import {factBlocks,factTextMatches,locateCitation,markOrdinaryFact,proposedReferences,wrappedRowMatches} from './ai-case-evidence.js';

const string={type:'string'};
const nullableString={type:['string','null']};
const amount={type:['number','null']};
const tax={type:'string',enum:['included','excluded','unknown']};
const money={amount,currency:nullableString,tax};
const LISTS={
  workItems:{category:nullableString,name:string,description:string,...money},
  materials:{name:string,material:nullableString,brand:nullableString,model:nullableString,specification:nullableString},
  spaces:{name:string,layout:string,relationships:{type:'array',items:string}},
};
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});

export const knowledgeInstructions=[
  'knowledge 是案件知識欄位，與畫面用摘要分開。只保存能由來源支持的資訊，各陣列最多 8 筆。金額用文件原幣別的數字，不轉幣、不加總猜測、不把未列金額填 0。未標明的金額、品牌、型號、幣別或規格填 null，含稅狀態不明填 unknown。',
  'quotedTotal 只取正式報價單明載的工程總額；changeNet 只取追加減工程文件明載的淨額；完工實際結算由系統讀取基本資料。workItems 保存代表性工項與可核對的小計。materials 保存材料、品牌、型號與規格。spaces 保存施工圖可確認的空間、配置、相鄰關係，只引用已辨識的施工圖頁面。結構化追加減由系統從已核對的 changes 摘錄建立。各項均引用實際支持的檔案與頁碼，缺少資料回傳空陣列或 null。',
].join('\n');

export function knowledgeSchema(citation){
  const withCitations=fields=>object({...fields,citations:{type:'array',items:citation}});
  const total={anyOf:[withCitations(money),{type:'null'}]};
  return object({
    quotedTotal:total,changeNet:total,
    ...Object.fromEntries(Object.entries(LISTS).map(([key,fields])=>[key,{type:'array',items:withCitations(fields)}])),
  });
}

export function readKnowledge(value,documents,drawingPages=[],verifiedChanges=[],record=()=>{}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Missing structured case knowledge');
  const recognized=new Set(drawingPages.map(({page})=>page));
  function item(row,fields,allowed,match,withoutOptional){
    if(!row||typeof row!=='object'||!Array.isArray(row.citations))return null;
    const citations=[];
    const proposed=proposedReferences(row.citations);
    for(const entry of proposed){
      const {source,page}=entry??{};
      if(!allowed.includes(source))continue;
      if(source==='basic'){
        if(page===null)citations.push({source,sourceId:'basic',page:null});
      }else if(source!=='drawing'||recognized.has(page)){
        const reference=locateCitation(entry,documents);
        if(reference)citations.push(reference);
      }
    }
    const result={};
    for(const [key,schema] of Object.entries(fields)){
      const field=row[key];
      if(schema.type==='array'){
        result[key]=Array.isArray(field)?field.filter(text=>typeof text==='string'&&text.trim()).slice(0,8).map(text=>text.trim().slice(0,300)):[];
      }else if(schema.enum){
        result[key]=schema.enum.includes(field)?field:'unknown';
      }else if(key==='amount'){
        result[key]=typeof field==='number'&&Number.isFinite(field)&&Math.abs(field)<=Number.MAX_SAFE_INTEGER?field:null;
      }else{
        result[key]=typeof field==='string'&&field.trim()?field.trim().slice(0,600):null;
        if(schema.type==='string'&&result[key]===null)return null;
      }
    }
    const review=candidate=>markOrdinaryFact(proposed,citations,documents,ref=>
      factBlocks(ref,documents,(block,lines)=>match(candidate,block,lines)));
    const verification=review(result);
    if(verification.referenceEligible||!withoutOptional)return {...result,...verification};
    const supportedFields=withoutOptional(result);
    const supportedReview=review(supportedFields);
    // The original candidate is retained separately in the admin-only model output.
    if(!supportedReview.referenceEligible)return {...result,...verification};
    const unverifiedFields=Object.keys(result).filter(key=>result[key]!==supportedFields[key]);
    return {...supportedFields,...supportedReview,unverifiedFields};
  }
  const allowed={workItems:['basic','quote','change','drawing'],materials:['basic','quote','change','drawing'],spaces:['drawing']};
  const includes=(block,values)=>values.every(value=>!value||factTextMatches(block,value));
  const amountPattern=value=>Number.isInteger(value)?String(value)+'(?:\\.0+)?':String(value).replace('.','\\.')+'0*';
  const moneyMatches=(block,{amount,currency,tax})=>{
    if(currency&&!(currency==='TWD'?/(?:nt\$|twd|新台幣|新臺幣|(?:\d\s*元)(?!件|組))/u.test(block):factTextMatches(block,currency)))return false;
    const includesTax=/(?:(?<!不)含稅|tax included|incl\.? tax)/u.test(block);
    const excludesTax=/(?:未稅|不含稅|tax excluded|excl\.? tax)/u.test(block);
    if(tax==='included'&&(!includesTax||excludesTax))return false;
    if(tax==='excluded'&&(!excludesTax||includesTax))return false;
    return amount===null||new RegExp('(?<![0-9.+-])\\+?'+amountPattern(amount)+'(?![0-9.]|,\\d)','u').test(block);
  };
  const matchList={
    workItems:(row,block,lines)=>{
      const fields=[row.name,row.category,row.description];
      if(!includes(block,fields)||!moneyMatches(block,row))return false;
      const amountText=row.amount==null?null:block.match(new RegExp('(?<![0-9.+-])'+amountPattern(row.amount)+'(?![0-9.]|,\\d)','u'))?.[0];
      if(lines>1&&!wrappedRowMatches(block,[...fields,amountText],/(?:工項|工程項目|品名|工種|說明|小計|金額|項目|含稅|不含稅|未稅|元|新臺幣|新台幣|nt\$|twd|\b(?:item|description|category|amount|subtotal|tax|included|excluded|incl|excl)\b)/gu))return false;
      if(row.amount===null)return true;
      const amountLabel='(?:小計|金額|subtotal|amount)';
      const explicit=new RegExp(amountLabel+'\\s*(?:(?:nt\\$|twd|\\$)\\s*)?\\+?'+amountPattern(row.amount)+'(?![0-9.]|,\\d)','u');
      if(explicit.test(block))return true;
      const withoutName=block.replace(/[a-z]+[0-9][a-z0-9-]*/gu,'');
      return (withoutName.match(/[+-]?\d+(?:\.\d+)?/gu)??[]).length===1;
    },
    materials:(row,block,lines)=>{
      const fields=[row.name,row.material,row.brand,row.model,row.specification];
      return includes(block,fields)&&(lines===1||wrappedRowMatches(block,fields,
        /(?:品名|材料|品牌|廠牌|型號|規格|設備|\b(?:item|name|material|brand|model|specification|spec)\b)/gu));
    },
    spaces:(row,block,lines)=>{
      const fields=[row.name,row.layout,...row.relationships];
      return includes(block,fields)&&(lines===1||wrappedRowMatches(block,fields,
        /(?:空間|配置|關係|\b(?:space|room|layout)\b)/gu));
    },
  };
  const withoutOptional={
    workItems:row=>({...row,category:null,description:null}),
    materials:row=>({...row,material:null,specification:null}),
  };
  const total=(row,source)=>{
    const labels=source==='quote'
      ?'(?:工程總金額|工程總價|含稅總額|未稅總額|grand total|quotation total|(?:^|\\s)(?:總計|合計))'
      :'(?:追加減淨額|追加減合計|變更淨額|淨額|net change|net adjustment)';
    const result=item(row,money,[source],(value,block)=>value.amount!==null&&moneyMatches(block,value)&&
      new RegExp(labels+'\\s*(?:\\(?\\s*(?:含稅|未稅|不含稅)\\s*\\)?\\s*)?'+
        '(?:(?:nt\\$|twd|新台幣|新臺幣|\\$)\\s*)?\\+?'+amountPattern(value.amount)+'(?![0-9.]|,\\d)','u').test(block));
    return result?.amount!=null?result:null;
  };
  const track=(key,index,row,reason='INVALID_KNOWLEDGE_FIELDS')=>{
    record(key,index,row,row?.verificationReason??(row?null:reason));
    return row;
  };
  return {
    quotedTotal:value.quotedTotal==null?null:track('quotedTotal',0,total(value.quotedTotal,'quote')),
    changeNet:value.changeNet==null?null:track('changeNet',0,total(value.changeNet,'change')),
    ...Object.fromEntries(Object.entries(LISTS).map(([key,fields])=>[
      key,(Array.isArray(value[key])?value[key]:[]).map((row,index)=>index>=8?track(key,index,null,'SECTION_LIMIT')
        :track(key,index,item(row,fields,allowed[key],matchList[key],withoutOptional[key]))).filter(Boolean),
    ])),
    changes:verifiedChanges.map(({item,text,...change})=>({
      ...change,name:item,description:change.evidence?.[0]?.quote??text,tax:'unknown',
    })),
  };
}

