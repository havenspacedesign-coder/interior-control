import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import handler from '../../api/ai-case-analyze.js';
import {analyzeBasicCase,renderAnalysisResult} from '../../app/features/ai-database/analysis-client.js';
const savedFetch=globalThis.fetch,savedKey=process.env.OPENAI_API_KEY;
const basic={name:'測試住宅',area:30,amount:200,year:2026,houseType:'新成屋',scopes:['客廳'],url:'',note:''};
const point=(text,source,page=1)=>({text,citations:[{source,page}]});
const sections={
  overview:[point('新成屋，室內 30 坪。','basic',null)],
  costs:[point('正式報價工程總額為新台幣 200 萬元。','quote')],
  work:[],materials:[],
  drawings:[
    point('客廳與餐廳相連。','drawing'),
    point('只有報價記載的配置。','quote'),
    point('沒有頁碼的尺寸。','drawing',null),
    point('不是有效頁碼的尺寸。','drawing',0),
  ],
  changes:[point('新增玄關櫃。','change')],
  issues:[{text:'無法確認主臥櫃體尺寸。',citations:[]}],
};
const fixture=await readFile(new URL('./fixtures/verification.pdf',import.meta.url));
const fields=object=>Object.fromEntries(Object.entries(object).map(([key,value])=>[key,Array.isArray(value)?{arrayValue:{values:value.map(x=>({stringValue:x}))}}:{stringValue:String(value)}]));
const record=kind=>({document:{fields:fields({id:kind,caseId:'case',kind,storagePath:'aiDatabase/cases/case/'+kind,name:kind+'.pdf',size:fixture.length})}});
const ok=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
async function run({files=['drawing','quote','change'].map(record),mediaStatus=200,bytes=fixture,output=sections}={}){
  const calls=[];let responseBody;
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('accounts:lookup'))return ok({users:[{localId:'manager'}]});
    if(url.includes('/members/'))return ok({fields:fields({role:'manager',status:'active'})});
    if(url.includes('/aiDbCases/'))return ok({fields:fields(basic)});
    if(url.endsWith(':runQuery'))return ok(files);
    if(url.includes('firebasestorage.googleapis.com'))return new Response(bytes,{status:mediaStatus});
    assert.equal(url,'https://api.openai.com/v1/responses');responseBody=JSON.parse(options.body);
    return ok({status:'completed',output_text:JSON.stringify(output)});
  };
  const response={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer user-token'},body:{basic,caseId:'case',files:[{storagePath:'https://evil.invalid'}]}},response);
  return{response,calls,responseBody};
}
try{
  process.env.OPENAI_API_KEY='mock-only';
  const result=await run();assert.equal(result.response.code,200);
  const content=result.responseBody.input[0].content,attachments=content.filter(item=>item.type==='input_file');
  assert.equal(attachments.length,3);
  for(const file of attachments)assert.deepEqual(Buffer.from(file.file_data.split(',')[1],'base64'),fixture,'actual PDF bytes must reach OpenAI');
  assert.deepEqual(attachments.map(file=>file.filename),['施工圖.pdf','正式報價單.pdf','追加減工程.pdf']);
  assert.equal(attachments[0].detail,'high');
  assert.ok(attachments.slice(1).every(file=>!Object.hasOwn(file,'detail')));
  assert.ok(content.every(item=>item.type!=='input_image'));
  assert.ok(result.responseBody.instructions.includes('主要材料／設備／品牌／型號'));
  assert.ok(result.responseBody.instructions.includes('不分析完工照片'));
  assert.deepEqual(result.response.data.sections.drawings,[sections.drawings[0]]);
  const rendered=renderAnalysisResult(result.response.data);
  assert.ok(rendered.includes('正式報價單｜第 1 頁')&&rendered.includes('施工圖｜第 1 頁'));
  assert.ok(rendered.includes('施工圖｜drawing.pdf')&&rendered.includes('引用頁碼：1'));
  assert.ok(rendered.includes('無法確認主臥櫃體尺寸'));
  const unreadable=await run({output:{...sections,drawings:sections.drawings.slice(1)}});
  assert.equal(unreadable.response.code,200);
  assert.ok(renderAnalysisResult(unreadable.response.data).includes('無法確認施工圖中的空間、配置、尺寸或施工資訊。'));
  assert.equal(result.calls.filter(call=>call.url.includes('firebasestorage.googleapis.com')).length,3);
  assert.ok(result.calls.filter(call=>call.url.includes('firebasestorage.googleapis.com')).every(call=>call.options.headers.authorization==='Firebase user-token'&&!call.options.method));
  assert.ok(result.calls.every(call=>!['PATCH','DELETE','PUT'].includes(call.options.method)));
  const query=JSON.parse(result.calls.find(call=>call.url.endsWith(':runQuery')).options.body);
  assert.equal(query.structuredQuery.where.fieldFilter.value.stringValue,'case');
  const missing=await run({files:[record('quote'),record('photo')]});
  assert.equal(missing.response.code,200);assert.deepEqual(missing.response.data.missing,['施工圖','追加減工程']);assert.equal(missing.responseBody.input[0].content.filter(item=>item.type==='input_file').length,1);
  assert.deepEqual(missing.response.data.sections.drawings,[]);
  assert.deepEqual(missing.response.data.sections.changes,[]);
  assert.ok(renderAnalysisResult(missing.response.data).includes('追加減工程｜未提供'));
  const none=await run({files:[]});assert.equal(none.response.code,200);assert.equal(none.calls.some(call=>call.url.includes('firebasestorage.googleapis.com')),false);
  const gone=await run({mediaStatus:404});assert.equal(gone.response.code,404);assert.equal(gone.responseBody,undefined);
  const corrupt=await run({bytes:Buffer.from('not a PDF')});assert.equal(corrupt.response.code,422);assert.equal(corrupt.responseBody,undefined);
  const foreign=record('quote');foreign.document.fields.storagePath={stringValue:'aiDatabase/cases/other/private'};
  const blocked=await run({files:[foreign]});assert.equal(blocked.response.code,422);assert.equal(blocked.calls.some(call=>call.url.includes('firebasestorage.googleapis.com')),false);
  const big=record('quote');big.document.fields.size={stringValue:'50000000'};const tooBig=await run({files:[big]});assert.equal(tooBig.response.code,413);
  const duplicate=await run({files:[record('quote'),record('quote')]});assert.equal(duplicate.response.code,422);
  let sent;
  globalThis.fetch=async(url,options)=>{sent=JSON.parse(options.body);return ok(missing.response.data);};
  const summary=await analyzeBasicCase({id:'case',...basic,files:['never supplied by frontend']},async()=>'user-token');
  assert.equal(sent.caseId,'case');assert.equal(sent.files,undefined);assert.deepEqual(summary,missing.response.data);
  console.log('PASS: backend resolves case PDFs, actual bytes/base64 for all 3 sources, absent PDFs skipped, photos excluded, missing/corrupt/oversized/foreign/duplicate PDF errors, no Firebase writes. OpenAI and Firebase requests mocked.');
}finally{globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
