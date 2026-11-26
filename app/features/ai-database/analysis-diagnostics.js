import {PDF_LABELS,SUMMARY_SECTIONS} from './summary-format.js';
import {esc} from './ui-utils.js';

const REASONS={
  NO_VALID_CITATION:'缺少有效來源',SOURCE_NOT_AVAILABLE:'未提供對應來源',
  SOURCE_NOT_ALLOWED:'來源不適用於本欄位',
  SOURCE_CONTENT_NOT_CONFIRMED:'原文未能支持此項內容',BASIC_PARAPHRASE_NOT_VERIFIED:'需核對案件基本資料',
  EVIDENCE_FIELD_FORMAT:'欄位格式不符或無法從原文確定欄位對應',
  EVIDENCE_QUOTE_MISMATCH:'指定 PDF 頁面找不到一致的原文摘錄',
  EVIDENCE_NUMBER_MISMATCH:'數值或單位與原文不一致',
  EVIDENCE_VALUE_MISMATCH:'欄位內容與原文不一致',
  PAGE_OUT_OF_RANGE:'頁碼無效或超出檔案頁數',DRAWING_PAGE_NOT_RECOGNIZED:'引用的施工圖頁尚無可靠辨識紀錄',
  PDF_EVIDENCE_UNAVAILABLE:'PDF 證據無法讀取',NO_TEXT_LAYER:'頁面缺少可核對的文字',
  PDF_OPEN_FAILED:'無法開啟 PDF',PARSER_LOAD_FAILED:'無法載入 PDF 解析模組',PAGE_TEXT_FAILED:'頁面文字抽取失敗',
  PDF_CANVAS_INIT_FAILED:'PDF 解析器的 Canvas 原生模組初始化失敗',
  PDF_WORKER_INIT_FAILED:'PDF 解析 Worker 初始化失敗',
  PDF_BYTES_MISSING:'未取得 PDF 檔案',INDEX_TIMEOUT:'PDF 索引逾時',
  ISSUE_REQUIRED_EVIDENCE_MISSING:'缺少所需的雙方證據',ISSUE_INVALID_SOURCE_PAGE:'矛盾證據的來源或頁碼無效',
  ISSUE_ORIGINAL_QUOTE_NOT_FOUND:'原始文件找不到所引文字',ISSUE_COMPARISON_NOT_SUPPORTED:'原文未支持這項比較',
  ISSUE_COMPARISON_SCOPE_UNCONFIRMED:'比較的範圍或版本需人工確認',ISSUE_SOURCE_UNREADABLE:'來源無法可靠辨識',
  CHANGE_SOURCE_OR_FIELDS_MISSING:'缺少追加減來源或必要欄位',
  INVALID_KNOWLEDGE_FIELDS:'結構化欄位不完整',INVALID_SUMMARY_POINT:'摘要項目格式不完整',
  DRAWING_SOURCE_NOT_PROVIDED:'未提供施工圖',SECTION_LIMIT:'超出摘要保留筆數',
  PDF_EVIDENCE_INDEX_FAILED:'PDF 索引失敗',VERIFIED_COVERAGE_REGRESSION:'已驗證項目大幅減少',
  VERIFIED_SOURCE_LOST:'既有已驗證來源失去佐證',DRAWING_REVIEW_INCOMPLETE:'施工圖逐頁分析未完成',
  NO_VERIFIED_PDF_KNOWLEDGE:'本次未取得可驗證的 PDF 知識',OLDER_RUN:'較晚開始的分析已發布',
  INVALID_MODEL_JSON:'AI 回傳的 JSON 無法解析',OPENAI_REQUEST_FAILED:'AI 請求失敗',
  OPENAI_HTTP_ERROR:'AI 服務回傳錯誤',OPENAI_RESPONSE_FORMAT_INVALID:'AI 服務回覆格式無效',
  OPENAI_OUTPUT_INCOMPLETE:'AI 回覆未完成',SUMMARY_SCHEMA_INVALID:'摘要結構不完整',
  KNOWLEDGE_SCHEMA_INVALID:'案件知識結構不完整',PDF_INDEX_UNEXPECTED_ERROR:'PDF 索引發生錯誤',
  PDF_SOURCE_LOAD_FAILED:'案件 PDF 檔案讀取失敗',DRAWING_PREPARATION_FAILED:'施工圖分析準備失敗',
  ANALYSIS_RULE_LOAD_FAILED:'無法讀取案件所屬分類的 AI 分析規則',ANALYSIS_RULES_CHANGED:'分析期間適用的規則或 PDF 類型已變更',
  PERMISSION_DENIED:'Firestore 權限不足',FIRESTORE_WRITE_FAILED:'Firestore 寫入失敗',
  FIRESTORE_LATEST_READ_FAILED:'Firestore 正式版本讀取失敗',FIRESTORE_PAYLOAD_TOO_LARGE:'紀錄總量超出儲存限制',
  FIRESTORE_COMMIT_FAILED:'Firestore 提交失敗',FIRESTORE_PRECONDITION_RETRY_LIMIT:'正式版本持續變動，寫入重試已達上限',
};
const STATES={completed:'已完成',parsed:'解析成功',invalid_json:'解析失敗',committed:'已寫入',
  opened:'已開啟',failed:'失敗',not_attempted:'未執行',not_applicable:'不適用',incomplete:'未完成',
  received:'已收到',requested:'已送出',http_error:'回傳錯誤',attempted:'已嘗試'};
const LABELS={...SUMMARY_SECTIONS,quotedTotal:'正式報價總額',changeNet:'追加減淨額',workItems:'結構化工項',
  spaces:'空間配置',category:'工種',description:'說明',material:'材料',specification:'規格'};
export const diagnosticReason=code=>REASONS[code]??code??'需人工核對';
const label=key=>LABELS[key]??key;
const state=key=>STATES[key]??key;
const fileLabel=key=>PDF_LABELS[key]??key;

export function renderAnalysisDiagnostics(trace,modelOutput){
  if(!trace&&!modelOutput)return '';
  const files=(trace?.pdf??[]).map(file=>{
    const diagnostics=file.diagnostics.map(entry=>[entry.page? `第 ${entry.page} 頁`:'',diagnosticReason(entry.code),entry.errorMessage??entry.errorType]
      .filter(Boolean).join('｜'));
    const stacks=[...new Set(file.diagnostics.map(entry=>entry.errorStack).filter(Boolean))];
    const details=stacks.length?`<details><summary>技術詳細資訊</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(stacks.join('\n\n'))}</pre></details>`:'';
    return `<li>${esc(fileLabel(file.source))}｜${esc(state(file.open))}｜共 ${esc(file.pageCount??'未知')} 頁｜引用 ${esc(file.requestedPages.length)} 頁｜已抽取 ${esc(file.extractedPages.length)} 頁${diagnostics.length?`<small>${esc(diagnostics.join('、'))}</small>`:''}${details}</li>`;
  });
  const counts=Object.entries(trace?.validationCounts??{}).map(([key,value])=>{
    const [group,section]=key.split('.');
    const cells=['input','retained','verified','pending','excluded'].map(name=>`<td>${esc(value[name])}</td>`).join('');
    return `<tr><th scope="row">${group==='knowledge'?'結構化｜':''}${esc(label(section))}</th>${cells}</tr>`;
  });
  const review=(trace?.validation??[]).filter(row=>row.reason||row.unverifiedFields?.length).map(row=>{
    const heading=[row.group==='knowledge'?'結構化':'摘要',label(row.section),`第 ${row.item} 筆`].join('｜');
    const codes=(row.citations??[]).map(ref=>[`${fileLabel(ref.source)}`,ref.page? `第 ${ref.page} 頁`:'',diagnosticReason(ref.reason)].filter(Boolean).join('｜'));
    const reason=row.unverifiedFields?.length?`待核對欄位 ${row.unverifiedFields.map(label).join('、')}`:diagnosticReason(row.reason);
    return `<li>${esc(heading)}｜${row.status==='excluded'?'已排除｜':''}${esc(reason)}${codes.length?`<small>${esc(codes.join('、'))}</small>`:''}</li>`;
  });
  const originals=trace?.json?.sections?Object.entries(trace.json.sections).map(([key,value])=>`${label(key)} ${value} 筆`).join('、'):'';
  const save=trace?.firestore;
  const written=Object.entries(save?.latestWritten?.bySource??{}).map(([key,count])=>`${fileLabel(key)} ${count} 筆`).join('、');
  const ruleAudit=trace?.analysisRules;
  const ruleRows=ruleAudit?.rules.map(({id,name,version,revisionId,documentTypes})=>`<li>${esc(name)}｜版本 ${esc(version)}｜ID ${esc(id)}<small>修訂 ID ${esc(revisionId)}｜${esc(documentTypes.map(fileLabel).join('、'))}</small></li>`).join('');
  return `<details class="aidb-analysis-block"><summary>分析診斷</summary>
    ${trace?`<p>分析編號 ${esc(trace.runId)}</p><p>OpenAI ${esc(state(trace.openAI.state))}｜JSON ${esc(state(trace.json.state))}</p>
    ${trace.failure?`<p>${esc(diagnosticReason(trace.failure))}</p>`:''}${originals?`<p>原始回覆 ${esc(originals)}</p>`:''}
    ${ruleAudit?`<details><summary>${ruleAudit.summarySubmitted?'本次分析使用的分類規則':'分析準備階段選取的分類規則'}</summary>
    ${ruleRows?`<ul>${ruleRows}</ul>`:'<p>本次沒有適用的已啟用規則。</p>'}</details>`:''}
    ${files.length?`<ul>${files.join('')}</ul>`:''}
    ${counts.length?`<table><thead><tr><th>分類</th><th>驗證前</th><th>保留</th><th>已驗證</th><th>待核對</th><th>排除</th></tr></thead><tbody>${counts.join('')}</tbody></table>`:''}
    ${review.length?`<ul>${review.join('')}</ul>`:''}
    ${save?`<p>Firestore ${esc(state(save.state))}${save.latestUpdated?'｜已更新正式版本':save.history?'｜已保留歷史': ''}${save.reason?`｜${esc(diagnosticReason(save.reason))}`:''}${written?`｜${esc(written)}`:''}</p>`:''}`:''}
    ${modelOutput?`<details><summary>原始 AI 回覆（待驗證）</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(modelOutput)}</pre></details>`:''}</details>`;
}

export function renderAnalysisVersion(report){
  if(!report?.runId)return '';
  const publication=report.knowledgeSave?.publication;
  const trusted=publication?.trustedRunId;
  const status=trusted===report.runId?'此版本可正式引用'
    :trusted?`此版本僅供查閱。目前可正式引用的版本為 ${trusted}`:'目前沒有通過發布驗證的版本';
  return `<p class="aidb-muted">${esc(status)}${publication?.reason?`｜${esc(diagnosticReason(publication.reason))}`:''}</p>`;
}

export function renderAnalysisHistory(history){
  if(!history)return '';
  const rows=history.runs.map(run=>{
    const status=run.runId===history.trustedRunId?'目前正式版本':run.status==='failed'?'分析失敗'
      :run.publication?.state==='published'?'曾發布':'歷史紀錄';
    const time=run.analyzedAt?new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Taipei'})
      .format(new Date(run.analyzedAt)):run.runId;
    return `<li><button type="button" class="btn" data-action="case.analysisRun" data-id="${esc(run.runId)}">${esc(time)}｜${status}</button></li>`;
  });
  return rows.length?`<ul>${rows.join('')}</ul>${history.cursor?'<button type="button" class="btn" data-action="case.analysisHistoryMore">載入較早紀錄</button>':''}`:'<p class="aidb-muted">尚無分析紀錄。</p>';
}
