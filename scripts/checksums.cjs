const fs=require('fs'),path=require('path'),crypto=require('crypto'),pkg=require('../package.json');
const dir=path.join(__dirname,'../release'),out=path.join(__dirname,'../artifacts');fs.mkdirSync(out,{recursive:true});
const files=fs.readdirSync(dir).filter(name=>name.startsWith(pkg.productName.replaceAll(' ','' )+'-')&&/\.(dmg|exe|AppImage)$/.test(name));if(files.length!==1)throw Error('Expected exactly one native installer; found '+files.length);
for(const name of files){const source=path.join(dir,name);fs.copyFileSync(source,path.join(out,name));fs.writeFileSync(path.join(out,name+'.sha256'),crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')+'  '+name+'\n');}
