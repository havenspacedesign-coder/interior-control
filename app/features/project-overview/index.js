// Runtime-composed source module. Keep declarations in shared application scope.
// ── Overview ──
let overviewStatusFilter=null;
let overviewCompletedMode=false;
let overviewReportProjId=null;
let overviewEditMode=false;
function renderOverview(){
  const el=$('panel-overview');
  if(overviewReportProjId){el.innerHTML=renderSiteReport(overviewReportProjId);return;}
  const inContact=S.projects.filter(p=>p.status==='contact').length;
  const inCv=S.projects.filter(p=>p.status==='cv').length;
  const inDesign=S.projects.filter(p=>p.status==='design').length;
  const inProg=S.projects.filter(p=>p.status==='prog').length;
  const done=S.projects.filter(p=>p.status==='done').length;
  const shown=sortDesignProjs(overviewCompletedMode
    ? S.projects.filter(p=>p.status==='done')
    : S.projects.filter(p=>p.status!=='done'&&(!overviewStatusFilter||p.status===overviewStatusFilter)));
  const canEditShown=canEditProjects()&&shown.some(p=>p.status!=='done'||currentRole==='manager');
  function statCard(v,n,color,label){
    const completed=v==='done';
    const on=completed?overviewCompletedMode:(!overviewCompletedMode&&overviewStatusFilter===v);
    const action=completed?'toggleOverviewCompletedMode()':`setOverviewFilter('${v}')`;
    return`<div class="stat" style="cursor:pointer;${on?'outline:2px solid '+color+';border-radius:var(--r)':''}" onclick="${action}"><div class="stat-n" style="color:${color}">${n}</div><div class="stat-l">${label}</div></div>`;
  }
  el.innerHTML=`
  <div class="stats">
    ${statCard('contact',inContact,'#6B6558','接洽中')}
    ${statCard('cv',inCv,'var(--red)','客變案')}
    ${statCard('design',inDesign,'#4A3FA0','設計中')}
    ${statCard('prog',inProg,'var(--purple)','施工中')}
    ${statCard('done',done,'var(--green)','已完工')}
  </div>
  <div class="card">
    <div class="card-hdr">
      <div style="display:flex;align-items:center;gap:10px"><span class="card-title">${overviewCompletedMode?'已完工案件':overviewStatusFilter?statusInfo(overviewStatusFilter).l+'案件':'所有案件'}</span>
        ${overviewCompletedMode?`<button class="btn btn-sm" onclick="toggleOverviewCompletedMode()">← 返回案件總覽</button>`:isAdmin()?`<button class="btn btn-p btn-sm" onclick="showAddProject()">＋ 新增案件</button>`:''}
      </div>
      ${canEditShown?`<button class="btn btn-sm" onclick="toggleOverviewEditMode()">${overviewEditMode?'完成':'編輯'}</button>`:''}
    </div>
    ${shown.length===0?`<div class="empty">尚無案件</div>`:`
    <div style="overflow-x:auto"><table>
      <thead><tr>${isAdmin()&&overviewEditMode?'<th style="width:34px"></th>':''}<th>案件名稱</th><th>狀態</th><th>業主姓名</th><th>類型</th><th>設計師</th><th>預算</th><th>合約完工日</th>${canEditShown&&overviewEditMode?'<th>操作</th>':''}</tr></thead>
      <tbody>${shown.map(p=>{
        const si=statusInfo(p.status);
        return`<tr ${isAdmin()&&overviewEditMode?`draggable="true" ondragstart="overviewRowDragStart(event,'${p.id}')" ondragover="overviewRowDragOver(event)" ondrop="overviewRowDrop(event,'${p.id}')"`:''}>${isAdmin()&&overviewEditMode?'<td style="text-align:center;cursor:grab;color:var(--text3)">⠿</td>':''}
          <td><strong style="font-weight:500;cursor:pointer;color:var(--purple)" onclick="${p.status==='done'?`showSiteReport('${p.id}')`:`showProjectDetail('${p.id}')`}">${p.name}</strong>${p.status==='done'?' <span style="font-size:10px;color:var(--text3)">(查看總報告表)</span>':''}</td>
          <td>${isAdmin()&&(p.status!=='done'||currentRole==='manager')?`<select class="status-sel" style="background:${si.bg};color:${si.color}" onchange="handleStatusChange('${p.id}',this)">
            ${STATUS_OPTS.map(o=>`<option value="${o.v}" ${p.status===o.v?'selected':''}>${o.l}</option>`).join('')}
          </select>`:`<span class="badge" style="background:${si.bg};color:${si.color}">${si.l}</span>`}</td>
          <td>${p.owner||''}</td><td style="color:var(--text2)">${p.type||''}</td>
          <td>${p.designer||''}</td><td>${p.budget||''}</td>
          <td style="color:var(--text2)">${p.contractEnd||p.finish||''}</td>
          ${canEditShown&&overviewEditMode?`<td>${p.status!=='done'||currentRole==='manager'?`<button class="btn btn-sm" onclick="showEditProject('${p.id}')">編輯</button>${canDeleteProjects()?` <button class="btn btn-sm" onclick="deleteProject('${p.id}')">刪除</button>`:''}`:''}</td>`:''}
        </tr>`;}).join('')}</tbody>
    </table></div>`}
  </div>`;
}
window.setOverviewFilter=function(v){overviewCompletedMode=false;overviewStatusFilter=overviewStatusFilter===v?null:v;renderOverview();}
window.toggleOverviewCompletedMode=function(){overviewCompletedMode=!overviewCompletedMode;overviewStatusFilter=null;overviewEditMode=false;renderOverview();}
window.toggleOverviewEditMode=function(){if(!canEditProjects())return;overviewEditMode=!overviewEditMode;renderOverview();}
let overviewRowDragSrc=null;
window.overviewRowDragStart=function(e,id){if(!isAdmin())return e.preventDefault();overviewRowDragSrc=id;e.dataTransfer.effectAllowed='move';}
window.overviewRowDragOver=function(e){if(isAdmin()&&overviewRowDragSrc)e.preventDefault();}
window.overviewRowDrop=async function(e,targetId){e.preventDefault();if(!isAdmin()||!overviewRowDragSrc||overviewRowDragSrc===targetId)return;const ids=sortDesignProjs(S.projects).map(p=>p.id),from=ids.indexOf(overviewRowDragSrc),to=ids.indexOf(targetId);if(from<0||to<0)return;ids.splice(from,1);ids.splice(to,0,overviewRowDragSrc);designProjectOrder=ids;overviewRowDragSrc=null;renderOverview();await setDoc(doc(db,'settings','designProjectOrder'),{order:ids});}
let workProjectDragSrc=null;
window.workProjectDragStart=function(e,id){if(currentRole!=='manager')return e.preventDefault();workProjectDragSrc=id;e.dataTransfer.effectAllowed='move';}
window.workProjectDragOver=function(e){if(currentRole==='manager'&&workProjectDragSrc)e.preventDefault();}
window.workProjectDragDrop=async function(e,targetId){e.preventDefault();if(currentRole!=='manager'||!workProjectDragSrc||workProjectDragSrc===targetId)return;const ids=sortDesignProjs(S.projects).map(p=>p.id),from=ids.indexOf(workProjectDragSrc),to=ids.indexOf(targetId);if(from<0||to<0)return;ids.splice(from,1);ids.splice(to,0,workProjectDragSrc);designProjectOrder=ids;workProjectDragSrc=null;renderProgress();await setDoc(doc(db,'settings','designProjectOrder'),{order:ids});}
window.showSiteReport=function(id){overviewReportProjId=id;renderOverview();}
window.closeSiteReport=function(){overviewReportProjId=null;renderOverview();}
function renderSiteReport(projId){
  const p=S.projects.find(x=>x.id===projId);
  if(!p)return`<div class="empty">找不到這個案件</div><button class="btn" onclick="closeSiteReport()">← 返回</button>`;
  const stages=getBibleStages();
  const schedule=[...(p.schedule||[])].sort((a,b)=>(a.date<b.date?-1:a.date>b.date?1:0));
  const meetingEntries=getMeetingEntriesForProject(p.name);
  return`
  <button class="btn btn-sm" onclick="closeSiteReport()">← 返回案件總覽</button>
  <div class="card" style="margin-top:12px">
    <div class="card-hdr"><span class="card-title">${p.name} — 工地總報告表</span></div>
    <div style="font-size:13px;line-height:2;color:var(--text2)">
      業主姓名：${p.owner||'—'}　類型：${p.type||'—'}　設計師：${p.designer||'—'}<br>
      預算：${p.budget||'—'}　合約完工日：${p.contractEnd||p.finish||'—'}　初驗日：${p.initialInspectionDate||'—'}<br>
      完工類型：${p.completionTypes&&p.completionTypes.length?p.completionTypes.join('、'):'—'}
    </div>
  </div>
  <div class="card">
    <div class="card-hdr"><span class="card-title">📖 施工寶典勾選結果</span></div>
    ${(()=>{
      const touchedStages=stages.filter(s=>{
        const stored=S.checks[`${p.id}_${s}`]||[];
        return stored.some(x=>x&&(x.done||x.skip));
      });
      if(!touchedStages.length)return'<div class="empty">尚無勾選紀錄</div>';
      return touchedStages.map(s=>{
        const metaItems=projectBibleItemsMeta(p,s);
        if(!metaItems.length)return'';
        const stored=S.checks[`${p.id}_${s}`]||[];
        const done=metaItems.filter((_,i)=>stored[i]?.done||stored[i]?.skip).length;
        return`<div style="margin-bottom:14px">
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${s}（${done}/${metaItems.length}）</div>
          ${metaItems.map((m,i)=>{
            const st=stored[i]||{};
            const icon=st.done?'✓':(st.skip?'✗':'○');
            const color=st.done?'var(--teal)':'var(--text3)';
            const depth=m.depth||(m.isSub?1:0);
            return`<div style="font-size:12px;padding:3px 0 3px ${depth*26}px;display:flex;gap:6px"><span style="color:${color};font-weight:600;width:14px">${icon}</span>${depth>0?'└ ':''}${m.text}</div>`;
          }).join('')}
        </div>`;
      }).join('');
    })()}
  </div>
  <div class="card">
    <div class="card-hdr"><span class="card-title">🏗 工地進度</span></div>
    ${schedule.length?schedule.map(ev=>`<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)">
      <strong>${ev.date}</strong>　${ev.time||''}　${ev.label||ev.stage||''}${ev.note?'　— '+ev.note:''}
    </div>`).join(''):'<div class="empty">尚無工地進度紀錄</div>'}
  </div>
  <div class="card">
    <div class="card-hdr"><span class="card-title">🗓 會議 / 其他事項</span></div>
    ${meetingEntries.length?meetingEntries.map(e=>`<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)">
      <strong>${e.date}</strong>　［${e.rowLabel}］　${e.text}
    </div>`).join(''):'<div class="empty">沒有標記這個工地的會議/其他事項紀錄</div>'}
  </div>`;
}
function getMeetingEntriesForProject(projName){
  const out=[];
  Object.keys(S.meetingLogs||{}).forEach(key=>{
    const log=S.meetingLogs[key];
    if(!log||!log.items)return;
    const rowInfo=MEETING_ROWS.find(r=>r.id===log.rowId);
    (log.items||[]).forEach(item=>{
      const m=(item.text||'').match(/\[proj:([^\]]+)\]/);
      if(m&&m[1]===projName){
        out.push({date:log.date,rowLabel:rowInfo?rowInfo.name:(log.rowId||''),text:(item.text||'').replace(/\[proj:[^\]]+\]/g,'').trim()});
      }
    });
  });
  out.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  return out;
}
window.updateStatus=async function(projId,v,completionTypes,inspDate){
  const existing=S.projects.find(p=>p.id===projId);
  if(existing?.status==='done'&&currentRole!=='manager')return alert('已完工案件僅限管理員變更狀態。');
  setSyncing();
  const patch={status:v};
  if(v==='done'){
    if(completionTypes)patch.completionTypes=completionTypes;
    if(inspDate)patch.initialInspectionDate=inspDate;
    const proj=S.projects.find(p=>p.id===projId);
    if(!proj||!proj.bibleSnapshot){
      const snap={};
      getBibleStages().forEach(s=>{
        const b=S.bible[s]||{before:[],during:[],after:[]};
        snap[s]={before:[...(b.before||[])],during:[...(b.during||[])],after:[...(b.after||[])]};
      });
      patch.bibleSnapshot=snap;
    }
  }
  await updateDoc(doc(db,'projects',projId),patch);
  setSynced();
}
function projectLinkedConstructionManualStages(proj){
  const progress=proj?.designProgress||{};
  const stages=new Set();
  getDesignCols().filter(col=>col.kind!=='note'&&col.kind!=='member').forEach(col=>{
    const key=col.key||col.name;
    const stored=progress[key+'__stageLinks'];
    const links=Array.isArray(stored)?stored:[progress[key]];
    links.forEach(link=>{
      const value=String(link||'').trim();
      if(value.startsWith('#')&&getBibleStages().includes(value.slice(1)))stages.add(value.slice(1));
    });
  });
  return stages;
}
window.checkConstructionManualCompletion=function(projId,options={}){
  const proj=S.projects.find(p=>p.id===projId);
  const result={passed:true,incompleteTotal:0,manualIncompleteTotal:0,designProgressIncompleteCount:0,existingStages:[],incompleteStages:[]};
  if(!proj)return result;
  const startStageIndex=Math.max(0,Number(options.startStageIndex)||0);
  const includeDesignProgress=options.includeDesignProgress!==false;
  const linkedStages=projectLinkedConstructionManualStages(proj);
  getBibleStages().slice(startStageIndex).forEach(stage=>{
    const items=projectBibleItems(proj,stage);
    if(!items.length)return;
    const stored=S.checks[`${projId}_${stage}`]||[];
    const resolvedCount=items.reduce((count,_,index)=>count+(stored[index]?.done||stored[index]?.skip?1:0),0);
    if(resolvedCount===0&&!linkedStages.has(stage))return;
    const incompleteCount=items.length-resolvedCount;
    result.existingStages.push({stage,label:displayStageName(stage),itemCount:items.length,incompleteCount});
    if(incompleteCount>0){
      result.manualIncompleteTotal+=incompleteCount;
      result.incompleteStages.push({stage,label:displayStageName(stage),incompleteCount});
    }
  });
  result.designProgressIncompleteCount=includeDesignProgress?designProgressMissingBlueCount(proj):0;
  result.incompleteTotal=result.manualIncompleteTotal+result.designProgressIncompleteCount;
  result.passed=result.incompleteTotal===0;
  return result;
}
function statusChangeNeedsConstructionManualCheck(fromStatus,toStatus){
  return (toStatus==='done'&&(fromStatus==='contact'||fromStatus==='cv'||fromStatus==='design'))
    || (fromStatus==='design'&&toStatus==='prog')
    || (fromStatus==='prog'&&toStatus==='done');
}
function constructionManualBlockedMessage(targetStatus,checkResult){
  const targetLabel=statusInfo(targetStatus).l;
  const lines=checkResult.incompleteStages.map(stage=>`${stage.label}：${stage.incompleteCount} 項`);
  if(checkResult.designProgressIncompleteCount>0)lines.push(`設計進度未填欄位：${checkResult.designProgressIncompleteCount} 項`);
  return `無法變更為「${targetLabel}」\n此案件尚有 ${checkResult.incompleteTotal} 項未完成。\n${lines.length?lines.join('\n')+'\n':''}請先完成設計進度與施工寶典後再變更案件狀態。`;
}
function constructionCloseManualBlockedMessage(checkResult){
  const lines=checkResult.incompleteStages.map(stage=>`- ${stage.label}：${stage.incompleteCount} 項`);
  return `無法變更為「已完工」\n\n施工寶典尚有未完成項目：\n${lines.join('\n')}\n\n請先完成施工寶典後再進行結案。`;
}
function checkProjectTradeCompletion(projId){
  const saved=S.projectTradeSelections[projId]||{};
  const incompleteCategories=S.tradeCategories.filter(category=>{
    const selection=saved[category.id];
    return !selection||(!selection.none&&!(selection.vendorIds||[]).length);
  });
  return{passed:S.tradeCategories.length>0&&incompleteCategories.length===0,hasCategories:S.tradeCategories.length>0,incompleteCategories};
}
function projectTradeBlockedMessage(checkResult){
  const lines=checkResult.hasCategories?checkResult.incompleteCategories.map(category=>`- ${category.name}`).join('\n'):'- 尚未建立工程分類';
  return `無法變更為「已完工」\n\n案件工班尚未完成設定：\n${lines}\n\n每個工程都必須勾選施工廠商，\n若沒有此工程，請勾選「無」。`;
}
// The status <select> in 案件總覽 routes through here so switching to
// 已完工 can collect completion type(s) first, instead of committing
// immediately. Any other status change goes straight through.
window.handleStatusChange=function(projId,selectEl){
  const v=selectEl.value;
  const proj=S.projects.find(p=>p.id===projId);
  if(proj?.status==='done'&&currentRole!=='manager'){
    selectEl.value=proj.status;
    alert('已完工案件僅限管理員變更狀態。');
    return;
  }
  const prevStatus=proj?proj.status:'design';
  if(statusChangeNeedsConstructionManualCheck(prevStatus,v)){
    const isConstructionClose=prevStatus==='prog'&&v==='done';
    const checkResult=checkConstructionManualCompletion(projId,isConstructionClose?{startStageIndex:16,includeDesignProgress:false}:{});
    if(!checkResult.passed){
      selectEl.value=prevStatus;
      alert(isConstructionClose?constructionCloseManualBlockedMessage(checkResult):constructionManualBlockedMessage(v,checkResult));
      renderOverview();
      return;
    }
    if(isConstructionClose){
      const tradeCheck=checkProjectTradeCompletion(projId);
      if(!tradeCheck.passed){
        selectEl.value=prevStatus;
        alert(projectTradeBlockedMessage(tradeCheck));
        renderOverview();
        return;
      }
    }
  }
  if(v!=='done'){updateStatus(projId,v);return;}
  const opts=['未簽約','設計終止','設計完成','工程完成'];
  const inspRow=`<div style="margin:2px 0 4px 26px">
      <div style="font-size:11px;color:var(--text2);margin-bottom:2px">初驗日</div>
      <div style="display:flex;align-items:center;gap:3px">
        <input id="ct-insp-y" type="number" placeholder="年" style="width:70px">年
        <input id="ct-insp-m" type="number" placeholder="月" min="1" max="12" style="width:50px">月
        <input id="ct-insp-d" type="number" placeholder="日" min="1" max="31" style="width:50px">日
      </div>
    </div>`;
  $('mo-content').innerHTML=`
    <div class="mo-title">標記為已完工</div>
    <div class="mo-sub">可複選：這個案子屬於哪一種完工？</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin:10px 0">
      ${opts.map((o,i)=>`<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="ct-${i}" value="${o}"> ${o}
      </label>${o==='工程完成'?inspRow:''}`).join('')}
    </div>
    <div class="mo-footer"><button class="btn" onclick="cancelStatusChange('${projId}','${prevStatus}')">取消</button><button class="btn btn-p" onclick="confirmStatusDone('${projId}')">確定</button></div>`;
  $('modal').style.display='flex';
}
window.cancelStatusChange=function(projId,prevStatus){
  closeMo();
  renderOverview();
}
window.confirmStatusDone=function(projId){
  const opts=['未簽約','設計終止','設計完成','工程完成'];
  const selected=opts.filter((o,i)=>{const el=$('ct-'+i);return el&&el.checked;});
  const y=$('ct-insp-y'),m=$('ct-insp-m'),d=$('ct-insp-d');
  let inspDate='';
  if(y&&y.value&&m&&m.value&&d&&d.value){
    inspDate=y.value+'-'+String(m.value).padStart(2,'0')+'-'+String(d.value).padStart(2,'0');
  }
  closeMo();
  updateStatus(projId,'done',selected,inspDate);
}
window.saveSiteNote=async function(projId,val){
  setSyncing();
  await updateDoc(doc(db,'projects',projId),{siteNote:val});
  setSynced();
}
