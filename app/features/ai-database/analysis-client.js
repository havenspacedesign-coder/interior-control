import {esc} from './ui-utils.js';
import {SUMMARY_SECTIONS,BASIC_LABEL,formatCitation,emptySection} from './summary-format.js';

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
  if(!Object.keys(SUMMARY_SECTIONS).every(key=>Array.isArray(data.sections?.[key]))||
    !Array.isArray(data.sources)||!Array.isArray(data.missing))throw Error('AI 服務未回傳分區摘要，請稍後重試。');
  return data;
}

function cleanText(value){
  return value
    .replace(/^\s{0,3}(?:#{1,6}\s*|[-*+]\s+|\d+[.)]\s+)/gm,'')
    .replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')
    .replace(/\*{2,}|_{2,}|~{2,}|`+/g,'')
    .replace(/([*_])([^\s*_](?:[^*_\r\n]*[^\s*_])?)\1/g,'$2')
    .trim();
}

function renderDrawingReview(review){
  if(!review)return '';
  const {totalPages,reviewedPages,pages}=review;
  const pending=totalPages-reviewedPages;
  const unreadable=pages.filter(({status})=>status==='unreadable').length;
  const status=[pending?`${pending} 頁尚未完成分析`:'',unreadable?`${unreadable} 頁無法可靠辨識`:''].filter(Boolean).join('、');
  const items=pages.map(({page,status,drawingType,content})=>{
    if(status==='unreadable')return `<li>第 ${esc(page)} 頁無法可靠辨識</li>`;
    if(status==='unreviewed')return `<li>第 ${esc(page)} 頁尚未完成分析</li>`;
    return `<li>第 ${esc(page)} 頁｜${esc(cleanText(drawingType))}<small class="aidb-muted">${esc(cleanText(content))}</small></li>`;
  });
  return `<small>施工圖共 ${esc(totalPages)} 頁，已分析 ${esc(reviewedPages)} 頁${status?`（${status}）`:''}</small><details class="aidb-drawing-review"><summary>逐頁分析紀錄</summary><ol>${items.join('')}</ol></details>`;
}

export function renderAnalysisResult(report){
  if(!report)return '';
  const {sections,sources,missing,drawingReview}=report;
  const blocks=Object.entries(SUMMARY_SECTIONS).map(([key,title],index)=>{
    const items=sections[key].map(({text,citations})=>{
      const content=cleanText(text);
      if(!content)return '';
      const refs=citations.length?`<small class="aidb-muted">${esc(citations.map(formatCitation).join('、'))}</small>`:'';
      return `<li>${esc(content)}${refs}</li>`;
    }).filter(Boolean);
    return `<section class="aidb-analysis-block"><h4>${index+1}. ${title}</h4>${items.length?`<ul>${items.join('')}</ul>`:`<p class="aidb-muted">${esc(emptySection(key,sources))}</p>`}</section>`;
  });
  const pagesBySource=new Map(sources.map(({kind})=>[kind,new Set()]));
  for(const [section,points] of Object.entries(sections)){
    for(const {citations} of points){
      for(const {source,page} of citations){
        if(source!=='drawing'||section==='drawings')pagesBySource.get(source)?.add(page);
      }
    }
  }
  const files=sources.map(({kind,label,name})=>{
    const pages=[...pagesBySource.get(kind)].sort((a,b)=>a-b);
    const references=pages.length?`<small class="aidb-muted">${kind==='drawing'?'施工圖重點':''}引用頁碼：${pages.join('、')}</small>`:'';
    return `<li>${esc(label)}｜${esc(name)}${kind==='drawing'?renderDrawingReview(drawingReview):''}${references}</li>`;
  });
  const analyzedAt=report.knowledgeSave?.analyzedAt;
  const time=analyzedAt&&Number.isFinite(Date.parse(analyzedAt))
    ?new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(analyzedAt)):'';
  blocks.push(`<section class="aidb-analysis-block"><h4>8. 資料來源</h4>${time?`<p class="aidb-muted">分析時間 ${esc(time)}</p>`:''}<ul><li>${BASIC_LABEL}</li>${files.join('')}${missing.map(label=>`<li class="aidb-muted">${esc(label)}｜未提供</li>`).join('')}</ul></section>`);
  return blocks.join('');
}

export function renderAnalysis(analysis={}){
  return `<p class="aidb-muted">根據案件基本資料、施工圖、正式報價單及追加減工程 PDF 整理案件重點。摘要暫存於本次頁面。</p><div data-analysis-result class="aidb-analysis-result" role="status" aria-live="polite"></div><p data-analysis-error role="alert" hidden></p><button class="btn btn-p" data-action="case.analyze" ${analysis.loading?'disabled':''}>${analysis.loading?'AI 分析中…':'開始 AI 分析'}</button>`;
}
