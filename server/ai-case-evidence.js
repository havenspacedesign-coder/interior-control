import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readEvidenceTableRows} from './ai-case-evidence-table.js';

const require=createRequire(import.meta.url);
const string={type:'string'};
const nullableString={type:['string','null']};
const shape=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const status=(verificationStatus,referenceEligible=false)=>({verificationStatus,referenceEligible});
const clean=value=>typeof value==='string'?value.normalize('NFC').replace(/\s+/g,' ').trim():'';
const esc=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function parserFailure(indexCode,cause){
  return Object.assign(new Error(indexCode,{cause}),{indexCode});
}

export async function loadEvidenceParser(onStage){
  let canvasLoaded=false;
  try{
    // Load the platform binding from the application before PDF.js evaluates its
    // top-level DOMMatrix. PDF.js's optional, internal require can be missed by tracing.
    const {default:canvas}=await import('@napi-rs/canvas');
    if(onStage){
      const context=canvas.createCanvas(1,1).getContext('2d');
      context.fillRect(0,0,1,1);
      onStage('canvas');
      canvasLoaded=true;
    }
    for(const name of ['DOMMatrix','ImageData','Path2D']){
      if(typeof globalThis[name]!=='function')globalThis[name]=canvas[name];
      if(typeof globalThis[name]!=='function')throw new ReferenceError(name+' is not defined');
    }
  }catch(error){throw parserFailure(canvasLoaded?'PDF_DOMMATRIX_TEST_FAILED':'PDF_CANVAS_INIT_FAILED',error);}
  if(onStage){
    try{
      const matrix=new globalThis.DOMMatrix();
      matrix.translateSelf(2,3);
      if(matrix.e!==2||matrix.f!==3)throw new Error('DOMMatrix translation returned unexpected coordinates');
      onStage('domMatrix');
    }catch(error){throw parserFailure('PDF_DOMMATRIX_TEST_FAILED',error);}
  }
  const parser=await import('pdfjs-dist/legacy/build/pdf.mjs');
  if(onStage){
    if(typeof parser.getDocument!=='function')throw new TypeError('PDF.js getDocument is unavailable');
    onStage('pdfjs');
  }
  try{
    const worker=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
    const workerModule=await import(worker);
    if(onStage&&typeof workerModule.WorkerMessageHandler?.setup!=='function')throw new TypeError('PDF.js Worker handler is unavailable');
    parser.GlobalWorkerOptions.workerSrc=worker;
    onStage?.('worker');
  }catch(error){throw parserFailure('PDF_WORKER_INIT_FAILED',error);}
  return parser;
}

function diagnosticError(error){
  const errorType=String(error?.code??error?.name??'').replace(/[^\w-]/g,'').slice(0,80)||null;
  // Keep engine locations without private paths, PDF text or raw upstream messages.
  const reference=error?.name==='ReferenceError'&&/^[a-zA-Z_$][\w$]{0,63} is not defined$/.test(error.message);
  const errorMessage=reference?error.message:null;
  const frames=(typeof error?.stack==='string'?error.stack.split('\n').slice(1,13):[]).flatMap(line=>{
    const internal=line.trim().match(/^at (?:[\w.<> ]+ \()?node:internal\/[\w/:.-]+\)?$/);
    if(internal)return [internal[0]];
    const location=line.match(/(?:[/\\])([\w.-]+\.(?:[cm]?js|ts))(:\d+:\d+)\)?\s*$/);
    if(!location)return [];
    const library=/[/\\]pdfjs-dist[/\\]/.test(line)?'pdfjs-dist/legacy/build/':'';
    return ['at '+library+location[1]+location[2]];
  });
  const errorStack=frames.length?[errorType+(errorMessage?': '+errorMessage:''),...frames].join('\n'):null;
  return {errorType,errorMessage,errorStack};
}

export const evidenceInstructions=[
  'issues 只回傳可定位到本案原始 PDF 的候選項目。不要提供一般施工建議、假設風險或沒有具體項目的提醒。沒有候選項目就填空陣列。',
  'type 為 conflict（兩份文件有具體不同值）、missing（某頁明載項目缺漏）、review（有原文但需核對比較口徑）、unreadable（指定文件頁的內容無法可靠辨識）。item、metric 填原文可找到的具體工項與欄位。conflict 提供不同 PDF 各一則 evidence，scope 填雙方原文共同明示的版次或比較口徑，沒有則填空。不要把報價、追加減、原施工圖不同階段自動認定為矛盾。',
  'evidence.quote 是 PDF 相應頁面逐字連續摘錄，須包含工項、實際欄位與原值，不可改寫或補字。value 與 unit 用原文，無數值填 null。頁碼為從 1 開始的 PDF 頁序。unreadable 的 quote 可留空，但仍需指定實際檔案與頁碼。',
  'changes 每筆以 item、direction、evidence 回傳。只取追加減工程 PDF 可核對的原始摘錄，direction 取 addition、deduction 或 neutral。不將報價或施工圖反推為追加減；沒有證據就填空陣列。',
].join('\n');

export function evidenceSchema(sources){
  const kinds=sources.map(({kind})=>kind);
  const proof=shape({
    source:{type:'string',enum:kinds.length?kinds:['drawing','quote','change']},page:{type:'integer'},
    quote:string,value:nullableString,unit:nullableString,
  });
  return {
    changes:shape({item:string,originalItem:nullableString,direction:{type:'string',enum:['addition','deduction','neutral']},evidence:proof}),
    issues:shape({type:{type:'string',enum:['conflict','missing','review','unreadable']},item:string,metric:string,
      scope:string,evidence:{type:'array',items:proof}}),
  };
}

// Use the original PDF text layer. Model output, page summaries and guessed OCR are never evidence.
export async function inspectPdfEvidence(pdfBytes,output,sources,loadParser=loadEvidenceParser){
  const result=new Map();
  result.diagnostics=[];
  result.files=[];
  if(!sources.length)return result;
  const report=(source,code,page=null,error=null)=>{
    const detail=diagnosticError(error);
    if(result.diagnostics.some(row=>row.source===source.kind&&row.code===code&&row.errorType===detail.errorType)){
      detail.errorStack=null;
    }
    result.diagnostics.push({source:source.kind,sourceId:source.fileId,code,page,...detail});
  };
  const requested=new Map();
  const rows=value=>Array.isArray(value)?value.slice(0,8):[];
  const knowledge=output.knowledge??{};
  const candidates=[...['overview','costs','work','materials','drawings','issues','changes'].flatMap(key=>rows(output[key])),
    ...['workItems','materials','spaces'].flatMap(key=>rows(knowledge[key])),knowledge.quotedTotal,knowledge.changeNet];
  for(const candidate of candidates.filter(value=>value&&typeof value==='object')){
    const {evidence,citations}=candidate;
    const refs=[...rows(citations),...(Array.isArray(evidence)?evidence.slice(0,2):[evidence])];
    for(const ref of refs){
      if(!Number.isSafeInteger(ref?.page)||ref.page<1)continue;
      if(!requested.has(ref.source))requested.set(ref.source,new Set());
      requested.get(ref.source).add(ref.page);
    }
  }
  const fileResult=source=>{
    const doc=result.get(source.kind);
    const diagnostics=result.diagnostics.filter(row=>row.source===source.kind);
    return {source:source.kind,sourceId:source.fileId,open:doc?'opened':'failed',pageCount:doc?.pageCount??null,
      requestedPages:[...(requested.get(source.kind)??[])].sort((a,b)=>a-b),
      extractedPages:doc?[...doc.texts].filter(([,value])=>Boolean(value)).map(([page])=>page).sort((a,b)=>a-b):[],
      diagnostics};
  };
  let getDocument,assets;
  try{
    ({getDocument}=await loadParser());
    assets=dirname(require.resolve('pdfjs-dist/package.json'));
  }catch(error){
    for(const source of sources)report(source,error.indexCode??'PARSER_LOAD_FAILED',null,error.cause??error);
    result.files=sources.map(fileResult);
    return result;
  }
  await Promise.all(sources.map(async source=>{
    const bytes=pdfBytes?.get(source.kind);
    if(!bytes){report(source,'PDF_BYTES_MISSING');return;}
    let loading;
    const deadline=AbortSignal.timeout(10_000);
    const abort=()=>{void loading?.destroy().catch(()=>{});};
    try{
      loading=getDocument({data:Uint8Array.from(bytes),isEvalSupported:false,useSystemFonts:false,stopAtErrors:true,
        disableFontFace:true,useWorkerFetch:false,cMapPacked:true,
        cMapUrl:join(assets,'cmaps')+'/',standardFontDataUrl:join(assets,'standard_fonts')+'/',
      });
      deadline.addEventListener('abort',abort,{once:true});
      const document=await loading.promise;
      const texts=new Map(),layoutRows=new Map(),tableRows=new Map();
      result.set(source.kind,{...source,pageCount:document.numPages,texts,layoutRows,tableRows});
      for(const number of requested.get(source.kind)??[]){
        if(number>document.numPages){report(source,'PAGE_OUT_OF_RANGE',number);continue;}
        if(deadline.aborted){report(source,'INDEX_TIMEOUT',number);continue;}
        try{
          const page=await document.getPage(number);
          const {items}=await page.getTextContent();
          const lines=[];
          let line=[];
          for(const item of items){
            if(typeof item.str!=='string')continue;
            line.push(item.str);
            if(item.hasEOL){lines.push(clean(line.join(' ')));line=[];}
          }
          if(line.length)lines.push(clean(line.join(' ')));
          const original=lines.filter(Boolean).join('\n');
          texts.set(number,original);
          const financial=['quote','change'].includes(source.kind);
          const layout=readLayoutRows(items,financial);
          layoutRows.set(number,layout.rows);
          if(financial)tableRows.set(number,layout.table);
          if(!original)report(source,'NO_TEXT_LAYER',number);
        }catch(error){
          texts.set(number,null);
          report(source,deadline.aborted?'INDEX_TIMEOUT':'PAGE_TEXT_FAILED',number,error);
        }
      }
    }catch(error){
      report(source,deadline.aborted?'INDEX_TIMEOUT':'PDF_OPEN_FAILED',null,error);
    }finally{
      deadline.removeEventListener('abort',abort);
      await loading?.destroy().catch(()=>{});
    }
  }));
  result.files=sources.map(fileResult);
  return result;
}

export function locateCitation(citation,documents){
  const {source,page}=citation??{};
  const document=documents.get(source);
  if(!document||!Number.isSafeInteger(page)||page<1||page>document.pageCount)return null;
  return {source,page,sourceId:document.fileId,sourceName:document.name};
}

// Keep issue verification on the original lines. Ordinary facts can span nearby wrapped lines.
export function normalizeFact(value){
  return value.normalize('NFKC').replace(/[−–]/gu,'-').replace(/(?<=\d)\s*,\s*(?=\d{3}(?:\D|$))/gu,'')
    .replace(/\s*([./+$-])\s*/gu,'$1').replace(/[|｜:：;；，、]/gu,' ')
    .replace(/(\p{Script=Han})\s+(?=\p{Script=Han})/gu,'$1')
    .replace(/\s+/gu,' ').trim().toLowerCase();
}

export function evidenceNumber(value){
  const match=normalizeFact(value).match(/^([+-]?)(\d+)(?:\.(\d+))?$/u);
  if(!match||Math.abs(Number(match[0]))>Number.MAX_SAFE_INTEGER)return null;
  const digits=match[2].replace(/^0+(?=\d)/u,'');
  const fraction=(match[3]??'').replace(/0+$/u,'');
  return (match[1]==='-'&&(digits!=='0'||fraction)?'-':'')+digits+(fraction?'.'+fraction:'');
}

export function sameEvidenceNumber(expected,actual){
  const canonical=evidenceNumber(expected);
  return canonical!==null&&canonical===evidenceNumber(actual);
}

function readLayoutRows(items,financial){
  const cells=items.flatMap(({str,transform,width})=>{
    if(typeof str!=='string'||!str.trim()||!Array.isArray(transform)||!Number.isFinite(width)||width<=0)return [];
    const [a,b,c,d,x,y]=transform;
    return [a,b,c,d,x,y].every(Number.isFinite)&&a>0&&d>0&&Math.abs(b)<0.01&&Math.abs(c)<0.01
      ?[{text:clean(str),x,y,end:x+width}]:[];
  }).sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows=[];
  for(const cell of cells){
    const row=rows.at(-1);
    if(row&&Math.abs(row[0].y-cell.y)<=0.75)row.push(cell);
    else rows.push([cell]);
  }
  const signatures=new Map();
  const signature=row=>row.map(cell=>Math.round(cell.x/2)).join(',');
  for(const row of rows){
    row.sort((a,b)=>a.x-b.x);
    if(row.length<2)continue;
    const key=signature(row);
    signatures.set(key,(signatures.get(key)??0)+1);
  }
  const visual=rows.flatMap(row=>{
    if(row.length<2||row.some((cell,index)=>index>0&&cell.x<row[index-1].end-0.75))return [];
    const splitColumns=row.some((cell,index)=>index>0&&cell.x-row[index-1].end>36);
    if(splitColumns&&signatures.get(signature(row))<2)return [];
    return [row.map(cell=>cell.text).join(' ')];
  });
  return {rows:visual,table:financial?readEvidenceTableRows(rows,normalizeFact):[]};
}

function factContains(original,value){
  const expected=normalizeFact(value).replace(/[。.!！]$/u,'');
  if(!expected)return false;
  const start=/^[a-z0-9+-]/u.test(expected)?'(?<![a-z0-9.+-])':'';
  const end=/[a-z0-9]$/u.test(expected)?'(?![a-z0-9.]|,\\d)':'';
  return new RegExp(start+esc(expected)+end,'u').test(original);
}

const originalLines=(reference,documents)=>documents.get(reference.source)?.texts.get(reference.page)?.split('\n')??[];
export function factBlocks(reference,documents,check,maxLines=3,useLayout=false){
  const lines=originalLines(reference,documents);
  if(!lines.some(Boolean))return null;
  const visualRows=useLayout?documents.get(reference.source)?.layoutRows?.get(reference.page)??[]:[];
  for(const row of visualRows){
    if(row.length<=1600&&check(normalizeFact(row),2,row))return row;
  }
  for(let length=1;length<=Math.min(maxLines,lines.length);length++){
    for(let start=0;start<=lines.length-length;start++){
      const excerpt=lines.slice(start,start+length).join('\n');
      if(excerpt.length>1600)continue;
      const normalized=normalizeFact(excerpt);
      if(check(normalized,length,excerpt))return excerpt;
    }
  }
  return null;
}

export function factTextMatches(original,value){return factContains(original,value);}

export function evidenceTableRows(reference,documents){
  const document=documents.get(reference.source);
  return document?.texts.get(reference.page)?document.tableRows?.get(reference.page)??[]:[];
}

export function matchesTableQuote(row,literal){
  return normalizeFact(row.quote)===literal||normalizeFact(row.quote.split('\n')[0])===literal;
}

// A wrapped row must account for its text with the proposed fields and known column
// labels. Otherwise adjacent items could lend each other a brand or an amount.
export function wrappedRowMatches(block,fields,columnLabels){
  let remaining=block;
  const parts=fields.filter(Boolean).map(normalizeFact).sort((a,b)=>b.length-a.length);
  for(const part of parts)remaining=remaining.replace(part,' ');
  return !remaining.replace(columnLabels,' ').replace(/[\s()./+\-$]+/gu,'');
}

export function markOrdinaryFact(proposed,citations,documents,findEvidence,explain=()=>null){
  const evidence=citations.flatMap(reference=>{
    if(reference.source==='basic')return [];
    const excerpt=findEvidence(reference);
    return excerpt?[{...reference,quote:excerpt}]:[];
  });
  if(evidence.length){
    return {citations:evidence.map(({quote,...reference})=>reference),evidence,...status('verified',true)};
  }
  const citationChecks=proposed.map(ref=>{
    const diagnostic=documents.diagnostics?.find(entry=>entry.source===ref.source&&(entry.page===null||entry.page===ref.page));
    const doc=documents.get(ref.source);
    const located=citations.some(link=>link.source===ref.source&&link.page===ref.page);
    const reason=doc&&!locateCitation(ref,documents)?'PAGE_OUT_OF_RANGE'
      :diagnostic?.code??(ref.source==='basic'?'BASIC_PARAPHRASE_NOT_VERIFIED':!doc?'SOURCE_NOT_AVAILABLE':!located
        ?ref.source==='drawing'?'DRAWING_PAGE_NOT_RECOGNIZED':'SOURCE_NOT_ALLOWED'
        :!doc.texts.get(ref.page)?'PDF_EVIDENCE_UNAVAILABLE':explain(ref)??'SOURCE_CONTENT_NOT_CONFIRMED');
    return {...ref,reason};
  });
  const verificationReason=citationChecks[0]?.reason??'NO_VALID_CITATION';
  return {citations,proposedCitations:proposed,citationChecks,verificationReason,...status('needs_review')};
}

export function proposedReferences(citations){
  return citations.slice(0,8).flatMap(ref=>typeof ref?.source==='string'&&ref.source.length<=30
    ?[{source:ref.source,page:ref.page===null||Number.isSafeInteger(ref.page)?ref.page:'invalid'}]:[]);
}

function verifyQuote(candidate,documents){
  const reference=locateCitation(candidate,documents);
  if(!reference)return null;
  const quote=clean(candidate.quote);
  const original=documents.get(reference.source).texts.get(reference.page);
  if(quote.length<4||quote.length>550||!original?.split('\n').some(line=>line.includes(quote)))return null;
  return {...reference,quote,value:clean(candidate.value)||null,unit:clean(candidate.unit)||null};
}

export function issueExclusionReason(candidate,documents){
  const evidence=candidate?.evidence;
  if(!Array.isArray(evidence)||evidence.length<(candidate?.type==='conflict'?2:1))return 'ISSUE_REQUIRED_EVIDENCE_MISSING';
  if(evidence.some(ref=>!locateCitation(ref,documents)))return 'ISSUE_INVALID_SOURCE_PAGE';
  if(candidate.type!=='unreadable'&&evidence.some(ref=>!verifyQuote(ref,documents)))return 'ISSUE_ORIGINAL_QUOTE_NOT_FOUND';
  return 'ISSUE_COMPARISON_NOT_SUPPORTED';
}

const RAW_NUMBER=/^[+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
function measured(proof,metric){
  if(!proof?.unit||!RAW_NUMBER.test(proof.value??''))return null;
  const anchored=new RegExp('(?:^|[\\s、，。；,;:：|｜()（）])'+esc(metric)+'\\s*[:：=]?\\s*'+esc(proof.value)+'\\s*'+esc(proof.unit)+'(?![0-9A-Za-z.])','u');
  if(!anchored.test(proof.quote))return null;
  const value=Number(proof.value.replaceAll(',','').replace('−','-'));
  return Number.isFinite(value)?value:null;
}
const hypothetical=/(?:若|如有|如需|建議|請確認|提前|以免|為避免|必要時|另行確認)/u;
const scopeMarker=/^(?:版本|版次|口徑|修訂|工程範圍|施工範圍|核定範圍|比較基準|Revision|Scope|Basis)\s*[:：=]\s*\S/u;
const hasPhrase=(text,phrase)=>new RegExp('(?:^|[\\s、，。；,;:：|｜()（）])'+esc(phrase)+'(?=$|[\\s、，。；,;:：|｜()（）])','u').test(text);
const basisTags=quote=>[...new Set(quote.match(/原估|實作|調整前|調整後|變更前|變更後|追加前|追加後|未稅|含稅/gu))].sort().join('|');
const summaryPoint=(text,evidence,labels)=>({text,citations:evidence.map(({source,page,sourceId,sourceName})=>({source,page,sourceId,sourceName})),evidence,...labels});

export function verifyIssues(candidates,documents,drawingReview){
  const pages=new Map(drawingReview?.pages.map(row=>[row.page,row.status])??[]);
  return candidates.slice(0,5).flatMap(candidate=>{
    if(!candidate||!Array.isArray(candidate.evidence))return [];
    const {type}=candidate,item=clean(candidate.item),metric=clean(candidate.metric),scope=clean(candidate.scope);
    if(type==='unreadable'){
      const reference=locateCitation(candidate.evidence[0],documents);
      const raw=reference&&documents.get(reference.source).texts.get(reference.page);
      const unreadable=reference&&(reference.source==='drawing'
        ?['unreadable','incomplete'].includes(pages.get(reference.page))
        :raw===''||raw===null);
      return unreadable?[summaryPoint('這一頁有資訊無法可靠辨識或核對。',[reference],{category:'unreadable',...status('unreadable')})]:[];
    }
    if(item.length<2||item.length>80||!metric||metric.length>45||hypothetical.test(item+metric))return [];
    const evidence=candidate.evidence.slice(0,2).map(value=>verifyQuote(value,documents)).filter(proof=>
      proof&&hasPhrase(proof.quote,item)&&proof.quote.includes(metric)&&!hypothetical.test(proof.quote));
    if(!evidence.length)return [];
    if(type==='missing'){
      const explicit=new RegExp(esc(metric)+'\\s*[:：]?\\s*(?:未提供|未標示|缺漏|缺少)(?:[，。；\\s]|$)','u');
      if(evidence.length!==1||!explicit.test(evidence[0].quote))return [];
      return [summaryPoint(`${item}的${metric}在原文件明載缺漏。`,evidence,{category:'confirmed',...status('verified',true)})];
    }
    if(!['conflict','review'].includes(type))return [];
    if(type==='conflict'){
      if(evidence.length!==2||evidence[0].source===evidence[1].source)return [];
      const [left,right]=evidence;
      const a=measured(left,metric),b=measured(right,metric);
      if(a===null||b===null||a===b||left.unit!==right.unit)return [];
      if(scope.length>=6&&scope.length<=120&&scopeMarker.test(scope)&&basisTags(left.quote)===basisTags(right.quote)&&
        evidence.every(proof=>proof.source!=='change'&&hasPhrase(proof.quote,scope))){
        return [summaryPoint(`${item}的${metric}不一致（${left.value} ${left.unit}／${right.value} ${right.unit}）。`,
          evidence,{category:'confirmed',comparisonScope:scope,...status('verified',true)})];
      }
    }
    return [summaryPoint(`${item}的${metric}需人工核對原文與比較口徑。`,evidence,{category:'review',...status('needs_review')})];
  });
}

export function verifyChanges(candidates,documents,verify=verifyQuote,readAmount=proof=>measured(proof,'金額')??measured(proof,'Amount'),
  directionText=proof=>proof.quote){
  return candidates.slice(0,4).flatMap(candidate=>{
    if(!candidate)return [];
    const item=clean(candidate.item),proof=verify(candidate.evidence,documents);
    if(item.length<2||item.length>80||proof?.source!=='change'||!proof.quote.includes(item)||hypothetical.test(proof.quote))return [];
    const direction=candidate.direction;
    const adjustment=directionText(proof);
    const addition=/追加|加作|新增|增加|\+\s*\d/u.test(adjustment);
    const deduction=/減作|追減|減列|扣除|刪減|(?:^|[:：\s])[-−]\s*\d/u.test(adjustment);
    const neutral=/不增減|無增減|零元調整|等價變更/u.test(adjustment);
    if((direction==='addition'&&(!addition||deduction))||(direction==='deduction'&&(!deduction||addition))||
      (direction==='neutral'&&(!neutral||addition||deduction))||!['addition','deduction','neutral'].includes(direction))return [];
    const amountMatch=proof.value===null?null:readAmount(proof);
    if(proof.value!==null&&amountMatch===null)return [];
    const amount=amountMatch===null?null:direction==='deduction'?-Math.abs(amountMatch):amountMatch;
    if(direction==='addition'&&amount!==null&&amount<0)return [];
    return [summaryPoint(`${item}｜原文：${proof.quote}`,[proof],{item,direction,amount,
      currency:/^(?:nt\$|twd|新臺幣|新台幣)$/iu.test(proof.unit??'')?'TWD':null,...status('verified',true)})];
  });
}

export function readOrdinaryChanges(candidates,documents){
  return candidates.slice(0,4).flatMap(candidate=>{
    const item=clean(candidate?.item),direction=candidate?.direction;
    if(item.length<2||item.length>80||hypothetical.test(item)||!['addition','deduction','neutral'].includes(direction))return [];
    if(!documents.has('change')&&!documents.diagnostics?.some(row=>row.source==='change'))return [];
    const originalItem=clean(candidate.originalItem)||item;
    let tableRow,reason='EVIDENCE_FIELD_FORMAT';
    const verified=verifyChanges([{...candidate,item:originalItem}],documents,(proof,index)=>{
      const hasOriginalItem=typeof candidate.originalItem==='string'&&!!candidate.originalItem.trim();
      const reference=locateCitation(proof,index);
      const quote=clean(proof?.quote);
      if(!reference||quote.length<4||quote.length>550)return null;
      const table=evidenceTableRows(reference,index).filter(row=>normalizeFact(row.item)===normalizeFact(originalItem));
      tableRow=table.find(row=>matchesTableQuote(row,normalizeFact(quote)));
      const strict=!table.length&&!hasOriginalItem?verifyQuote(proof,index):null;
      if(strict)return strict;
      const original=tableRow?.quote??(!table.length?factBlocks(reference,index,
        block=>hasOriginalItem?block===normalizeFact(quote):factContains(block,quote),3,hasOriginalItem):null);
      if(!original)reason='EVIDENCE_QUOTE_MISMATCH';
      return original?{...reference,quote:clean(original),value:clean(proof.value)||null,unit:clean(proof.unit)||null}:null;
    },proof=>{
      if(!proof.unit)return null;
      const raw=normalizeFact(proof.value);
      if(!RAW_NUMBER.test(raw)||Math.abs(Number(raw))>Number.MAX_SAFE_INTEGER)return null;
      reason='EVIDENCE_NUMBER_MISMATCH';
      if(tableRow){
        if(tableRow.currency!=='TWD'||!/^(?:nt\$|twd|新臺幣|新台幣)$/iu.test(proof.unit))return null;
        return sameEvidenceNumber(raw,tableRow.amount)?Number(tableRow.amount):null;
      }
      const value=(/^\d/u.test(raw)?'\\+?':'')+esc(raw),unit=esc(normalizeFact(proof.unit));
      const label='(?:金額|amount)';
      const numberEnd='(?![0-9.]|,\\d)';
      const pattern=new RegExp(label+'\\s*(?:'+unit+'\\s*'+value+numberEnd+'|'+value+numberEnd+'\\s*'+unit+')','u');
      return pattern.test(normalizeFact(proof.quote))?Number(raw):null;
    },proof=>tableRow?tableRow.item+' '+tableRow.amount:proof.quote);
    if(verified.length)return verified.map(row=>({...row,summaryText:item}));
    const proposed=proposedReferences([candidate.evidence]);
    const reference=proposed[0]?.source==='change'?locateCitation(proposed[0],documents):null;
    const quote=clean(candidate.evidence?.quote).slice(0,550);
    return [{item,direction,amount:null,currency:null,text:quote||item,
      ...markOrdinaryFact(proposed,reference?[reference]:[],documents,()=>null,()=>reason)}];
  });
}
