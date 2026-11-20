import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
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
const money={amount:0,currency:'TWD',tax:'included'};
const knowledge={
  quotedTotal:{...money,citations:[{source:'quote',page:1}]},changeNet:null,
  workItems:[{name:'櫃體',category:'木作',description:'玄關櫃',...money,citations:[{source:'quote',page:1}]}],
  materials:[{name:'鉸鍊',material:null,brand:'BLUM',model:null,specification:null,citations:[{source:'quote',page:1}]}],
  spaces:[{name:'客廳',layout:'開放式',relationships:['連接餐廳'],citations:[{source:'drawing',page:1}]}],
  changes:[],
};
const fixture=await readFile(new URL('./fixtures/verification.pdf',import.meta.url));
const {PDFDocument,StandardFonts}=createRequire(import.meta.url)('pdf-lib');
const reviewedPage=page=>page===4
  ?{page,readable:true,complete:true,drawingType:'天花配置圖',content:'天花局部降板。'}
  :{page,readable:true,complete:true,drawingType:'平面配置圖',content:'客廳與餐廳相連。',spaceNames:['客廳'],dimensions:['走道 900 mm']};
const fields=object=>Object.fromEntries(Object.entries(object).map(([key,value])=>[key,Array.isArray(value)?{arrayValue:{values:value.map(x=>({stringValue:x}))}}:{stringValue:String(value)}]));
const record=kind=>({document:{fields:fields({id:kind,caseId:'case',kind,storagePath:'aiDatabase/cases/case/'+kind,name:kind+'.pdf',size:fixture.length})}});
const ok=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const commitTime='2026-11-20T05:00:00.000Z';
async function run({files=['drawing','quote','change'].map(record),mediaStatus=200,bytes=fixture,output=sections,
  pageResults=pages=>pages.map(reviewedPage),saveFailed=false,readDenied=false,newerRun=false,rawOutput=null}={}){
  const calls=[],pageRequests=[];let responseBody;
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('accounts:lookup'))return ok({users:[{localId:'manager'}]});
    if(url.includes('/members/'))return ok({fields:fields({role:'manager',status:'active'})});
    if(url.endsWith('/aiKnowledge/latest')&&readDenied)return new Response(null,{status:403});
    if(url.endsWith('/aiKnowledge/latest'))return newerRun?ok({updateTime:commitTime,fields:{
      startedAt:{timestampValue:'2099-01-01T00:00:00Z'},latestRunId:{stringValue:'newer-run'},
    }}):new Response(null,{status:404});
    if(url.endsWith(':commit'))return saveFailed
      ?new Response(JSON.stringify({error:{status:'PERMISSION_DENIED'}}),{status:403}):ok({commitTime});
    if(url.includes('/aiDbCases/'))return ok({fields:fields(basic)});
    if(url.endsWith(':runQuery'))return ok(files);
    if(url.includes('firebasestorage.googleapis.com'))return new Response(bytes,{status:mediaStatus});
    assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(options.body);
    if(body.text.format.name==='construction_drawing_pages'){
      const input=body.input[0].content;
      const pages=[];
      for(const item of input.filter(({type})=>type==='input_file')){
        const page=Number(item.filename.match(/^drawing-page-(\d+)\.pdf$/)?.[1]);
        const doc=await PDFDocument.load(Buffer.from(item.file_data.split(',')[1],'base64'));
        pages.push({page,detail:item.detail,count:doc.getPageCount(),width:doc.getPage(0).getWidth()});
      }
      pageRequests.push(...pages);
      return ok({status:'completed',output_text:JSON.stringify({pages:pageResults(pages.map(item=>item.page))})});
    }
    responseBody=body;
    return ok({status:'completed',output_text:rawOutput??JSON.stringify({knowledge,...output})});
  };
  const response={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer user-token'},body:{basic,caseId:'case',files:[{storagePath:'https://evil.invalid'}]}},response);
  return{response,calls,responseBody,pageRequests};
}

async function checkSegmentedDrawing(){
  const pdf=await PDFDocument.create();
  for(let page=1;page<=32;page++)pdf.addPage();
  const bytes=await pdf.save();
  const hash=createHash('sha256').update(bytes).digest('hex');
  const base='projects/have000/databases/(default)/documents';
  const casePath=base+'/aiDbCases/case';
  const docs=new Map();
  let sequence=0;
  const put=(name,fields)=>docs.set(name,{name,fields,updateTime:new Date(Date.UTC(2025,0,1)+sequence++).toISOString()});
  put(casePath+'/aiKnowledge/latest',{
    latestRunId:{stringValue:'previous'},sources:{arrayValue:{values:[{mapValue:{fields:fields({kind:'drawing',sha256:hash})}}]}},
    startedAt:{timestampValue:'2025-01-01T00:00:00Z'},
  });
  for(let page=1;page<=25;page++){
    put(casePath+'/aiKnowledgeRuns/previous/drawingPages/'+page,{
      ...fields({status:'recognized',drawingType:'平面配置圖',content:'已保存的頁面',plans:['原紀錄']}),
      page:{integerValue:String(page)},
    });
  }
  const calls=[],pageAttempts=new Map();
  let canFinishLastPage=false;
  globalThis.fetch=async(url,options)=>{
    if(url.includes('accounts:lookup'))return ok({users:[{localId:'manager'}]});
    if(url.includes('/members/'))return ok({fields:fields({role:'manager',status:'active'})});
    if(url.endsWith(':runQuery'))return ok([record('drawing')]);
    if(url.includes('firebasestorage.googleapis.com'))return new Response(bytes);
    if(url===`https://firestore.googleapis.com/v1/${casePath}`)return ok({fields:fields(basic)});
    if(url.endsWith(':commit')){
      const {writes}=JSON.parse(options.body);
      for(const {update,currentDocument} of writes){
        const existing=docs.get(update.name);
        if((currentDocument?.exists===false&&existing)||(currentDocument?.updateTime&&existing?.updateTime!==currentDocument.updateTime)){
          return new Response(JSON.stringify({error:{status:'FAILED_PRECONDITION'}}),{status:400});
        }
      }
      for(const {update} of writes)put(update.name,update.fields);
      return ok({commitTime,writeResults:writes.map(({update})=>({updateTime:docs.get(update.name).updateTime}))});
    }
    if(url.startsWith('https://firestore.googleapis.com/v1/')){
      const path=url.slice('https://firestore.googleapis.com/v1/'.length);
      if(path.includes('?pageSize=')){
        const prefix=path.split('?')[0]+'/';
        return ok({documents:[...docs.values()].filter(({name})=>name.startsWith(prefix)&&!name.slice(prefix.length).includes('/'))});
      }
      return docs.has(path)?ok(docs.get(path)):new Response(null,{status:404});
    }
    assert.equal(url,'https://api.openai.com/v1/responses');
    const request=JSON.parse(options.body);
    if(request.text.format.name==='construction_drawing_pages'){
      const pages=request.input[0].content.filter(({type})=>type==='input_file')
        .map(({filename})=>Number(filename.match(/\d+/)[0]));
      calls.push(pages);
      for(const page of pages)pageAttempts.set(page,(pageAttempts.get(page)||0)+1);
      if(pages.includes(26)&&pageAttempts.get(26)===1){
        return ok({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}});
      }
      return ok({status:'completed',output_text:JSON.stringify({
        pages:pages.filter(page=>page!==32||canFinishLastPage).map(page=>({
          ...reviewedPage(page),complete:page!==31||pageAttempts.get(31)>1,
          reason:page===31&&pageAttempts.get(31)===1?'部分標註無法確認':'',
          materials:['木皮'],elevations:['櫃體立面'],plans:['配置'],
        })),
      })});
    }
    assert.ok(request.input[0].content.every(({type})=>type!=='input_file'),'summary must not reread drawings');
    return ok({status:'completed',output_text:JSON.stringify({...sections,knowledge})});
  };
  const invoke=async(drawingMode,sessionId)=>{
    const response={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
    await handler({method:'POST',headers:{authorization:'Bearer user-token'},body:{basic,caseId:'case',drawingMode,sessionId}},response);
    assert.equal(response.code,200,JSON.stringify(response.data));
    return response.data;
  };
  async function runSession(sessionId){
    for(let step=0;step<16;step++){
      const result=await invoke('step',sessionId);
      if(result.drawingStep.done)return invoke('finalize',sessionId);
    }
    assert.fail('Drawing session did not complete');
  }
  const first=await runSession('11111111-1111-4111-8111-111111111111');
  assert.equal(first.drawingReview.recognizedPages,31);
  assert.equal(first.drawingReview.failedPages,1);
  assert.equal(first.drawingReview.isComplete,false);
  assert.equal(first.drawingReview.pages[31].reasonCode,'MISSING_PAGE');
  assert.equal(first.drawingReview.pages[25].lastFailureCode,'OUTPUT_LIMIT');
  assert.equal(first.drawingReview.pages[30].lastFailureCode,'PARTIAL_CONTENT');
  assert.equal(pageAttempts.get(32),3);
  assert.ok(calls.flat().every(page=>page>=26));
  assert.ok(calls.every(batch=>batch.length<=2));
  const firstRun=casePath+'/aiKnowledgeRuns/'+first.knowledgeSave.runId;
  assert.equal(docs.get(firstRun).fields.status.stringValue,'partial');
  assert.equal([...docs.keys()].filter(path=>path.startsWith(firstRun+'/drawingPages/')).length,32);
  assert.equal(docs.get(firstRun+'/drawingPages/32').fields.content.nullValue,null);
  const before=calls.length;
  canFinishLastPage=true;
  const next=await runSession('22222222-2222-4222-8222-222222222222');
  assert.deepEqual(calls.slice(before),[[32]]);
  assert.equal(next.drawingReview.recognizedPages,32);
  assert.equal(next.drawingReview.failedPages,0);
  assert.equal(next.drawingReview.isComplete,true);
  const nextRun=casePath+'/aiKnowledgeRuns/'+next.knowledgeSave.runId;
  assert.equal(docs.get(nextRun).fields.status.stringValue,'complete');
  assert.equal(docs.get(nextRun+'/drawingPages/32').fields.materials.arrayValue.values[0].stringValue,'木皮');
  assert.equal(docs.get(firstRun).fields.status.stringValue,'partial');
}
try{
  process.env.OPENAI_API_KEY='mock-only';
  await checkSegmentedDrawing();
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
  assert.ok(result.responseBody.text.format.schema.required.includes('knowledge'));
  const saved=result.response.data.knowledgeSave;
  assert.equal(saved.analyzedAt,commitTime);
  assert.equal(saved.isLatest,false);
  assert.equal(saved.publication.reason,'NO_VERIFIED_PDF_KNOWLEDGE');
  const writes=JSON.parse(result.calls.find(call=>call.url.endsWith(':commit')).options.body).writes;
  assert.ok(!writes.some(write=>write.update?.name.endsWith('/aiKnowledge/latest')));
  const runDoc=writes.find(write=>write.update?.name.endsWith('/aiKnowledgeRuns/'+saved.runId)).update.fields;
  const pageDoc=writes.find(write=>write.update?.name.endsWith('/drawingPages/1')).update.fields;
  assert.equal(result.response.data.runId,saved.runId);
  assert.equal(runDoc.diagnostics.mapValue.fields.runId.stringValue,saved.runId);
  assert.deepEqual(runDoc.sections.mapValue.fields.issues.arrayValue.values,[]);
  assert.equal(runDoc.caseFacts.mapValue.fields.areaPing.integerValue,'30');
  assert.equal(runDoc.financials.mapValue.fields.quotedTotal.mapValue.fields.amount.integerValue,'0');
  assert.equal(runDoc.financials.mapValue.fields.quotedTotal.mapValue.fields.referenceEligible.booleanValue,false);
  assert.equal(runDoc.financials.mapValue.fields.completedSettlement.mapValue.fields.amount.integerValue,'200');
  assert.equal(runDoc.drawing.mapValue.fields.pages,undefined);
  assert.equal(pageDoc.sourceFileId.stringValue,'drawing');
  assert.equal(pageDoc.spaceNames.arrayValue.values[0].stringValue,'客廳');
  assert.equal(pageDoc.dimensions.arrayValue.values[0].stringValue,'走道 900 mm');
  assert.ok(writes.every(write=>write.update.name.includes('/aiDbCases/case/')&&
    !write.update.name.endsWith('/aiDbCases/case')));
  const failed=await run({saveFailed:true});
  assert.equal(failed.response.code,200);
  assert.equal(failed.response.data.knowledgeSave.code,'PERMISSION_DENIED');
  assert.match(failed.response.data.knowledgeSave.error,/Firestore 拒絕儲存.*權限不足/);
  assert.equal(failed.response.data.diagnostics.firestore.state,'failed');
  assert.equal(failed.response.data.diagnostics.firestore.reason,'PERMISSION_DENIED');
  const captured=[];
  const originalInfo=console.info;
  let invalid;
  try{
    console.info=(...entries)=>captured.push(entries);
    invalid=await run({rawOutput:'{"private":"CONFIDENTIAL QUOTE",'});
  }finally{console.info=originalInfo;}
  assert.equal(invalid.response.code,502);
  const trace=invalid.response.data.diagnostics;
  assert.equal(trace.json.state,'invalid_json');
  assert.equal(trace.openAI.state,'completed');
  assert.equal(trace.firestore.latestUpdated,false);
  const failedWrites=JSON.parse(invalid.calls.find(call=>call.url.endsWith(':commit')).options.body).writes;
  assert.equal(failedWrites.length,1);
  assert.ok(failedWrites[0].update.name.endsWith('/aiKnowledgeRuns/'+trace.runId));
  assert.match(failedWrites[0].update.fields.modelOutput.stringValue,/CONFIDENTIAL QUOTE/);
  assert.doesNotMatch(JSON.stringify(captured),/CONFIDENTIAL QUOTE|user-token|mock-only/);
  assert.equal(JSON.parse(captured.find(row=>row[0]==='ai_case_analysis')[1]).runId,trace.runId);
  const readDenied=await run({readDenied:true});
  assert.equal(readDenied.response.code,200);
  assert.equal(readDenied.response.data.knowledgeSave.code,'PERMISSION_DENIED');
  assert.ok(!readDenied.calls.some(call=>call.url.endsWith(':commit')));
  const older=await run({newerRun:true});
  assert.equal(older.response.data.knowledgeSave.isLatest,false);
  assert.ok(JSON.parse(older.calls.find(call=>call.url.endsWith(':commit')).options.body).writes
    .every(write=>!write.update?.name.endsWith('/aiKnowledge/latest')));
  assert.deepEqual(result.response.data.sections.drawings.map(({text})=>text),sections.drawings.map(row=>row.text));
  const rendered=renderAnalysisResult(result.response.data);
  assert.ok(rendered.includes('正式報價單｜第 1 頁')&&rendered.includes('施工圖｜第 1 頁'));
  assert.ok(rendered.includes('施工圖｜drawing.pdf')&&rendered.includes('待核對來源 施工圖｜第 1 頁'));
  assert.ok(!rendered.includes('施工圖重點引用頁碼：'));
  assert.ok(rendered.includes('施工圖共 1 頁，已分析 1 頁'));
  assert.ok(rendered.includes('逐頁分析紀錄'));
  assert.ok(!rendered.includes('無法確認主臥櫃體尺寸'));
  assert.ok(rendered.includes('本次未發現具充分證據支持的矛盾或缺失'));
  const unreadable=await run({output:{...sections,drawings:sections.drawings.slice(1)}});
  assert.equal(unreadable.response.code,200);
  assert.ok(unreadable.response.data.sections.drawings.every(row=>row.verificationStatus==='needs_review'));
  const multipage=await PDFDocument.create();
  const font=await multipage.embedFont(StandardFonts.Helvetica);
  for(let page=1;page<=13;page++){
    const sheet=multipage.addPage([600+page,800]);
    if(page===2||page===4)sheet.drawText('Elevated ceiling',{x:40,y:650,size:11,font});
  }
  const drawing=await multipage.save();
  const extraPoint=point('Elevated ceiling','drawing',4);
  const mixed=await run({bytes:drawing,files:[record('drawing')],
    pageResults:pages=>pages.filter(page=>page!==3).map(page=>page===2
      ?{page,readable:false,drawingType:'',content:''}:reviewedPage(page)),
    output:{...sections,drawings:[sections.drawings[0],extraPoint,point('Elevated ceiling','drawing',2),
      point('引用未回報頁。','drawing',3),point('引用不存在的頁。','drawing',14),
      {text:'結論的一部分缺少證據。',citations:[{source:'drawing',page:1},{source:'drawing',page:3}]},
    ]},
  });
  assert.equal(mixed.response.code,200);
  assert.deepEqual(mixed.pageRequests.sort((a,b)=>a.page-b.page),
    Array.from({length:13},(_,index)=>({page:index+1,detail:'high',count:1,width:601+index})));
  assert.equal(mixed.response.data.drawingReview.totalPages,13);
  assert.equal(mixed.response.data.drawingReview.reviewedPages,12);
  assert.equal(mixed.response.data.drawingReview.pages[1].status,'unreadable');
  assert.equal(mixed.response.data.drawingReview.pages[2].status,'request_failed');
  assert.equal(mixed.response.data.drawingReview.pages[2].reasonCode,'MISSING_PAGE');
  assert.equal(mixed.response.data.sections.drawings.length,5);
  assert.equal(mixed.response.data.sections.drawings[1].verificationStatus,'verified');
  assert.equal(mixed.response.data.sections.drawings[2].verificationReason,'DRAWING_PAGE_NOT_RECOGNIZED');
  assert.equal(mixed.response.data.sections.drawings[4].verificationReason,'PAGE_OUT_OF_RANGE');
  assert.equal(mixed.response.data.diagnostics.validationCounts['summary.drawings'].pending,4);
  assert.equal(mixed.response.data.knowledgeSave.isLatest,true);
  assert.deepEqual(mixed.response.data.diagnostics.pdf[0].extractedPages,[2,4]);
  assert.equal(mixed.response.data.diagnostics.firestore.latestWritten.groups.drawing,1);
  const published=JSON.parse(mixed.calls.find(call=>call.url.endsWith(':commit')).options.body).writes
    .find(write=>write.update.name.endsWith('/aiKnowledge/latest')).update.fields;
  assert.equal(published.latestRunId.stringValue,mixed.response.data.runId);
  assert.equal(published.diagnostics,undefined);
  assert.equal(published.modelOutput,undefined);
  const reviewHtml=renderAnalysisResult(mixed.response.data);
  assert.ok(reviewHtml.includes('施工圖共 13 頁，已分析 12 頁'));
  assert.ok(reviewHtml.includes('第 2 頁無法可靠辨識'));
  assert.ok(reviewHtml.includes('第 3 頁請求失敗'));
  assert.ok(reviewHtml.includes('第 13 頁｜平面配置圖'));
  assert.ok(reviewHtml.includes('施工圖重點引用頁碼：4'));
  assert.ok(reviewHtml.includes('Elevated ceiling<small class="aidb-muted">施工圖｜第 4 頁</small>'));
  const coverage=JSON.parse(mixed.responseBody.input[0].content[0].text).drawingPages;
  assert.deepEqual(coverage.map(({page})=>page),[1,4,5,6,7,8,9,10,11,12,13]);
  const complete=await run({bytes:drawing,files:[record('drawing')],
    output:{...sections,drawings:[sections.drawings[0],extraPoint]},
  });
  const completeHtml=renderAnalysisResult(complete.response.data);
  assert.ok(completeHtml.includes('施工圖共 13 頁，已分析 13 頁'));
  assert.ok(completeHtml.includes('施工圖重點引用頁碼：4'));
  assert.equal(result.calls.filter(call=>call.url.includes('firebasestorage.googleapis.com')).length,3);
  assert.ok(result.calls.filter(call=>call.url.includes('firebasestorage.googleapis.com')).every(call=>call.options.headers.authorization==='Firebase user-token'&&!call.options.method));
  assert.ok(result.calls.every(call=>!['PATCH','DELETE','PUT'].includes(call.options.method)));
  const query=JSON.parse(result.calls.find(call=>call.url.endsWith(':runQuery')).options.body);
  assert.equal(query.structuredQuery.where.fieldFilter.value.stringValue,'case');
  const missing=await run({files:[record('quote'),record('photo')]});
  assert.equal(missing.response.code,200);assert.deepEqual(missing.response.data.missing,['施工圖','追加減工程']);assert.equal(missing.responseBody.input[0].content.filter(item=>item.type==='input_file').length,1);
  assert.deepEqual(missing.response.data.sections.drawings,[]);
  assert.equal(missing.response.data.drawingReview,undefined);
  assert.deepEqual(missing.pageRequests,[]);
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
  console.log('PASS: PDFs, separate drawing page documents, structured case knowledge, retained latest version and save failures. OpenAI and Firebase requests mocked.');
}finally{globalThis.fetch=savedFetch;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
