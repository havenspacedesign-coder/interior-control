import assert from 'node:assert/strict';
import {test} from 'node:test';
import handler from '../../api/ai-case-analyze.js';
import {runPdfParserSelfTest} from '../../server/ai-pdf-self-test.js';
import {renderPdfSelfTest,requestPdfSelfTest} from '../../app/features/ai-database/pdf-self-test.js';

test('PDF self-test permits only active managers and works without OpenAI or case access',async()=>{
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const operation='pdf-parser-self-test';
  async function request({token='mock-firebase-token',role='manager',status='active',body={operation}}={}){
    const urls=[];
    globalThis.fetch=async input=>{
      const url=new URL(input);
      urls.push(url);
      if(url.hostname==='identitytoolkit.googleapis.com')return Response.json({users:[{localId:'mock-uid'}]});
      assert.equal(url.hostname,'firestore.googleapis.com');
      assert.ok(url.pathname.endsWith('/members/mock-uid'));
      return Response.json({fields:{role:{stringValue:role},status:{stringValue:status}}});
    };
    const response={setHeader(){},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};
    await handler({method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body},response);
    return {response,urls};
  }
  try{
    assert.equal((await request({token:null})).response.code,401);
    for(const options of [{role:'admin'},{role:'staff'},{status:'resigned'}]){
      assert.equal((await request(options)).response.code,403);
    }
    for(const extra of [{caseId:'forbidden'},{url:'https://example.com/file.pdf'},{files:[]}]){
      const result=await request({body:{operation,...extra}});
      assert.equal(result.response.code,400);
      assert.equal(result.urls.length,2);
    }
    const {response,urls}=await request();
    assert.equal(response.code,200);
    assert.equal(urls.length,2);
    const result=response.body.pdfSelfTest;
    assert.deepEqual(result.passed,['canvas','domMatrix','pdfjs','worker','open','text','pages']);
    assert.equal(result.pageCount,2);
    assert.deepEqual(result.pages,[{page:1,text:'PDF self-test page one'},{page:2,text:'PDF self-test page two'}]);
    assert.match(renderPdfSelfTest({result}),/自測成功/);
    assert.doesNotMatch(JSON.stringify(response.body),/mock-firebase-token|mock-uid/);
    globalThis.fetch=async (url,init)=>{
      assert.equal(url,'/api/ai-case-analyze');
      assert.equal(init.headers.authorization,'Bearer mock-firebase-token');
      assert.deepEqual(JSON.parse(init.body),{operation});
      return Response.json(response.body);
    };
    assert.deepEqual(await requestPdfSelfTest(async()=> 'mock-firebase-token'),result);
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=originalKey;
  }
});

test('PDF self-test identifies Worker failure without returning raw messages or paths',async()=>{
  const result=await runPdfParserSelfTest(async onStage=>{
    for(const stage of ['canvas','domMatrix','pdfjs'])onStage(stage);
    const cause=Object.assign(new Error('fake-private-secret /private/build/worker.mjs'),{code:'ERR_MODULE_NOT_FOUND'});
    throw Object.assign(new Error('worker',{cause}),{indexCode:'PDF_WORKER_INIT_FAILED'});
  });
  assert.equal(result.ok,false);
  assert.equal(result.error.stage,'worker');
  assert.equal(result.error.name,'Error');
  assert.match(result.error.reason,/ERR_MODULE_NOT_FOUND/);
  assert.doesNotMatch(JSON.stringify(result),/fake-private-secret|private\/build/);
  assert.match(renderPdfSelfTest({result}),/自測失敗.*PDF\.js Worker/);
});

test('PDF self-test rejects extracted text assigned to the wrong page',async()=>{
  const result=await runPdfParserSelfTest(async onStage=>{
    for(const stage of ['canvas','domMatrix','pdfjs','worker'])onStage(stage);
    return {getDocument:()=>({destroy:async()=>{},promise:Promise.resolve({
      numPages:2,getPage:async page=>({getTextContent:async()=>({items:[{
        str:page===1?'PDF self-test page two':'PDF self-test page one',
      }]})}),
    })})};
  });
  assert.equal(result.ok,false);
  assert.equal(result.error.stage,'pages');
  assert.equal(result.error.code,'PDF_PAGE_TEXT_MISMATCH');
  assert.equal(result.error.page,1);
});
