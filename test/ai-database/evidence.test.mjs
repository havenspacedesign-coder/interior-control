import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {inspectPdfEvidence,locateCitation,verifyChanges,verifyIssues} from '../../server/ai-case-evidence.js';
import {readSummary} from '../../server/ai-case-summary.js';
import {EVIDENCE_POLICY_VERSION,SUMMARY_SECTIONS,verifiedKnowledgeItems} from '../../app/features/ai-database/summary-format.js';
import {renderAnalysisResult} from '../../app/features/ai-database/analysis-client.js';
import {readKnowledge} from '../../server/ai-case-knowledge-fields.js';
import {saveCaseKnowledge,update} from '../../server/ai-case-knowledge.js';

async function pdf(...lines){
  const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica);
  for(const text of lines){
    const page=document.addPage();
    if(text)page.drawText(text,{x:35,y:600,size:11,font});
  }
  return document.save();
}
const left='Revision: A | Cabinet Quantity: 2 pcs';
const right='Revision: A | Cabinet Quantity: 3 pcs';
const change='Cabinet +1 | Amount: +1,200 NT$';
const sources=['drawing','quote','change'].map(kind=>({kind,fileId:kind+'-id',name:kind+'.pdf',label:kind}));
const buffers=new Map([['drawing',await pdf(left,'')],['quote',await pdf(right)],['change',await pdf(change)]]);
const evidence=(source,quote,value,unit='pcs',page=1)=>({source,quote,value,unit,page});
const conflict={type:'conflict',item:'Cabinet',metric:'Quantity',scope:'Revision: A',
  evidence:[evidence('drawing',left,'2'),evidence('quote',right,'3')]};
const adjustment={item:'Cabinet',direction:'addition',evidence:evidence('change',change,'+1,200','NT$')};
const unreadable={type:'unreadable',item:'',metric:'',scope:'',evidence:[evidence('drawing','',null,null,2)]};
const docs=await inspectPdfEvidence(buffers,{issues:[conflict,unreadable],changes:[adjustment]},sources);
assert.equal(docs.get('drawing').pageCount,2);
assert.equal(docs.get('quote').texts.get(1),right);
assert.equal(locateCitation({source:'quote',page:0},docs),null);
assert.equal(locateCitation({source:'quote',page:999999},docs),null);
assert.equal(locateCitation({source:'quote',page:1.1},docs),null);
const confirmed=verifyIssues([conflict],docs)[0];
assert.equal(confirmed.category,'confirmed');
assert.equal(confirmed.verificationStatus,'verified');
assert.deepEqual(confirmed.evidence.map(({sourceId,sourceName,page,value})=>[sourceId,sourceName,page,value]),[
  ['drawing-id','drawing.pdf',1,'2'],['quote-id','quote.pdf',1,'3'],
]);
assert.equal(verifyIssues([{...conflict,scope:''}],docs)[0].verificationStatus,'needs_review');
assert.equal(verifyIssues([{...conflict,scope:'Revision:'}],docs)[0].verificationStatus,'needs_review');
assert.equal(verifyIssues([{...conflict,evidence:[conflict.evidence[0],evidence('quote',right,'30')]}],docs).length,0);
assert.equal(verifyIssues([{...conflict,evidence:[conflict.evidence[0],evidence('quote','Revision: A | Cabinet Quantity: 8 pcs','8')]}],docs).length,0);
assert.equal(verifyIssues([{...conflict,evidence:[conflict.evidence[0],evidence('quote',right,'3','pcs',2)]}],docs).length,0);
assert.equal(verifyIssues([{...conflict,evidence:[]}],docs).length,0);
assert.equal(verifyIssues([{type:'missing',item:'Cabinet',metric:'Quantity',evidence:[conflict.evidence[0]]}],docs).length,0);
const missingText='玄關櫃｜把手規格：未提供。';
docs.get('quote').texts.set(1,[right,missingText].join('\n'));
const missing={type:'missing',item:'玄關櫃',metric:'把手規格',scope:'',
  evidence:[evidence('quote',missingText,null,null)]};
assert.equal(verifyIssues([missing],docs)[0].category,'confirmed');
assert.equal(verifyIssues([{...missing,evidence:[evidence('quote','玄關櫃｜把手規格：未提供',null,null,2)]}],docs).length,0);
assert.equal(verifyChanges([adjustment],docs)[0].amount,1200);
assert.equal(verifyChanges([{...adjustment,direction:'deduction'}],docs).length,0);
assert.equal(verifyChanges([{...adjustment,evidence:{...adjustment.evidence,page:999999}}],docs).length,0);
assert.deepEqual(verifiedKnowledgeItems([confirmed],undefined),[]);
assert.deepEqual(verifiedKnowledgeItems([{...confirmed,revoked:true}],EVIDENCE_POLICY_VERSION),[]);
assert.deepEqual(verifiedKnowledgeItems([{...confirmed,verificationStatus:'needs_review'}],EVIDENCE_POLICY_VERSION),[]);

const blank=Object.fromEntries(Object.keys(SUMMARY_SECTIONS).map(key=>[key,[]]));
const suggestions=[
  {text:'部分施工圖與報價單內容或數量不一致，需進一步核對。',citations:[]},
  {text:'施工期間若有變更，需提前告知以避免追加費用。',citations:[]},
];
const sections=readSummary({...blank,issues:[...suggestions,{...conflict,evidence:[]},unreadable],changes:[]},
  docs,[],{pages:[{page:2,status:'unreadable'}]});
assert.equal(sections.issues.length,1);
assert.equal(sections.issues[0].verificationStatus,'unreadable');
const html=renderAnalysisResult({sections,sources,missing:[],evidencePolicyVersion:EVIDENCE_POLICY_VERSION});
assert.ok(html.includes('本次未發現具充分證據支持的矛盾或缺失'));
assert.ok(html.includes('無法可靠辨識的資訊'));
assert.ok(!html.includes('需進一步核對')&&!html.includes('提前告知'));
const legacy=renderAnalysisResult({sections:{...blank,issues:suggestions},sources,missing:[]});
assert.ok(legacy.includes('原有問題尚未驗證'));
assert.ok(!legacy.includes('已確認的矛盾或缺失'));
console.log('PASS: Original PDF text, real page bounds, numeric disagreement, out-of-context suggestions, and legacy exclusion.');

const citation={source:'quote',page:1};
const originalModel={
  ...blank,costs:[{text:'Grand Total: NT$ 125000',citations:[citation]}],
  materials:[{text:'Cabinet hinge BLUM CLIP-TOP',citations:[citation]}],
  changes:[{item:'Cabinet',direction:'addition',evidence:evidence('change','Cabinet +1 | Amount: NT$ +1,200','+1,200','NT$')}],
  issues:[{...conflict,evidence:[conflict.evidence[0]]}],
  knowledge:{
    quotedTotal:{amount:125000,currency:'TWD',tax:'unknown',citations:[citation]},changeNet:null,spaces:[],
    workItems:[{name:'Painting',category:null,description:'Wall finish',amount:7200,currency:'TWD',tax:'unknown',citations:[citation]}],
    materials:[{name:'Cabinet hinge',material:null,brand:'BLUM',model:'CLIP-TOP',specification:null,citations:[citation]}],
  },
};
const table=await PDFDocument.create();
const font=await table.embedFont(StandardFonts.Helvetica);
for(const lines of [
  ['Grand Total', 'NT$ 125,000', 'Cabinet hinge | BLUM', 'CLIP-', 'TOP', 'Handle | HAFELE',
    'Painting | Wall finish','Subtotal: NT$ 7,200.00','Flooring | Subtotal: NT$ 15,000'],
  ['Cabinet +1', 'Amount: NT$ +1,200'],
]){
  const page=table.addPage();
  lines.forEach((line,index)=>page.drawText(line,{x:35,y:650-index*14,size:11,font}));
}
async function extractPage(index){
  const copy=await PDFDocument.create();
  const [page]=await copy.copyPages(table,[index]);
  copy.addPage(page);
  return copy.save();
}
const tableSources=sources.filter(row=>row.kind!=='drawing');
const tableBytes=new Map([['quote',await extractPage(0)],['change',await extractPage(1)]]);

test('wrapped PDF tables verify totals, materials and change amounts against source text',async()=>{
  const indexed=await inspectPdfEvidence(tableBytes,originalModel,tableSources);
  const summary=readSummary(originalModel,indexed);
  const structured=readKnowledge(originalModel.knowledge,indexed,[],summary.changes);
  assert.equal(summary.costs[0].verificationStatus,'verified');
  assert.equal(structured.quotedTotal.amount,125000);
  assert.equal(structured.quotedTotal.referenceEligible,true);
  assert.equal(structured.materials[0].brand,'BLUM');
  assert.equal(structured.materials[0].model,'CLIP-TOP');
  assert.equal(structured.materials[0].referenceEligible,true);
  assert.equal(structured.workItems[0].amount,7200);
  assert.equal(structured.workItems[0].referenceEligible,true);
  assert.equal(structured.changes[0].amount,1200);
  assert.equal(structured.changes[0].referenceEligible,true);
  assert.deepEqual(summary.issues,[]);
  const inaccurate=readKnowledge({
    ...originalModel.knowledge,quotedTotal:{...originalModel.knowledge.quotedTotal,amount:25000},
    materials:[{...originalModel.knowledge.materials[0],brand:'UNSUPPORTED'},
      {...originalModel.knowledge.materials[0],brand:'HAFELE',model:null}],
  },indexed);
  assert.equal(inaccurate.quotedTotal.referenceEligible,false);
  assert.equal(inaccurate.materials[0].referenceEligible,false);
  assert.equal(inaccurate.materials[1].referenceEligible,false);
  assert.deepEqual(indexed.files.map(file=>[file.source,file.open,file.extractedPages]),[
    ['quote','opened',[1]],['change','opened',[1]],
  ]);
  const paraphrased=readKnowledge({
    ...originalModel.knowledge,
    workItems:[{...originalModel.knowledge.workItems[0],name:'Flooring',description:'Replace all rooms',amount:15000}],
  },indexed);
  assert.equal(paraphrased.workItems[0].referenceEligible,true);
  assert.equal(paraphrased.workItems[0].amount,15000);
  assert.equal(paraphrased.workItems[0].description,null);
});

test('index failures leave an admin summary with pending evidence and a concrete failure code',async()=>{
  const indexed=await inspectPdfEvidence(tableBytes,originalModel,tableSources,async()=>{
    throw Object.assign(Error('test error'),{code:'ERR_MODULE_NOT_FOUND'});
  });
  const summary=readSummary(originalModel,indexed);
  assert.equal(summary.costs[0].text,originalModel.costs[0].text);
  assert.equal(summary.materials[0].text,originalModel.materials[0].text);
  assert.equal(summary.costs[0].verificationReason,'PDF_EVIDENCE_UNAVAILABLE');
  assert.equal(summary.costs[0].verificationStatus,'needs_review');
  assert.equal(summary.materials[0].referenceEligible,false);
  assert.equal(summary.changes[0].verificationStatus,'needs_review');
  assert.deepEqual(summary.issues,[]);
  assert.ok(indexed.diagnostics.every(row=>row.code==='PARSER_LOAD_FAILED'&&row.errorType==='ERR_MODULE_NOT_FOUND'));
  const rendered=renderAnalysisResult({sections:summary,sources:tableSources,missing:[],evidenceDiagnostics:indexed.diagnostics});
  assert.match(rendered,/待驗證/);
  assert.match(rendered,/PDF 證據索引讀取失敗/);
  const unreadable=await inspectPdfEvidence(new Map(tableBytes).set('quote',Buffer.from('%PDF-1.4\nbroken')),originalModel,tableSources);
  assert.ok(unreadable.diagnostics.some(row=>row.source==='quote'&&row.code==='PDF_OPEN_FAILED'));
  const partiallyVerified=readSummary(originalModel,unreadable);
  assert.equal(partiallyVerified.costs[0].verificationStatus,'needs_review');
  assert.equal(partiallyVerified.changes[0].verificationStatus,'verified');
});

test('Firestore keeps raw history but rejects degraded latest and excludes pending items from published knowledge',async()=>{
  const indexed=await inspectPdfEvidence(tableBytes,originalModel,tableSources);
  const fetchBefore=globalThis.fetch;
  const old={updateTime:'2026-11-19T00:00:00Z',fields:update('unused',{
    latestRunId:'existing',financials:{quotedTotal:{amount:125000}},materials:[{name:'Cabinet hinge'}],
  }).update.fields};
  const writes=[];
  let snapshot=null;
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/aiKnowledge/latest'))return snapshot?Response.json(snapshot):new Response(null,{status:404});
    assert.ok(url.endsWith(':commit'));
    writes.push(...JSON.parse(options.body).writes);
    return Response.json({commitTime:'2026-11-20T00:00:00Z'});
  };
  async function save(runId,model,index){
    const sections=readSummary(model,index);
    return saveCaseKnowledge({
      caseId:'case',caseUpdatedAt:null,token:'mock',uid:'admin',runId,startedAt:'2026-11-20T00:00:00Z',model:'mock',
      basic:{name:'Test',area:'',houseType:'',year:'',scopes:[],amount:''},sources:tableSources,missing:[],sections,
      structured:readKnowledge(model.knowledge,index,[],sections.changes),modelOutput:JSON.stringify(model),evidenceDiagnostics:index.diagnostics,
    });
  }
  try{
    const model={...originalModel,knowledge:{...originalModel.knowledge,materials:[
      ...originalModel.knowledge.materials,{...originalModel.knowledge.materials[0],brand:'UNVERIFIED'},
    ]}};
    assert.equal((await save('normal',model,indexed)).isLatest,true);
    const [history,latest]=writes.splice(0);
    assert.equal(history.update.fields.materials.arrayValue.values.length,2);
    assert.equal(latest.update.fields.materials.arrayValue.values.length,1);
    assert.equal(latest.update.fields.modelOutput,undefined);
    assert.match(history.update.fields.modelOutput.stringValue,/UNVERIFIED/);
    assert.equal(history.update.fields.modelOutputStatus.stringValue,'needs_review');
    snapshot=old;
    const againstLegacy=await save('legacy-replacement',originalModel,indexed);
    assert.equal(againstLegacy.isLatest,true);
    assert.equal(againstLegacy.publication.trustedRunId,'legacy-replacement');
    writes.length=0;
    snapshot={updateTime:'2026-11-19T00:00:00Z',fields:latest.update.fields};
    const failed=await inspectPdfEvidence(tableBytes,model,tableSources,async()=>{throw Error('mock parser unavailable');});
    const failedRun=await save('failed',model,failed);
    assert.equal(failedRun.publication.reason,'PDF_EVIDENCE_INDEX_FAILED');
    assert.equal(failedRun.publication.trustedRunId,'normal');
    assert.equal(writes.length,1);
    assert.match(writes[0].update.name,/aiKnowledgeRuns\/failed$/);
    writes.length=0;
    const blankModel={...originalModel,knowledge:{...originalModel.knowledge,materials:[],quotedTotal:null}};
    assert.equal((await save('degraded',blankModel,indexed)).publication.reason,'VERIFIED_COVERAGE_REGRESSION');
    assert.equal(writes.length,1);
    assert.match(writes[0].update.name,/aiKnowledgeRuns\/degraded$/);
  }finally{globalThis.fetch=fetchBefore;}
});
