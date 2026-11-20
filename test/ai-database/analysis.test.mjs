import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPhotoLoader} from '../../app/features/ai-database/photo-loader.js';
import handler from '../../api/ai-case-analyze.js';
import {analyzeBasicCase,renderAnalysisResult} from '../../app/features/ai-database/analysis-client.js';
import {SUMMARY_SECTIONS} from '../../app/features/ai-database/summary-format.js';
import {createProductionStore} from '../../app/features/ai-database/firebase-store.js';

const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
const basic={name:'測試住宅',area:30,amount:200,year:2026,houseType:'新成屋',scopes:['客廳'],url:'',note:'測試文字'};
const sections=Object.fromEntries(Object.keys(SUMMARY_SECTIONS).map(key=>[key,[]]));
sections.overview=[{text:'## **測試住宅** <script>保留純文字</script>',citations:[{source:'basic',page:null}]}];
const report={sections,sources:[],missing:['施工圖','正式報價單','追加減工程']};
const casePath='aiDbCases/case';
const runPath=casePath+'/aiKnowledgeRuns/saved-run';
const getSnapshot=data=>({exists:()=>data!==undefined,data:()=>data});
const store=createProductionStore({
  db:{},auth:{currentUser:{uid:'manager'}},storage:{},storageSdk:{},
  fs:{
    doc:(_db,...path)=>path.join('/'),collection:(_db,...path)=>path.join('/'),
    getDocFromServer:async path=>getSnapshot({
      'members/manager':{role:'manager',status:'active'},
      [casePath+'/aiKnowledge/latest']:{latestRunId:'saved-run'},
      [runPath]:{...report,drawing:{totalPages:2,reviewedPages:2},
        analyzedAt:{toDate:()=>new Date('2026-11-20T05:00:00Z')}},
    }[path]),
    getDocsFromServer:async path=>{
      assert.equal(path,runPath+'/drawingPages');
      return {docs:[getSnapshot({page:2,status:'unreadable'}),getSnapshot({page:1,status:'recognized'})]};
    },
  },
});
const restored=await store.loadCaseAnalysis('case');
assert.deepEqual(restored.drawingReview.pages.map(({page})=>page),[1,2]);
assert.equal(restored.knowledgeSave.analyzedAt,'2026-11-20T05:00:00.000Z');
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
const handlers={},result={innerHTML:''},alert={textContent:'',hidden:true},button={dataset:{action:'case.analyze'},disabled:false,textContent:''};
const state={revision:0,cases:[{id:'case',...basic}],files:[],cleanupPaths:[],categories:[]};
const before=JSON.stringify(state);
let requests=0,resolve,reject,savedReads=0;
const root={innerHTML:'',contains:()=>false,
  querySelector(selector){return selector==='[data-analysis-result]'?result:selector==='[data-analysis-error]'?alert:selector==='[data-action="case.analyze"]'?button:null;},
  querySelectorAll:()=>[],setAttribute(){},removeAttribute(){},
  addEventListener(name,callback){if(!handlers[name])handlers[name]=callback;},
};
const sandbox={document:{querySelector:()=>true,activeElement:null},URL,Map,Set,queueMicrotask,createPhotoLoader,
  window:{addEventListener(){}},esc:x=>x,renderNavigation:()=>'',renderCaseContent:()=>'',cleanupFiles:async()=>{},LEARNING_SCHEMA:{version:1},
  renderAnalysisResult,analyzeBasicCase:()=>{requests++;return new Promise((yes,no)=>{resolve=yes;reject=no;});},
};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
sandbox.mountAiDatabase(root,{canManage:()=>true,user:()=>({}),createStore:()=>({label:'test',load:async()=>state,subscribe:()=>()=>{},
  loadCaseAnalysis:async caseId=>{assert.equal(caseId,'case');savedReads++;return report;},
  commit:()=>assert.fail('Analysis must not write case data'),
})}).render();
await new Promise(done=>setImmediate(done));
const click=control=>handlers.click({target:{closest:()=>control}});
click({dataset:{action:'case.select',id:'case'}});
await new Promise(done=>setImmediate(done));
assert.equal(savedReads,1);
assert.ok(result.innerHTML.includes('測試住宅'));
click(button);click(button);
assert.equal(requests,1);assert.equal(button.disabled,true);assert.equal(button.textContent,'AI 分析中…');
resolve(report);await new Promise(done=>setImmediate(done));
const rendered=result.innerHTML;
assert.equal((rendered.match(/<h4>/g)||[]).length,8);
assert.ok(rendered.includes('<li>測試住宅 &lt;script&gt;保留純文字&lt;/script&gt;'));
assert.ok(!rendered.includes('##')&&!rendered.includes('**')&&!rendered.includes('<script>'));
assert.ok(rendered.includes('未提供施工圖，無法確認圖面資訊。'));
assert.equal(button.disabled,false);
click(button);reject(Error('測試失敗提示'));await new Promise(done=>setImmediate(done));
assert.equal(alert.hidden,false);assert.equal(alert.textContent,'測試失敗提示');assert.equal(button.disabled,false);
assert.equal(result.innerHTML,rendered);assert.equal(JSON.stringify(state),before);
console.log('PASS: mounted analysis UI displays eight sections, strips Markdown, escapes text, and preserves results on retry failure.');
try{
  process.env.OPENAI_API_KEY='test-secret-never-in-browser';
  let result=await run({method:'GET'});assert.equal(result.response.code,405);assert.equal(result.calls.length,0);
  result=await run({token:''});assert.equal(result.response.code,401);assert.equal(result.calls.length,0);
  result=await run({replies:[{ok:false,json:async()=>({})}]});assert.equal(result.response.code,401);
  for(const [role,status] of [['staff','active'],['manager','resigned']]){
    result=await run({replies:[account(),member(role,status)]});assert.equal(result.response.code,403);assert.equal(result.calls.length,2);
  }
  for(const role of ['manager','admin']){
    result=await run({body:{basic:{...basic,files:['do-not-send'],photo:'do-not-send'}},replies:[account(),member(role),ok({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(sections)}]}]})]});
    assert.equal(result.response.code,200);
    assert.equal(result.response.data.sections.overview[0].text,sections.overview[0].text);
    assert.equal(result.response.data.sections.overview[0].verificationStatus,'ai_inference');
    assert.deepEqual(result.response.data.sections.issues,[]);
    assert.ok(result.response.data.summary.includes('8. 資料來源'));
    const outbound=JSON.parse(result.calls[2].options.body);
    assert.deepEqual(JSON.parse(outbound.input),Object.fromEntries(Object.entries(basic).map(([k,v])=>[k,k==='scopes'?v:String(v)])));
    assert.equal(outbound.store,false);assert.equal(outbound.tools,undefined);
    assert.equal(outbound.text.format.strict,true);
    assert.deepEqual(outbound.text.format.schema.required,Object.keys(SUMMARY_SECTIONS));
    assert.ok(result.calls.slice(0,2).every(call=>!call.options.method||call.options.method==='POST'));
    assert.equal(JSON.stringify(result.response.data).includes(process.env.OPENAI_API_KEY),false);
  }
  result=await run({body:{basic:{...basic,note:'x'.repeat(13000)}},replies:[account(),member()]});assert.equal(result.response.code,400);assert.equal(result.calls.length,2);
  delete process.env.OPENAI_API_KEY;
  result=await run({replies:[account(),member()]});assert.equal(result.response.code,503);
  process.env.OPENAI_API_KEY='test-secret';
  result=await run({replies:[account(),member(),{ok:false,status:429,json:async()=>({error:{message:'secret internal error'}})}]});assert.equal(result.response.code,429);assert.ok(!JSON.stringify(result.response.data).includes('secret internal error'));
  result=await run({replies:[account(),member(),ok({status:'incomplete',output_text:'partial'})]});assert.equal(result.response.code,502);
  result=await run({replies:[account(),member(),ok({status:'completed',output_text:'{"overview":[]}'})]});assert.equal(result.response.code,502);
  result=await run({replies:[account(),member(),Object.assign(new Error(),{name:'TimeoutError'})]});assert.equal(result.response.code,504);

  await assert.rejects(analyzeBasicCase(basic),/本機展示帳號/);
  let sent;
  globalThis.fetch=async(url,options)=>{sent={url,options};return ok(report);};
  const summary=await analyzeBasicCase({...basic,files:['not sent'],storagePath:'not sent'},async()=>'id-token');
  assert.deepEqual(summary,report);
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
