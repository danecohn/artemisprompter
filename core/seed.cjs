'use strict';
function seed(vault,product) {
  if(vault.list().length)return;
  if(product==='mind'){
    vault.create('Welcome to Mind','note',`# Welcome to Mind\n\nA quiet place for everything on your mind. Your notes are ordinary Markdown files in a folder you own.\n\n## Make a little room\n\n- Write a thought. Follow it somewhere.\n- Connect notes with [[A garden of ideas]].\n- Find your way with tags, backlinks, and the graph.\n\n## Your files, your choice\n\nOpen an existing Markdown folder from **File → Open folder**. Files from other Markdown note apps can be opened here. Their plugins and app settings are left in their original folders.\n\nNo account, network connection, or subscription is needed.\n\n#beginning #personal\n`);
    vault.create('A garden of ideas','note',`# A garden of ideas\n\nSome ideas need a little space before they make sense. Others need a connection.\n\nA useful note is an invitation to the next one: [[The things I notice]], [[Projects worth making]], or back to [[Welcome to Mind]].\n\n> Give a thought somewhere to grow.\n\n## A small practice\n\n- [ ] Capture one observation\n- [ ] Link it to something you already know\n- [ ] Return when the idea has changed\n\n#ideas #practice\n`);
    vault.create('The things I notice','note',`# The things I notice\n\nLight on the desk. A good question. The part of a conversation that stays.\n\n## Today\n\nThere is usually more here than I noticed the first time.\n\nRelated: [[A garden of ideas]]\n\n#journal\n`);
    vault.create('Projects worth making','note',`# Projects worth making\n\n## Make something useful\n\nA good project starts with a clear question and enough room to explore.\n\n- What would make someone's day easier?\n- What can we make calmer?\n- What belongs together?\n\nSee [[A garden of ideas]].\n\n#projects #ideas\n`);
  }else{
    const a=vault.create('A thoughtful product launch','goal',`# A thoughtful product launch\n\nWrite a clear, compelling launch announcement for **{{product}}**. Make it useful to {{audience}}.\n\nUse the connected context, instructions, and output brief. Keep the language specific and human.\n`);
    const b=vault.create('Product context','context',`# Product context\n\n{{product}} is a local-first desktop tool by Cohnsoft. It helps people turn connected ideas into useful work.\n\nThe audience is {{audience}}. Their time and attention matter.\n`);
    const c=vault.create('Writing direction','instructions',`# Writing direction\n\n- Lead with what someone can do.\n- Use familiar words and concrete examples.\n- Keep claims grounded in the supplied context.\n- If a detail is missing, say what needs to be confirmed.\n\n## Avoid\n\nHype, invented statistics, generic promises, and unnecessary jargon.\n`);
    const d=vault.create('The final shape','output',`# The final shape\n\nReturn:\n\n1. One short headline.\n2. A 100–150 word announcement.\n3. Three concrete benefits.\n4. A simple invitation to try the app.\n\nUse Markdown.\n`);
    vault.saveProject({schemaVersion:1,roots:[a.id],edges:[{from:a.id,to:b.id},{from:a.id,to:c.id},{from:a.id,to:d.id}],positions:{[a.id]:{x:390,y:80},[b.id]:{x:90,y:290},[c.id]:{x:390,y:330},[d.id]:{x:690,y:290}},variables:{product:'Cohnsoft Mind',audience:'thoughtful people who work with ideas'},snippets:[]});
  }
}
module.exports={seed};
