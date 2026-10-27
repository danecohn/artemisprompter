const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const root=path.join(__dirname,'..'),dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
esbuild.buildSync({entryPoints:[path.join(root,'src/renderer.js')],bundle:true,format:'iife',outfile:path.join(dist,'renderer.js'),target:'chrome140',minify:true,legalComments:'eof',define:{'__PRODUCT__':JSON.stringify(require('../product.json'))}});
for(const file of ['index.html','app.css','vigiltech.css'])fs.copyFileSync(path.join(root,'src',file),path.join(dist,file));
fs.cpSync(path.join(root,'assets'),path.join(dist,'assets'),{recursive:true});
console.log('Built '+require('../product.json').name);
