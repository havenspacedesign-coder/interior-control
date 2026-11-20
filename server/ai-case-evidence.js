import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';

const require=createRequire(import.meta.url);
const string={type:'string'};
const nullableString={type:['string','null']};
const shape=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const status=(verificationStatus,referenceEligible=false)=>({verificationStatus,referenceEligible});
const clean=value=>typeof value==='string'?value.normalize('NFC').replace(/\s+/g,' ').trim():'';
const esc=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

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
    changes:shape({item:string,direction:{type:'string',enum:['addition','deduction','neutral']},evidence:proof}),
    issues:shape({type:{type:'string',enum:['conflict','missing','review','unreadable']},item:string,metric:string,
      scope:string,evidence:{type:'array',items:proof}}),
  };
}

// Use the original PDF text layer. Model output, page summaries and guessed OCR are never evidence.
export async function inspectPdfEvidence(pdfBytes,output,sources){
  const result=new Map();
  if(!sources.length)return result;
  let getDocument,assets;
  try{
    ({getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'));
    assets=dirname(require.resolve('pdfjs-dist/package.json'));
  }catch{return result;}
  const requested=new Map();
  const candidates=[...(Array.isArray(output.issues)?output.issues.slice(0,5):[]),
    ...(Array.isArray(output.changes)?output.changes.slice(0,4):[])];
  for(const {evidence} of candidates.filter(value=>value&&typeof value==='object')){
    for(const ref of (Array.isArray(evidence)?evidence.slice(0,2):[evidence])){
      if(!Number.isSafeInteger(ref?.page)||ref.page<1)continue;
      if(!requested.has(ref.source))requested.set(ref.source,new Set());
      requested.get(ref.source).add(ref.page);
    }
  }
  await Promise.all(sources.map(async source=>{
    const bytes=pdfBytes.get(source.kind);
    if(!bytes)return;
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
      const texts=new Map();
      result.set(source.kind,{...source,pageCount:document.numPages,texts});
      for(const number of requested.get(source.kind)??[]){
        if(deadline.aborted||number>document.numPages)continue;
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
          texts.set(number,lines.filter(Boolean).join('\n'));
        }catch{texts.set(number,null);}
      }
    }catch{
      // An unreadable original must not cause a proposed citation to be accepted.
    }finally{
      deadline.removeEventListener('abort',abort);
      await loading?.destroy().catch(()=>{});
    }
  }));
  return result;
}

export function locateCitation(citation,documents){
  const {source,page}=citation??{};
  const document=documents.get(source);
  if(!document||!Number.isSafeInteger(page)||page<1||page>document.pageCount)return null;
  return {source,page,sourceId:document.fileId,sourceName:document.name};
}

function verifyQuote(candidate,documents){
  const reference=locateCitation(candidate,documents);
  if(!reference)return null;
  const quote=clean(candidate.quote);
  const original=documents.get(reference.source).texts.get(reference.page);
  if(quote.length<4||quote.length>550||!original?.split('\n').some(line=>line.includes(quote)))return null;
  return {...reference,quote,value:clean(candidate.value)||null,unit:clean(candidate.unit)||null};
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

export function verifyChanges(candidates,documents){
  return candidates.slice(0,4).flatMap(candidate=>{
    if(!candidate)return [];
    const item=clean(candidate.item),proof=verifyQuote(candidate.evidence,documents);
    if(item.length<2||item.length>80||proof?.source!=='change'||!proof.quote.includes(item)||hypothetical.test(proof.quote))return [];
    const direction=candidate.direction;
    const addition=/追加|加作|新增|增加|\+\s*\d/u.test(proof.quote);
    const deduction=/減作|追減|減列|扣除|刪減|(?:^|[:：\s])[-−]\s*\d/u.test(proof.quote);
    const neutral=/不增減|無增減|零元調整|等價變更/u.test(proof.quote);
    if((direction==='addition'&&(!addition||deduction))||(direction==='deduction'&&(!deduction||addition))||
      (direction==='neutral'&&(!neutral||addition||deduction))||!['addition','deduction','neutral'].includes(direction))return [];
    const amountMatch=proof.value===null?null:measured(proof,'金額')??measured(proof,'Amount');
    if(proof.value!==null&&amountMatch===null)return [];
    const amount=amountMatch===null?null:direction==='deduction'?-Math.abs(amountMatch):amountMatch;
    if(direction==='addition'&&amount!==null&&amount<0)return [];
    return [summaryPoint(`${item}｜原文：${proof.quote}`,[proof],{item,direction,amount,
      currency:proof.unit==='NT$'||proof.unit==='新台幣'?'TWD':null,...status('verified',true)})];
  });
}
