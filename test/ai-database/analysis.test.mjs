import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPhotoLoader} from '../../app/features/ai-database/photo-loader.js';
import handler from '../../api/ai-case-analyze.js';
import {analyzeBasicCase} from '../../app/features/ai-database/analysis-client.js';

const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
const basic={name:'測試住宅',area:30,amount:200,year:2026,houseType:'新成屋',scopes:['客廳'],url:'',note:'測試文字'};
const ok=data=>({ok:true,status:200,json:async()=>data});
const account=()=>ok({users:[{localId:'manager-id'}]});
const member=(role='manager',status='active')=>ok({fields:{role:{stringValue:role},status:{stringValue:status}}});
async function run({method='POST',token='test-token',body={basic},replies=[]}={}){
  const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});const reply=replies.shift();if(reply instanceof Error)throw reply;assert.ok(reply,`Unexpected outbound request: ${url}`);return reply;};
  const response={headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await handler({method,headers:token?{authorization:`Bearer ${token}`}:{},body},response);
  return{response,calls};
}

const source=(await readFile(new URL('../../app/features/ai-database/index.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace('export function mountAiDatabase','function mountAiDatabase')
  .replaceAll('import.meta.url',JSON.stringify(import.meta.url));
const handlers={},result={textContent:''},alert={textContent:'',hidden:true},button={dataset:{action:'case.analyze'},disabled:false,textContent:''};
const state={revision:0,cases:[{id:'case',...basic}],files:[],cleanupPaths:[],categories:[]};
const before=JSON.stringify(state);
let requests=0,resolve,reject;
const root={innerHTML:'',contains:()=>false,
  querySelector(selector){return selector==='[data-analysis-result]'?result:selector==='[data-analysis-error]'?alert:selector==='[data-action="case.analyze"]'?button:null;},
  querySelectorAll:()=>[],setAttribute(){},removeAttribute(){},
  addEventListener(name,callback){if(!handlers[name])handlers[name]=callback;},
};
const sandbox={document:{querySelector:()=>true,activeElement:null},URL,Map,Set,queueMicrotask,createPhotoLoader,
  window:{addEventListener(){}},esc:x=>x,renderNavigation:()=>'',renderCaseContent:()=>'',cleanupFiles:async()=>{},LEARNING_SCHEMA:{version:1},
  analyzeBasicCase:()=>{requests++;return new Promise((yes,no)=>{resolve=yes;reject=no;});},
};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
sandbox.mountAiDatabase(root,{canManage:()=>true,user:()=>({}),createStore:()=>({label:'test',load:async()=>state,subscribe:()=>()=>{},commit:()=>assert.fail('Analysis must not write case data')})}).render();
await new Promise(done=>setImmediate(done));
const click=control=>handlers.click({target:{closest:()=>control}});
click({dataset:{action:'case.select',id:'case'}});
click(button);click(button);
assert.equal(requests,1);assert.equal(button.disabled,true);assert.equal(button.textContent,'AI 分析中…');
resolve('<script>result remains plain text</script>');await new Promise(done=>setImmediate(done));
assert.equal(result.textContent,'<script>result remains plain text</script>');assert.equal(button.disabled,false);
click(button);reject(Error('測試失敗提示'));await new Promise(done=>setImmediate(done));
assert.equal(alert.hidden,false);assert.equal(alert.textContent,'測試失敗提示');assert.equal(button.disabled,false);
assert.equal(result.textContent,'<script>result remains plain text</script>');assert.equal(JSON.stringify(state),before);
console.log('PASS: mounted analysis UI loading/duplicate prevention, plain text result, failure/retry, unchanged case data.');
try{
  process.env.OPENAI_API_KEY='test-secret-never-in-browser';
  let result=await run({method:'GET'});assert.equal(result.response.code,405);assert.equal(result.calls.length,0);
  result=await run({token:''});assert.equal(result.response.code,401);assert.equal(result.calls.length,0);
  result=await run({replies:[{ok:false,json:async()=>({})}]});assert.equal(result.response.code,401);
  for(const [role,status] of [['staff','active'],['manager','resigned']]){
    result=await run({replies:[account(),member(role,status)]});assert.equal(result.response.code,403);assert.equal(result.calls.length,2);
  }
  for(const role of ['manager','admin']){
    result=await run({body:{basic:{...basic,files:['do-not-send'],photo:'do-not-send'}},replies:[account(),member(role),ok({status:'completed',output:[{content:[{type:'output_text',text:'案件摘要測試'}]}]})]});
    assert.equal(result.response.code,200);assert.equal(result.response.data.summary,'案件摘要測試');
    const outbound=JSON.parse(result.calls[2].options.body);
    assert.deepEqual(JSON.parse(outbound.input),Object.fromEntries(Object.entries(basic).map(([k,v])=>[k,k==='scopes'?v:String(v)])));
    assert.equal(outbound.store,false);assert.equal(outbound.tools,undefined);
    assert.ok(result.calls.slice(0,2).every(call=>!call.options.method||call.options.method==='POST'));
    assert.equal(JSON.stringify(result.response.data).includes(process.env.OPENAI_API_KEY),false);
  }
  result=await run({body:{basic:{...basic,note:'x'.repeat(13000)}},replies:[account(),member()]});assert.equal(result.response.code,400);assert.equal(result.calls.length,2);
  delete process.env.OPENAI_API_KEY;
  result=await run({replies:[account(),member()]});assert.equal(result.response.code,503);
  process.env.OPENAI_API_KEY='test-secret';
  result=await run({replies:[account(),member(),{ok:false,status:429,json:async()=>({error:{message:'secret internal error'}})}]});assert.equal(result.response.code,429);assert.ok(!JSON.stringify(result.response.data).includes('secret internal error'));
  result=await run({replies:[account(),member(),ok({status:'incomplete',output_text:'partial'})]});assert.equal(result.response.code,502);
  result=await run({replies:[account(),member(),Object.assign(new Error(),{name:'TimeoutError'})]});assert.equal(result.response.code,504);

  await assert.rejects(analyzeBasicCase(basic),/本機展示帳號/);
  let sent;
  globalThis.fetch=async(url,options)=>{sent={url,options};return ok({summary:'<script>plain text summary</script>'});};
  const summary=await analyzeBasicCase({...basic,files:['not sent'],storagePath:'not sent'},async()=>'id-token');
  assert.equal(summary,'<script>plain text summary</script>');
  assert.equal(sent.url,'/api/ai-case-analyze');
  assert.deepEqual(JSON.parse(sent.options.body),{basic});
  assert.equal(sent.options.headers.authorization,'Bearer id-token');
  globalThis.fetch=async()=>({ok:false,json:async()=>({message:'服務未設定'})});
  await assert.rejects(analyzeBasicCase(basic,async()=>'token'),/服務未設定/);
  globalThis.fetch=async()=>({json:async()=>{throw Error();}});
  await assert.rejects(analyzeBasicCase(basic,async()=>'token'),/API 尚未啟用/);
  console.log('PASS: API auth/roles, basic-text allowlist, success, missing key, upstream failure, timeout; client request and errors. OpenAI calls mocked.');
}finally{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;
}
