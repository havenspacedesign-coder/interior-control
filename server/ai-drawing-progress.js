import {ROOT,update} from './ai-case-knowledge.js';
import {BATCH_SIZE,CONCURRENT_BATCHES,drawingReport,reviewBatch} from './ai-drawing-pages.js';

const MAX_ATTEMPTS=3;
const LEASE_MS=55_000;
const unpackFields=fields=>Object.fromEntries(Object.entries(fields??{}).map(([key,value])=>[key,unpack(value)]));
function unpack(value){
  if('integerValue' in value)return Number(value.integerValue);
  if('arrayValue' in value)return (value.arrayValue.values??[]).map(unpack);
  if('mapValue' in value)return unpackFields(value.mapValue.fields);
  return value.stringValue??value.timestampValue??value.booleanValue??value.doubleValue??null;
}
const terminal=row=>row?.status==='unreadable'||canReuse(row);
const canReuse=row=>row?.status==='recognized'&&typeof row.content==='string'&&!!row.content.trim()&&
  typeof row.drawingType==='string'&&!!row.drawingType.trim();
const attempts=(row,sessionId)=>row?.sessionId===sessionId?(row.attempts??0):0;
const eligible=(row,sessionId)=>!terminal(row)&&attempts(row,sessionId)<MAX_ATTEMPTS;
const placeholder=page=>({page,status:'unreviewed',reasonCode:'NOT_STARTED',reason:'本頁尚未送出分析。'});

function store(token,budget){
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  async function request(path,body){
    const response=await fetch(ROOT+path,{headers,signal:AbortSignal.any([budget,AbortSignal.timeout(5500)]),
      ...(body?{method:'POST',body:JSON.stringify(body)}:{}),
    });
    if(response.status===401||response.status===403)throw Object.assign(Error('Firestore denied drawing progress'),{code:'PERMISSION_DENIED'});
    return response;
  }
  return {
    async get(path){
      const response=await request('/'+path);
      if(response.status===404)return null;
      if(!response.ok)throw Error('Could not read drawing progress');
      return response.json();
    },
    async list(path){
      const documents=[];
      let next='';
      do{
        const response=await request('/'+path+'?pageSize=100'+(next?'&pageToken='+encodeURIComponent(next):''));
        if(response.status===404)break;
        if(!response.ok)throw Error('Could not list drawing pages');
        const data=await response.json();
        documents.push(...(data.documents??[]).map(doc=>unpackFields(doc.fields)));
        next=data.nextPageToken;
      }while(next);
      return documents;
    },
    async commit(writes){
      const response=await request(':commit',{writes});
      const result=await response.json();
      if(response.ok)return result;
      if(['ABORTED','FAILED_PRECONDITION','ALREADY_EXISTS'].includes(result.error?.status))return null;
      throw Error('Could not save drawing progress');
    },
  };
}

async function seedPages(storage,casePath,hash){
  const latest=await storage.get(casePath+'/aiKnowledge/latest');
  const {sources,latestRunId}=unpackFields(latest?.fields);
  if(!Array.isArray(sources)||!sources.some(source=>source.kind==='drawing'&&source.sha256===hash)||
    typeof latestRunId!=='string'||!/^[-\w]+$/.test(latestRunId))return [];
  return (await storage.list(casePath+'/aiKnowledgeRuns/'+latestRunId+'/drawingPages')).filter(canReuse);
}

export async function drawingProgress({caseId,source,drawing,sessionId,token,ask,step}){
  const storage=store(token,AbortSignal.timeout(step?47_000:18_000)),casePath='aiDbCases/'+caseId;
  const path=casePath+'/aiDrawingProgress/'+source.sha256;
  const collection=path+'/pages';
  const totalPages=drawing.totalPages;
  const started=Date.now();
  const saved=await storage.get(path);
  if(step&&unpackFields(saved?.fields).leaseUntil>started)return {busy:true};
  const current=await storage.list(collection);
  const byPage=new Map(current.map(row=>[row.page,row]));
  const seeds=current.length===0?await seedPages(storage,casePath,source.sha256):[];
  for(const row of seeds)if(row.page>=1&&row.page<=totalPages)byPage.set(row.page,row);
  const pages=Array.from({length:totalPages},(_,index)=>byPage.get(index+1)??placeholder(index+1));
  if(!step){
    if(pages.some(row=>eligible(row,sessionId)))return {needsStep:true};
    return drawingReport(pages);
  }
  const pending=pages.filter(row=>eligible(row,sessionId))
    .sort((a,b)=>attempts(a,sessionId)-attempts(b,sessionId)||a.page-b.page);
  if(!pending.length&&!seeds.length)return {done:true};
  const lease=await storage.commit([update(path,{leaseUntil:Date.now()+LEASE_MS,totalPages},
    saved?{updateTime:saved.updateTime}:{exists:false})]);
  if(!lease)return {busy:true};
  const leasedAt=lease.writeResults?.[0]?.updateTime||lease.commitTime;
  let released=false;
  try{
    const signal=AbortSignal.timeout(24_000);
    const fresh=pending.filter(row=>!attempts(row,sessionId)).slice(0,CONCURRENT_BATCHES*BATCH_SIZE);
    const selected=fresh.length?fresh:pending.slice(0,CONCURRENT_BATCHES);
    const size=fresh.length?BATCH_SIZE:1;
    const batches=[];
    for(let index=0;index<selected.length;index+=size)batches.push(selected.slice(index,index+size).map(({page})=>page));
    const results=(await Promise.all(batches.map(batch=>reviewBatch(drawing,batch,ask,signal)))).flat();
    const changed=new Map(seeds.map(row=>[row.page,row]));
    for(const row of results){
      const old=pages[row.page-1];
      const result=['request_failed','unreadable'].includes(row.status)&&old.status==='incomplete'
        ?{...old,lastFailureCode:row.reasonCode,lastFailureReason:row.reason}
        :['request_failed','incomplete'].includes(old.status)&&row.status==='recognized'
          ?{...row,lastFailureCode:old.lastFailureCode??old.reasonCode,lastFailureReason:old.lastFailureReason??old.reason}:row;
      const entry={...result,sessionId,attempts:attempts(old,sessionId)+1};
      pages[row.page-1]=entry;
      changed.set(row.page,entry);
    }
    const persisted=await storage.commit([
      update(path,{leaseUntil:0,totalPages},{updateTime:leasedAt}),
      ...[...changed].map(([page,row])=>update(collection+'/'+page,row)),
    ]);
    if(!persisted)return {busy:true};
    released=true;
    return {done:!pages.some(row=>eligible(row,sessionId)),pageCount:totalPages};
  }finally{
    if(!released)await storage.commit([update(path,{leaseUntil:0,totalPages},{updateTime:leasedAt})]).catch(()=>{});
  }
}
