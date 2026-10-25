'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const YAML = require('yaml');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const slash = p => p.split(path.sep).join('/');
const MAX_FILE = 8 * 1024 * 1024;
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function parseNote(content, relative) {
  let meta = {}, body = content, warning = null;
  const front = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (front) {
    try { const parsed = YAML.parse(front[1], { maxAliasCount: 50 }); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed; body = content.slice(front[0].length); }
    catch { warning = 'The YAML properties could not be read. Your original text is preserved.'; }
  }
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.posix.basename(relative, '.md');
  const tags = [...new Set([...(Array.isArray(meta.tags) ? meta.tags.map(String) : typeof meta.tags === 'string' ? meta.tags.split(/[, ]+/) : []), ...Array.from(body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu), m => m[1])])].filter(Boolean);
  const links = Array.from(body.matchAll(/(?<!!)\[\[([^\]]+)\]\]/g), m => ({ raw: m[0], target: m[1].split('|')[0].split('#')[0].trim(), label: m[1].split('|')[1] || m[1].split('#')[0].trim() })).filter(x => x.target);
  return { id: typeof meta.id === 'string' && /^[\w.-]{1,128}$/.test(meta.id) ? meta.id : 'file-' + hash(relative).slice(0,20), path: relative, title, meta, body, content, hash: hash(content), tags, links, warning, words: body.trim().split(/\s+/).filter(Boolean).length };
}
function titleFile(title) {
  const name = String(title || '').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').trim().slice(0,120);
  if (!name || name === '.' || name === '..' || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) fail('NAME', 'Choose a different file name.');
  return name;
}
function resolveLink(notes, target, from = '') {
  const clean = target.replace(/\.md$/i, '').replace(/\\/g,'/');
  const candidates = [path.posix.normalize(path.posix.join(path.posix.dirname(from), clean)), clean].map(x => x.toLocaleLowerCase());
  const exact = notes.filter(n => candidates.includes(n.path.replace(/\.md$/i,'').toLocaleLowerCase()));
  if (exact.length) return exact[0];
  const byName = notes.filter(n => path.posix.basename(n.path, '.md').toLocaleLowerCase() === clean.toLocaleLowerCase() || n.title.toLocaleLowerCase() === clean.toLocaleLowerCase());
  return byName.length === 1 ? byName[0] : null;
}
class Vault {
  constructor(root) {
    fs.mkdirSync(root, { recursive: true }); this.root = fs.realpathSync(root);
    this.metaDir = path.join(this.root, '.artemis');
    if (fs.existsSync(this.metaDir) && fs.lstatSync(this.metaDir).isSymbolicLink()) fail('PATH', 'The .artemis metadata directory must not be a symbolic link.');
    fs.mkdirSync(this.metaDir, { recursive: true });
  }
  safe(relative, { metadata = false } = {}) {
    if (typeof relative !== 'string' || !relative || relative.includes('\0') || path.isAbsolute(relative) || /^[a-z]:/i.test(relative)) fail('PATH', 'Use a path inside the open folder.');
    const parts = relative.replace(/\\/g,'/').split('/');
    if (parts.some(p => !p || p === '..' || p === '.' || (!metadata && p.startsWith('.')))) fail('PATH', 'That path is reserved or outside the open folder.');
    let current = this.root;
    for (const part of parts) { current = path.join(current, part); if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail('PATH', 'Symbolic links are not followed.'); }
    if (!current.startsWith(this.root + path.sep)) fail('PATH', 'That path is outside the open folder.');
    return current;
  }
  list() {
    const notes = [], ids = new Set(); let total = 0;
    const walk = (dir, depth) => {
      if (depth > 32) fail('LIMIT', 'This folder is nested too deeply. Open a smaller folder.');
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file, depth + 1);
        else if (entry.isFile() && /\.md$/i.test(entry.name)) {
          const stat = fs.statSync(file); total += stat.size;
          if (stat.size > MAX_FILE || total > 128 * 1024 * 1024 || notes.length >= 10000) fail('LIMIT', 'This folder exceeds the desktop indexing limit (10,000 notes, 8 MB per note, 128 MB total). Open a smaller folder.');
          const note = parseNote(fs.readFileSync(file,'utf8'), slash(path.relative(this.root, file)));
          if (ids.has(note.id)) { note.warning = 'This note shares an ID with another file; its path is used to distinguish it.'; note.id = 'file-' + hash(note.path).slice(0,20); }
          ids.add(note.id); notes.push({ ...note, modified: stat.mtime.toISOString() });
        }
      }
    };
    walk(this.root, 0); return notes;
  }
  read(relative) { const file = this.safe(relative); if (!/\.md$/i.test(relative)) fail('TYPE', 'Only Markdown notes can be opened here.'); if (fs.statSync(file).size > MAX_FILE) fail('LIMIT', 'This note is larger than 8 MB.'); return parseNote(fs.readFileSync(file,'utf8'), relative); }
  write(relative, content, expectedHash) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_FILE || !/\.md$/i.test(relative)) fail('TYPE', 'Save a Markdown note smaller than 8 MB.');
    const file = this.safe(relative); const exists = fs.existsSync(file);
    if (exists && (!expectedHash || hash(fs.readFileSync(file)) !== expectedHash)) fail('CONFLICT', 'This note changed on disk. Reload it or save your changes as a new note.');
    if (!exists && expectedHash) fail('CONFLICT', 'This note was moved or removed. Save your changes as a new note.');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (exists) {
      const history = this.safe('.artemis/history/' + hash(relative).slice(0,20), { metadata: true }); fs.mkdirSync(history, { recursive: true });
      fs.copyFileSync(file, path.join(history, Date.now() + '-' + crypto.randomUUID().slice(0,8) + '.md'));
      const versions = fs.readdirSync(history).sort(); for (const old of versions.slice(0, -20)) fs.unlinkSync(path.join(history,old));
    }
    const temp = file + '.artemis-' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(temp, content, { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, file); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    return this.read(relative);
  }
  create(title, role = 'note', content) {
    const relative = titleFile(title) + '.md'; const file = this.safe(relative);
    if (fs.existsSync(file)) fail('EXISTS', 'A note with that name already exists.');
    const properties='---\n' + YAML.stringify({ id: crypto.randomUUID(), role, created: new Date().toISOString(), tags: [] }) + '---\n\n';
    const text = content?.startsWith('---\n') ? content : properties + (content ?? '# ' + title + '\n\n');
    fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 }); return this.read(relative);
  }
  rename(relative, title) {
    const source = this.safe(relative), next = slash(path.posix.join(path.posix.dirname(relative), titleFile(title)+'.md')), dest = this.safe(next);
    if (source === dest) return this.read(next);
    if (fs.existsSync(dest)) fail('EXISTS', 'A note with that name already exists.');
    fs.renameSync(source,dest); return this.read(next);
  }
  trash(relative) {
    const file = this.safe(relative), dest = this.safe('.artemis/trash/'+Date.now()+'-'+crypto.randomUUID().slice(0,8)+'-'+path.basename(relative), { metadata: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(file,dest); return { recoverable: true };
  }
  project() {
    const file = this.safe('.artemis/project.json', { metadata: true });
    if (!fs.existsSync(file)) return { schemaVersion:1, edges:[], roots:[], positions:{}, variables:{}, snippets:[] };
    try { const data = JSON.parse(fs.readFileSync(file,'utf8')); this.validateProject(data); return data; } catch(e) { fail('PROJECT', 'Project metadata could not be read: '+e.message); }
  }
  validateProject(data) {
    if (data?.schemaVersion !== 1 || !Array.isArray(data.edges) || !Array.isArray(data.roots) || !data.positions || !data.variables || !Array.isArray(data.snippets)) fail('PROJECT', 'The project metadata is incomplete.');
    if (data.edges.length > 20000 || JSON.stringify(data).length > 2 * 1024 * 1024) fail('LIMIT','The project metadata is too large.');
    for (const edge of data.edges) if (typeof edge.from !== 'string' || typeof edge.to !== 'string' || edge.from === edge.to) fail('PROJECT','Choose two different prompt blocks to connect.');
    for (const pos of Object.values(data.positions)) if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) fail('PROJECT','A graph position is invalid.');
    for (const [key,value] of Object.entries(data.variables)) if (!/^[A-Za-z][\w.-]{0,79}$/.test(key) || typeof value !== 'string' || value.length > 100000) fail('VARIABLE','Use variable names such as product_name and plain text values.');
    for (const root of data.roots) if(typeof root!=='string')fail('PROJECT','A prompt entry is invalid.');
    for (const snippet of data.snippets) if(!snippet || typeof snippet.name!=='string' || !/^[a-z][a-z0-9-]{0,39}$/.test(snippet.name) || typeof snippet.body!=='string' || snippet.body.length>100000)fail('PROJECT','A saved slash command is invalid.');
  }
  saveProject(data) {
    this.validateProject(data);
    const file = this.safe('.artemis/project.json', { metadata: true }), temp = file+'.tmp'; fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600}); fs.renameSync(temp,file); return data;
  }
  importAssets(paths, from = '') {
    const dir = this.safe('attachments'); fs.mkdirSync(dir,{recursive:true});
    return paths.map(source => {
      const ext=path.extname(source).toLowerCase(); if (!['.png','.jpg','.jpeg','.gif','.webp'].includes(ext) || fs.statSync(source).size > 20*1024*1024) fail('TYPE','Attach PNG, JPEG, GIF or WebP images up to 20 MB.');
      const name=titleFile(path.basename(source,ext))+'-'+crypto.randomUUID().slice(0,6)+ext, dest=this.safe('attachments/'+name); fs.copyFileSync(source,dest,fs.constants.COPYFILE_EXCL); return path.posix.relative(path.posix.dirname(from),'attachments/'+name);
    });
  }
  asset(relative, from = '') {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(from),relative));
    const file=this.safe(target), ext=path.extname(file).toLowerCase(), types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'};
    if (!types[ext] || fs.statSync(file).size>20*1024*1024) fail('TYPE','This image type or size is not supported.');
    return 'data:'+types[ext]+';base64,'+fs.readFileSync(file).toString('base64');
  }
}
module.exports = { Vault, parseNote, titleFile, resolveLink, hash, fail };
