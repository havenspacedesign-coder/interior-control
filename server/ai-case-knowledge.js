import {EVIDENCE_POLICY_VERSION,verifiedKnowledgeItems} from '../app/features/ai-database/summary-format.js';

export const DOCUMENTS='projects/have000/databases/(default)/documents';
export const ROOT='https://firestore.googleapis.com/v1/'+DOCUMENTS;
const SCHEMA_VERSION=1;
const ANALYSIS_VERSION=1;
const timestamp=value=>({timestampValue:value});
const number=value=>value!==''&&Number.isFinite(Number(value))?Number(value):null;
const permissionDenied=()=>Object.assign(Error('Firestore denied case knowledge access'),{code:'PERMISSION_DENIED'});

function field(value){
  if(value===null)return {nullValue:null};
  if(typeof value==='string')return {stringValue:value};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(field)}};
  return {mapValue:{fields:fields(value)}};
}

const fields=object=>Object.fromEntries(Object.entries(object).map(([key,value])=>[key,field(value)]));

export function update(path,content,currentDocument,recordTime=false){
  return {
    update:{name:DOCUMENTS+'/'+path,fields:fields(content)},currentDocument,
    ...(recordTime?{updateTransforms:[{fieldPath:'analyzedAt',setToServerValue:'REQUEST_TIME'}]}:{}),
  };
}

export async function saveCaseKnowledge({caseId,caseUpdatedAt,token,uid,runId,startedAt,model,basic,sources,missing,sections,structured,drawingReview}){
  const casePath='aiDbCases/'+caseId;
  const latestPath=casePath+'/aiKnowledge/latest';
  const runPath=casePath+'/aiKnowledgeRuns/'+runId;
  const drawingSource=sources.find(source=>source.kind==='drawing');
  const sourceId=new Map(sources.map(source=>[source.kind,source.fileId]));
  const cited=points=>points.map(({citations,...point})=>({...point,citations:citations.map(ref=>({
    ...ref,sourceId:ref.source==='basic'?'basic':sourceId.get(ref.source),
  }))}));
  const {quotedTotal,changeNet,...items}=structured;
  const actualAmount=number(basic.amount);
  const knowledge={
    caseId,schemaVersion:SCHEMA_VERSION,analysisVersion:ANALYSIS_VERSION,evidencePolicyVersion:EVIDENCE_POLICY_VERSION,model,startedBy:uid,caseUpdatedAt,
    status:drawingReview&&!drawingReview.isComplete?'partial':'complete',
    overview:cited(sections.overview),issues:cited(sections.issues),
    caseFacts:{name:basic.name,areaPing:number(basic.area),houseType:basic.houseType||null,year:number(basic.year),scopes:basic.scopes,
      verificationStatus:'verified',referenceEligible:true,citations:[{source:'basic',sourceId:'basic',page:null}]},
    financials:{
      quotedTotal,changeNet,
      completedSettlement:actualAmount===null?null:{amount:actualAmount,currency:'TWD',tax:'unknown',
        verificationStatus:'verified',referenceEligible:true,citations:[{source:'basic',sourceId:'basic',page:null}]},
    },
    ...items,
    sources,missing,
    drawing:drawingReview?{
      totalPages:drawingReview.totalPages,reviewedPages:drawingReview.reviewedPages,
      recognizedPages:drawingReview.recognizedPages,unreadablePages:drawingReview.unreadablePages,
      incompletePages:drawingReview.incompletePages,failedPages:drawingReview.failedPages,isComplete:drawingReview.isComplete,
      sourceId:drawingSource.fileId,summary:cited(sections.drawings),
    }:null,
  };
  const run=update(runPath,{...knowledge,runId,sections},{exists:false},true);
  run.update.fields.startedAt=timestamp(startedAt);
  const verified=rows=>verifiedKnowledgeItems(rows,EVIDENCE_POLICY_VERSION);
  const latestKnowledge={
    ...knowledge,
    ...Object.fromEntries(['overview','issues','workItems','materials','spaces','changes'].map(key=>[key,verified(knowledge[key])])),
    financials:Object.fromEntries(Object.entries(knowledge.financials).map(([key,row])=>[key,verified([row])[0]??null])),
    drawing:knowledge.drawing?{...knowledge.drawing,summary:verified(knowledge.drawing.summary)}:null,
  };
  const runWrites=[
    run,
    ...(drawingReview?.pages??[]).map(row=>update(runPath+'/drawingPages/'+row.page,{
      page:row.page,status:row.status,drawingType:row.drawingType??null,content:row.content??null,
      spaceNames:row.spaceNames??[],dimensions:row.dimensions??[],equipment:row.equipment??[],
      cabinetry:row.cabinetry??[],ceilings:row.ceilings??[],sourceFileId:drawingSource.fileId,
      plans:row.plans??[],elevations:row.elevations??[],materials:row.materials??[],
      reasonCode:row.reasonCode??null,reason:row.reason??null,attempts:row.attempts??null,
      verificationStatus:row.status==='unreadable'?'unreadable':row.status==='recognized'?'ai_inference':'needs_review',
      referenceEligible:false,
      lastFailureCode:row.lastFailureCode??null,lastFailureReason:row.lastFailureReason??null,
    },{exists:false})),
  ];
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  const signal=AbortSignal.timeout(7000);
  for(let attempt=0;attempt<3;attempt++){
    const snapshot=await fetch(ROOT+'/'+latestPath,{headers,signal});
    if(snapshot.status===401||snapshot.status===403)throw permissionDenied();
    if(!snapshot.ok&&snapshot.status!==404)throw Error('Could not read latest case knowledge');
    const current=snapshot.ok?await snapshot.json():null;
    const currentStartedAt=Date.parse(current?.fields?.startedAt?.timestampValue??'');
    const newStartedAt=Date.parse(startedAt);
    const currentRun=current?.fields?.latestRunId?.stringValue??'';
    const newLatest=!Number.isFinite(currentStartedAt)||newStartedAt>currentStartedAt||(newStartedAt===currentStartedAt&&runId>currentRun);
    const writes=[...runWrites];
    if(newLatest){
      const latest=update(latestPath,{...latestKnowledge,latestRunId:runId},
        current?{updateTime:current.updateTime}:{exists:false},true);
      latest.update.fields.startedAt=timestamp(startedAt);
      writes.push(latest);
    }
    const body=JSON.stringify({writes});
    if(Buffer.byteLength(body)>9_000_000)throw Error('Case knowledge exceeds the commit size limit');
    const result=await fetch(ROOT+':commit',{method:'POST',headers,body,signal});
    if(result.ok){
      const {commitTime}=await result.json();
      return {runId,analyzedAt:commitTime,isLatest:newLatest};
    }
    if(result.status===401||result.status===403)throw permissionDenied();
    const {error}=await result.json();
    if(error?.status==='PERMISSION_DENIED'||error?.status==='UNAUTHENTICATED')throw permissionDenied();
    if(!['ABORTED','FAILED_PRECONDITION','ALREADY_EXISTS'].includes(error?.status))throw Error('Could not save case knowledge');
  }
  throw Error('Case knowledge changed before commit');
}

