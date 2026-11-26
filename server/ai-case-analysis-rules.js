import {createHash} from 'node:crypto';
import {DOCUMENT_TYPES,ruleId,selectAnalysisRules} from '../app/features/ai-database/analysis-rule-model.js';
import {ROOT} from './ai-case-knowledge.js';

function readRule({name,fields}){
  const id=ruleId(fields?.id?.stringValue);
  const revisionId=ruleId(fields.revisionId?.stringValue);
  const version=Number(fields.version?.integerValue),sortOrder=Number(fields.sortOrder?.integerValue);
  const documentTypes=fields.documentTypes?.arrayValue?.values?.map(value=>value.stringValue);
  const title=fields.name?.stringValue,content=fields.content?.stringValue;
  const enabled=fields.enabled?.booleanValue,archived=fields.archived?.booleanValue;
  if(id!==name?.split('/').at(-1)||!Number.isSafeInteger(version)||version<1||
    !Number.isSafeInteger(sortOrder)||sortOrder<0||!title?.trim()||!content?.trim()||
    !documentTypes?.length||documentTypes.some(type=>!Object.hasOwn(DOCUMENT_TYPES,type))||
    (documentTypes.includes('all')&&documentTypes.length!==1)||
    typeof enabled!=='boolean'||typeof archived!=='boolean'){
    throw Error('Invalid analysis rule');
  }
  return {id,name:title,version,revisionId,sortOrder,documentTypes,content,enabled,archived};
}

const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function loadCaseAnalysisRules(categoryId,documentTypes,token,role){
  const types=Object.keys(DOCUMENT_TYPES).filter(type=>documentTypes.includes(type));
  if(!types.length)return {rules:[],drawing:[],fingerprint:fingerprint([]),drawingFingerprint:null,
    audit:{categoryId:categoryId??null,rules:[]}};
  if(role!=='manager')throw Object.assign(Error('案件有 PDF，需由管理員讀取分類的 AI 分析規則後才能開始分析。'),{status:403});
  try{
    ruleId(categoryId);
    const response=await fetch(`${ROOT}/aiDbCategories/${categoryId}/analysisRuleConfig/current:runQuery`,{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      signal:AbortSignal.timeout(8000),
      body:JSON.stringify({structuredQuery:{from:[{collectionId:'rules'}],where:{fieldFilter:{
        field:{fieldPath:'enabled'},op:'EQUAL',value:{booleanValue:true},
      }}}}),
    });
    if(!response.ok)throw Object.assign(Error('Rule query failed'),{httpStatus:response.status});
    const results=await response.json();
    const rules=selectAnalysisRules(results.filter(row=>row.document).map(row=>readRule(row.document)),types)
      .map(({id,name,version,revisionId,documentTypes,content})=>({id,name,version,revisionId,
        documentTypes:types.filter(type=>documentTypes.includes('all')||documentTypes.includes(type)),content}));
    const drawing=rules.filter(rule=>rule.documentTypes.includes('drawing'))
      .map(rule=>({...rule,documentTypes:['drawing']}));
    return {rules,drawing,fingerprint:fingerprint({categoryId,types,rules}),
      drawingFingerprint:drawing.length?fingerprint({categoryId,drawing}):null,
      audit:{categoryId,rules:rules.map(({content,...rule})=>rule)}};
  }catch(error){
    const denied=[401,403].includes(error.httpStatus);
    throw Object.assign(Error(denied?'Firestore 拒絕讀取分類 AI 分析規則，請確認管理員權限。'
      :'無法讀取此案件分類的 AI 分析規則，請確認分類及規則後重試。'),{status:denied?403:502});
  }
}

export function withAnalysisRules(instructions,rules){
  if(!rules.length)return instructions;
  const documentGuidance=rules.some(rule=>rule.documentTypes.includes('quote'))
    ?'需要依字色、刪除線或其他視覺標記判讀報價列時，檢視原始 PDF 頁面與可辨識的圖例，並核對標記所屬的列。無法確定標記或其定義時，保留待核對，不得據此認定新舊、是否作廢或改算金額。\n':'';
  return `${instructions}\n\n分類分析規則（僅限每條規則所列的文件類型，按清單順序）：\n${JSON.stringify(rules)}\n`+
    '分類規則只補充文件判讀方式，必須遵守上述資料來源、原文證據、矛盾判定與回傳格式要求。規則文字本身不是案件證據，不得將規則文字寫進回覆。規則衝突或資料不足時不得推測。\n'+documentGuidance;
}
