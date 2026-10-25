'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const pkg=require('../package.json'),root=path.resolve(__dirname,'../release'),shot=path.join(root,'smoke-'+process.platform+'-'+process.arch+'.png');
function find(test,folder,depth=4){for(const e of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,e.name);if(test(file))return file;if(e.isDirectory()&&depth&&!file.endsWith('.app')){const result=find(test,file,depth-1);if(result)return result;}}return null;}
let bin;if(process.platform==='darwin'){const app=find(p=>p.endsWith('/'+pkg.productName+'.app'),root);if(app)bin=path.join(app,'Contents/MacOS',pkg.productName);}else if(process.platform==='win32')bin=find(p=>p.endsWith(path.sep+pkg.productName+'.exe')&&p.includes('unpacked'),root);else bin=find(p=>p.endsWith('/'+pkg.name)&&p.includes('unpacked'),root);
if(!bin)throw Error('The packaged native app was not found.');
let command=bin,args=['--smoke-test',shot];if(process.platform==='linux'){args.unshift('--no-sandbox','--disable-gpu');if(!process.env.DISPLAY){args.unshift('-a',bin);command='xvfb-run';}}
const result=spawnSync(command,args,{encoding:'utf8',timeout:120000,env:{...process.env}});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;if(result.status!==0)throw Error('Native packaged app failed with status '+result.status);if(!fs.existsSync(shot)||fs.statSync(shot).size<2000)throw Error('Native renderer produced no usable screenshot.');
console.log('Native save/read/export and renderer verified: '+pkg.productName+' '+process.platform+'-'+process.arch);
