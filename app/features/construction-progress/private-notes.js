// Runtime-composed source module. Keep declarations in shared application scope.
function renderPrivateTodoSection(){
  if(calMode!=='month')return'';
  var days=getWeekDates();
  var td=today();
  var pn=S.privateNotes||{work:{},personal:{}};
  var COLS=[
    {c:'',bg:'#e8e5e0',l:'無'},
    {c:'#E24B4A',bg:'#E24B4A',l:'紅'},
    {c:'#EF9F27',bg:'#EF9F27',l:'橘'},
    {c:'#1D9E75',bg:'#1D9E75',l:'綠'},
    {c:'#534AB7',bg:'#534AB7',l:'藍'},
    {c:'#9c9690',bg:'#9c9690',l:'灰'}
  ];
  var sel=S.privateSelected||{};
  var editing=S.privateEditing||null;

  function itemControls(){
    var found=null;
    Object.keys(sel).forEach(function(k){
      if(sel[k]>=0){
        var parts=k.split('|');
        var type=parts[0],ds=parts[1];
        var items=(pn[type]&&pn[type][ds])||[];
        if(items[sel[k]])found={type:parts[0],ds:parts[1],idx:sel[k],item:items[sel[k]]};
      }
    });
    var active=!!found;
    var item=active?found.item:null;
    var completeOnclick=active?(' onclick="pnToggleComplete(\''+found.type+'\',\''+found.ds+'\','+found.idx+')"'):'';
    var strikeOnclick=active?(' onclick="pnToggleStrike(\''+found.type+'\',\''+found.ds+'\','+found.idx+')"'):'';
    var h='<span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px">';
    h+='<span'+completeOnclick+' style="font-size:10px;cursor:'+(active?'pointer':'default')+';opacity:'+(active?1:0.35)+';color:'+(item&&item.completed?'#fff':'var(--text3)')+';background:'+(item&&item.completed?'var(--red)':'transparent')+';border:1px solid '+(item&&item.completed?'var(--red)':'var(--border)')+';border-radius:9px;padding:1px 6px;white-space:nowrap">'+(item&&item.completed?'✓ 已完成':'完成')+'</span>';
    h+='<span'+strikeOnclick+' style="font-size:10px;cursor:'+(active?'pointer':'default')+';opacity:'+(active?1:0.35)+';color:'+(item&&item.strike?'#fff':'var(--text3)')+';background:'+(item&&item.strike?'#555':'transparent')+';border:1px solid '+(item&&item.strike?'#555':'var(--border)')+';border-radius:9px;padding:1px 6px;text-decoration:line-through;white-space:nowrap">S</span>';
    h+='</span>';
    return h;
  }

  // Render text with @mentions highlighted
  function renderText(text){
    if(!text)return'';
    return text.replace(/([\u4e00-\u9fa5A-Za-z0-9_\s]+)/g,function(match){return match;})
      .split(/(\[proj:[^\]]+\])/g).map(function(part){
        var m=part.match(/\[proj:([^\]]+)\]/);
        if(m)return'<span style="color:var(--purple);font-weight:600;background:var(--pl);padding:0 4px;border-radius:3px;font-size:10px">'+m[1]+'</span>';
        return escAttr(part);
      }).join('');
  }

  function makeCell(type,ds){
    var isT=isSameDay(new Date(ds+'T00:00:00'),td);
    var items=(pn[type]&&pn[type][ds])||[];
    var selKey=type+'|'+ds;
    var selIdx=(sel[selKey]!=null)?sel[selKey]:-1;
    var h='<td data-pn-cell="'+type+'|'+ds+'" style="vertical-align:top;padding:4px;border:1px solid var(--border);'+(isT?'background:#fff8f8':'')+'" ondragover="pnPreviewCell(event,\''+type+'\',\''+ds+'\')" ondrop="pnDrop(event,\''+type+'\',\''+ds+'\')">';
    items.forEach(function(item,i){
      var color=item.color||'';var linkedItem=normalizeLinkedItem(item);
      var isSel=selIdx===i;
      var isEdit=editing&&editing.type===type&&editing.ds===ds&&editing.idx===i;
      var border=isSel?'2px solid var(--purple)':'1.5px solid var(--border)';
      var textStyle=(color?'color:'+color+';font-weight:500':'color:var(--text)')+(item.strike?';text-decoration:line-through':'');
      // Chip height matches add button
      if(isEdit){
        h+='<div style="border:'+border+';border-radius:5px;margin-bottom:4px;padding:6px 8px;background:var(--surface);display:flex;align-items:center;gap:5px">'
          +'<input type="text" class="pn-box-input pn-chip" id="pnbox-'+type+'-'+ds+'-'+i+'" value="'+escAttr(linkedItem.text)+'" data-link-url="'+escAttr(linkedItem.link?.url||'')+'" data-link-label="'+escAttr(linkedItem.link?.label||'')+'" autocomplete="off" spellcheck="false"'
          +' style="flex:1;min-width:0;box-sizing:border-box;background:transparent;border:none;padding:0;font-size:12px;line-height:1.4;font-family:inherit;'+textStyle+'"'
          +' oninput="pnSyncFormulaText(this.value);pnInput(event,\''+type+'\',\''+ds+'\','+i+')"'
          +' onblur="pnBoxBlur(this,\''+type+'\',\''+ds+'\','+i+')"'
          +' onkeydown="pnKeyDown(event,\''+type+'\',\''+ds+'\','+i+')"'
          +' oncontextmenu="return insertUrlForSelection(event,this)"'
          +' onclick="event.stopPropagation()"'
          +'>'
          +'</div>';
      }else{
        h+='<div class="pn-chip" data-pn-index="'+i+'" style="background:var(--surface);border:'+border+';padding:6px 8px;border-radius:5px;font-size:12px;margin-bottom:4px;cursor:pointer;user-select:none;min-height:30px;line-height:1.4;position:relative;'+textStyle+'"'
          +' onmousedown="pnPointerSelect(event,\''+type+'\',\''+ds+'\','+i+')"'
          +' onclick="pnSelect(\''+type+'\',\''+ds+'\','+i+')"'
          +' ondblclick="event.stopPropagation();pnStartEdit(\''+type+'\',\''+ds+'\','+i+')"'
          +' draggable="true"'
          +' ondragstart="pnDragStart(event,\''+type+'\',\''+ds+'\','+i+')"'
          +' ondragend="pnDragEnd()"'
          +' ondragover="pnPreviewReorder(event,\''+type+'\',\''+ds+'\','+i+')"'
          +' ondrop="pnDrop(event,\''+type+'\',\''+ds+'\','+i+')"'
          +'>';
        h+=renderItemText(item);
        if(item.completed)h+='<span style="position:absolute;top:2px;right:4px;font-size:10px;color:var(--red)">✓</span>';
        h+='</div>';
      }
    });
    h+='<button type="button" class="pn-add" style="font-size:12px;padding:6px 8px;border:1px dashed var(--border);background:none;cursor:pointer;color:var(--text3);width:100%;text-align:left;margin-top:2px;border-radius:5px;font-family:inherit;min-height:30px" onmousedown="pnPrepareAdd(\''+type+'\',\''+ds+'\')" onclick="event.stopPropagation();pnAdd(\''+type+'\',\''+ds+'\')">＋ 新增</button>';
    h+='</td>';
    return h;
  }

  function makeRow(type,label){
    var h='<tr><td class="log-name-cell" style="font-size:11px;color:var(--text2);position:sticky;left:0;z-index:5;background:var(--bg);border-right:2px solid var(--border);width:200px">'+label+'</td>';
    days.forEach(function(d){h+=makeCell(type,fmtDay(d));});
    h+='</tr>';
    return h;
  }

  var hiddenHeader='<tr style="height:0;visibility:hidden"><th style="padding:0;width:200px"></th>'+days.map(function(){return'<th style="padding:0"></th>';}).join('')+'</tr>';
  var divider='<tr><td colspan="'+(days.length+1)+'" style="padding:0"><div style="border-top:2px solid #1a1a1a"></div></td></tr>';
  var tblStyle='border-collapse:collapse;table-layout:fixed';
  var colgroup='<colgroup><col style="width:200px">'+days.map(function(){return'<col style="width:180px">';}).join('')+'</colgroup>';

  return '<div style="border-top:3px solid #1a1a1a"></div>'
    +'<div class="private-section-hdr mobile-progress-fixed-header" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">'
    +'<span class="private-section-title" style="width:180px;display:inline-flex;align-items:center;gap:6px;flex:none">🔒 個人專區'
    +'<span class="help-wrap"><button class="help-btn" type="button" aria-label="個人專區操作說明" onclick="toggleHelpPop(event,\'private-help\')">?</button><span class="help-pop" id="private-help" onclick="event.stopPropagation()"><ul><li>個人專區只有你自己看得到。</li><li>雙擊項目可編輯內容。</li><li>輸入 @ 可搜尋並連結工地。</li><li>按住 Ctrl 拖拉可複製項目。</li><li>按 Delete 可刪除已選取的項目。</li></ul></span></span></span>'
    +'<span class="private-section-actions" style="display:inline-flex;align-items:center;gap:4px"><button class="btn btn-sm" onclick="openRecurringManager(true)">＋自動排程</button>'
    +itemControls()+'</span>'
    +'</div>'
    +'<div class="private-section" style="border-top:none;border-radius:0 0 var(--rl2) var(--rl2)">'
    +'<div class="hscroll-sync hide-hscrollbar" style="overflow-x:auto"><table style="'+tblStyle+';width:'+(200+days.length*180)+'px">'+colgroup+'<thead>'+hiddenHeader+'</thead><tbody>'
    +makeRow('work','工地記事')
    +divider
    +makeRow('personal','私人記事')
    +'</tbody></table></div></div>';
}

var pnDragSrc=null;
var pnDragPreview=null;
var pnDragLayout=null;
function pnClearDragPreview(){
  document.querySelectorAll('.pn-chip.pn-dragging').forEach(function(el){el.classList.remove('pn-dragging');});
  document.querySelectorAll('[data-pn-cell] .pn-chip[draggable="true"]').forEach(function(el){el.style.transform='';});
  pnDragPreview=null;
  pnDragLayout=null;
}
function pnApplyDragPreview(type,ds,previewIndex){
  if(!pnDragSrc||pnDragSrc.type!==type||pnDragSrc.ds!==ds)return;
  var cell=document.querySelector('[data-pn-cell="'+type+'|'+ds+'"]');
  if(!cell)return;
  var chips=[...cell.querySelectorAll('.pn-chip[draggable="true"]')];
  var source=pnDragSrc.idx;
  var sourceEl=chips[source];
  if(!sourceEl)return;
  var shift=sourceEl.getBoundingClientRect().height+4;
  chips.forEach(function(el,i){
    el.style.transform='';
    if(i===source){el.classList.add('pn-dragging');return;}
    if(previewIndex<source&&i>=previewIndex&&i<source)el.style.transform='translateY('+shift+'px)';
    if(previewIndex>source&&i>source&&i<=previewIndex)el.style.transform='translateY(-'+shift+'px)';
  });
}
function pnSetDropEffect(e){
  if(e.dataTransfer)e.dataTransfer.dropEffect=e.ctrlKey?'copy':'move';
}
function pnPreviewAtY(e,type,ds){
  if(!pnDragSrc||pnDragSrc.type!==type||pnDragSrc.ds!==ds||!pnDragLayout)return;
  // 用拖曳開始時的中心線判定，避免已讓位的 transform 反過來改變門檻而閃爍。
  var previewIndex=0;
  pnDragLayout.forEach(function(item,i){if(i!==pnDragSrc.idx&&e.clientY>item.center)previewIndex++;});
  if(pnDragPreview&&pnDragPreview.type===type&&pnDragPreview.ds===ds&&pnDragPreview.index===previewIndex)return;
  pnDragPreview={type:type,ds:ds,index:previewIndex};
  pnApplyDragPreview(type,ds,previewIndex);
}
window.pnPreviewReorder=function(e,type,ds){
  e.preventDefault();e.stopPropagation();
  pnSetDropEffect(e);
  pnPreviewAtY(e,type,ds);
}
window.pnPreviewCell=function(e,type,ds){
  e.preventDefault();
  pnSetDropEffect(e);
  pnPreviewAtY(e,type,ds);
}
// 第一格上方也保留一段有效放置區，讓往上拖出框線時仍可預覽／放到最上方。
function pnAllowNativeDrop(e){
  if(!pnDragSrc)return false;
  // 原生 HTML5 拖曳若沒有明確 preventDefault，瀏覽器就會顯示禁止游標。
  e.preventDefault();pnSetDropEffect(e);
  return true;
}
document.addEventListener('dragenter',function(e){pnAllowNativeDrop(e);},true);
document.addEventListener('dragover',function(e){
  if(!pnAllowNativeDrop(e))return;
  var cell=document.querySelector('[data-pn-cell="'+pnDragSrc.type+'|'+pnDragSrc.ds+'"]');
  var targetCell=e.target.closest?.('[data-pn-cell]');
  if(!cell||(targetCell&&targetCell!==cell))return;
  var rect=cell.getBoundingClientRect();
  if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top-96||e.clientY>rect.bottom+20)return;
  pnPreviewAtY(e,pnDragSrc.type,pnDragSrc.ds);
},true);
document.addEventListener('drop',function(e){
  if(!pnDragSrc||e.target.closest?.('[data-pn-cell]'))return;
  var cell=document.querySelector('[data-pn-cell="'+pnDragSrc.type+'|'+pnDragSrc.ds+'"]');
  if(!cell)return;
  var rect=cell.getBoundingClientRect();
  if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top-72||e.clientY>rect.bottom)return;
  e.preventDefault();window.pnDrop(e,pnDragSrc.type,pnDragSrc.ds,0);
});
var meetingSelected={};
var meetingEditing=null,meetingEditCanceled=false;
var meetingSelGen=0;
var meetingDragSrc=null;
var meetingMentionActive=null;
var taskSelected={};
var taskSelGen=0;
var pnMentionActive=null; // {type,ds,idx}
var pnEditCanceled=false; // set right before an Escape-triggered blur, so the blur handler discards the edit instead of saving it
function projectMentionLabel(p){return String(p?.siteTag||p?.name||'').trim();}
function projectMentionMatches(query){const q=String(query||'').toLowerCase();return S.projects.filter(function(p){return p.status!=='done'&&(String(p.name||'')+' '+String(p.siteTag||'')).toLowerCase().includes(q);});}

window.pnInput=function(e,type,ds,idx){
  var inp=e.target;
  var val=inp.value||'';
  var pos=inp.selectionStart||0;
  var textBefore=val.substring(0,pos);
  var atIdx=textBefore.lastIndexOf('@');
  var menuEl=document.getElementById('pn-global-mention');
  if(atIdx>=0&&textBefore.indexOf(' ',atIdx)<0){
    var q=textBefore.substring(atIdx+1).toLowerCase();
    var projs=projectMentionMatches(q);
    if(projs.length){
      pnMentionActive={type:type,ds:ds,idx:idx,atIdx:atIdx};
      var rect=inp.getBoundingClientRect();
      menuEl.style.cssText='display:block;position:fixed;top:'+(rect.bottom+4)+'px;left:'+rect.left+'px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:9999;min-width:150px;max-height:180px;overflow-y:auto';
      menuEl.innerHTML=projs.map(function(p){
        return'<div style="padding:7px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border)" '
          +'onmousedown="pnInsertMention(event,\''+type+'\',\''+ds+'\','+idx+',\''+projectMentionLabel(p)+'\')">'
          +escAttr(projectMentionLabel(p))+(p.siteTag?'<span style="font-size:10px;color:var(--text2);margin-left:5px">'+escAttr(p.name)+'</span>':'')+'</div>';
      }).join('');
      return;
    }
  }
  if(menuEl){menuEl.style.display='none';}
  pnMentionActive=null;
}

window.pnInsertMention=function(e,type,ds,idx,projName){
  e.preventDefault();
  var inp=document.getElementById('pnbox-'+type+'-'+ds+'-'+idx);
  if(!inp)return;
  var menuEl=document.getElementById('pn-global-mention');
  if(menuEl)menuEl.style.display='none';
  pnMentionActive=null;
  // Replace @query with [proj:name] in input value
  var val=inp.value;
  var pos=inp.selectionStart||val.length;
  var textBefore=val.substring(0,pos);
  var atIdx=textBefore.lastIndexOf('@');
  if(atIdx>=0){
    var tag='[proj:'+projName+']';
    var newVal=val.substring(0,atIdx)+tag+val.substring(pos);
    inp.value=newVal;
    if(formulaBarState)formulaBarState.text=newVal;
    var newPos=atIdx+tag.length;
    inp.setSelectionRange(newPos,newPos);
  }
  // Stay in edit mode — the person may want to keep typing right after
  // the inserted tag, rather than the field immediately closing.
  inp.focus();
}

// Same @ mention behavior as the inline chip box, but for the top formula bar.
window.pnFormulaInput=function(e){
  var inp=e.target;
  var val=inp.value||'';
  var pos=inp.selectionStart||0;
  var textBefore=val.substring(0,pos);
  var atIdx=textBefore.lastIndexOf('@');
  var menuEl=document.getElementById('pn-global-mention');
  if(!menuEl)return;
  if(atIdx>=0&&textBefore.indexOf(' ',atIdx)<0){
    var q=textBefore.substring(atIdx+1).toLowerCase();
    var projs=projectMentionMatches(q);
    if(projs.length){
      pnMentionActive={formula:true,atIdx:atIdx};
      var rect=inp.getBoundingClientRect();
      menuEl.style.cssText='display:block;position:fixed;top:'+(rect.bottom+4)+'px;left:'+rect.left+'px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:9999;min-width:150px;max-height:180px;overflow-y:auto';
      menuEl.innerHTML=projs.map(function(p){
        return'<div style="padding:7px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border)" '
          +'onmousedown="pnFormulaInsertMention(event,\''+projectMentionLabel(p)+'\')">'
          +escAttr(projectMentionLabel(p))+(p.siteTag?'<span style="font-size:10px;color:var(--text2);margin-left:5px">'+escAttr(p.name)+'</span>':'')+'</div>';
      }).join('');
      return;
    }
  }
  menuEl.style.display='none';
  pnMentionActive=null;
}
window.pnFormulaInsertMention=function(e,projName){
  e.preventDefault();
  var inp=document.getElementById('pn-formula-input');
  if(!inp)return;
  var menuEl=document.getElementById('pn-global-mention');
  if(menuEl)menuEl.style.display='none';
  pnMentionActive=null;
  var val=inp.value;
  var pos=inp.selectionStart||val.length;
  var textBefore=val.substring(0,pos);
  var atIdx=textBefore.lastIndexOf('@');
  if(atIdx>=0){
    var tag='[proj:'+projName+']';
    var newVal=val.substring(0,atIdx)+tag+val.substring(pos);
    inp.value=newVal;
    if(formulaBarState)formulaBarState.text=newVal;
    var newPos=atIdx+tag.length;
    inp.setSelectionRange(newPos,newPos);
  }
  inp.focus();
}
window.pnFormulaKeyDown=function(e){
  if(pnMentionActive&&pnMentionActive.formula){
    if(e.key==='Escape'){
      var menuEl=document.getElementById('pn-global-mention');
      if(menuEl)menuEl.style.display='none';
      pnMentionActive=null;
      return;
    }
  }
  if(e.key==='Escape'&&!e.isComposing&&e.keyCode!==229){pnEditCanceled=true;e.target.blur();return;}
  if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229)e.target.blur();
}

window.pnKeyDown=function(e,type,ds,idx){
  if(pnMentionActive){
    if(e.key==='Escape'){
      var menuEl=document.getElementById('pn-global-mention');
      if(menuEl)menuEl.style.display='none';
      pnMentionActive=null;
      return;
    }
  }
  if(e.key==='Escape'&&!e.isComposing&&e.keyCode!==229){pnEditCanceled=true;e.target.blur();return;}
  if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();e.target.blur();return;}
  if(e.key==='Tab'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();pnSaveBox(e.target,type,ds,idx).then(function(){pnMove(type,ds,idx,e.shiftKey?'left':'right');});}
}

window.pnSaveBlur=async function(type,ds,idx){
  var inp=document.getElementById('pne-'+type+'-'+ds+'-'+idx);
  if(!inp)return;
  var text=inp.value||'';
  if(!currentUser)return;
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];
  while(items.length<=idx)items.push({text:'',color:''});
  items[idx]=Object.assign({},items[idx],{text:text});
  S.privateNotes=Object.assign({},pn);
  S.privateNotes[type]=Object.assign({},pn[type]||{});
  S.privateNotes[type][ds]=items;
  S.privateEditing=null;
  setSyncing();
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
  setSynced();
}

window.pnSelect=function(type,ds,idx){
  var previousEdit=S.privateEditing;
  if(previousEdit&&!(previousEdit.type===type&&previousEdit.ds===ds&&previousEdit.idx===idx)){
    var previousInput=document.getElementById('pnbox-'+previousEdit.type+'-'+previousEdit.ds+'-'+previousEdit.idx);
    if(previousInput)pnSaveBox(previousInput,previousEdit.type,previousEdit.ds,previousEdit.idx);
  }
  clearSpreadsheetSelections('private');
  selGen++;
  S.privateSelected={};
  S.privateSelected[type+'|'+ds]=idx;
  S.privateEditing=null;
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])||[];
  var linked=normalizeLinkedItem(items[idx]||{});
  updateFormulaBar(type,ds,idx,linked.text,undefined,linked.link);
  renderProgress();
  // Single click only selects (highlights) — it stays showing the pretty
  // chip. Double-click, or typing a character while selected, is what
  // actually opens the raw text for editing (see pnStartEdit / the
  // type-to-edit keydown listener below).
}
window.pnStartEdit=function(type,ds,idx){
  clearSpreadsheetSelections('private');
  selGen++;
  S.privateSelected={};
  S.privateSelected[type+'|'+ds]=idx;
  S.privateEditing={type:type,ds:ds,idx:idx};
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])||[];
  var text=items[idx]?items[idx].text||'':'';
  updateFormulaBar(type,ds,idx,text);
  renderProgress();
  setTimeout(function(){
    var inp=document.getElementById('pnbox-'+type+'-'+ds+'-'+idx);
    if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);}
  },0);
}
// Excel-style "select the cell, then just start typing" — the keystroke
// replaces whatever was there, rather than appending to it.
window.pnStartEditWithChar=function(type,ds,idx,ch){
  clearSpreadsheetSelections('private');
  selGen++;
  S.privateSelected={};
  S.privateSelected[type+'|'+ds]=idx;
  S.privateEditing={type:type,ds:ds,idx:idx};
  updateFormulaBar(type,ds,idx,ch);
  renderProgress();
  var inp=document.getElementById('pnbox-'+type+'-'+ds+'-'+idx);
  if(inp){pnImePending={type:type,ds:ds,idx:idx};inp.value=ch;pnSyncFormulaText(ch);inp.focus();var l=inp.value.length;inp.setSelectionRange(l,l);setTimeout(function(){pnImePending=null;},0);}
}
var pnImePending=null;
document.addEventListener('compositionstart',function(e){
  var inp=e.target,pending=pnImePending;
  if(!pending||!inp||inp.id!=='pnbox-'+pending.type+'-'+pending.ds+'-'+pending.idx)return;
  inp.value='';pnSyncFormulaText('');pnImePending=null;
});
document.addEventListener('compositionend',function(){pnImePending=null;});
function clearSpreadsheetSelections(keep){
  if(keep!=='private'){S.privateSelected={};S.privateEditing=null;}
  if(keep!=='meeting'){meetingSelected={};meetingEditing=null;}
  if(keep!=='schedule'){scheduleSelected=null;scheduleEditing=null;}
}
window.pnPointerSelect=function(e,type,ds,idx){
  var editing=S.privateEditing;
  if(!editing){
    var key=type+'|'+ds;
    if(S.privateSelected?.[key]===idx)return;
    var previous=privateSelectedCell();
    clearSpreadsheetSelections('private');
    selGen++;S.privateSelected={};S.privateSelected[key]=idx;
    var item=(((S.privateNotes||{})[type]||{})[ds]||[])[idx]||{};
    updateFormulaBar(type,ds,idx,normalizeLinkedItem(item).text);
    // 拖曳開始前不能重繪整張表，否則原生 drag source 會消失；先直接切換外框。
    if(previous){var previousCell=document.querySelector('[data-pn-cell="'+previous.type+'|'+previous.ds+'"]');var previousEl=previousCell?.querySelector('.pn-chip[data-pn-index="'+previous.idx+'"]');if(previousEl)previousEl.style.border='1.5px solid var(--border)';}
    document.querySelectorAll('.pn-chip[draggable="true"].pn-chip-sel').forEach(function(el){el.classList.remove('pn-chip-sel');});
    e.currentTarget.classList.add('pn-chip-sel');
    e.currentTarget.style.border='2px solid var(--purple)';
    return;
  }
  if(editing.type===type&&editing.ds===ds&&editing.idx===idx)return;
  S.privatePendingSelection={type:type,ds:ds,idx:idx};
}
var excelTextClipboard='';
function privateSelectedCell(){var key=null,idx=-1;Object.keys(S.privateSelected||{}).forEach(function(k){if(S.privateSelected[k]>=0){key=k;idx=S.privateSelected[k];}});if(!key)return null;var p=key.split('|');return{type:p[0],ds:p[1],idx:idx};}
function meetingSelectedCell(){var key=null,idx=-1;Object.keys(meetingSelected||{}).forEach(function(k){if(meetingSelected[k]>=0){key=k;idx=meetingSelected[k];}});if(!key)return null;var p=key.split('|');return{rowId:p[0],ds:p[1],idx:idx};}
function selectedExcelText(){const p=privateSelectedCell(),m=meetingSelectedCell();if(p)return((((S.privateNotes||{})[p.type]||{})[p.ds]||[])[p.idx]||{}).text||'';if(m)return((((S.meetingLogs||{})[m.rowId+'_'+m.ds]||{}).items||[])[m.idx]||{}).text||'';if(scheduleSelected){const proj=S.projects.find(x=>x.id===scheduleSelected.projId),ev=(proj?.schedule||[]).filter(x=>x.date===scheduleSelected.ds)[scheduleSelected.ei];return ev?.note||'';}return'';}
async function pasteExcelText(text){const p=privateSelectedCell(),m=meetingSelectedCell();if(p)return pnSetCellText(p.type,p.ds,p.idx,text);if(m)return mSetCellText(m.rowId,m.ds,text);if(scheduleSelected){const span=document.querySelector(`.ev-field[data-proj="${CSS.escape(scheduleSelected.projId)}"][data-ds="${CSS.escape(scheduleSelected.ds)}"][data-ei="${scheduleSelected.ei}"]`);if(span){startFieldEdit(span);span.textContent=text;await saveScheduleCell(span);}}}
document.addEventListener('keydown',function(e){
  var ae=document.activeElement;
  if(ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.isContentEditable))return;
  if(e.isComposing||e.keyCode===229)return;
  const p=privateSelectedCell(),m=meetingSelectedCell(),hasSelection=!!(p||m||scheduleSelected);if(!hasSelection)return;
  if((e.ctrlKey||e.metaKey)&&['c','x','v'].includes(e.key.toLowerCase())){
    e.preventDefault();const key=e.key.toLowerCase();if(key==='c'||key==='x'){excelTextClipboard=selectedExcelText();navigator.clipboard?.writeText(excelTextClipboard).catch(function(){});if(key==='x')pasteExcelText('');}else{const paste=navigator.clipboard?.readText?navigator.clipboard.readText().catch(function(){return excelTextClipboard;}):Promise.resolve(excelTextClipboard);paste.then(function(text){pasteExcelText(text||'');});}return;
  }
  if(e.key==='Delete'){e.preventDefault();if(p){pnDelete(p.type,p.ds,p.idx);return;}pasteExcelText('');return;}
  if(e.key==='F2'){e.preventDefault();if(p)pnStartEdit(p.type,p.ds,p.idx);else if(m)mStartEdit(m.rowId,m.ds,m.idx);else if(scheduleSelected){const span=document.querySelector(`.ev-field[data-proj="${CSS.escape(scheduleSelected.projId)}"][data-ds="${CSS.escape(scheduleSelected.ds)}"][data-ei="${scheduleSelected.ei}"]`);if(span)startFieldEdit(span);}return;}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const direction=e.key.replace('Arrow','').toLowerCase();if(p)pnMove(p.type,p.ds,p.idx,direction);else if(m)mMove(m.rowId,m.ds,direction);else moveScheduleSelection(direction);return;}
  if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(p)pnStartEditWithChar(p.type,p.ds,p.idx,e.key);else if(m)mStartEditWithChar(m.rowId,m.ds,m.idx,e.key);else startScheduleEditWithText(e.key);e.preventDefault();}
});
window.pnEdit=function(type,ds,idx){
  selGen++;
  S.privateSelected={};
  S.privateSelected[type+'|'+ds]=idx;
  S.privateEditing=null; // No inline edit - use formula bar
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])||[];
  var text=items[idx]?items[idx].text||'':'';
  updateFormulaBar(type,ds,idx,text);
  renderProgress();
  // Focus the in-place box (also usable via the top bar, synced)
  setTimeout(function(){
    var inp=document.getElementById('pnbox-'+type+'-'+ds+'-'+idx);
    if(inp){inp.focus();var l=inp.value.length;inp.setSelectionRange(l,l);}
  },50);
}
window.pnSetColor=async function(type,ds,idx,color){
  if(!currentUser)return;
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];
  if(idx<0||idx>=items.length)return;
  items[idx]=Object.assign({},items[idx],{color:color});
  S.privateNotes=Object.assign({},pn);
  S.privateNotes[type]=Object.assign({},pn[type]||{});
  S.privateNotes[type][ds]=items;
  setSyncing();
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
  setSynced();
}
function persistLocalPrivateNotes(){if(!IS_LOCAL_PREVIEW)return;try{localStorage.setItem('localPreviewPrivateNotes_'+(currentUser?.uid||'local-test-admin'),JSON.stringify(S.privateNotes||{work:{},personal:{}}));}catch(error){console.warn('本機記事狀態無法保存',error);}}
window.pnToggleComplete=async function(type,ds,idx){
  if(!currentUser)return;
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];
  if(idx<0||idx>=items.length)return;
  var nowDone=!items[idx].completed;
  items[idx]=Object.assign({},items[idx],{
    completed:nowDone,
    color:nowDone?'#E24B4A':(items[idx].color==='#E24B4A'?'':items[idx].color),
    completedBy:nowDone?currentUser.uid:null,
    completedAt:nowDone?new Date().toISOString():null
  });
  S.privateNotes=Object.assign({},pn);
  S.privateNotes[type]=Object.assign({},pn[type]||{});
  S.privateNotes[type][ds]=items;
  persistLocalPrivateNotes();
  setSyncing();
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
  setSynced();
}
window.pnToggleStrike=async function(type,ds,idx){
  if(!currentUser)return;
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];
  if(idx<0||idx>=items.length)return;
  items[idx]=Object.assign({},items[idx],{strike:!items[idx].strike});
  S.privateNotes=Object.assign({},pn);
  S.privateNotes[type]=Object.assign({},pn[type]||{});
  S.privateNotes[type][ds]=items;
  setSyncing();
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
  setSynced();
}
window.pnAdd=async function(type,ds){
  if(!currentUser)return;
  if(S.privateAddingFromBlur)return;
  if(S.privatePendingAdd&&S.privatePendingAdd.type===type&&S.privatePendingAdd.ds===ds)return;
  if(S.privateEditing){
    S.privatePendingAdd={type:type,ds:ds};
    var editing=S.privateEditing;
    var editingInput=document.getElementById('pnbox-'+editing.type+'-'+editing.ds+'-'+editing.idx);
    if(editingInput)editingInput.blur();
    return;
  }
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];
  items.push({text:'',color:''});
  S.privateNotes=Object.assign({},pn);
  S.privateNotes[type]=Object.assign({},pn[type]||{});
  S.privateNotes[type][ds]=items;
  var newIdx=items.length-1;
  // 新空白模塊先立即呈現為「已單擊選取」，不等待資料同步完成。
  clearSpreadsheetSelections('private');
  selGen++;
  S.privateSelected={};
  S.privateSelected[type+'|'+ds]=newIdx;
  S.privateEditing={type:type,ds:ds,idx:newIdx};
  persistLocalPrivateNotes();
  updateFormulaBar(type,ds,newIdx,'');
  renderProgress();
  var newInput=document.getElementById('pnbox-'+type+'-'+ds+'-'+newIdx);
  if(newInput){newInput.focus({preventScroll:true});newInput.setSelectionRange(0,0);}
  setSyncing();
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
  setSynced();
}
function pnShowSelectedChip(type,ds,idx){
  var cell=document.querySelector('[data-pn-cell="'+type+'|'+ds+'"]');
  var chip=cell?.querySelector('.pn-chip[data-pn-index="'+idx+'"]');
  if(!chip)return;
  document.querySelectorAll('.pn-chip[draggable="true"].pn-chip-sel').forEach(function(el){el.classList.remove('pn-chip-sel');});
  chip.classList.add('pn-chip-sel');
  chip.style.border='2px solid var(--purple)';
}
window.pnPrepareAdd=function(type,ds){
  if(S.privateEditing)S.privatePendingAdd={type:type,ds:ds};
}
window.pnDelete=async function(type,ds,idx){
  if(!currentUser)return;
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];
  if(idx<0||idx>=items.length)return;
  var deletedItem=items[idx];
  items.splice(idx,1);
  S.privateNotes=Object.assign({},pn);
  S.privateNotes[type]=Object.assign({},pn[type]||{});
  S.privateNotes[type][ds]=items;
  if(deletedItem.recurringId&&deletedItem.recurringDate){
    S.privateNotes.recurringSchedules=(pn.recurringSchedules||[]).map(function(rule){
      if(rule.id!==deletedItem.recurringId)return rule;
      var skipped=Array.from(new Set([...(rule.skippedDates||[]),deletedItem.recurringDate]));
      return Object.assign({},rule,{skippedDates:skipped});
    });
  }
  S.privateSelected={};
  setSyncing();
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
  setSynced();
}
window.pnDragStart=function(e,type,ds,idx){
  pnDragSrc={type:type,ds:ds,idx:idx};
  pnDragPreview={type:type,ds:ds,index:idx};
  var dragEl=e.currentTarget;
  var dragCell=dragEl.closest('[data-pn-cell]');
  pnDragLayout=dragCell?[...dragCell.querySelectorAll('.pn-chip[draggable="true"]')].map(function(el){var r=el.getBoundingClientRect();return{center:r.top+r.height/2};}):null;
  e.dataTransfer.effectAllowed='copyMove';
  e.dataTransfer.setData('text/plain',type+'|'+ds+'|'+idx);
  var ghost=dragEl.cloneNode(true);
  ghost.classList.add('pn-drag-ghost');
  ghost.style.cssText+=`;position:fixed;left:-9999px;top:-9999px;width:${dragEl.getBoundingClientRect().width}px;z-index:9999;`;
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost,Math.min(24,dragEl.getBoundingClientRect().width/2),dragEl.getBoundingClientRect().height/2);
  requestAnimationFrame(function(){dragEl.classList.add('pn-dragging');});
  setTimeout(function(){ghost.remove();},0);
}
window.pnDragEnd=function(){pnClearDragPreview();pnDragSrc=null;}
window.pnDrop=async function(e,toType,toDs,insertAt){
  e.preventDefault();e.stopPropagation();
  var raw=e.dataTransfer.getData('text/plain');
  var from=null;
  if(raw){var p=raw.split('|');if(p.length===3)from={type:p[0],ds:p[1],idx:parseInt(p[2])};}
  if(!from)from=pnDragSrc;
  if(!from||!currentUser){pnClearDragPreview();return;}
  var pn=S.privateNotes||{work:{},personal:{}};
  var fromItems=(pn[from.type]&&pn[from.type][from.ds])?[...pn[from.type][from.ds]]:[];
  var item=fromItems[from.idx];
  if(!item){pnClearDragPreview();pnDragSrc=null;return;}
  if(from.type===toType&&from.ds===toDs){
    var reordered=[...fromItems];
    reordered.splice(from.idx,1);
    var preview=pnDragPreview&&pnDragPreview.type===toType&&pnDragPreview.ds===toDs?pnDragPreview.index:null;
    var target=Number.isInteger(preview)?preview:(Number.isInteger(insertAt)?insertAt:reordered.length);
    if(preview===null&&from.idx<target)target--;
    target=Math.max(0,Math.min(target,reordered.length));
    reordered.splice(target,0,item);
    S.privateNotes=Object.assign({},pn);
    S.privateNotes[toType]=Object.assign({},pn[toType]||{});
    S.privateNotes[toType][toDs]=reordered;
    await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
    pnClearDragPreview();pnDragSrc=null;
    renderProgress();
    return;
  }
  var toItems=(pn[toType]&&pn[toType][toDs])?[...pn[toType][toDs]]:[];
  toItems.push(Object.assign({},item));
  var newPn=Object.assign({},pn);
  newPn[toType]=Object.assign({},pn[toType]||{});
  newPn[toType][toDs]=toItems;
  if(!e.ctrlKey){
    fromItems.splice(from.idx,1);
    newPn[from.type]=Object.assign({},newPn[from.type]||{});
    newPn[from.type][from.ds]=fromItems;
  }else{
    // Copied forward to a later date (multi-day task) — mark the earlier
    // day's item blue so it's clear the task continues past this date.
    if(toDs>from.ds){
      fromItems[from.idx]=Object.assign({},fromItems[from.idx],{color:'#534AB7'});
    }
    newPn[from.type]=Object.assign({},newPn[from.type]||{});
    newPn[from.type][from.ds]=fromItems;
  }
  S.privateNotes=newPn;
  await setDoc(doc(db,'privateNotes',currentUser.uid),newPn);
  pnClearDragPreview();pnDragSrc=null;
  renderProgress();
}
