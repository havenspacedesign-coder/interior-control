import {factBlocks,normalizeFact} from './ai-case-evidence.js';

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
};
const totalLabels={
  quotedTotal:['正式報價總額','工程總金額|工程總價|報價總額|含稅總額|未稅總額|grand total|quotation total|contract sum','quote'],
  changeNet:['追加減淨額','追加減淨額|變更淨額|net change|net adjustment','change'],
};
const headings={overview:['caseName','houseType','area','year','scope'],costs:['settlement','quotedTotal','changeNet','amount'],
  work:['work','amount','quantity'],materials:['brand','model'],drawings:['width','height','length','depth','quantity','work']};
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
  const normalized=normalizeFact(value);
  return /^[+-]?\d+(?:\.\d+)?$/.test(normalized)&&Math.abs(Number(normalized))<=Number.MAX_SAFE_INTEGER?Number(normalized):null;
};
function decimal(value){
  const match=normalizeFact(value).match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if(!match||number(value)===null)return null;
  const digits=match[2].replace(/^0+(?=\d)/,'');
  const fraction=(match[3]??'').replace(/0+$/,'');
  return (match[1]==='-'&&(digits!=='0'||fraction)?'-':'')+digits+(fraction?'.'+fraction:'');
}
const sameNumber=(expected,actual)=>decimal(expected)!==null&&decimal(expected)===decimal(actual);
const canonicalUnit=value=>units[normalizeFact(value)]??normalizeFact(value);
const moneyValue=(line,prefix,requested)=>{
  if(!/^(?:TWD|NT\$|新臺幣|新台幣|元)$/iu.test(requested.unit??''))return false;
  const result=line.match(new RegExp('^'+prefix+'\\s*(?:'+currency+'\\s*'+numeric+'|'+numeric+'\\s*'+currency+')$','iu'));
  return !!result&&sameNumber(requested.value,result[1]??result[2]);
};

function pdfClaim(claim,line){
  const {kind,value,unit}=claim;
  if(uncertain.test(line))return null;
  const total=totalLabels[kind];
  if(total){
    if(claim.subject!==null||!moneyValue(line,'(?:'+total[1]+')',claim))return null;
    return {text:total[0]+' '+number(value)+' TWD',value:number(value),unit:'TWD'};
  }
  if(kind==='work'){
    const description=line.match(/^(?:施工項目|工程項目|工項|item\b|scope of work\b)\s*(.+)$/iu)?.[1];
    if(claim.subject!==null||unit!==null||description!==normalizeFact(value))return null;
    return {text:'工項 '+value,value,unit:null};
  }
  const [name,label,type]=labeled[kind]??[];
  const subject=safeText(claim.subject);
  if(!name||!subject)return null;
  const subjectPrefix=esc(normalizeFact(subject))+'(?:\\s+|(?=[\\p{Script=Han}]))';
  const prefix=subjectPrefix+'(?:'+label+')';
  const text=subject+' '+name+' '+value+(unit?' '+unit:'');
  if(type==='money')return moneyValue(line,prefix,claim)?{text,value:number(value),unit:'TWD'}:null;
  if(type==='identity'){
    if(kind==='model'&&!/^[a-z0-9][a-z0-9./_-]*$/i.test(value))return null;
    if(kind==='brand'&&/(?:品牌|型號|型式|\b(?:brand|model)\b)/iu.test(value))return null;
    const suffix=kind==='brand'?'(?:\\s+(?:型號|型式|model)\\s*[a-z0-9][a-z0-9./_-]*)?':'';
    const brand=kind==='model'?'(?:(?:品牌|廠牌|brand)\\s*[a-z0-9][a-z0-9._-]*\\s+)?':'';
    const pattern=subjectPrefix+brand+'(?:'+label+')';
    return unit===null&&new RegExp('^'+pattern+'\\s*'+esc(normalizeFact(value))+suffix+'$','iu').test(line)?{text,value,unit:null}:null;
  }
  if(!unit)return null;
  const actual=line.match(new RegExp('^'+prefix+'\\s*'+numeric+'\\s*'+(type==='length'?lengthUnit:quantityUnit)+'$','iu'));
  if(!actual||!sameNumber(value,actual[1])||canonicalUnit(unit)!==canonicalUnit(actual[2]))return null;
  return {text,value:number(value),unit:canonicalUnit(actual[2])};
}

export function verifySummaryClaim(section,claim,citations,documents,basic){
  if(!claim||!headings[section]?.includes(claim.kind)||!safeText(claim.value))return null;
  const {kind}=claim;
  const value=safeText(claim.value);
  const spec=basicFields[kind];
  if(spec){
    if(!basic||claim.subject!==null||claim.quote!==null||(claim.unit??'')!==spec[2])return null;
    const [field,label,unit]=spec;
    const raw=basic[field];
    const actual=Array.isArray(raw)?raw.find(entry=>safeText(entry)&&normalizeFact(entry)===normalizeFact(value)):safeText(raw);
    if(!safeText(actual)||(unit?!sameNumber(value,actual):normalizeFact(value)!==normalizeFact(actual)))return null;
    const reference={source:'basic',page:null,sourceId:'basic'};
    return {text:label+' '+actual+(unit?' '+unit:''),claim:{kind,field,value:unit?number(actual):actual,unit:unit||null},
      verificationStatus:'verified',referenceEligible:true,citations:[reference],evidence:[{...reference,field,quote:actual}]};
  }
  const quote=safeText(claim.quote);
  if(!quote)return null;
  const literal=normalizeFact(quote);
  const supported=pdfClaim({...claim,value},literal);
  if(!supported)return null;
  for(const ref of citations){
    if(ref.source==='basic'||(totalLabels[kind]&&ref.source!==totalLabels[kind][2]))continue;
    const excerpt=factBlocks(ref,documents,block=>block===literal,3,true);
    if(!excerpt)continue;
    return {text:supported.text,claim:{kind,subject:claim.subject,value:supported.value,unit:supported.unit},
      verificationStatus:'verified',referenceEligible:true,citations:[ref],evidence:[{...ref,quote:excerpt}]};
  }
  return null;
}
