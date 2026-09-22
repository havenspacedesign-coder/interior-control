// Runtime-composed source module. Keep declarations in shared application scope.
// ── Progress ──
var pendingProgressRender=false;
const MOBILE_PROGRESS_LABEL_WIDTH=96;
const MOBILE_PROGRESS_DAY_WIDTH=180;
function mobileProgressTimelineWidth(days){return MOBILE_PROGRESS_LABEL_WIDTH+days.length*MOBILE_PROGRESS_DAY_WIDTH;}
function renderMobileProgressDateHeader(days){
  const WD=['日','一','二','三','四','五','六'];
  const td=today();
  const timelineWidth=mobileProgressTimelineWidth(days);
  return`<div class="mobile-progress-date-sticky" id="mobile-progress-date-sticky"><div class="mobile-progress-date-track" id="mobile-progress-date-track" style="width:${timelineWidth}px"><div class="mobile-progress-date-spacer"></div>${days.map(function(d){
    const ds=fmtDay(d),dow=d.getDay(),dc=S.dateColors[ds]||{},color=dc.color||(dow===0||dow===6?'var(--red)':'');
    return`<div class="mobile-progress-date-cell" style="${color?'color:'+color:''}">${d.getMonth()+1}/${d.getDate()} <span style="font-weight:400;font-size:10px">週${WD[dow]}</span>${isSameDay(d,td)?'<span style="font-size:10px">●</span>':''}</div>`;
  }).join('')}</div></div>`;
}
function renderProgress(force){
  var af=document.activeElement;
  var menuOpen=false;
  var typingInProgress=!!(af&&af.matches&&af.matches('input,textarea,[contenteditable="true"]')&&af.closest&&af.closest('#panel-progress'));
  document.querySelectorAll('.pn-mention-menu').forEach(function(el){if(el.style.display==='block')menuOpen=true;});
  if(!force&&(typingInProgress||menuOpen)){
    // 使用者正在進度頁任何文字欄位輸入時，背景同步或前一欄位的延遲儲存
    // 都不能重畫整個頁面，否則剛取得焦點的欄位會被替換而無法立即貼上。
    pendingProgressRender=true;
    return;
  }
  pendingProgressRender=false;
  const preservedHScrollLeft=calMode==='month'?progressScrollLeftForMonth():captureProgressHScroll();
  const el=$('panel-progress');
  const weekDays=getWeekDates();
  function shouldShow(p){
    return p.status==='prog';
  }
  const viewMonth=weekDays[0].getFullYear()+'-'+String(weekDays[0].getMonth()+1).padStart(2,'0');
  el.innerHTML=`
  <div class="progress-layout" style="display:flex;gap:14px;align-items:flex-start">
  ${renderGlobalNotesPanel(viewMonth)}
  <div class="progress-main" style="flex:1;min-width:0">
  <div class="progress-sticky-board" style="position:sticky;top:49px;z-index:25;background:var(--bg);box-shadow:0 1px 0 var(--border)">
  <div class="wctrl">
    <div class="seg">
      <button class="${calMode==='month'?'on':''}" onclick="setCalMode('month')">月視圖</button>
      <button class="${calMode==='day'?'on':''}" onclick="setCalMode('day')">今日總覽</button>
      <button class="${calMode==='todo'?'on':''}" onclick="setCalMode('todo')">各工地待辦事項</button>
      <button class="mobile-progress-notes-tab ${calMode==='notes'?'on':''}" onclick="setCalMode('notes')">我的記事本</button>
    </div>
    ${calMode==='month'?`<div class="formula-bar${formulaBarState?' active':''}" id="pn-formula-bar">
      <span class="formula-bar-label" id="pn-formula-label">${formulaBarState?(formulaBarState.type==='meeting'?(MEETING_ROWS.find(r=>r.id===formulaBarState.rowId)?.name||'會議 / 其他事項'):(formulaBarState.type==='work'?'工地記事':'私人記事'))+' · '+formulaBarState.ds.slice(5).replace('-','/'):'選取儲存格'}</span>
      <input class="formula-bar-input" id="pn-formula-input" placeholder="選取色塊後在此編輯…" value="${formulaBarState?escAttr(formulaBarState.text||''):''}" data-link-url="${formulaBarState?.link?escAttr(formulaBarState.link.url||''):''}" data-link-label="${formulaBarState?.link?escAttr(formulaBarState.link.label||''):''}" autocomplete="off" spellcheck="false"
        oncontextmenu="return insertUrlForSelection(event,this)"
        oninput="pnSyncFormulaText(this.value);pnFormulaInput(event)"
        onblur="formulaBarSave()"
        onkeydown="pnFormulaKeyDown(event)">
    </div>`:''}
    ${calMode==='month'?`<div class="nav-row">
      <button class="nav-btn" onclick="changePeriod(-1)">‹</button>
      <span class="wk-lbl" onclick="openDatePicker()">${weekDays[0].getFullYear()+'年 '+(weekDays[0].getMonth()+1)+'月'} 📅</span>
      <input type="date" id="week-date-picker" style="position:fixed;opacity:0;pointer-events:none;width:0;height:0" onchange="jumpToDate(this.value)">
      <button class="nav-btn" onclick="changePeriod(1)">›</button>
    </div>`:''}
  </div>
  </div>
  ${calMode==='todo'?renderTodoPanel():calMode==='notes'?renderGlobalNotesPanel(viewMonth,false):`
  ${getBibleStages().length===0?`<div class="empty" style="margin-bottom:1rem">請先至「施工寶典」新增工程階段</div>`:''}
  ${calMode==='month'?renderMobileProgressDateHeader(weekDays)+`<div class="progress-horizontal-viewport hide-hscrollbar" id="progress-horizontal-viewport" style="--progress-timeline-width:${mobileProgressTimelineWidth(weekDays)}px">${renderWeekView(shouldShow)}${renderDailyLogSection(weekDays)}${renderPrivateTodoSection()}</div>`:renderDayView()}
  ${calMode==='month'?'':renderPrivateTodoSection()}
  <div style="height:500px"></div>
  `}
  </div>
  </div>
  ${calMode==='month'?`<div class="hscroll-sync" id="progress-bottom-hscroll" style="position:fixed;bottom:0;height:14px;overflow-x:auto;overflow-y:hidden;background:var(--surface);border-top:1px solid var(--border);z-index:40">
    <div style="width:${200+weekDays.length*180}px;height:1px"></div>
  </div>`:''}`;
  restoreHScroll(preservedHScrollLeft);
  requestAnimationFrame(function(){restoreHScroll(preservedHScrollLeft);syncProgressMeetingStickyOffset();});
  requestAnimationFrame(watchNoteBoxResize);
}
let noteResizeObserver=null;
function watchNoteBoxResize(){
  const el=document.getElementById('global-note-box');
  if(!el)return;
  if(!noteResizeObserver){
    noteResizeObserver=new ResizeObserver(function(entries){
      entries.forEach(function(entry){
        globalNoteBoxHeight=entry.target.style.height||(entry.contentRect.height+'px');
      });
    });
  }
  noteResizeObserver.observe(el);
}
// Global sticky notepad — visible only to the current user. One text box,
// like 每日施工日誌. Whatever you type is saved under the month you're
// currently viewing; a month with no edit of its own just inherits the
// text from the nearest earlier month that has one, so editing "forks"
// forward from that point without touching earlier months' saved text.
function getGlobalNoteText(viewMonth){
  if(!currentUser)return'';
  const prefix=currentUser.uid+'_';
  const months=Object.keys(S.globalNotes||{})
    .filter(k=>k.indexOf(prefix)===0)
    .map(k=>k.slice(prefix.length))
    .filter(m=>m<=viewMonth)
    .sort();
  if(!months.length)return'';
  return S.globalNotes[prefix+months[months.length-1]].text||'';
}
let globalNoteBoxHeight=null;
function globalNotesCollapseStorageKey(){return currentUser?`notebookCollapsed_${currentUser.uid}`:'';}
function globalNotesAreCollapsed(){const key=globalNotesCollapseStorageKey();try{return !!key&&localStorage.getItem(key)==='1';}catch(error){return false;}}
window.toggleGlobalNotesPanel=function(){
  const key=globalNotesCollapseStorageKey();
  if(!key)return;
  try{localStorage.setItem(key,globalNotesAreCollapsed()?'0':'1');}catch(error){console.warn('無法儲存記事本收合偏好',error);}
  if(activePanel==='progress')renderProgress();
};
function renderGlobalNotesPanel(viewMonth,allowCollapse=true){
  if(!currentUser)return'';
  const text=getGlobalNoteText(viewMonth);
  const td=today();
  const curMonth=td.getFullYear()+'-'+String(td.getMonth()+1).padStart(2,'0');
  const isFuture=viewMonth>curMonth;
  const collapsed=allowCollapse&&globalNotesAreCollapsed();
  const heightStyle=globalNoteBoxHeight?`height:${globalNoteBoxHeight}`:'min-height:300px';
  return`<div class="global-notes-panel${collapsed?' is-collapsed':''}" style="width:300px;flex-shrink:0;position:sticky;top:60px;border:1px solid var(--border);border-radius:var(--rl2);background:var(--surface);padding:10px;max-height:calc(100vh - 80px);overflow-y:auto">
    <div class="global-notes-heading"><span class="global-notes-heading-text">📝 我的記事本${isFuture?' <span style="font-weight:400;color:var(--text3)">（未來月份，鎖定）</span>':''}</span>${allowCollapse?`<button class="global-notes-toggle" type="button" onclick="toggleGlobalNotesPanel()" title="${collapsed?'展開記事本':'收合記事本'}" aria-label="${collapsed?'展開記事本':'收合記事本'}">${collapsed?'›':'‹ 收合'}</button>`:''}</div>
    <div class="global-note-body"><textarea id="global-note-box" placeholder="點此輸入…" ${isFuture?'readonly':`onblur="globalNoteBoxHeight=this.style.height;saveGlobalNote('${viewMonth}',this.value);saveNoteHeight(this.style.height)" onmouseup="globalNoteBoxHeight=this.style.height;saveNoteHeight(this.style.height)"`} style="width:100%;box-sizing:border-box;${heightStyle};border:1px solid var(--border);border-radius:5px;padding:6px 8px;font-size:12px;font-family:inherit;resize:vertical;line-height:1.5;${isFuture?'background:var(--bg);color:var(--text3);cursor:not-allowed':''}">${escAttr(text)}</textarea></div>
  </div>`;
}
window.saveNoteHeight=async function(height){
  if(!currentUser||!height)return;
  await setDoc(doc(db,'userPrefs',currentUser.uid),{noteHeight:height},{merge:true});
}
window.saveGlobalNote=async function(viewMonth,text){
  if(!currentUser)return;
  const td=today();
  const curMonth=td.getFullYear()+'-'+String(td.getMonth()+1).padStart(2,'0');
  if(viewMonth>curMonth)return; // future months are locked, ignore any save attempt
  setSyncing();
  await setDoc(doc(db,'globalNotes',currentUser.uid+'_'+viewMonth),{uid:currentUser.uid,month:viewMonth,text,updatedAt:serverTimestamp()});
  setSynced();
}

function renderWeekView(shouldShow){
  const days=getWeekDates();const td=today();
  const WD=['日','一','二','三','四','五','六'];
  const projs=sortDesignProjs(S.projects.filter(shouldShow));
  const hint=selectedTag?`<div style="background:var(--pl);color:var(--pd);padding:6px 10px;border-radius:var(--r);margin-bottom:8px;font-size:12px">已選取色塊 — Ctrl+點格子複製，點空白取消</div>`:'';

  function renderCell(p,pi,d){
    const isT=isSameDay(d,td);const ds=fmtDay(d);
    const allEvs=(p.schedule||[]).filter(e=>e.date===ds);
    const isDone=p.status==='done';
    const isOpen=openPicker&&openPicker.projId===p.id&&openPicker.ds===ds;
    return`<td class="ev-cell ${isT?'tc':''}" style="min-height:88px" onclick="handleCellBg(event,'${p.id}','${ds}')" ondragover="event.preventDefault()" ondrop="evDrop(event,'${p.id}','${ds}')">
      ${allEvs.map((ev,ei)=>{
        const resolvedStage=resolveBibleStage(ev.stage,ev.label);
        const pn=pendingCount(p.id,resolvedStage);
        const isSel=selectedTag&&selectedTag.projId===p.id&&selectedTag.ds===ds&&selectedTag.ei===ei;
        return`<div class="ev-row">
          <span class="ev-chip${isSel?' sel':''}" style="background:${sc(pi)};color:${tc(pi)}"
            draggable="true" ondragstart="evDragStart(event,'${p.id}','${ds}',${ei})"
            onclick="event.stopPropagation();handleChipClick(event,'${p.id}','${ds}',${ei},'${resolvedStage}')">${displayStageName(ev.label||ev.stage||'?')}${pendBadge(pn)}</span>
          <span class="ev-field excel-cell ${scheduleCellIsSelected(p.id,ds,ei)?'excel-selected':''} ${scheduleCellIsEditing(p.id,ds,ei)?'excel-editing':''}" data-proj="${p.id}" data-ds="${ds}" data-ei="${ei}" data-field="note" contenteditable="${scheduleCellIsEditing(p.id,ds,ei)?'true':'false'}"
            onclick="event.stopPropagation();selectScheduleCell(this)" ondblclick="event.stopPropagation();startFieldEdit(this)" onblur="saveScheduleCell(this)" onkeydown="scheduleCellKeyDown(event,this)">${escAttr(ev.note||'')}</span>
          ${!isDone?`<button class="ev-del" onclick="event.stopPropagation();removeEv('${p.id}','${ds}',${ei})">×</button>`:''}
        </div>`;}).join('')}
      ${!isDone?`<div class="add-ev-wrap">
        <span class="add-ev-btn" onclick="event.stopPropagation();togglePicker(event,'${p.id}','${ds}',1)">＋ 新增</span>
        ${isOpen?`<div class="stage-search-box" onclick="event.stopPropagation()" style="top:${openPicker.top}px;left:${openPicker.left}px">
          <input type="text" class="stage-search-input" id="ssi-${p.id}-${ds}" placeholder="打關鍵字搜尋…"
            oninput="filterStages('${p.id}','${ds}')"
            onkeydown="handleStageKey(event,'${p.id}','${ds}')">
          <div class="stage-search-list" id="ssl-${p.id}-${ds}">
            ${getBibleStages().filter(s=>!isDesignStage(s)).map(s=>`<div class="stage-search-item" onclick="addEvFromStage('${p.id}','${ds}','${s}')">${displayStageName(s)}</div>`).join('')}
          </div>
        </div>`:''}
      </div>`:''}
    </td>`;
  }

  return`${hint}<div class="progress-week-content"><div class="wtbl-wrap hscroll-sync hide-hscrollbar progress-meeting-table"><table class="wtbl" style="width:${200+days.length*180}px">
  <colgroup><col style="width:200px">${days.map(()=>'<col style="width:180px">').join('')}</colgroup>
  <thead><tr>
    <th class="site-hd" style="width:200px"></th>
    ${days.map(d=>{
  const isT=isSameDay(d,td);
  const ds2=fmtDay(d);
  const dow=d.getDay();
  const isWknd=dow===0||dow===6;
  const dc=S.dateColors[ds2]||{};
  const dateColor=dc.color||(isWknd?'var(--red)':'');
  const dateNote=dc.note||'';
  return`<th class="${isT?'th-t':''}" style="width:180px;${dateColor?'color:'+dateColor:''};cursor:pointer" onclick="openDateColorPicker('${ds2}')" title="${dateNote||'點擊設定顏色/備註'}">
    ${d.getMonth()+1}/${d.getDate()} <span style="font-weight:400;font-size:10px">週${WD[d.getDay()]}</span>${dateNote?` <span style="font-size:9px;font-weight:400">${dateNote}</span>`:''}
  </th>`;}).join('')}
  </tr></thead>
  <tbody>
  ${(function(){
    var mFound=null;
    Object.keys(meetingSelected).forEach(function(k){
      if(meetingSelected[k]>=0){
        var parts=k.split('|');var rowId=parts[0],ds2=parts[1];
        var mkey=rowId+'_'+ds2;
        var mitems=(S.meetingLogs[mkey]&&S.meetingLogs[mkey].items)||[];
        if(mitems[meetingSelected[k]])mFound={rowId:rowId,ds:ds2,idx:meetingSelected[k],color:mitems[meetingSelected[k]].color||'',bg:mitems[meetingSelected[k]].bg||''};
      }
    });
    function mColorButton(kind,curVal){
      var isText=kind==='text';
      var label=isText?'文字顏色':'填滿顏色';
      var icon=isText
        ?'<span class="meeting-text-color-glyph">A</span>'
        :'<svg class="meeting-fill-color-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 3.4 17.7 14.9l-6.8 6.8a2 2 0 0 1-2.8 0l-5.8-5.8a2 2 0 0 1 0-2.8l7-7-3.1-3.1 1.4-1.4 3.1 3.1 1.5-1.5 1.4 1.4-7.4 7.4 5.8 5.8 2.9-2.9L4.8 4.8 6.2 3.4Z"/><path d="M18.4 17.2s-2.5 2.8-2.5 4.3a2.5 2.5 0 0 0 5 0c0-1.5-2.5-4.3-2.5-4.3Z"/></svg>';
      var bar=curVal||(isText?'#202124':'#ffffff');
      var oc=mFound?(' onclick="openMeetingColorPalette(event,\''+mFound.rowId+'\',\''+mFound.ds+'\','+mFound.idx+',\''+kind+'\',\''+curVal+'\')"'):'';
      return'<button type="button" class="meeting-color-button" aria-label="'+label+'" title="'+label+'" '+(mFound?'':'disabled')+oc+'>'
        +'<span class="meeting-color-icon">'+icon+'</span><span class="meeting-color-bar" style="background:'+bar+'"></span></button>';
    }
    var mColorBar='<span class="meeting-color-controls">'
      +mColorButton('text',mFound?mFound.color:'')
      +mColorButton('bg',mFound?mFound.bg:'')
      +'</span>';
    var hdr='<tr><td colspan="'+(days.length+1)+'" style="height:37px;box-sizing:border-box;padding:2px 10px;background:var(--bg);font-size:12px;font-weight:600;border-top:2px solid #1a1a1a">'
      +'<div class="meeting-toolbar">'
      +'<span class="meeting-toolbar-title">🗓 會議 / 其他事項</span>'
      +'<span class="meeting-toolbar-help"><span class="help-wrap"><button class="help-btn" type="button" aria-label="會議操作說明" onclick="toggleHelpPop(event,\'meeting-help\')">?</button><span class="help-pop" id="meeting-help" onclick="event.stopPropagation()"><ul><li>單擊項目後可選擇文字與底色。</li><li>雙擊項目可編輯內容。</li><li>點「＋標記」可標記人員，並同步到對方的每日施工日誌。</li><li>按住 Ctrl 拖拉可複製項目。</li><li>按 Delete 可刪除已選取的項目。</li></ul></span></span></span>'
      +'<span aria-hidden="true"></span>'+mColorBar
      +'</div></td></tr>';
    var rows=MEETING_ROWS.map(function(row){
      var rh='<tr><td class="site-hd" style="color:var(--text2)">'+row.name+'</td>';
      rh+=days.map(function(d){
        var ds=fmtDay(d);
        var isT=isSameDay(d,td);
        var key=row.id+'_'+ds;
        var items=(S.meetingLogs[key]&&S.meetingLogs[key].items)||[];
        var selKey=row.id+'|'+ds;
        var selIdx=(meetingSelected[selKey]!=null)?meetingSelected[selKey]:-1;
        var h='<td style="vertical-align:top;height:30px;padding:2px;border:1px solid var(--border);'+(isT?'background:#fff8f8':'')+'" ondragover="mDragOver(event)" ondragleave="mDragLeave(event)" ondrop="mDrop(event,\''+row.id+'\',\''+ds+'\')">';
        if(items.length===0){
          var emptySelected=selIdx===0;
          var emptyEditing=meetingEditing&&meetingEditing.rowId===row.id&&meetingEditing.ds===ds&&meetingEditing.idx===0;
          if(emptyEditing){
            h+='<div style="border:2px solid var(--purple);padding:3px 8px;border-radius:5px;display:flex;align-items:center;min-height:30px;font-size:13px;line-height:1.3;background:var(--surface)">'
              +'<input type="text" class="pn-box-input meet-chip" id="meetbox-'+row.id+'-'+ds+'-0" value="" autocomplete="off" spellcheck="false"'
              +' style="flex:1;min-width:0;box-sizing:border-box;border:none;padding:0;font-size:13px;line-height:1.3;font-family:inherit;background:transparent;color:var(--text)"'
              +' onblur="mBoxBlur(this,\''+row.id+'\',\''+ds+'\',0)"'
              +' onkeydown="mEditKeyDown(event,this,\''+row.id+'\',\''+ds+'\',0)"'
              +' onclick="event.stopPropagation()"'
              +'>'
              +'</div>';
          }else{
            h+='<div class="meet-chip '+(emptySelected?'excel-selected':'')+'" style="border:1.5px dashed var(--border);padding:3px 8px;border-radius:5px;font-size:13px;cursor:pointer;user-select:none;min-height:30px;line-height:1.3;color:var(--text3)"'
            +' onmousedown="mPointerSelect(event,\''+row.id+'\',\''+ds+'\',0)" onclick="mSelectEmpty(\''+row.id+'\',\''+ds+'\')" ondblclick="event.stopPropagation();mStartEdit(\''+row.id+'\',\''+ds+'\',0)"></div>';
          }
        }else{
          var item=items[0];
          var color=item.color||'';var bg=item.bg||'';var linkedItem=normalizeLinkedItem(item);
          var mentions=(item.mentions||[]).filter(function(uid){var member=S.members.find(function(x){return x.uid===uid;});return member&&member.role!=='manager';});
          var isSel=selIdx===0;
          var border=isSel?'2px solid var(--purple)':'1.5px solid var(--border)';
          var textStyle=(color?'color:'+color+';font-weight:500;':'color:var(--text);')+(bg?'background:'+bg+';':'background:var(--surface);');
          var markable=markableMembersList();
          var allMarked=markable.length>0&&markable.every(function(member){return mentions.indexOf(member.uid)>=0;});
          var dots=allMarked
            ?'<span title="已標記全部成員" style="height:18px;border-radius:3px;background:var(--purple);color:#fff;font-size:9px;font-weight:700;letter-spacing:.3px;padding:0 5px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">ALL</span>'
            :mentions.map(function(uid){
            var m=S.members.find(function(x){return x.uid===uid;});
            var nm=memberDisplayName(m);
            return'<span title="'+nm+'" style="width:18px;height:18px;border-radius:50%;background:var(--purple);color:#fff;font-size:10px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">'+memberTag(m)+'</span>';
          }).join('');
          var isEdit=meetingEditing&&meetingEditing.rowId===row.id&&meetingEditing.ds===ds&&meetingEditing.idx===0;
          if(isEdit){
            h+='<div style="border:'+border+';padding:3px 8px;border-radius:5px;display:flex;align-items:center;gap:5px;min-height:30px;font-size:13px;line-height:1.3;'+textStyle+'">'
              +'<input type="text" class="pn-box-input meet-chip" id="meetbox-'+row.id+'-'+ds+'-0" value="'+escAttr(linkedItem.text)+'" data-link-url="'+escAttr(linkedItem.link?.url||'')+'" data-link-label="'+escAttr(linkedItem.link?.label||'')+'" autocomplete="off" spellcheck="false"'
              +' style="flex:1;min-width:0;box-sizing:border-box;border:none;padding:0;font-size:13px;line-height:1.3;font-family:inherit;background:transparent;color:inherit"'
              +' onblur="mBoxBlur(this,\''+row.id+'\',\''+ds+'\',0)"'
              +' onkeydown="mEditKeyDown(event,this,\''+row.id+'\',\''+ds+'\',0)"'
              +' oncontextmenu="return insertUrlForSelection(event,this)"'
              +' onclick="event.stopPropagation()"'
              +'>'
              +'<div style="display:flex;gap:3px;align-items:center;flex-shrink:0">'+dots
              +'<span class="meet-tag-btn" title="標記成員" onmouseenter="mOpenMentionPicker(event,\''+row.id+'\',\''+ds+'\',0)" onmouseleave="mScheduleCloseMention(\''+row.id+'\',\''+ds+'\')" onclick="event.stopPropagation()" style="font-size:11px;color:var(--purple);cursor:pointer;border:1px dashed var(--purple);border-radius:50%;width:18px;height:18px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap">+</span>'
              +'</div></div>';
          }else{
            h+='<div class="meet-chip '+(isSel?'excel-selected':'')+'" style="border:'+border+';padding:3px 8px;border-radius:5px;font-size:13px;cursor:pointer;user-select:none;min-height:30px;line-height:1.3;position:relative;'+textStyle+'"'
            +' onmousedown="mPointerSelect(event,\''+row.id+'\',\''+ds+'\',0)" onclick="mSelect(\''+row.id+'\',\''+ds+'\',0)"'
              +' ondblclick="event.stopPropagation();mStartEdit(\''+row.id+'\',\''+ds+'\',0)"'
              +' draggable="true"'
              +' ondragstart="mDragStart(event,\''+row.id+'\',\''+ds+'\',0)"'
              +' ondragend="mDragEnd(event)"'
              +'>'+renderItemText(item)
              +(dots?'<span style="position:absolute;top:2px;right:2px;display:flex;gap:2px">'+dots+'</span>':'')
              +'</div>';
          }
        }
        h+='<div class="pn-mention-menu" id="meet-mention-'+row.id+'-'+ds+'" style="display:none" onmouseenter="mCancelCloseMention()" onmouseleave="mScheduleCloseMention(\''+row.id+'\',\''+ds+'\')"></div>';
        h+='</td>';
        return h;
      }).join('');
      rh+='</tr>';
      return rh;
    }).join('');
    return hdr+rows;
  })()}
  </tbody></table></div>
  </div>
  ${projs.length?`<div class="wtbl-wrap hscroll-sync hide-hscrollbar"><table class="wtbl" style="width:${200+days.length*180}px"><colgroup><col style="width:200px">${days.map(()=>'<col style="width:180px">').join('')}</colgroup><tbody>
  <tr><td colspan="${days.length+1}" style="padding:8px 10px;background:var(--bg);font-size:12px;font-weight:600;border-top:3px solid #1a1a1a"><div style="position:sticky;left:8px;display:inline-flex;align-items:center;gap:7px">🏗 工地進度<span class="help-wrap"><button class="help-btn" type="button" aria-label="工地進度操作說明" onclick="toggleHelpPop(event,'work-progress-help')">?</button><span class="help-pop" id="work-progress-help" onclick="event.stopPropagation()"><ul><li>單擊色塊可開啟 checklist。</li><li>按住 Ctrl 再單擊可複製。</li><li>雙擊白色欄位可編輯。</li><li>直接拖拉可搬移項目。</li><li>按住 Ctrl 拖拉可複製項目。</li></ul></span></span></div></td></tr>
  ${projs.map((p,pi)=>`
    <tr ${currentRole==='manager'?`draggable="true" ondragstart="workProjectDragStart(event,'${p.id}')" ondragover="workProjectDragOver(event)" ondrop="workProjectDragDrop(event,'${p.id}')"`:''}>
      <td class="site-hd" style="color:${tc(pi)};cursor:${currentRole==='manager'?'grab':'pointer'}" onclick="showProjectDetail('${p.id}')" title="${currentRole==='manager'?'拖曳可調整工地順序':'點擊查看案件詳細資料'}">${currentRole==='manager'?'<span style="color:var(--text3);margin-right:6px">⠿</span>':''}
        ${p.name}${p.status==='done'?`<br><span style="font-size:10px;color:var(--gd);background:var(--gl);padding:1px 5px;border-radius:8px">完工</span>`:''}
        <textarea onclick="event.stopPropagation()" onblur="saveSiteNote('${p.id}',this.value)" placeholder="共用備註…" style="width:100%;box-sizing:border-box;margin-top:5px;font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-family:inherit;resize:vertical;min-height:44px;cursor:text;color:var(--text)">${escAttr(p.siteNote||'')}</textarea>
      </td>
      ${days.map(d=>renderCell(p,pi,d)).join('')}
    </tr>
  `).join('')}
  </tbody></table></div>`:''}`;
}
