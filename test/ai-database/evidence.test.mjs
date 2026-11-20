import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {inspectPdfEvidence,locateCitation,verifyChanges,verifyIssues} from '../../server/ai-case-evidence.js';
import {readSummary} from '../../server/ai-case-summary.js';
import {EVIDENCE_POLICY_VERSION,SUMMARY_SECTIONS,verifiedKnowledgeItems} from '../../app/features/ai-database/summary-format.js';
import {renderAnalysisResult} from '../../app/features/ai-database/analysis-client.js';

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
