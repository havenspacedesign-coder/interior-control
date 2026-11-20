import {esc} from './ui-utils.js';

const labels={canvas:'Canvas',domMatrix:'DOMMatrix',pdfjs:'PDF.js',worker:'PDF.js Worker',
  open:'開啟 PDF',text:'文字擷取',pages:'頁碼核對',fixture:'建立測試 PDF',index:'建立索引',assets:'定位字型資源'};

export async function requestPdfSelfTest(getIdToken){
  const token=await getIdToken?.();
  if(!token)throw new Error('請先登入管理員帳號。');
  const response=await fetch('/api/ai-case-analyze',{
    method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({operation:'pdf-parser-self-test'}),signal:AbortSignal.timeout(30000),
  });
  const data=await response.json().catch(()=>null);
  if(data?.pdfSelfTest)return data.pdfSelfTest;
  throw new Error(response.status===403?'只有管理員可以執行 PDF 解析器自測。'
    :response.status===401?'登入已失效，請重新登入。':'無法取得 PDF 自測結果，請稍後重試。');
}

export function renderPdfSelfTest({running,result,error}={}){
  const steps=result?.passed.map(stage=>labels[stage]).filter(Boolean).join('、');
  const failure=result?.error;
  const outcome=result?.ok?`<p><strong>自測成功</strong>｜${esc(result.pageCount)} 頁</p><ul>${result.pages.map(({page,text})=>
    `<li>第 ${esc(page)} 頁｜${esc(text)}</li>`).join('')}</ul>`
    :failure?`<p><strong>自測失敗</strong>｜${esc(labels[failure.stage]??failure.stage)}${failure.page?`｜第 ${esc(failure.page)} 頁`:''}</p>
      <p>${esc(failure.name)}（${esc(failure.code)}）｜${esc(failure.reason)}</p>`:'';
  return `<button type="button" class="btn btn-sm" data-action="pdf.selfTest" ${running?'disabled':''}>${running?'PDF 自測中…':'PDF 解析器自測'}</button>
    <div role="status" aria-live="polite">${outcome}${steps?`<p>已通過｜${esc(steps)}</p>`:''}${error?`<p>${esc(error)}</p>`:''}</div>`;
}
