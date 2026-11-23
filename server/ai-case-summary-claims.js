import {evidenceNumber,evidenceTableRows,factBlocks,matchesTableQuote,normalizeFact,sameEvidenceNumber} from './ai-case-evidence.js';

const basicFields={
  caseName:['name','案件名稱',''],houseType:['houseType','房屋類型',''],area:['area','室內坪數','坪'],
  year:['year','案件年份','年'],scope:['scopes','施工範圍',''],settlement:['amount','完工實際結算','TWD'],
};
const labeled={
  amount:['金額','金額|小計|amount|subtotal','money'],
  width:['寬度','淨寬|寬度|clear width|width','length'],
  height:['高度','淨高|高度|clear height|height','length'],
  length:['長度','長度|length','length'],
  depth:['深度','深度|depth','length'],
  quantity:['數量','數量|quantity|qty','count'],
  brand:['品牌','品牌|廠牌|brand','identity'],
  model:['型號','型號|型式|model','identity'],
  productName:['品名','品名|產品名稱|product name','identity'],
  series:['系列','系列|series','identity'],
  colorCode:['色號','色號|colour code|color code','identity'],
};
const totalLabels={
  quotedTotal:['正式報價總額','工程總金額|工程總價|報價總額|含稅總額|未稅總額|grand total|quotation total|contract sum','quote'],
  changeNet:['追加減淨額','追加減淨額|變更淨額|net change|net adjustment','change'],
};
const headings={overview:['caseName','houseType','area','year','scope'],costs:['settlement','quotedTotal','changeNet','amount'],
  work:['work','amount','quantity'],materials:['brand','model','productName','series','colorCode'],drawings:['width','height','length','depth','quantity','work']};
const string={type:'string'};
const nullableString={type:['string','null']};
const properties={
  kind:{type:'string',enum:[...Object.keys(basicFields),...Object.keys(labeled),...Object.keys(totalLabels),'work']},
  subject:nullableString,value:string,unit:nullableString,quote:nullableString,
};
export const summaryClaimSchema={anyOf:[
  {type:'object',additionalProperties:false,required:Object.keys(properties),properties},
  {type:'null'},
]};

const safeText=value=>typeof value==='string'&&value.trim()&&value.trim().length<=550?value.trim():null;
const esc=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const uncertain=/(?:建議|假設|如有|如需|另行確認|需確認|暫估|預估|未定|不含|未施作|禁止|取消|備選|\b(?:recommend(?:ed|ation)?|suggested|optional|proposed|estimated|should|may|not|excluded|cancelled|subject to)\b)/iu;
const currency='(?:nt\\$|twd|新台幣|新臺幣|元)';
const numeric='([+-]?\\d+(?:\\.\\d+)?)';
const lengthUnit='(mm|cm|m|毫米|公厘|公分|公尺)';
const quantityUnit='(pcs|pc|件|組|套|支|樘|扇|個|台|座|式)';
const units={毫米:'mm',公厘:'mm',公分:'cm',公尺:'m',pc:'pcs'};
const number=value=>{
  const normalized=evidenceNumber(value);
  return normalized===null?null:Number(normalized);
};
const canonicalUnit=value=>units[normalizeFact(value)]??normalizeFact(value);
const formatError={reason:'EVIDENCE_FIELD_FORMAT'};
const valueError={reason:'EVIDENCE_VALUE_MISMATCH'};
const numberError={reason:'EVIDENCE_NUMBER_MISMATCH'};

// Recover the original subject delimiter before normalization removes it.
function annotation(subject,excerpt){
  const separator=excerpt.normalize('NFKC').match(/^\s*(?:[-•]\s*)?([^:\r\n]+):\s*([^\r\n]+)\s*$/u);
  return separator&&normalizeFact(separator[1])===normalizeFact(subject)?normalizeFact(separator[2]):null;
}

function combinedDimensions(body){
  const part='([whld])\\s*'+numeric+'\\s*'+lengthUnit+'?';
  if(!body||!new RegExp('^'+part+'(?:\\s*[*×x]\\s*'+part+'){1,3}$','iu').test(body))return null;
  const parts=[...body.matchAll(new RegExp(part,'giu'))];
  const unit=parts.at(-1)[3];
  if(!unit||new Set(parts.map(part=>part[1])).size!==parts.length)return null;
  return new Map(parts.map(([,axis,value,ownUnit])=>[axis,[value,ownUnit??unit]]));
}

export function readCompactProduct(subject,excerpt){
  const body=annotation(subject,excerpt);
  if(!body||uncertain.test(body)||!/^[\p{Script=Han}a-z0-9 ./_-]+$/u.test(body))return null;
  // Run-together CJK text has no reliable word boundary. Recognize the attested
  // paint brands or an intact Latin brand token, then require a product descriptor.
  const parts=body.match(/^(得利|班傑明|[a-z][a-z-]{1,24})\s*([\p{Script=Han}]+)\s*(.*)$/u);
  if(!parts)return null;
  const [,brand,descriptor,code]=parts;
  const product=descriptor.match(/^(.*?(?:水泥漆|暖機|暖風機|乳膠漆|面漆|底漆))(.+系列)?$/u);
  const series=product?.[2]??(!product&&descriptor.endsWith('系列')?descriptor:null);
  const productName=product?.[1]??null;
  if(!productName&&!series)return null;
  const paint=/(?:漆)$/u.test(normalizeFact(subject));
  const colorCode=paint&&/^(?:\d{2}[a-z]{2} \d{2}\/\d{3}|\d{3,4}-\d{2})$/u.test(code)?code:null;
  const model=!paint&&/^(?=[a-z0-9./_-]*\d)[a-z0-9][a-z0-9./_-]*$/u.test(code)?code:null;
  return !code||colorCode||model?{brand,productName,series,model,colorCode}:null;
}
const moneyValue=(line,prefix,requested)=>{
  if(!/^(?:TWD|NT\$|新臺幣|新台幣|元)$/iu.test(requested.unit??''))return false;
  const result=line.match(new RegExp('^'+prefix+'\\s*(?:'+currency+'\\s*'+numeric+'|'+numeric+'\\s*'+currency+')$','iu'));
  return result?(result[1]??result[2]):null;
};

function pdfClaim(claim,line,excerpt){
  const {kind,value,unit}=claim;
  if(uncertain.test(line))return formatError;
  const total=totalLabels[kind];
  if(total){
    const actual=claim.subject===null&&moneyValue(line,'(?:'+total[1]+')',claim);
    if(!actual)return formatError;
    if(!sameEvidenceNumber(value,actual))return numberError;
    return {text:total[0]+' '+number(value)+' TWD',value:number(value),unit:'TWD'};
  }
  if(kind==='work'){
    const description=line.match(/^(?:施工項目|工程項目|工項|item\b|scope of work\b)\s*(.+)$/iu)?.[1];
    if(claim.subject!==null||unit!==null||!description)return formatError;
    if(description!==normalizeFact(value))return valueError;
    return {text:'工項 '+value,value,unit:null};
  }
  const [name,label,type]=labeled[kind]??[];
  const subject=safeText(claim.subject);
  if(!name||!subject)return formatError;
  const subjectPrefix=esc(normalizeFact(subject))+'(?:\\s+|(?=[\\p{Script=Han}]))';
  const prefix=subjectPrefix+'(?:'+label+')';
  const text=subject+' '+name+' '+value+(unit?' '+unit:'');
  if(type==='money'){
    const actual=moneyValue(line,prefix,claim);
    if(!actual)return formatError;
    return sameEvidenceNumber(value,actual)?{text,value:number(value),unit:'TWD'}:numberError;
  }
  if(type==='identity'){
    if(unit!==null||kind==='model'&&!/^[a-z0-9][a-z0-9./_-]*$/i.test(value))return formatError;
    if(kind==='brand'&&/(?:品牌|型號|型式|\b(?:brand|model)\b)/iu.test(value))return formatError;
    const suffix=kind==='brand'?'(?=\\s+(?:型號|型式|model)\\s*[a-z0-9][a-z0-9./_-]*$|$)':'$';
    const brand=kind==='model'?'(?:(?:品牌|廠牌|brand)\\s*[a-z0-9][a-z0-9._-]*\\s+)?':'';
    const pattern=subjectPrefix+brand+'(?:'+label+')';
    const explicit=line.match(new RegExp('^'+pattern+'\\s*(.+?)'+suffix,'iu'))?.[1];
    const actual=explicit??readCompactProduct(subject,excerpt)?.[kind];
    if(!actual)return formatError;
    return actual===normalizeFact(value)?{text,value,unit:null}:valueError;
  }
  if(!unit)return formatError;
  const actual=line.match(new RegExp('^'+prefix+'\\s*'+numeric+'\\s*'+(type==='length'?lengthUnit:quantityUnit)+'$','iu'));
  const axis={width:'w',height:'h',length:'l',depth:'d'}[kind];
  const measurement=actual?.slice(1)??(axis?combinedDimensions(annotation(subject,excerpt))?.get(axis):null);
  if(!measurement)return formatError;
  const [sourceValue,sourceUnit]=measurement;
  if(!sameEvidenceNumber(value,sourceValue)||canonicalUnit(unit)!==canonicalUnit(sourceUnit))return numberError;
  return {text:subject+' '+name+' '+value+' '+sourceUnit,value:number(value),unit:sourceUnit};
}

function tableClaim(claim,row){
  const {kind,value,unit}=claim;
  if(uncertain.test(row.quote)||!unit)return formatError;
  if(kind==='amount'&&(row.currency!=='TWD'||!/^(?:twd|nt\$|新臺幣|新台幣|元)$/iu.test(unit)))return formatError;
  const sourceUnit=kind==='amount'?row.currency:row.unit;
  if(!sameEvidenceNumber(value,row[kind])||kind==='quantity'&&canonicalUnit(unit)!==canonicalUnit(sourceUnit))return numberError;
  return {text:row.item+' '+labeled[kind][0]+' '+value+' '+sourceUnit,value:number(value),unit:sourceUnit};
}

export function verifySummaryClaim(section,claim,citations,documents,basic,fail=()=>{}){
  if(!claim||!headings[section]?.includes(claim.kind)||!safeText(claim.value))return null;
  const {kind}=claim;
  const value=safeText(claim.value);
  const spec=basicFields[kind];
  if(spec){
    if(!basic||claim.subject!==null||claim.quote!==null||(claim.unit??'')!==spec[2])return null;
    const [field,label,unit]=spec;
    const raw=basic[field];
    const actual=Array.isArray(raw)?raw.find(entry=>safeText(entry)&&normalizeFact(entry)===normalizeFact(value)):safeText(raw);
    if(!safeText(actual)||(unit?!sameEvidenceNumber(value,actual):normalizeFact(value)!==normalizeFact(actual)))return null;
    const reference={source:'basic',page:null,sourceId:'basic'};
    return {text:label+' '+actual+(unit?' '+unit:''),claim:{kind,field,value:unit?number(actual):actual,unit:unit||null},
      verificationStatus:'verified',referenceEligible:true,citations:[reference],evidence:[{...reference,field,quote:actual}]};
  }
  const quote=safeText(claim.quote);
  if(!quote)return null;
  const literal=normalizeFact(quote);
  for(const ref of citations){
    if(ref.source==='basic')continue;
    if(totalLabels[kind]&&ref.source!==totalLabels[kind][2]){fail(ref,'SOURCE_NOT_ALLOWED');continue;}
    const table=['amount','quantity'].includes(kind)&&safeText(claim.subject)
      ?evidenceTableRows(ref,documents).filter(row=>normalizeFact(row.item)===normalizeFact(claim.subject)):[];
    const record=table.find(row=>matchesTableQuote(row,literal));
    const excerpt=record?.quote??(!table.length?factBlocks(ref,documents,block=>block===literal,3,true):null);
    if(!excerpt){fail(ref,'EVIDENCE_QUOTE_MISMATCH');continue;}
    const supported=record?tableClaim({...claim,value},record):pdfClaim({...claim,value},literal,excerpt);
    if(supported.reason){fail(ref,supported.reason);continue;}
    return {text:supported.text,claim:{kind,subject:claim.subject,value:supported.value,unit:supported.unit},
      verificationStatus:'verified',referenceEligible:true,citations:[ref],evidence:[{...ref,quote:excerpt}]};
  }
  return null;
}
