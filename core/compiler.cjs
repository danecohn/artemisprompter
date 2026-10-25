'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {zipSync,strToU8}=require('fflate');
const {resolveLink,titleFile,hash,fail}=require('./vault.cjs');
function compile(notes,project,{title='Untitled prompt web',includeUnlinked=false}={}) {
  const map=new Map(notes.map(n=>[n.id,n]));
  const roots=project.roots?.length?project.roots:notes.length?[notes[0].id]:[];
  if(!roots.length)fail('EMPTY','Create a prompt block and choose an entry prompt first.');
  const edges=project.edges||[],state=new Map(),ordered=[],trail=[],warnings=[];
  const visit=id=>{
    const note=map.get(id);if(!note)fail('MISSING','A connected prompt block no longer exists. Repair its connection before generating.');
    if(state.get(id)===1)fail('CYCLE','A prompt includes itself through a loop: '+[...trail,note.title].join(' → ')+'. Remove one include connection.');
    if(state.get(id)===2)return;
    state.set(id,1);trail.push(note.title);ordered.push(note);
    for(const edge of edges.filter(e=>e.from===id))visit(edge.to);
    for(const link of note.links){const target=resolveLink(notes,link.target,note.path);if(target)visit(target.id);else warnings.push('Unresolved note link in '+note.title+': '+link.target);}
    trail.pop();state.set(id,2);
  };
  roots.forEach(visit);if(includeUnlinked)notes.forEach(n=>visit(n.id));
  const unknown=new Set(),variables=project.variables||{},images=new Map();
  const substitute=text=>text.replace(/\{\{\s*([A-Za-z][\w.-]*)\s*\}\}/g,(all,key)=>{if(!Object.hasOwn(variables,key)||!variables[key].trim()){unknown.add(key);return all;}return variables[key];});
  const names=new Map(ordered.map((n,i)=>[n.id,String(i+1).padStart(2,'0')+'-'+titleFile(n.title).slice(0,75)+'-'+n.id.slice(-6)+'.md']));
  const anchor=id=>'block-'+hash(id).slice(0,12);
  const transform=(note,combined)=>substitute(note.body)
    .replace(/!\[\[([^\]]+)\]\]/g,(_all,name)=>'!['+name+']('+name.split('/').map(encodeURIComponent).join('/')+')')
    .replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g,(all,alt,raw)=>{
      if(/^(?:[a-z]+:|\/\/|\/|#)/i.test(raw)){if(/^https?:/i.test(raw))warnings.push('External image was not downloaded: '+raw);return all;}
      let decoded;try{decoded=decodeURI(raw);}catch{fail('IMAGE','An image path has invalid encoding in '+note.title);}
      const source=path.posix.normalize(path.posix.join(path.posix.dirname(note.path),decoded));
      if(!/\.(?:png|jpe?g|gif|webp)$/i.test(source)){warnings.push('Image format was not bundled: '+decoded);return all;}
      const target='assets/'+hash(source).slice(0,12)+'-'+titleFile(path.posix.basename(source));images.set(source,{source,target});
      const url=(combined?'':'../')+target.split('/').map(encodeURIComponent).join('/');return '!['+alt+']('+url+')';
    })
    .replace(/(?<!!)\[\[([^\]]+)\]\]/g,(all,inside)=>{const [raw,label]=inside.split('|');const target=resolveLink(notes,raw.split('#')[0],note.path);return target&&names.has(target.id)?'['+(label||target.title)+']('+(combined?'#'+anchor(target.id):encodeURI(names.get(target.id)))+')':(label||raw);});
  const body=ordered.map((n,i)=>'<a id="'+anchor(n.id)+'"></a>\n\n## '+(i+1)+'. '+n.title+'\n\n'+transform(n,true).replace(/^#\s+.+\r?\n?/,'').trim()).join('\n\n---\n\n');
  const contents=ordered.map((n,i)=>'- ['+(i+1)+'. '+n.title+'](#'+anchor(n.id)+')').join('\n');
  const prompt='# '+title+'\n\n'+contents+'\n\n'+body+'\n';
  const files=Object.fromEntries(ordered.map(n=>['notes/'+names.get(n.id),transform(n,false)]));
  if(unknown.size)fail('VARIABLES','Fill these variables before generating: '+[...unknown].sort().join(', '));
  files['PROMPT.md']=prompt;
  files['INDEX.md']='# '+title+'\n\nStart with [PROMPT.md](PROMPT.md), a readable single-file prompt. The notes below preserve the connected source documents.\n\n'+ordered.map(n=>'- ['+n.title+'](notes/'+encodeURI(names.get(n.id))+') · '+String(project.roles?.[n.id]||n.meta.role||'prompt')).join('\n')+'\n\n## Includes\n\n'+edges.filter(e=>names.has(e.from)&&names.has(e.to)).map(e=>'- '+map.get(e.from).title+' → '+map.get(e.to).title).join('\n')+(warnings.length?'\n\n## Link warnings\n\n'+[...new Set(warnings)].map(w=>'- '+w).join('\n'):'')+'\n';
  files['graph.json']=JSON.stringify({schemaVersion:1,roots,nodes:ordered.map(n=>({id:n.id,title:n.title,role:project.roles?.[n.id]||n.meta.role||'prompt',file:'notes/'+names.get(n.id)})),edges:edges.filter(e=>names.has(e.from)&&names.has(e.to))},null,2)+'\n';
  return {files,images:[...images.values()],order:ordered.map(n=>n.id),warnings:[...new Set(warnings)],words:prompt.split(/\s+/).filter(Boolean).length};
}
function exportBundle(vault,outputBase,options={}) {
  const result=compile(vault.list(),vault.project(),options);let imageBytes=0;
  for(const image of result.images){let file;try{file=vault.safe(image.source);if(!fs.statSync(file).isFile())fail('IMAGE','Not a file');}catch(e){fail('IMAGE','A linked image is missing or outside the notebook: '+image.source);}
    const size=fs.statSync(file).size;imageBytes+=size;if(size>20*1024*1024||imageBytes>128*1024*1024)fail('IMAGE','Images exceed the export limit (20 MB per image, 128 MB total).');result.files[image.target]=fs.readFileSync(file);
  }
  fs.mkdirSync(outputBase,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'),folder=path.join(outputBase,titleFile(options.title||path.basename(vault.root)).slice(0,70)+'-'+stamp+'-'+crypto.randomUUID().slice(0,6));
  fs.mkdirSync(folder,{recursive:false});
  const manifest={schemaVersion:1,product:'Artemis Prompter',publisher:'Artemis Softworks LLC',generated:new Date().toISOString(),files:[]};
  for(const [relative,text]of Object.entries(result.files)){const file=path.join(folder,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text,{flag:'wx',mode:0o600});manifest.files.push({path:relative,sha256:hash(text),bytes:Buffer.byteLength(text)});}
  result.files['manifest.json']=JSON.stringify(manifest,null,2)+'\n';fs.writeFileSync(path.join(folder,'manifest.json'),result.files['manifest.json'],{flag:'wx',mode:0o600});
  const zipped=Object.fromEntries(Object.entries(result.files).map(([name,text])=>[name,typeof text==='string'?strToU8(text):text]));fs.writeFileSync(path.join(folder,'Prompt.bundle.zip'),zipSync(zipped),{flag:'wx',mode:0o600});
  return {folder,prompt:path.join(folder,'PROMPT.md'),bundle:path.join(folder,'Prompt.bundle.zip'),blocks:result.order.length,words:result.words,warnings:result.warnings};
}
module.exports={compile,exportBundle};
