const string={type:'string'};
const nullableString={type:['string','null']};
const amount={type:['number','null']};
const tax={type:'string',enum:['included','excluded','unknown']};
const money={amount,currency:nullableString,tax};
const LISTS={
  workItems:{category:nullableString,name:string,description:string,...money},
  materials:{name:string,material:nullableString,brand:nullableString,model:nullableString,specification:nullableString},
  spaces:{name:string,layout:string,relationships:{type:'array',items:string}},
  changes:{name:string,description:string,direction:{type:'string',enum:['addition','deduction','neutral','unknown']},...money},
};
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});

export const knowledgeInstructions=[
  'knowledge 是案件知識欄位，與畫面用摘要分開。只保存能由來源支持的資訊，各陣列最多 8 筆。金額用文件原幣別的數字，不轉幣、不加總猜測、不把未列金額填 0。未標明的金額、品牌、型號、幣別或規格填 null，含稅狀態不明填 unknown。',
  'quotedTotal 只取正式報價單明載的工程總額；changeNet 只取追加減工程文件明載的淨額；完工實際結算由系統讀取基本資料。workItems 保存代表性工項與可核對的小計。materials 保存材料、品牌、型號與規格。spaces 保存施工圖可確認的空間、配置、相鄰關係，只引用已辨識的施工圖頁面。changes 保存變更項目及方向與金額。各項均引用實際支持的檔案與頁碼，缺少資料回傳空陣列或 null。',
].join('\n');

export function knowledgeSchema(citation){
  const withCitations=fields=>object({...fields,citations:{type:'array',items:citation}});
  const total={anyOf:[withCitations(money),{type:'null'}]};
  return object({
    quotedTotal:total,changeNet:total,
    ...Object.fromEntries(Object.entries(LISTS).map(([key,fields])=>[key,{type:'array',items:withCitations(fields)}])),
  });
}

export function readKnowledge(value,sources,drawingPages=[]){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Missing structured case knowledge');
  const byKind=new Map(sources.map(source=>[source.kind,source]));
  const recognized=new Set(drawingPages.map(({page})=>page));
  function item(row,fields,allowed){
    if(!row||typeof row!=='object'||!Array.isArray(row.citations))return null;
    const citations=[];
    for(const entry of row.citations){
      const {source,page}=entry??{};
      const document=byKind.get(source);
      if(!allowed.includes(source))continue;
      if(source==='basic'){
        if(page===null)citations.push({source,sourceId:'basic',page:null});
      }else if(document&&Number.isSafeInteger(page)&&page>0&&(source!=='drawing'||recognized.has(page))){
        citations.push({source,sourceId:document.fileId,page});
      }
    }
    if(!citations.length)return null;
    const result={citations};
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
    return result;
  }
  const allowed={workItems:['basic','quote','change','drawing'],materials:['basic','quote','change','drawing'],spaces:['drawing'],changes:['change']};
  const total=(row,source)=>{
    const result=item(row,money,[source]);
    return result?.amount!=null?result:null;
  };
  return {
    quotedTotal:total(value.quotedTotal,'quote'),changeNet:total(value.changeNet,'change'),
    ...Object.fromEntries(Object.entries(LISTS).map(([key,fields])=>[
      key,(Array.isArray(value[key])?value[key]:[]).map(row=>item(row,fields,allowed[key])).filter(Boolean).slice(0,8),
    ])),
  };
}
