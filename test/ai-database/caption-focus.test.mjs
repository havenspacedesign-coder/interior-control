import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the mounted event handlers with delayed shared-store notifications.
const source=(await readFile(new URL('../../app/features/ai-database/index.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace('export function mountAiDatabase','function mountAiDatabase')
  .replaceAll('import.meta.url',JSON.stringify(import.meta.url));
const handlers={},status={textContent:'',hidden:true};
let renders=0,notify,state={revision:0,files:[{id:'one',caseId:'case',caption:''}],cleanupPaths:[],categories:[]};
const document={activeElement:null,querySelector:()=>true};
const inputs=['one','two'].map(id=>({
  dataset:{caption:id,captionEditing:'false'},value:'',
  matches:selector=>selector==='[data-caption]',
  closest:()=>null,
  blur(){document.activeElement=null;handlers.focusout({target:this});},
  focus(){document.activeElement=this;},
}));
const root={
  set innerHTML(value){renders++;document.activeElement=null;},
  contains:node=>inputs.includes(node),
  querySelector:selector=>selector==='.aidb-notice'?status:null,
  querySelectorAll:selector=>selector==='[data-caption]'?inputs:[],
  setAttribute(){},removeAttribute(){},
  addEventListener(name,handler){if(!handlers[name])handlers[name]=handler;},
};
const store={
  label:'delayed store',load:async()=>state,
  subscribe(callback){notify=callback;return()=>{};},
  async commit(command){state={...state,revision:state.revision+1,files:state.files.map(file=>file.id===command.payload.fileId?{...file,caption:command.payload.caption}:file)};return state;},
};
const sandbox={document,queueMicrotask,URL,Map,Set,console,
  window:{addEventListener(){},removeEventListener(){}},
  renderNavigation:()=>'',renderCaseContent:()=>'',esc:x=>x,
  cleanupFiles:async()=>{},LEARNING_SCHEMA:{version:1},
};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const mount=sandbox.mountAiDatabase(root,{createStore:()=>store,canManage:()=>true,user:()=>({})});
mount.render();await new Promise(resolve=>setImmediate(resolve));
inputs[0].focus();inputs[0].value='客廳說明';handlers.input({target:inputs[0]});
let prevented=false;
handlers.keydown({target:inputs[0],key:'Tab',preventDefault(){prevented=true;}});
await new Promise(resolve=>setImmediate(resolve));
assert.ok(prevented);assert.equal(state.files[0].caption,'客廳說明');
assert.equal(document.activeElement,inputs[1]);
const before=renders;
await notify();await notify();
assert.equal(renders,before,'delayed save notifications must not replace focused captions');
assert.equal(document.activeElement,inputs[1]);
assert.equal(inputs[1].dataset.captionEditing,'false');
inputs[1].blur();await new Promise(resolve=>setImmediate(resolve));
assert.equal(renders,before+1,'deferred shared view refresh runs after leaving captions');
console.log('PASS: Tab focus survives delayed store notifications; caption saves; deferred refresh runs on exit.');
