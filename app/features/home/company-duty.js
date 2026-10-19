// Runtime-composed source module. Keep declarations in shared application scope.
// ── Company cleaning duty module ──
const COMPANY_DUTY_VERSION=2,COMPANY_DUTY_WEEKLY_COUNT=5;
let companyDutyTestDate='';
function dutyMonthKey(date=new Date()){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;}
function dutyGroupLabel(index){let n=index+1,label='';while(n>0){n--;label=String.fromCharCode(65+n%26)+label;n=Math.floor(n/26);}return label;}
function emptyCompanyDutyConfig(){
  return{version:COMPANY_DUTY_VERSION,anchorMonth:dutyMonthKey(),groups:Array.from({length:COMPANY_DUTY_WEEKLY_COUNT},(_,i)=>({id:`group-${i+1}`,weekly:''})),memberOrder:[],monthlyCleaning:{A:{memberIds:[],tasks:[]},B:{memberIds:[],tasks:[]}}};
}
function dutyUniqueIds(ids){return Array.isArray(ids)?[...new Set(ids.map(String).filter(Boolean))]:[];}
function normalizeCompanyDutyConfig(raw){
  const blank=emptyCompanyDutyConfig();
  // Preserve existing weekly work, order and legacy fields when adding independent month-end teams.
  const sourceGroups=Array.isArray(raw?.groups)?raw.groups:[];
  const groups=Array.from({length:Math.max(COMPANY_DUTY_WEEKLY_COUNT,sourceGroups.length)},(_,i)=>{const g=sourceGroups[i]||{};return{...g,id:String(g.id||`group-${i+1}`),weekly:String(g.weekly||'')};});
  const monthlyCleaning={};
  for(const key of ['A','B']){
    const source=raw?.monthlyCleaning?.[key]||{};
    const memberIds=dutyUniqueIds(source.memberIds).filter(uid=>key==='A'||!monthlyCleaning.A.memberIds.includes(uid));
    const tasks=Array.isArray(source.tasks)?source.tasks.map((task,i)=>({id:String(task?.id||`${key}-task-${i+1}`),text:String(task?.text||'')})):[];
    monthlyCleaning[key]={memberIds,tasks};
  }
  return{version:COMPANY_DUTY_VERSION,groups,memberOrder:dutyUniqueIds(raw?.memberOrder),anchorMonth:/^\d{4}-(0[1-9]|1[0-2])$/.test(raw?.anchorMonth||'')?raw.anchorMonth:blank.anchorMonth,monthlyCleaning};
}
function makeLocalCompanyDutyConfig(){return emptyCompanyDutyConfig();}
function dutyEligibleMembers(){return activeMembersList();}
function dutyConfigMembers(config=companyDutyConfig){return config.memberOrder.map(uid=>S.members.find(m=>String(m.uid||m.id)===uid)).filter(Boolean);}
function dutyMemberName(uid){const member=S.members.find(m=>String(m.uid||m.id)===uid);return member?memberDisplayName(member):'已移除成員';}
function dutyMonthOffset(anchor,current=dutyMonthKey()){const[aY,aM]=String(anchor||current).split('-').map(Number),[cY,cM]=current.split('-').map(Number);return(cY-aY)*12+(cM-aM);}
function companyDutyAssignments(date=new Date()){
  if(isCompanyDutyLastFriday(date))return[];
  const config=normalizeCompanyDutyConfig(companyDutyConfig),members=dutyConfigMembers(config),n=config.groups.length;
  if(!n||members.length!==n)return[];
  const shift=((dutyMonthOffset(config.anchorMonth,dutyMonthKey(date))%n)+n)%n;
  return config.groups.map((group,index)=>({group,label:dutyGroupLabel(index),member:members[(index-shift+n)%n]}));
}
function companyDutyLastFriday(date){const last=new Date(date.getFullYear(),date.getMonth()+1,0);last.setDate(last.getDate()-((last.getDay()+2)%7));return last;}
function isCompanyDutyLastFriday(date){return date.getDay()===5&&date.getDate()===companyDutyLastFriday(date).getDate();}
function companyDutyDisplayDate(){return localTestMode&&companyDutyTestDate?new Date(companyDutyTestDate+'T12:00:00'):new Date();}
window.setCompanyDutyTestDate=function(value){
  if(!localTestMode||!IS_LOCAL_PREVIEW)return;
  const parsed=new Date(value+'T12:00:00');
  companyDutyTestDate=/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(parsed.getTime())&&fmtDay(parsed)===value?value:'';
  renderHome();
};
function renderCompanyDutyModule(_tier,date=companyDutyDisplayDate()){
  const config=normalizeCompanyDutyConfig(companyDutyConfig),monthly=isCompanyDutyLastFriday(date);
  const settings=isAdmin()?`<button class="btn btn-sm company-duty-settings-button" onclick="event.stopPropagation();openCompanyDutySettings()">值日設定</button>`:'';
  let body='';
  if(monthly){
    body=`<div class="company-duty-list">${['A','B'].map(key=>{const group=config.monthlyCleaning[key];return`<div class="company-duty-person" data-duty-monthly="${key}"><div class="company-duty-name">${key} 組</div><div class="company-duty-task"><span>成員：</span>${group.memberIds.length?group.memberIds.map(uid=>escAttr(dutyMemberName(uid))).join('、'):'尚未設定'}</div>${group.tasks.length?`<ol class="duty-monthly-tasks">${group.tasks.map(task=>`<li>${escAttr(task.text||'尚未填寫工作內容')}</li>`).join('')}</ol>`:'<div class="company-duty-task">尚未設定工作項目</div>'}</div>`;}).join('')}</div>`;
  }else{
    const members=dutyConfigMembers(config),assignments=companyDutyAssignments(date),last=companyDutyLastFriday(date);
    body=`<div class="company-duty-schedule-note">一般週五｜當月分配固定，下月輪替<br>月底清潔：${last.getMonth()+1}/${last.getDate()}（五），當天不做一般值日</div>`;
    body+=assignments.length?`<div class="company-duty-list">${assignments.map((a,i)=>`<div class="company-duty-person" data-duty-weekly="${i}"><div class="company-duty-name">${escAttr(memberDisplayName(a.member))}</div><div class="company-duty-task"><span>工作 ${i+1}：</span>${escAttr(a.group.weekly)}</div></div>`).join('')}</div>`:`<div class="company-duty-status">⚠️ 工作項目 5 項｜值日人員 ${members.length} 人<br>請填寫 5 項工作並安排 5 位人員，設定完成後才會分配。</div>`;
  }
  return`<div class="company-duty"><div class="company-duty-top"><span class="company-duty-month">🧹 ${monthly?'月底清潔':date.getMonth()+1+' 月公司值日'}</span>${settings}</div>${monthly?`<div class="company-duty-schedule-note">${date.getMonth()+1}/${date.getDate()}（五）｜固定 A／B 組，不參與輪替</div>`:''}${body}</div>`;
}
function dutyCanEdit(){return isAdmin()&&!!companyDutyDraft;}
function dutyMonthlySettingsHTML(key){
  const group=companyDutyDraft.monthlyCleaning[key],other=companyDutyDraft.monthlyCleaning[key==='A'?'B':'A'];
  return`<section class="duty-setting-card duty-monthly-card"><div class="duty-setting-head"><span>${key} 組｜月底清潔</span><span class="duty-help">固定成員，不限人數</span></div><div class="duty-monthly-body"><div class="duty-monthly-members">${dutyEligibleMembers().map(m=>{const uid=String(m.uid||m.id),checked=group.memberIds.includes(uid),unavailable=other.memberIds.includes(uid);return`<label><input type="checkbox" aria-label="${key} 組 ${escAttr(memberDisplayName(m))}" ${checked?'checked':''} ${unavailable?'disabled':''} onchange="toggleDutyMonthlyMember('${key}','${escAttr(uid)}',this.checked)"><span>${escAttr(memberDisplayName(m))}${unavailable?'（已在另一組）':''}</span></label>`;}).join('')||'<span class="duty-help">目前沒有可選人員</span>'}</div><div class="duty-setting-head"><span>工作項目</span><button class="btn btn-sm btn-p" onclick="addDutyMonthlyTask('${key}')">＋ 新增${key}組工作</button></div><div class="duty-monthly-work-list">${group.tasks.map((task,i)=>`<div class="duty-monthly-work-row"><span>${i+1}</span><input id="duty-task-${key}-${i}" aria-label="${key} 組工作 ${i+1}" value="${escAttr(task.text)}" placeholder="輸入清潔工作" oninput="updateDutyMonthlyTask('${key}',${i},this.value)"><div class="duty-row-tools"><button class="btn btn-sm" aria-label="${key} 組工作 ${i+1} 上移" ${i===0?'disabled':''} onclick="moveDutyMonthlyTask('${key}',${i},-1)">↑</button><button class="btn btn-sm" aria-label="${key} 組工作 ${i+1} 下移" ${i===group.tasks.length-1?'disabled':''} onclick="moveDutyMonthlyTask('${key}',${i},1)">↓</button><button class="btn btn-sm btn-danger" onclick="removeDutyMonthlyTask('${key}',${i})">刪除</button></div></div>`).join('')||'<div class="empty">尚未新增工作項目</div>'}</div></div></section>`;
}
function renderCompanyDutySettings(){
  if(!dutyCanEdit())return;
  const config=companyDutyDraft,members=dutyConfigMembers(config),available=dutyEligibleMembers().filter(m=>!config.memberOrder.includes(String(m.uid||m.id))),ok=members.length===config.groups.length;
  const workRows=config.groups.map((g,i)=>`<div class="duty-work-row duty-weekly-work-row"><strong>${i+1}</strong><input aria-label="一般工作 ${i+1}" value="${escAttr(g.weekly)}" placeholder="一般週五工作內容" oninput="updateDutyGroup(${i},'weekly',this.value)"><div class="duty-row-tools"><button class="btn btn-sm" ${i===0?'disabled':''} onclick="moveDutyGroup(${i},-1)">↑</button><button class="btn btn-sm" ${i===config.groups.length-1?'disabled':''} onclick="moveDutyGroup(${i},1)">↓</button></div></div>`).join('');
  const memberRows=members.map((m,i)=>`<div class="duty-person-row"><strong>${i+1}</strong><span>${escAttr(memberDisplayName(m))}</span><div class="duty-row-tools"><button class="btn btn-sm" ${i===0?'disabled':''} onclick="moveDutyMember(${i},-1)">↑</button><button class="btn btn-sm" ${i===members.length-1?'disabled':''} onclick="moveDutyMember(${i},1)">↓</button><button class="btn btn-sm btn-danger" onclick="removeDutyMember(${i})">移除</button></div></div>`).join('');
  $('mo-content').className='mo-box company-duty-settings';
  $('mo-content').innerHTML=`<div class="mo-title">值日生清潔設定</div><div class="mo-sub">一般週五：5 項工作、5 位人員，當月固定分配，下個月才往下一項輪替。月底最後一個週五完全改用下方固定 A／B 組。</div><section class="duty-weekly-settings"><h3 class="duty-section-title">① 每週清潔設定</h3><div class="duty-count-status ${ok?'ok':'warn'}">工作項目 5 項｜值日人員 ${members.length} 人　${ok?'✅ 可正常每月輪替':'⚠️ 可先儲存，填妥工作與人員前不分配一般值日'}</div><label class="duty-anchor-month">輪替起始月份 <input type="month" aria-label="輪替起始月份" value="${config.anchorMonth}" onchange="updateDutyAnchorMonth(this.value)"></label><div class="duty-settings-grid"><section class="duty-setting-card"><div class="duty-setting-head">每週清潔工作項目</div><div class="duty-setting-body">${workRows}</div></section><section class="duty-setting-card"><div class="duty-setting-head">每週清潔人員（按此順序每月輪替）</div><div class="duty-setting-body">${memberRows||'<div class="empty">尚未加入值日人員</div>'}</div><div class="duty-person-add"><select id="duty-member-select" aria-label="一般值日人員"><option value="">選擇既有成員</option>${available.map(m=>`<option value="${escAttr(String(m.uid||m.id))}">${escAttr(memberDisplayName(m))}</option>`).join('')}</select><button class="btn btn-sm btn-p" ${available.length&&config.memberOrder.length<config.groups.length?'':'disabled'} onclick="addDutyMember()">加入</button></div></section></div></section><section class="duty-monthly-settings"><h3 class="duty-section-title">② 月底清潔設定</h3><div class="duty-monthly-intro">月底清潔｜只在每月最後一個星期五執行，取代當天的一般值日；人員與工作固定沿用，不參與月份輪替。</div><div class="duty-monthly-settings-grid">${dutyMonthlySettingsHTML('A')}${dutyMonthlySettingsHTML('B')}</div></section><div class="mo-footer"><button class="btn" onclick="closeMo()">取消</button><button class="btn btn-p" id="duty-save-button" onclick="saveCompanyDutySettings()">儲存設定</button></div>`;
  if(localTestMode&&IS_LOCAL_PREVIEW)$('mo-content').insertAdjacentHTML('beforeend',`<label class="duty-test-date">本機測試日期（不儲存、不影響系統日期）<input type="date" aria-label="值日模組本機測試日期" value="${companyDutyTestDate}" onchange="setCompanyDutyTestDate(this.value)"></label>`);
  $('modal').style.display='flex';
}
window.openCompanyDutySettings=function(){if(!isAdmin())return;companyDutyDraft=normalizeCompanyDutyConfig(companyDutyConfig);renderCompanyDutySettings();};
window.updateDutyGroup=function(index,field,value){if(dutyCanEdit()&&field==='weekly'&&companyDutyDraft.groups[index])companyDutyDraft.groups[index].weekly=value;};
window.updateDutyAnchorMonth=function(value){if(dutyCanEdit()&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value))companyDutyDraft.anchorMonth=value;};
window.moveDutyGroup=function(index,delta){if(!dutyCanEdit())return;const to=index+delta;if(to<0||to>=companyDutyDraft.groups.length)return;[companyDutyDraft.groups[index],companyDutyDraft.groups[to]]=[companyDutyDraft.groups[to],companyDutyDraft.groups[index]];renderCompanyDutySettings();};
window.addDutyMember=function(){const uid=$('duty-member-select')?.value;if(!dutyCanEdit()||!uid||companyDutyDraft.memberOrder.length>=companyDutyDraft.groups.length||companyDutyDraft.memberOrder.includes(uid)||!dutyEligibleMembers().some(m=>String(m.uid||m.id)===uid))return;companyDutyDraft.memberOrder.push(uid);renderCompanyDutySettings();};
window.removeDutyMember=function(index){if(!dutyCanEdit())return;companyDutyDraft.memberOrder.splice(index,1);renderCompanyDutySettings();};
window.moveDutyMember=function(index,delta){if(!dutyCanEdit())return;const to=index+delta;if(to<0||to>=companyDutyDraft.memberOrder.length)return;[companyDutyDraft.memberOrder[index],companyDutyDraft.memberOrder[to]]=[companyDutyDraft.memberOrder[to],companyDutyDraft.memberOrder[index]];renderCompanyDutySettings();};
window.toggleDutyMonthlyMember=function(key,uid,checked){
  if(!dutyCanEdit()||!['A','B'].includes(key))return;
  const group=companyDutyDraft.monthlyCleaning[key],other=companyDutyDraft.monthlyCleaning[key==='A'?'B':'A'];
  if(checked){if(other.memberIds.includes(uid)||!dutyEligibleMembers().some(m=>String(m.uid||m.id)===uid)){renderCompanyDutySettings();return;}if(!group.memberIds.includes(uid))group.memberIds.push(uid);}
  else group.memberIds=group.memberIds.filter(id=>id!==uid);
  renderCompanyDutySettings();
};
window.addDutyMonthlyTask=function(key){if(!dutyCanEdit()||!['A','B'].includes(key))return;const tasks=companyDutyDraft.monthlyCleaning[key].tasks;tasks.push({id:window.crypto?.randomUUID?.()||`task-${Date.now()}-${Math.random().toString(36).slice(2)}`,text:''});renderCompanyDutySettings();$(`duty-task-${key}-${tasks.length-1}`)?.focus();};
window.updateDutyMonthlyTask=function(key,index,value){if(dutyCanEdit()&&companyDutyDraft.monthlyCleaning[key]?.tasks[index])companyDutyDraft.monthlyCleaning[key].tasks[index].text=value;};
window.moveDutyMonthlyTask=function(key,index,delta){if(!dutyCanEdit()||!['A','B'].includes(key))return;const tasks=companyDutyDraft.monthlyCleaning[key].tasks,to=index+delta;if(!tasks[index]||to<0||to>=tasks.length)return;[tasks[index],tasks[to]]=[tasks[to],tasks[index]];renderCompanyDutySettings();};
window.removeDutyMonthlyTask=function(key,index){if(!dutyCanEdit()||!companyDutyDraft.monthlyCleaning[key]?.tasks[index]||!confirm(`確定刪除 ${key} 組這條清潔工作？儲存後生效。`))return;companyDutyDraft.monthlyCleaning[key].tasks.splice(index,1);renderCompanyDutySettings();};
window.resetCompanyDutySettings=function(){if(!dutyCanEdit()||!confirm('清空公司值日的 5 項一般工作、人員與月底 A／B 組設定？只影響本模組，儲存後生效。'))return;companyDutyDraft=emptyCompanyDutyConfig();renderCompanyDutySettings();};
window.saveCompanyDutySettings=async function(){
  if(!dutyCanEdit())return;
  const normalized=normalizeCompanyDutyConfig(companyDutyDraft),button=$('duty-save-button');if(button)button.disabled=true;
  try{await setDoc(doc(db,'settings','companyDuty'),{...normalized,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});companyDutyConfig=normalized;companyDutyDraft=null;closeMo();renderHome();}
  catch(error){if(button)button.disabled=false;console.error('company duty save failed',error);alert('值日設定暫時無法儲存，請稍後再試。');}
};
