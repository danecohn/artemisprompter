'use strict';
const {app,BrowserWindow,ipcMain,dialog,Menu,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {Vault,fail}=require('../core/vault.cjs');
const {seed}=require('../core/seed.cjs');
const {exportBundle}=require('../core/compiler.cjs');
const product=require('../product.json');
app.setName(product.name);
let win,vault,prefs={},watcher,watchTimer,lastExport,closeApproved=false;
const smokeIndex=process.argv.indexOf('--smoke-test'),smokeOut=smokeIndex>=0?process.argv[smokeIndex+1]:null;
const isolated=process.env.ARTEMIS_QA_HOME || (smokeOut?fs.mkdtempSync(path.join(os.tmpdir(),'artemis-'+product.id+'-smoke-')):null);
if(isolated){app.setPath('userData',path.join(isolated,'settings'));app.disableHardwareAcceleration();}
const entry=path.join(__dirname,'../dist/index.html'),entryURL=pathToFileURL(entry).href;
function prefFile(){return path.join(app.getPath('userData'),'preferences.json');}
function storePrefs(){fs.mkdirSync(app.getPath('userData'),{recursive:true});const file=prefFile();fs.writeFileSync(file+'.tmp',JSON.stringify(prefs,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.tmp',file);}
function setVault(root,makeSeed=false){
  watcher?.close();vault=new Vault(root);const initialized=path.join(vault.metaDir,'initialized');if(makeSeed&&!fs.existsSync(initialized)){seed(vault,product.id);fs.writeFileSync(initialized,'1\n');}prefs.vault=vault.root;storePrefs();
  try{watcher=fs.watch(vault.root,{recursive:true},(_event,filename)=>{const name=String(filename||'');if(name.startsWith('.artemis')||name.endsWith('.tmp'))return;clearTimeout(watchTimer);watchTimer=setTimeout(()=>win?.webContents.send('vault:changed'),650);});}catch{watcher=null;}
}
function info(){return {product,root:vault.root,folderName:path.basename(vault.root),output:prefs.output||path.join(app.getPath('documents'),'Artemis Prompts'),platform:process.platform,exports:prefs.exports||[]};}
function trusted(event){return event.sender===win?.webContents&&event.senderFrame?.url.split('#')[0]===entryURL;}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{if(!trusted(event))return{ok:false,error:{code:'ORIGIN',message:'This action is only available in the Artemis application window.'}};try{return{ok:true,data:await fn(...args)};}catch(e){return{ok:false,error:{code:e.code||'ERROR',message:e.message||'The operation could not be completed.'}};}});}
function wire(){
  handle('app:bootstrap',()=>({...info(),notes:vault.list(),project:vault.project()}));
  handle('app:close-ready',()=>{closeApproved=true;win.close();return true;});
  handle('vault:open',async()=>{const result=await dialog.showOpenDialog(win,{title:'Open a Markdown folder',properties:['openDirectory','createDirectory']});if(result.canceled)return null;setVault(result.filePaths[0]);return {...info(),notes:vault.list(),project:vault.project()};});
  handle('vault:list',()=>vault.list());handle('vault:read',p=>vault.read(p));handle('vault:save',(p,text,hash)=>vault.write(p,text,hash));
  handle('vault:create',(title,role)=>vault.create(title,role));handle('vault:rename',(p,title)=>vault.rename(p,title));handle('vault:trash',p=>vault.trash(p));
  handle('project:get',()=>vault.project());handle('project:save',data=>vault.saveProject(data));
  handle('prompt:generate',options=>{if(product.id!=='prompter')fail('PRODUCT','Prompt generation is available in Artemis Prompter.');if(typeof options?.title!=='string')fail('TITLE','Give this prompt web a title.');lastExport=exportBundle(vault,info().output,{title:options.title,includeUnlinked:options.includeUnlinked===true});prefs.exports=[lastExport,...(prefs.exports||[])].slice(0,30);storePrefs();return lastExport;});
  handle('output:choose',async()=>{const result=await dialog.showOpenDialog(win,{title:'Choose where generated prompts are saved',defaultPath:info().output,properties:['openDirectory','createDirectory']});if(result.canceled)return null;prefs.output=result.filePaths[0];storePrefs();return prefs.output;});
  handle('output:reveal',async which=>{if(!lastExport)fail('EXPORT','Generate a prompt first.');if(which==='folder')return shell.openPath(lastExport.folder);shell.showItemInFolder(which==='bundle'?lastExport.bundle:lastExport.prompt);return true;});
  handle('vault:reveal',()=>shell.openPath(vault.root));
  handle('vault:attach',async from=>{const result=await dialog.showOpenDialog(win,{title:'Attach images',properties:['openFile','multiSelections'],filters:[{name:'Images',extensions:['png','jpg','jpeg','gif','webp']}]});return result.canceled?[]:vault.importAssets(result.filePaths,from);});
  handle('vault:asset',(relative,from)=>vault.asset(relative,from));
  handle('app:external',async url=>{let parsed;try{parsed=new URL(url);}catch{fail('URL','This link is invalid.');}if(!['https:','http:'].includes(parsed.protocol))fail('URL','Only web links can be opened externally.');await shell.openExternal(parsed.href);return true;});
}
function menu(){const send=command=>()=>win?.webContents.send('app:command',command);Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform==='darwin'?[{role:'appMenu',label:product.name}]:[]),
  {label:'File',submenu:[{label:'New '+(product.id==='mind'?'note':'prompt block'),accelerator:'CmdOrCtrl+N',click:send('new')},{label:'Open folder…',accelerator:'CmdOrCtrl+O',click:send('open')},{label:'Save',accelerator:'CmdOrCtrl+S',click:send('save')},{label:'Daily note',accelerator:'CmdOrCtrl+Shift+D',click:send('daily')},{type:'separator'},...(product.id==='prompter'?[{label:'Generate prompt',accelerator:'CmdOrCtrl+Shift+G',click:send('generate')}]:[]),{label:'Show notes folder',click:()=>shell.openPath(vault.root)},{type:'separator'},{role:process.platform==='darwin'?'close':'quit'}]},
  {role:'editMenu'},{label:'View',submenu:[{label:'Quick switcher',accelerator:'CmdOrCtrl+K',click:send('palette')},{label:product.id==='mind'?'Knowledge graph':'Prompt web',accelerator:'CmdOrCtrl+G',click:send('graph')},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
  {role:'windowMenu'},{label:'Help',submenu:[{label:'About '+product.name,click:()=>dialog.showMessageBox(win,{type:'info',title:product.name,message:product.name+' '+product.version,detail:'An original desktop app by Artemis Softworks LLC.\nFounded by Demetria Althea Cohn.\n\nLocal Markdown files. No account required.\nGPL-3.0-only. Third-party license notices are included in the app.\n\nThis application is independent of Obsidian and does not include Obsidian application code or plugins.'})},{label:'Source and documentation',click:()=>shell.openExternal(product.repository)}]}
]));}
async function smoke(){
  await win.webContents.executeJavaScript('new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(document.querySelector("[data-ready=true]")){clearInterval(t);resolve(true);}else if(++n>100){clearInterval(t);reject(Error("Renderer did not initialize"));}},100);})');
  const result=await win.webContents.executeJavaScript('window.artemis.bootstrap()');
  if(result.product.id!==product.id||result.notes.length<4)throw Error('Packaged app could not load its real local vault.');
  const note=vault.create('Packaged write check','note');vault.write(note.path,note.content+'\nNative save and reopen verified.\n',note.hash);if(!vault.read(note.path).content.includes('Native save'))throw Error('Packaged write check failed.');
  if(product.id==='prompter'){const generated=exportBundle(vault,path.join(isolated,'output'),{title:'Native prompt verification'});if(!fs.readFileSync(generated.prompt,'utf8').includes('Artemis Mind'))throw Error('The packaged prompt export did not render variables.');}
  const image=await win.webContents.capturePage();fs.mkdirSync(path.dirname(path.resolve(smokeOut)),{recursive:true});fs.writeFileSync(smokeOut,image.toPNG());console.log('PACKAGED SMOKE OK '+product.name+' '+process.platform+'-'+process.arch);app.quit();
}
if(!app.requestSingleInstanceLock()&&!smokeOut)app.quit();else{
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
  app.whenReady().then(async()=>{
    try{try{prefs=JSON.parse(fs.readFileSync(prefFile(),'utf8'));}catch{prefs={};}
      const managed=isolated?path.join(isolated,'vault'):path.join(app.getPath('documents'),product.name);const root=prefs.vault&&fs.existsSync(prefs.vault)?prefs.vault:managed;setVault(root,root===managed);wire();
      win=new BrowserWindow({width:1440,height:940,minWidth:960,minHeight:640,show:!smokeOut,title:product.name,backgroundColor:'#f5f5f7',icon:path.join(__dirname,'../assets/icon.png'),titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',trafficLightPosition:{x:20,y:19},webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:true}});
      win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(url.split('#')[0]!==entryURL)event.preventDefault();});win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
      win.on('close',event=>{if(!closeApproved&&!smokeOut){event.preventDefault();win.webContents.send('app:command','before-close');}});
      lastExport=prefs.exports?.[0];menu();await win.loadFile(entry);win.on('closed',()=>{win=null;});if(smokeOut)await smoke();
    }catch(e){console.error(e);if(smokeOut)app.exit(1);else{await dialog.showMessageBox({type:'error',message:product.name+' could not open its folder',detail:e.message});app.quit();}}
  });
  app.on('window-all-closed',()=>{watcher?.close();app.quit();});
}
