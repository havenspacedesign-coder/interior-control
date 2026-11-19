export async function analyzeBasicCase(project,getIdToken){
  if(!getIdToken)throw Error('本機展示帳號無法呼叫雲端 AI。請在已部署 API 的測試網站使用 Firebase 管理員帳號登入。');
  const token=await getIdToken();
  if(!token)throw Error('請先登入管理員帳號。');
  const basic=Object.fromEntries(['name','area','amount','year','houseType','scopes','url','note'].map(key=>[key,project[key]??(key==='scopes'?[]:'')]));
  let response;
  try{
    response=await fetch('/api/ai-case-analyze',{
      method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({basic,...(project.id?{caseId:project.id}:{})}),signal:AbortSignal.timeout(185000),
    });
  }catch(error){throw Error(['TimeoutError','AbortError'].includes(error.name)?'AI 分析逾時，請重試。':'無法連線 AI 分析服務，請檢查網路後重試。');}
  let data;
  try{data=await response.json();}catch{throw Error('AI 分析 API 尚未啟用或回覆格式不正確。');}
  if(!response.ok)throw Error(data.message||'AI 分析失敗，請稍後重試。');
  if(typeof data.summary!=='string'||!data.summary.trim())throw Error('AI 沒有回傳摘要，請重試。');
  if(Array.isArray(data.sources)){
    const provided=data.sources.map(source=>source.label).join('、')||'無';
    const missing=Array.isArray(data.missing)?data.missing.join('、'):'';
    return `本次已讀取 PDF：${provided}${missing?'\n未提供：'+missing:''}\n\n${data.summary}`;
  }
  return data.summary;
}

export function renderAnalysis(analysis={}){
  // Results are plain text. The host assigns textContent, never AI-generated HTML.
  return `<p class="aidb-muted">分析案件基本資料與已上傳的施工圖、正式報價單及追加減工程 PDF。未上傳的類別會略過，不分析完工照片；結果暫存於本次頁面。</p><div data-analysis-result role="status" aria-live="polite" style="white-space:pre-wrap;overflow-wrap:anywhere"></div><p data-analysis-error role="alert" hidden></p><button class="btn btn-p" data-action="case.analyze" ${analysis.loading?'disabled':''}>${analysis.loading?'AI 分析中…':'開始 AI 分析'}</button>`;
}
