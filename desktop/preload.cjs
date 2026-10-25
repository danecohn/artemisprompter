'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=async(channel,...args)=>{const result=await ipcRenderer.invoke(channel,...args);if(!result.ok){const error=new Error(result.error.message);error.code=result.error.code;throw error;}return result.data;};
contextBridge.exposeInMainWorld('artemis',Object.freeze({
  bootstrap:()=>invoke('app:bootstrap'),closeReady:()=>invoke('app:close-ready'),openFolder:()=>invoke('vault:open'),
  list:()=>invoke('vault:list'),read:p=>invoke('vault:read',p),save:(p,text,hash)=>invoke('vault:save',p,text,hash),
  create:(title,role)=>invoke('vault:create',title,role),rename:(p,title)=>invoke('vault:rename',p,title),trash:p=>invoke('vault:trash',p),
  project:()=>invoke('project:get'),saveProject:data=>invoke('project:save',data),generate:options=>invoke('prompt:generate',options),
  chooseOutput:()=>invoke('output:choose'),reveal:which=>invoke('output:reveal',which),showVault:()=>invoke('vault:reveal'),
  attach:from=>invoke('vault:attach',from),asset:(relative,from)=>invoke('vault:asset',relative,from),external:url=>invoke('app:external',url),
  onCommand:fn=>{const listener=(_e,command)=>fn(command);ipcRenderer.on('app:command',listener);return()=>ipcRenderer.removeListener('app:command',listener);},
  onChanged:fn=>{const listener=()=>fn();ipcRenderer.on('vault:changed',listener);return()=>ipcRenderer.removeListener('vault:changed',listener);}
}));
