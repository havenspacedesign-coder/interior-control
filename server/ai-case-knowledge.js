import {EVIDENCE_POLICY_VERSION,KNOWLEDGE_PUBLICATION_VERSION,publishedKnowledgeRun,verifiedKnowledgeItems} from '../app/features/ai-database/summary-format.js';

export const DOCUMENTS='projects/have000/databases/(default)/documents';
export const ROOT='https://firestore.googleapis.com/v1/'+DOCUMENTS;
const SCHEMA_VERSION=1;
const ANALYSIS_VERSION=1;
const timestamp=value=>({timestampValue:value});
const number=value=>value!==''&&Number.isFinite(Number(value))?Number(value):null;
const permissionDenied=()=>Object.assign(Error('Firestore denied case knowledge access'),{code:'PERMISSION_DENIED'});
const storageError=(code,httpStatus=null)=>Object.assign(Error(code),{code,httpStatus});

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

const coveredLists=['workItems','materials','spaces','changes'];
const ordinarySections=['overview','costs','work','materials','drawings','changes'];
const failedIndexCodes=new Set(['PARSER_LOAD_FAILED','PDF_CANVAS_INIT_FAILED','PDF_WORKER_INIT_FAILED',
  'PDF_BYTES_MISSING','PDF_OPEN_FAILED','INDEX_TIMEOUT','PAGE_TEXT_FAILED']);
const safeReference=(ref,sources)=>ref&&(ref.source==='basic'?ref.sourceId==='basic'&&ref.page===null
  :Array.isArray(sources)&&sources.some(source=>source?.kind===ref.source&&source.fileId===ref.sourceId)&&
    Number.isSafeInteger(ref.page)&&ref.page>0);
function sourcedItems(rows,policy,sources){
  return verifiedKnowledgeItems(rows,policy).filter(row=>row.citations.every(ref=>safeReference(ref,sources)&&
    (ref.source==='basic'||Array.isArray(row.evidence)&&row.evidence.some(proof=>proof?.source===ref.source&&proof.sourceId===ref.sourceId&&
      proof.page===ref.page&&typeof proof.quote==='string'&&proof.quote.trim()))));
}
function decodeFields(fields){
  return Object.fromEntries(Object.entries(fields??{}).map(([key,value])=>[key,decodeField(value)]));
}
function decodeField(value){
  if(value.arrayValue)return (value.arrayValue.values??[]).map(decodeField);
  if(value.mapValue)return decodeFields(value.mapValue.fields);
  if(value.integerValue!==undefined)return Number(value.integerValue);
  return value.stringValue??value.timestampValue??value.booleanValue??value.doubleValue??null;
}
function coverage(knowledge){
  const select=rows=>sourcedItems(rows,knowledge.evidencePolicyVersion,knowledge.sources??[]);
  const groups=Object.fromEntries(coveredLists.map(key=>[key,select(knowledge[key])]));
  for(const key of ['quotedTotal','changeNet'])groups[key]=select([knowledge.financials?.[key]]);
  groups.drawing=select(knowledge.drawing?.summary);
  for(const key of ordinarySections)groups['summary.'+key]=select(knowledge.summary?.[key]);
  const bySource={};
  for(const row of Object.values(groups).flat()){
    for(const source of new Set(row.citations.map(ref=>ref.source).filter(source=>source!=='basic'))){
      bySource[source]=(bySource[source]??0)+1;
    }
  }
  return {groups:Object.fromEntries(Object.entries(groups).map(([key,rows])=>[key,rows.length])),bySource};
}
function publicationBlock(current,latest,diagnostics){
  if(diagnostics.some(({code})=>failedIndexCodes.has(code)))return 'PDF_EVIDENCE_INDEX_FAILED';
  const before=coverage(current),after=coverage(latest);
  const lists=Object.entries(before.groups).map(([key,old])=>[old,after.groups[key]??0]);
  const oldTotal=lists.reduce((sum,[old])=>sum+old,0);
  const lost=lists.reduce((sum,[old,next])=>sum+Math.max(old-next,0),0);
  if(lists.some(([old,next])=>old>0&&next===0)||lost>=Math.max(2,Math.ceil(oldTotal/3))){
    return 'VERIFIED_COVERAGE_REGRESSION';
  }
  if(Object.keys(before.bySource).some(key=>!after.bySource[key]))return 'VERIFIED_SOURCE_LOST';
  if(before.bySource.drawing&&current.drawing?.isComplete&&latest.drawing&&!latest.drawing.isComplete)return 'DRAWING_REVIEW_INCOMPLETE';
  if(latest.sources.length&&!Object.keys(after.bySource).length)return 'NO_VERIFIED_PDF_KNOWLEDGE';
  return null;
}

export async function saveCaseKnowledge({caseId,caseUpdatedAt,token,uid,runId,startedAt,model,basic,sources,missing,sections,structured,drawingReview,
  evidenceDiagnostics=[],modelOutput=null,trace=null}){
  const casePath='aiDbCases/'+caseId;
  const latestPath=casePath+'/aiKnowledge/latest';
  const runPath=casePath+'/aiKnowledgeRuns/'+runId;
  const drawingSource=sources.find(source=>source.kind==='drawing');
  const sourceId=new Map(sources.map(source=>[source.kind,source.fileId]));
  const cited=points=>points.map(({citations,...point})=>({...point,citations:citations.map(ref=>({
    ...ref,sourceId:ref.source==='basic'?'basic':sourceId.get(ref.source)??null,
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
  const verified=rows=>sourcedItems(rows,EVIDENCE_POLICY_VERSION,sources).map(({unverifiedFields,...row})=>row);
  const latestKnowledge={
    ...knowledge,
    publicationPolicyVersion:KNOWLEDGE_PUBLICATION_VERSION,
    ...Object.fromEntries(['overview','issues','workItems','materials','spaces','changes'].map(key=>[key,verified(knowledge[key])])),
    financials:Object.fromEntries(Object.entries(knowledge.financials).map(([key,row])=>[key,verified([row])[0]??null])),
    drawing:knowledge.drawing?{...knowledge.drawing,summary:verified(knowledge.drawing.summary)}:null,
    summary:Object.fromEntries(ordinarySections.map(key=>[key,verified(sections[key])])),
  };
  const verifiedCounts={...coverage(latestKnowledge),additionalFields:{
    overview:latestKnowledge.overview.length,confirmedIssues:latestKnowledge.issues.length,caseFacts:1,
    completedSettlement:Number(Boolean(latestKnowledge.financials.completedSettlement)),
  }};
  if(trace)trace.firestore={state:'attempted',candidateVerified:verifiedCounts};
  const runWrites=[
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
    if(!snapshot.ok&&snapshot.status!==404)throw storageError('FIRESTORE_LATEST_READ_FAILED',snapshot.status);
    const current=snapshot.ok?await snapshot.json():null;
    const currentStartedAt=Date.parse(current?.fields?.startedAt?.timestampValue??'');
    const newStartedAt=Date.parse(startedAt);
    const currentRun=current?.fields?.latestRunId?.stringValue??'';
    const isNewer=!Number.isFinite(currentStartedAt)||newStartedAt>currentStartedAt||(newStartedAt===currentStartedAt&&runId>currentRun);
    const previous=decodeFields(current?.fields);
    const blocked=publicationBlock(previous,latestKnowledge,evidenceDiagnostics);
    const newLatest=isNewer&&!blocked;
    const trustedRunId=newLatest?runId:publishedKnowledgeRun(previous);
    const publication={state:newLatest?'published':'history_only',reason:blocked??(isNewer?null:'OLDER_RUN'),trustedRunId};
    const firestore={state:'committed',history:true,drawingPages:runWrites.length,latestUpdated:newLatest,
      candidateVerified:verifiedCounts,latestWritten:newLatest?verifiedCounts:null,reason:publication.reason};
    const run=update(runPath,{...knowledge,runId,sections,evidenceDiagnostics,modelOutput,
      modelOutputStatus:modelOutput===null?null:'needs_review',publication,
      ...(trace?{diagnostics:{...trace,firestore}}:{})},{exists:false},true);
    run.update.fields.startedAt=timestamp(startedAt);
    const writes=[run,...runWrites];
    if(newLatest){
      const latest=update(latestPath,{...latestKnowledge,latestRunId:runId},
        current?{updateTime:current.updateTime}:{exists:false},true);
      latest.update.fields.startedAt=timestamp(startedAt);
      writes.push(latest);
    }
    const body=JSON.stringify({writes});
    if(Buffer.byteLength(body)>9_000_000)throw storageError('FIRESTORE_PAYLOAD_TOO_LARGE');
    const result=await fetch(ROOT+':commit',{method:'POST',headers,body,signal});
    if(result.ok){
      const {commitTime}=await result.json();
      if(trace)trace.firestore=firestore;
      return {runId,analyzedAt:commitTime,isLatest:newLatest,publication,
        ...(blocked?{error:'本次分析已保留於歷史。因證據讀取異常或已驗證資料減少，本次未更新正式 AI 知識。'}:{}),
      };
    }
    if(result.status===401||result.status===403)throw permissionDenied();
    const {error}=await result.json().catch(()=>({}));
    if(error?.status==='PERMISSION_DENIED'||error?.status==='UNAUTHENTICATED')throw permissionDenied();
    if(!['ABORTED','FAILED_PRECONDITION','ALREADY_EXISTS'].includes(error?.status))throw storageError('FIRESTORE_COMMIT_FAILED',result.status);
  }
  throw storageError('FIRESTORE_PRECONDITION_RETRY_LIMIT');
}

export async function saveFailedCaseRun({caseId,token,uid,trace,modelOutput,startedAt}){
  const path='aiDbCases/'+caseId+'/aiKnowledgeRuns/'+trace.runId;
  const firestore={state:'committed',history:true,latestUpdated:false,reason:trace.failure};
  const write=update(path,{runId:trace.runId,caseId,startedBy:uid,status:'failed',
    publication:{state:'history_only',reason:trace.failure},diagnostics:{...trace,firestore},modelOutput,
    modelOutputStatus:modelOutput===null?null:'needs_review'},{exists:false},true);
  write.update.fields.startedAt=timestamp(startedAt);
  const response=await fetch(ROOT+':commit',{method:'POST',signal:AbortSignal.timeout(4000),
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({writes:[write]})});
  if(!response.ok)throw [401,403].includes(response.status)?permissionDenied():storageError('FIRESTORE_COMMIT_FAILED',response.status);
  trace.firestore=firestore;
}

