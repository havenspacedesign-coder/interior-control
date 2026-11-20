export const SUMMARY_SECTIONS={
  overview:'案件概況',
  costs:'工程金額摘要',
  work:'主要工程項目',
  materials:'主要材料／品牌／型號',
  drawings:'施工圖重點',
  changes:'追加減工程摘要',
  issues:'AI 發現的矛盾／缺失／無法確認資訊',
};
export const PDF_LABELS={drawing:'施工圖',quote:'正式報價單',change:'追加減工程'};
export const BASIC_LABEL='案件基本資料';

export function formatCitation({source,page}){
  return source==='basic'?BASIC_LABEL:`${PDF_LABELS[source]}｜第 ${page} 頁`;
}
export function emptySection(key,sources){
  if(key==='drawings')return sources.some(source=>source.kind==='drawing')
    ?'無法確認施工圖中的空間、配置、尺寸或施工資訊。'
    :'未提供施工圖，無法確認圖面資訊。';
  if(key==='changes'&&!sources.some(source=>source.kind==='change'))return '未提供追加減工程 PDF。';
  if(key==='issues')return '本次未發現具充分證據支持的矛盾或缺失';
  return '現有資料無法確認。';
}
export const EVIDENCE_POLICY_VERSION=1;
export const KNOWLEDGE_PUBLICATION_VERSION=1;
export function publishedKnowledgeRun(knowledge){
  return knowledge?.evidencePolicyVersion===EVIDENCE_POLICY_VERSION&&
    knowledge.publicationPolicyVersion===KNOWLEDGE_PUBLICATION_VERSION&&
    typeof knowledge.latestRunId==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(knowledge.latestRunId)
    ?knowledge.latestRunId:null;
}
export function verifiedKnowledgeItems(rows,policyVersion){
  if(policyVersion!==EVIDENCE_POLICY_VERSION||!Array.isArray(rows))return [];
  return rows.filter(row=>row?.verificationStatus==='verified'&&row.referenceEligible===true&&row.revoked!==true&&
    Array.isArray(row.citations)&&row.citations.length>0);
}
