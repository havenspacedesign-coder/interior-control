import {esc} from './ui-utils.js';
import {SUMMARY_SECTIONS,BASIC_LABEL,formatCitation,emptySection,verifiedKnowledgeItems,EVIDENCE_POLICY_VERSION} from './summary-format.js';

export async function analyzeBasicCase(project,getIdToken){
  if(!getIdToken)throw Error('本機展示帳號無法呼叫雲端 AI。請在已部署 API 的測試網站使用 Firebase 管理員帳號登入。');
  const token=await getIdToken();
  if(!token)throw Error('請先登入管理員帳號。');
  const basic=Object.fromEntries(['name','area','amount','year','houseType','scopes','url','note'].map(key=>[key,project[key]??(key==='scopes'?[]:'')]));
  const sessionId=project.id?crypto.randomUUID():null;
  let mode=sessionId?'step':null;
  let data;
  for(;;){
    let response;
    try{
      response=await fetch('/api/ai-case-analyze',{
      method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
        body:JSON.stringify({basic,...(sessionId?{caseId:project.id,drawingMode:mode,sessionId}:{})}),signal:AbortSignal.timeout(185000),
      });
    }catch(error){throw Error(['TimeoutError','AbortError'].includes(error.name)?'AI 分析逾時，請重試。':'無法連線 AI 分析服務，請檢查網路後重試。');}
    try{data=await response.json();}catch{throw Error('AI 分析 API 尚未啟用或回覆格式不正確。');}
    if(!response.ok)throw Error(data.message||'AI 分析失敗，請稍後重試。');
    if(!data.drawingStep)break;
    if(data.drawingStep.busy)throw Error('這份施工圖的分析正在進行，請稍後再按「開始 AI 分析」接續。');
    mode=data.drawingStep.done?'finalize':'step';
  }
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
  const items=pages.map(({page,status,drawingType,content,reason,lastFailureReason})=>{
    const note=[reason,lastFailureReason].filter(Boolean).map(esc).join('；');
    const detail=note?`<small class="aidb-muted">${note}</small>`:'';
    if(status==='unreadable')return `<li>第 ${esc(page)} 頁無法可靠辨識${detail}</li>`;
    if(status==='unreviewed')return `<li>第 ${esc(page)} 頁尚未完成分析${detail}</li>`;
    if(status==='request_failed')return `<li>第 ${esc(page)} 頁請求失敗${detail}</li>`;
    if(status==='incomplete')return `<li>第 ${esc(page)} 頁辨識不完整｜${esc(cleanText(drawingType))}<small class="aidb-muted">${esc(cleanText(content))}</small>${detail}</li>`;
    return `<li>第 ${esc(page)} 頁｜${esc(cleanText(drawingType))}<small class="aidb-muted">${esc(cleanText(content))}</small></li>`;
  });
  return `<small>施工圖共 ${esc(totalPages)} 頁，已分析 ${esc(reviewedPages)} 頁${status?`（${status}）`:''}</small><details class="aidb-drawing-review"><summary>逐頁分析紀錄</summary><ol>${items.join('')}</ol></details>`;
}

export function renderAnalysisResult(report){
  if(!report)return '';
  const {sections,sources,missing,drawingReview}=report;
  const blocks=Object.entries(SUMMARY_SECTIONS).map(([key,title],index)=>{
    if(key==='issues'){
      const issues=sections.issues;
      if(report.evidencePolicyVersion!==EVIDENCE_POLICY_VERSION&&issues.length){
        return `<section class="aidb-analysis-block"><h4>${index+1}. ${title}</h4><p class="aidb-muted">此為舊版分析，原有問題尚未驗證。</p><details><summary>查看歷史分析紀錄</summary><ul>${issues.map(row=>`<li>${esc(cleanText(row.text))}</li>`).join('')}</ul></details></section>`;
      }
      const confirmed=verifiedKnowledgeItems(issues,report.evidencePolicyVersion).filter(row=>row.category==='confirmed');
      const groups=[['已確認的矛盾或缺失',confirmed],['需要人工確認的疑問',issues.filter(row=>row.category==='review')],
        ['無法可靠辨識的資訊',issues.filter(row=>row.category==='unreadable')]];
      const content=groups.filter(([,rows])=>rows.length).map(([label,rows])=>`<p><strong>${label}</strong></p><ul>${rows.map(row=>{
        const refs=(row.evidence??[]).map(ref=>[ref.sourceName||formatCitation(ref),ref.sourceName?`第 ${ref.page} 頁`:'',ref.quote||''].filter(Boolean).join('｜'));
        return `<li>${esc(row.text)}${refs.map(ref=>`<small class="aidb-muted">${esc(ref)}</small>`).join('')}</li>`;
      }).join('')}</ul>`).join('');
      return `<section class="aidb-analysis-block"><h4>${index+1}. ${title}</h4>${confirmed.length?'':`<p class="aidb-muted">${esc(emptySection(key,sources))}</p>`}${content}</section>`;
    }
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
    if(section==='issues'&&report.evidencePolicyVersion!==EVIDENCE_POLICY_VERSION)continue;
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
