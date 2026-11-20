import {PDF_LABELS as LABELS} from '../app/features/ai-database/summary-format.js';
import {createHash} from 'node:crypto';

const ROOT='https://firestore.googleapis.com/v1/projects/have000/databases/(default)/documents';
const BUCKET='have000.firebasestorage.app';
const LIMIT=50_000_000;
const fail=(status,message)=>Object.assign(new Error(message),{status});
function decode(value){
  if('stringValue' in value)return value.stringValue;
  if('integerValue' in value)return Number(value.integerValue);
  if('doubleValue' in value)return value.doubleValue;
  if('arrayValue' in value)return(value.arrayValue.values||[]).map(decode);
  return null;
}
const fields=document=>Object.fromEntries(Object.entries(document.fields||{}).map(([key,value])=>[key,decode(value)]));
async function pdfBytes(response,remaining,label){
  if(Number(response.headers.get('content-length'))>remaining)throw fail(413,'本次 PDF 合計需小於 50 MB，請縮小檔案後再分析。');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>=remaining)throw fail(413,'本次 PDF 合計需小於 50 MB，請縮小檔案後再分析。');chunks.push(Buffer.from(value));}
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks,size);
  if(bytes.subarray(0,5).toString()!=='%PDF-')throw fail(422,`${label}不是有效的 PDF，請檢查已上傳檔案。`);
  return bytes;
}

// Uses the caller's Firebase token and existing rules. No Admin SDK or writes.
export async function readCasePdfs(caseId,token,signal){
  if(typeof caseId!=='string'||!(/^[a-zA-Z0-9_-]{1,120}$/).test(caseId))throw fail(400,'案件 ID 格式不正確。');
  const headers={authorization:`Bearer ${token}`};
  const projectResponse=await fetch(`${ROOT}/aiDbCases/${encodeURIComponent(caseId)}`,{headers,signal});
  if(!projectResponse.ok)throw fail(projectResponse.status===404?404:403,'無法讀取此案件，請確認案件仍存在及管理員權限。');
  const caseDocument=await projectResponse.json();
  const project=fields(caseDocument);
  const listResponse=await fetch(`${ROOT}:runQuery`,{method:'POST',headers:{...headers,'content-type':'application/json'},signal,
    body:JSON.stringify({structuredQuery:{from:[{collectionId:'aiDbFiles'}],where:{fieldFilter:{field:{fieldPath:'caseId'},op:'EQUAL',value:{stringValue:caseId}}}}})});
  if(!listResponse.ok)throw fail(403,'無法讀取案件 PDF 清單，請確認管理員權限。');
  const documents=await listResponse.json();
  const files=documents.filter(row=>row.document).map(({document})=>({
    ...fields(document),documentId:document.name?.split('/').at(-1),recordUpdatedAt:document.updateTime??null,
  })).filter(file=>Object.hasOwn(LABELS,file.kind));
  const kinds=new Set();let declaredSize=0;
  for(const file of files){
    const parts=typeof file.storagePath==='string'?file.storagePath.split('/'):[];
    if(file.caseId!==caseId||parts.length!==4||parts[0]!=='aiDatabase'||parts[1]!=='cases'||parts[2]!==caseId||!parts[3]||['.','..'].includes(parts[3])||kinds.has(file.kind))throw fail(422,'案件 PDF 紀錄或儲存路徑不一致，請先檢查資料。');
    kinds.add(file.kind);declaredSize+=Number(file.size)||0;
  }
  if(declaredSize>=LIMIT)throw fail(413,'本次 PDF 合計需小於 50 MB，請縮小檔案後再分析。');
  const content=[],sources=[];let total=0,drawingBytes=null;
  for(const kind of ['drawing','quote','change']){
    const file=files.find(row=>row.kind===kind);if(!file)continue;
    const label=LABELS[kind];
    const response=await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(file.storagePath)}?alt=media`,{headers:{authorization:`Firebase ${token}`},signal});
    if(!response.ok)throw fail(response.status===404?404:502,`${label} PDF 讀取失敗，尚未完成分析。請確認檔案存在及讀取權限後重試。`);
    const bytes=await pdfBytes(response,LIMIT-total,label);total+=bytes.length;
    if(kind==='drawing')drawingBytes=bytes;
    content.push({type:'input_text',text:`下一份 PDF 為「${label}」，引用的 source 為 ${kind}。`},
      {type:'input_file',filename:label+'.pdf',file_data:'data:application/pdf;base64,'+bytes.toString('base64'),
        ...(kind==='drawing'?{detail:'high'}:{}),
      });
    sources.push({kind,label,name:String(file.name||label+'.pdf'),bytes:bytes.length,
      fileId:file.documentId||file.id||kind,recordUpdatedAt:file.recordUpdatedAt,
      sha256:createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return {project,caseUpdatedAt:caseDocument.updateTime??null,content,sources,drawingBytes,
    missing:Object.entries(LABELS).filter(([kind])=>!kinds.has(kind)).map(([,label])=>label),
  };
}
