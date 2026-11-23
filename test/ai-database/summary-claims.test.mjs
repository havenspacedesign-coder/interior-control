import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {inspectPdfEvidence} from '../../server/ai-case-evidence.js';
import {readSummary,summaryFormat} from '../../server/ai-case-summary.js';
import {readKnowledge} from '../../server/ai-case-knowledge-fields.js';
import {saveCaseKnowledge} from '../../server/ai-case-knowledge.js';
import {SUMMARY_SECTIONS} from '../../app/features/ai-database/summary-format.js';

const empty=Object.fromEntries(Object.keys(SUMMARY_SECTIONS).map(key=>[key,[]]));
const sources=['quote','drawing','change'].map(kind=>({kind,label:kind,name:kind+'.pdf',fileId:kind}));
async function pdf(sheets){
  const doc=await PDFDocument.create();
  const font=await doc.embedFont(StandardFonts.Helvetica);
  for(const sheet of sheets){
    const page=doc.addPage();
    for(const [text,x,y] of sheet)page.drawText(text,{x,y,font,size:12});
  }
  return doc.save();
}
const bytes=new Map([
  ['quote',await pdf([[['Grand total:',40,750],['NT$ 120,000.00',40,725],
    ['Hinge',40,700],['Handle',40,675],['Brand: BLUM Model: 71B3550',240,700],['Brand: HAFELE Model: H100',240,675],
    ['Cabinet installation',40,630],['Surface preparation',40,605],['Amount: NT$ 20,000',240,630],['Amount: NT$ 2,000',240,605],
    ['Recommended optional upgrade',40,565]],[['Unrelated page',40,750]],[]])],
  ['drawing',await pdf([[['Visitor corridor',40,750],['Clear width: 900 mm',220,750],['Visitor seats',40,720],['Quantity: 4 pcs',220,720]]])],
  ['change',await pdf([[['Add cabinet | Amount: NT$ +12,000',40,750]]])],
]);
function point(text,kind,value,quote,subject=null,unit=null,source='quote',page=1){
  return {text,citations:[{source,page}],claim:{kind,subject,value,unit,quote}};
}
const known={
  ...empty,
  costs:[point('Total contract price is 120,000 New Taiwan dollars','quotedTotal','120,000','Grand total:\nNT$ 120,000.00',null,'TWD')],
  materials:[
    point('The door hinges are supplied by Blum','brand','BLUM','Hinge Brand: BLUM Model: 71B3550','Hinge'),
    point('The specified hinge model is 71B3550','model','71B3550','Hinge Brand: BLUM Model: 71B3550','Hinge'),
  ],
  drawings:[
    point('The visitor hallway has 900 mm of clear width','width','900','Visitor corridor Clear width: 900 mm','Visitor corridor','mm','drawing'),
    point('There are four visitor seats','quantity','4','Visitor seats Quantity: 4 pcs','Visitor seats','pcs','drawing'),
  ],
  work:[point('Installing the cabinetry costs NT$ 20,000','amount','20,000','Cabinet installation Amount: NT$ 20,000','Cabinet installation','TWD')],
  overview:[{text:'The interior measures 24 ping',citations:[],claim:{kind:'area',subject:null,value:'24',unit:'坪',quote:null}}],
  changes:[{item:'Extra cupboard installation',originalItem:'Add cabinet',direction:'addition',
    evidence:{source:'change',page:1,quote:'Add cabinet | Amount: NT$ +12,000',value:'12000',unit:'NT$'}}],
};
const basic={name:'Test',area:'24',houseType:'',year:'',scopes:[],amount:''};
const drawing=[{page:1}];
const makeIndex=data=>inspectPdfEvidence(bytes,data,sources);
const summary=(data,index,sourceBasic=basic)=>readSummary(data,index,drawing,undefined,undefined,sourceBasic);

test('typed claims verify paraphrases against wrapped lines, positioned table rows, drawing labels and Firebase fields',async()=>{
  const index=await makeIndex(known);
  const result=summary(known,index);
  for(const section of ['overview','costs','work','materials','drawings','changes']){
    assert.ok(result[section].every(row=>row.verificationStatus==='verified'),JSON.stringify(result[section]));
  }
  assert.equal(result.costs[0].claim.value,120000);
  assert.equal(result.costs[0].summaryText,known.costs[0].text);
  assert.equal(result.costs[0].evidence[0].quote,'Grand total:\nNT$ 120,000.00');
  assert.equal(result.materials[0].evidence[0].page,1);
  assert.equal(result.materials[0].evidence[0].sourceId,'quote');
  assert.equal(result.overview[0].evidence[0].field,'area');
  assert.equal(result.overview[0].citations[0].page,null);
  assert.equal(result.changes[0].amount,12000);
  assert.equal(result.changes[0].summaryText,'Extra cupboard installation');
  const knowledge={quotedTotal:null,changeNet:null,spaces:[],
    materials:[{name:'Hinge',material:null,brand:'BLUM',model:'71B3550',specification:null,citations:[{source:'quote',page:1}]}],
    workItems:[{name:'Cabinet installation',category:null,description:'Cabinet installation',amount:20000,currency:'TWD',tax:'unknown',
      citations:[{source:'quote',page:1}]}]};
  assert.equal(readKnowledge(knowledge,index).materials[0].verificationStatus,'verified');
  assert.equal(readKnowledge(knowledge,index).workItems[0].verificationStatus,'verified');
  assert.ok(summaryFormat(sources,true).schema.properties.costs.items.required.includes('claim'));
});

test('wrong values, unrelated rows, unsupported evidence, bad pages and advice stay pending',async()=>{
  const withClaim=(p,changes)=>({...p,claim:{...p.claim,...changes}});
  const data={...empty,
    overview:[withClaim(known.overview[0],{value:'25'})],
    costs:[withClaim(known.costs[0],{value:'120001'}),...([2,3,9].map(page=>({...known.costs[0],citations:[{source:'quote',page}]}))),
      withClaim(known.costs[0],{quote:'Grand total: NT$ 120,001',value:'120001'})],
    work:[withClaim(known.work[0],{value:'2,000',quote:'Cabinet installation Amount: NT$ 2,000'}),
      point('Upgrade is recommended','work','Recommended optional upgrade','Recommended optional upgrade')],
    materials:[withClaim(known.materials[0],{value:'HAFELE'}),withClaim(known.materials[1],{value:'H100'}),
      withClaim(known.materials[0],{subject:'Light fixture',value:'ACME',quote:'Light fixture Brand: ACME'})],
    drawings:[withClaim(known.drawings[0],{value:'901'}),withClaim(known.drawings[0],{unit:'cm'}),
      withClaim(known.drawings[1],{value:'5'})],
    changes:[{...known.changes[0],evidence:{...known.changes[0].evidence,value:'13000'}}],
  };
  const result=summary(data,await makeIndex(data));
  for(const row of Object.values(result).flat()){
    assert.equal(row.verificationStatus,'needs_review',JSON.stringify(row));
    assert.equal(row.referenceEligible,false);
  }
  assert.equal(result.costs[0].verificationReason,'EVIDENCE_NUMBER_MISMATCH');
  assert.equal(result.costs[1].verificationReason,'EVIDENCE_QUOTE_MISMATCH');
  assert.equal(result.costs[2].verificationReason,'NO_TEXT_LAYER');
  assert.equal(result.costs[3].verificationReason,'PAGE_OUT_OF_RANGE');
  assert.equal(result.materials[0].verificationReason,'EVIDENCE_VALUE_MISMATCH');
  assert.equal(result.work[1].verificationReason,'EVIDENCE_FIELD_FORMAT');
  assert.equal(summary(known,await makeIndex(known),null).overview[0].verificationStatus,'needs_review');
});

test('five real drawing annotations verify against their source page without guessing axes or product fields',()=>{
  const notes=['-電梯門：W90*H230cm','-主浴窗戶：W135*H160cm','-天花板漆：得利水泥漆89YY 80/039',
    '-壁面漆：班傑明極致系列2141-70','-客浴暖風機：KOHLER淨暖機77316TW-G-MZ'];
  const index=new Map([['drawing',{fileId:'drawing',pageCount:32,texts:new Map([[1,notes.join('\n')]])}]]);
  const claim=(kind,value,line,subject,unit=null)=>point('改寫後的摘要',kind,value,notes[line],subject,unit,'drawing');
  const data={...empty,
    drawings:[claim('height','230',0,'電梯門','cm'),claim('width','135',1,'主浴窗戶','cm')],
    materials:[claim('brand','得利',2,'天花板漆'),claim('brand','班傑明',3,'壁面漆'),
      claim('model','77316TW-G-MZ',4,'客浴暖風機'),claim('productName','水泥漆',2,'天花板漆'),
      claim('series','極致系列',3,'壁面漆')],
  };
  const result=summary(data,index);
  for(const row of [...result.drawings,...result.materials]){
    assert.equal(row.verificationStatus,'verified',JSON.stringify(row));
    assert.equal(row.evidence[0].page,1);
    assert.ok(notes.includes(row.evidence[0].quote));
  }
  assert.deepEqual(result.drawings.map(row=>[row.claim.value,row.claim.unit]),[[230,'cm'],[135,'cm']]);
  const color=claim('colorCode','89YY 80/039',2,'天花板漆');
  assert.equal(summary({...empty,materials:[color]},index).materials[0].verificationStatus,'verified');
  const mixed='側窗：W 90 毫米 × H 230 公分';
  index.get('drawing').texts.set(1,[...notes,mixed].join('\n'));
  const mixedUnit=point('側窗高度','height','230',mixed,'側窗','cm','drawing');
  assert.equal(summary({...empty,drawings:[mixedUnit]},index).drawings[0].claim.unit,'公分');
  const invalid={...empty,drawings:[claim('width','230',0,'電梯門','cm'),claim('height','230',0,'電梯門','mm')],
    materials:[claim('brand','利',2,'天花板漆'),claim('model','77316TW-G-M',4,'客浴暖風機'),
      claim('model','2141-70',3,'壁面漆'),{...color,citations:[]},claim('brand','得利',2,'壁面漆')]};
  const rejected=summary(invalid,index);
  assert.deepEqual(rejected.drawings.map(row=>row.verificationReason),['EVIDENCE_NUMBER_MISMATCH','EVIDENCE_NUMBER_MISMATCH']);
  assert.deepEqual(rejected.materials.map(row=>row.verificationReason),['EVIDENCE_VALUE_MISMATCH','EVIDENCE_VALUE_MISMATCH',
    'EVIDENCE_FIELD_FORMAT','NO_VALID_CITATION','EVIDENCE_FIELD_FORMAT']);
  assert.ok([...rejected.drawings,...rejected.materials].every(row=>!row.referenceEligible));
  const knowledge={materials:[{name:'客浴暖風機',brand:'KOHLER',model:'77316TW-G-MZ',citations:[{source:'drawing',page:1}]},
    {name:'壁面漆',brand:'明',citations:[{source:'drawing',page:1}]}]};
  assert.deepEqual(readKnowledge(knowledge,index,drawing).materials.map(row=>row.referenceEligible),[true,false]);
});

test('quote and change tables verify the correct column and retain a wrapped description as evidence',async()=>{
  const columns=[30,120,252,315,360,435];
  const row=(cells,y)=>cells.flatMap((text,i)=>text?[[text,columns[i],y]]:[]);
  const header=row(['Item','Description','Qty','Unit','Unit Price','Amount (NT$)'],750);
  const positioned=new Map([
    ['quote',await pdf([[...header,
      ...row(['Cabinet work','Birch veneer','4','pcs','3,000','12,000'],720),
      ...row(['','Finish A'],708),
      ...row(['Painting','Wall coating','2','pcs','500','1,000'],684)]])],
    ['change',await pdf([[...header,...row(['Add cabinet','Entry storage','2','pcs','2,000','+4,000'],720),
      ...row(['','Shallow shelf'],708),...row(['Remove tile','Flooring','2','pcs','500','-1,000'],684)]])],
  ]);
  const quote='Cabinet work Birch veneer 4 pcs 3,000 12,000\nFinish A';
  const addition={item:'Additional entry storage',originalItem:'Add cabinet',direction:'addition',
    evidence:{source:'change',page:1,quote:'Add cabinet Entry storage 2 pcs 2,000 +4,000\nShallow shelf',value:'4000',unit:'NT$'}};
  const work=(kind,value,unit)=>point('Verified table column',kind,value,quote,'Cabinet work',unit);
  const item={name:'Cabinet work',description:'Birch veneer Finish A',amount:12000,currency:'TWD',tax:'unknown',citations:[{source:'quote',page:1}]};
  const data={...empty,work:[work('amount','12000','TWD'),work('quantity','4','pcs'),work('amount','3000','TWD'),
    work('quantity','2','pcs'),point('Subtotal from the main row','amount','12000',quote.split('\n')[0],'Cabinet work','TWD')],
    changes:[addition,{...addition,evidence:{...addition.evidence,value:'2000'}},
      {item:'Remove tile',originalItem:'Remove tile',direction:'deduction',
        evidence:{source:'change',page:1,quote:'Remove tile Flooring 2 pcs 500 -1,000',value:'-1000',unit:'NT$'}}],
    knowledge:{workItems:[item,{...item,amount:3000},{...item,amount:1000}]}};
  const index=await inspectPdfEvidence(positioned,data,sources.filter(source=>source.kind!=='drawing'));
  const result=summary(data,index);
  assert.deepEqual(result.work.map(value=>value.verificationReason??'verified'),['verified','verified',
    'EVIDENCE_NUMBER_MISMATCH','EVIDENCE_NUMBER_MISMATCH','verified']);
  assert.equal(result.work[0].evidence[0].quote,quote);
  assert.equal(result.changes[0].amount,4000);
  assert.equal(result.changes[1].verificationReason,'EVIDENCE_NUMBER_MISMATCH');
  assert.equal(result.changes[2].amount,-1000);
  const knowledge=readKnowledge(data.knowledge,index,[],result.changes);
  assert.deepEqual(knowledge.workItems.map(value=>[value.referenceEligible,value.verificationReason??null]),
    [[true,null],[false,'EVIDENCE_NUMBER_MISMATCH'],[false,'EVIDENCE_NUMBER_MISMATCH']]);
});

test('unverified narrative stays in history and failed claims cannot replace latest',async()=>{
  const raw='UNVERIFIED_NARRATIVE: total price is 999,999 TWD';
  const model={...known,drawings:[],costs:[{...known.costs[0],text:raw}]};
  const index=await makeIndex(model),verified=summary(model,index);
  assert.match(verified.costs[0].text,/120000/);
  assert.equal(verified.costs[0].summaryText,raw);
  const originalFetch=globalThis.fetch;
  let latest=null,commits=[];
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/aiKnowledge/latest'))return latest?Response.json(latest):new Response(null,{status:404});
    assert.ok(url.endsWith(':commit'));
    commits=JSON.parse(options.body).writes;
    const update=commits.find(write=>write.update.name.endsWith('/aiKnowledge/latest'))?.update;
    if(update)latest={fields:update.fields,updateTime:'2026-11-20T01:00:00Z'};
    return Response.json({commitTime:'2026-11-20T01:00:00Z'});
  };
  const save=(runId,sections,startedAt)=>saveCaseKnowledge({caseId:'test',caseUpdatedAt:null,token:'mock',uid:'admin',runId,
    startedAt,model:'mock',basic,sources,missing:[],sections,
    structured:{quotedTotal:null,changeNet:null,workItems:[],materials:[],spaces:[],changes:[]}});
  try{
    assert.equal((await save('first',verified,'2026-11-20T00:00:00Z')).isLatest,true);
    assert.match(JSON.stringify(commits[0]),/UNVERIFIED_NARRATIVE/);
    assert.doesNotMatch(JSON.stringify(latest),/UNVERIFIED_NARRATIVE/);
    const invalid={...empty,costs:[{...known.costs[0],claim:{...known.costs[0].claim,value:'999999'}}]};
    assert.equal((await save('failed',summary(invalid,index),'2026-11-20T02:00:00Z')).isLatest,false);
    assert.equal(commits.length,1);
    assert.ok(commits[0].update.name.endsWith('/aiKnowledgeRuns/failed'));
    assert.equal(latest.fields.latestRunId.stringValue,'first');
  }finally{globalThis.fetch=originalFetch;}
});
