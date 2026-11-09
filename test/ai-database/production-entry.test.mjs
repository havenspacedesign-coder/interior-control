import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { openFile } from '../../app/features/ai-database/files.js';

const source=await readFile(new URL('../../app/features/ai-database/production-integration.js',import.meta.url),'utf8');

function testShell({role,status='active',hash='',signedIn=true,localTestMode=false}){
  const handlers={};
  const tab={dataset:{},addEventListener:(name,handler)=>{handlers[name]=handler;}};
  const existing={before:node=>assert.equal(node,tab),addEventListener(){}};
  const user=signedIn?{uid:'account'}:null;
  let panels=0,imports=0;
  const context={
    auth:{currentUser:user},currentUser:user,localTestMode,activePanel:'home',
    S:{members:[{id:'account',role,status}]},location:{hash},
    renderActive(){},onAuthStateChanged(){},console,
    document:{
      createElement(tag){if(tag==='div')panels++;return tab;},
      querySelector(){return existing;},
      querySelectorAll(){return [existing,tab];},
    },
  };
  vm.runInNewContext(source,context,{
    importModuleDynamically(){imports++;throw new Error('Unexpected protected module load');},
  });
  context.renderActive();
  return {tab,handlers,context,panels:()=>panels,imports:()=>imports};
}

for(const role of ['admin','manager']){
  const {tab}=testShell({role});
  assert.equal(tab.hidden,false);
}
for(const account of [
  {role:'staff'},{role:'supervisor'},{role:'pending'},
  {role:'admin',status:'resigned'},{role:'admin',signedIn:false},{role:'manager',localTestMode:true},
]){
  const shell=testShell({...account,hash:'#ai-database'});
  assert.equal(shell.tab.hidden,true);
  shell.handlers.click();
  assert.equal(shell.panels(),0);
  assert.equal(shell.imports(),0);
}
const shell=testShell({role:'admin'});
shell.context.S.members[0].role='staff';
shell.context.renderActive();
assert.equal(shell.tab.hidden,true);
console.log('PASS production navigation: administrator visibility, denied deep link and click, role demotion, no local-login fallback.');

const originalSetTimeout=globalThis.setTimeout;
const scheduled=[];
let preview;
globalThis.window={
  open(){
    preview={
      opener:{},closed:false,
      location:{replace(url){preview.url=url;}},
      close(){preview.closed=true;},
    };
    return preview;
  },
};
globalThis.setTimeout=callback=>scheduled.push(callback);
try{
  const file={storagePath:'aiDatabase/cases/example/file',name:'quote.pdf'};
  let deliver;
  const download=new Promise(resolve=>{deliver=resolve;});
  const result=openFile({getBlob:()=>download},file);
  assert.equal(preview.opener,null);
  assert.equal(preview.url,undefined);
  deliver(new Blob(['%PDF-1.4'],{type:'application/pdf'}));
  await result;
  // Restore Node's timer while fetching the generated Blob URL.
  globalThis.setTimeout=originalSetTimeout;
  assert.equal(await (await fetch(preview.url)).text(),'%PDF-1.4');
  await openFile({getBlob:async()=>new Blob(['private'])},file,false,()=>false);
  assert.equal(preview.closed,true);
  assert.equal(preview.url,undefined);
  console.log('PASS protected preview: popup opened before read, Blob delivered, revoked session closes preview.');
}finally{
  globalThis.setTimeout=originalSetTimeout;
  for(const cleanup of scheduled)cleanup();
  delete globalThis.window;
}
