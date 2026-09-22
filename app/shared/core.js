// Runtime-composed source module. Keep declarations in shared application scope.
let currentUser=null,currentRole=null;
function isSystemAdmin(){return currentRole==='manager';}
const IS_LOCAL_PREVIEW=location.protocol==='file:'||['127.0.0.1','localhost'].includes(location.hostname);
let localTestMode=false;
let S={projects:[],checks:{},bible:{},bibleOrder:[],members:[],homeNotes:[],recommendations:[],recommendationCategories:[],recommendationRegions:[],growthItems:[],announcements:[],dailyLogs:{},privateNotes:{work:{},personal:{}},dateColors:{},meetingLogs:{},globalNotes:{},userTodos:[],tradeCategories:[],tradeVendors:[],otherVendorCategories:[],otherVendors:[],projectTradeSelections:{}};
let selectedProjectDetailId='',selectedProjectDetailPhotoId='',selectedProjectDetailPhotoBlob=null;
let userPrefs={todoProjects:[]};
const DEFAULT_APPEARANCE={theme:'default',fontSize:'small'};
let appearanceBeforeEdit=null;
function normalizeAppearance(value){const source=value&&typeof value==='object'?value:{};return{theme:['default','game'].includes(source.theme)?source.theme:DEFAULT_APPEARANCE.theme,fontSize:['small','medium','large'].includes(source.fontSize)?source.fontSize:DEFAULT_APPEARANCE.fontSize};}
function applyAppearance(value){const s=normalizeAppearance(value),root=document.documentElement;root.dataset.theme=s.theme;root.dataset.fontSize=s.fontSize;return s;}
function appearanceChoice(name,value,label,selected){return`<label class="appearance-choice"><input type="radio" name="${name}" value="${value}" ${selected?'checked':''} onchange="previewAppearanceSettings()"><span>${label}</span></label>`;}
function appearanceFormSettings(){const s=normalizeAppearance(userPrefs.appearance);return{theme:document.querySelector('input[name="app-theme"]:checked')?.value||s.theme,fontSize:document.querySelector('input[name="app-font"]:checked')?.value||s.fontSize};}
window.previewAppearanceSettings=function(){applyAppearance(appearanceFormSettings());};
window.showAppearanceSettings=function(){appearanceBeforeEdit=normalizeAppearance(userPrefs.appearance);const s=appearanceBeforeEdit;$('mo-content').className='mo-box appearance-modal';$('mo-content').innerHTML=`<div class="mo-title">外觀設定</div><div class="appearance-intro">這是你的個人全域設定，會套用整個 APP，不影響其他使用者。</div><section class="appearance-group"><span class="appearance-label">主題</span><div class="appearance-options two">${appearanceChoice('app-theme','default','有隅預設',s.theme==='default')}${appearanceChoice('app-theme','game','遊戲風',s.theme==='game')}</div></section><section class="appearance-group"><span class="appearance-label">字體大小</span><div class="appearance-options">${appearanceChoice('app-font','small','小（14px）',s.fontSize==='small')}${appearanceChoice('app-font','medium','中（15px）',s.fontSize==='medium')}${appearanceChoice('app-font','large','大（16px）',s.fontSize==='large')}</div></section><div class="appearance-reset-row"><div class="appearance-reset-copy">恢復 APP 原本的主題與小字體。</div><button class="btn appearance-reset" type="button" onclick="window.resetAppearanceSettings()">恢復預設外觀</button></div><div class="mo-footer"><button class="btn" type="button" onclick="window.cancelAppearanceSettings()">取消</button><button class="btn btn-p" type="button" onclick="window.saveAppearanceSettings()">儲存並套用</button></div>`;$('modal').style.display='flex';};
window.cancelAppearanceSettings=function(){applyAppearance(appearanceBeforeEdit||userPrefs.appearance);appearanceBeforeEdit=null;closeMo();};
window.saveAppearanceSettings=async function(){const settings=appearanceFormSettings();userPrefs={...userPrefs,appearance:settings};applyAppearance(settings);if(localTestMode)localStorage.setItem('localPreviewAppearance',JSON.stringify(settings));else await setDoc(doc(db,'userPrefs',currentUser.uid),{appearance:settings},{merge:true});appearanceBeforeEdit=null;closeMo();};
window.resetAppearanceSettings=async function(){const settings={...DEFAULT_APPEARANCE};userPrefs={...userPrefs,appearance:settings};applyAppearance(settings);if(localTestMode)localStorage.setItem('localPreviewAppearance',JSON.stringify(settings));else await setDoc(doc(db,'userPrefs',currentUser.uid),{appearance:settings},{merge:true});appearanceBeforeEdit=null;closeMo();};
applyAppearance(DEFAULT_APPEARANCE);
let localRenderTimer=null;
function localClone(v){return v===undefined?v:JSON.parse(JSON.stringify(v));}
const LOCAL_PREVIEW_STATE_KEY='localPreviewStateV1';
function saveLocalPreviewState(){
  if(!localTestMode)return;
  try{localStorage.setItem(LOCAL_PREVIEW_STATE_KEY,JSON.stringify({version:1,state:localClone(S),userPrefs:localClone(userPrefs)}));}
  catch(error){console.warn('本機測試資料無法保存',error);}
}
function restoreLocalPreviewState(){
  try{
    const saved=JSON.parse(localStorage.getItem(LOCAL_PREVIEW_STATE_KEY)||'null');
    if(!saved||saved.version!==1||!saved.state||typeof saved.state!=='object')return;
    Object.keys(S).forEach(key=>{if(Object.prototype.hasOwnProperty.call(saved.state,key))S[key]=localClone(saved.state[key]);});
    if(saved.userPrefs&&typeof saved.userPrefs==='object')userPrefs={...userPrefs,...localClone(saved.userPrefs)};
  }catch(error){console.warn('本機測試資料無法讀取',error);}
}
function localPath(ref){return String(ref?.path||'').replace(/^\/+|\/+$/g,'');}
function localParts(ref){const p=localPath(ref).split('/');return{collection:p[0]||'',id:p.slice(1).join('/')};}
// A stage title is user-visible text, not a Firestore path. Escape only the
// characters that could turn it into a different document path while keeping
// existing document IDs unchanged.
function bibleStorageId(stage){return String(stage).replace(/%/g,'%25').replace(/\//g,'%2F');}
function bibleStageFromStorageId(id){return String(id).replace(/%2F/g,'/').replace(/%25/g,'%');}
function bibleStageDoc(stage){return doc(db,'bible',bibleStorageId(stage));}
function bibleStageData(stage,data){return{...data,stageTitle:stage};}
function localFindArray(collectionName,id){
  const arr=collectionName==='projects'?S.projects:collectionName==='members'?S.members:collectionName==='homeNotes'?S.homeNotes:collectionName==='recommendations'?S.recommendations:collectionName==='recommendationCategories'?S.recommendationCategories:collectionName==='recommendationRegions'?S.recommendationRegions:collectionName==='growthItems'?S.growthItems:collectionName==='announcements'?S.announcements:collectionName==='userTodos'?S.userTodos:collectionName==='tradeCategories'?S.tradeCategories:collectionName==='tradeVendors'?S.tradeVendors:collectionName==='otherVendorCategories'?S.otherVendorCategories:collectionName==='otherVendors'?S.otherVendors:null;
  if(!arr)return null;
  return arr.find(x=>String(x.id)===id||String(x.uid)===id)||null;
}
function localRead(collectionName,id){
  if(['projects','members','homeNotes','recommendations','recommendationCategories','recommendationRegions','growthItems','announcements','userTodos','tradeCategories','tradeVendors','otherVendorCategories','otherVendors'].includes(collectionName))return localFindArray(collectionName,id);
  if(collectionName==='checks')return{items:S.checks[id]||[]};
  if(collectionName==='bible')return id==='orderConfig'?{order:S.bibleOrder}:S.bible[bibleStageFromStorageId(id)];
  if(collectionName==='dailyLogs')return S.dailyLogs[id];
  if(collectionName==='meetingLogs')return S.meetingLogs[id];
  if(collectionName==='globalNotes')return S.globalNotes[id];
  if(collectionName==='projectTradeSelections')return{categories:S.projectTradeSelections[id]||{}};
  if(collectionName==='privateNotes')return S.privateNotes;
  if(collectionName==='userPrefs')return userPrefs;
  if(collectionName==='settings'){
    if(id==='designCols')return{cols:designCols||DEFAULT_DESIGN_COLS};
    if(id==='designColWidths')return{widths:designColWidths};
    if(id==='designProjectOrder')return{order:designProjectOrder};
    if(id==='dateColors')return{colors:S.dateColors};
    if(id==='companyDuty')return companyDutyConfig;
  }
  return undefined;
}
function localWrite(collectionName,id,data,merge=false){
  const value=localClone(data)||{};
  if(['projects','members','homeNotes','recommendations','recommendationCategories','recommendationRegions','growthItems','announcements','userTodos','tradeCategories','tradeVendors','otherVendorCategories','otherVendors'].includes(collectionName)){
    const arr=collectionName==='projects'?S.projects:collectionName==='members'?S.members:collectionName==='homeNotes'?S.homeNotes:collectionName==='recommendations'?S.recommendations:collectionName==='recommendationCategories'?S.recommendationCategories:collectionName==='recommendationRegions'?S.recommendationRegions:collectionName==='growthItems'?S.growthItems:collectionName==='announcements'?S.announcements:collectionName==='userTodos'?S.userTodos:collectionName==='tradeCategories'?S.tradeCategories:collectionName==='tradeVendors'?S.tradeVendors:collectionName==='otherVendorCategories'?S.otherVendorCategories:S.otherVendors;
    const existing=localFindArray(collectionName,id);
    if(existing)Object.assign(existing,merge?value:{...value,id:existing.id||id});
    else arr.push({...value,id,uid:collectionName==='members'?(value.uid||id):value.uid});
    if(collectionName==='announcements')localStorage.setItem('localPreviewAnnouncements',JSON.stringify(S.announcements));
  }else if(collectionName==='checks')S.checks[id]=localClone(Array.isArray(value)?value:(value.items||[]));
  else if(collectionName==='bible'){
    if(id==='orderConfig')S.bibleOrder=[...(value.order||[])];
    else{const stage=bibleStageFromStorageId(id);S.bible[stage]=merge?{...(S.bible[stage]||{}),...value}:value;}
  }else if(collectionName==='dailyLogs')S.dailyLogs[id]=merge?{...(S.dailyLogs[id]||{}),...value}:value;
  else if(collectionName==='meetingLogs')S.meetingLogs[id]=merge?{...(S.meetingLogs[id]||{}),...value}:value;
  else if(collectionName==='globalNotes')S.globalNotes[id]=merge?{...(S.globalNotes[id]||{}),...value}:value;
  else if(collectionName==='projectTradeSelections')S.projectTradeSelections[id]=localClone(value.categories||{});
  else if(collectionName==='privateNotes'){S.privateNotes=merge?{...(S.privateNotes||{}),...value}:value;try{localStorage.setItem('localPreviewPrivateNotes_'+(currentUser?.uid||'local-test-admin'),JSON.stringify(S.privateNotes));}catch(error){console.warn('本機記事狀態無法保存',error);}}
  else if(collectionName==='userPrefs')userPrefs=merge?{...userPrefs,...value}:value;
  else if(collectionName==='settings'){
    if(id==='designCols')designCols=value.cols||DEFAULT_DESIGN_COLS;
    else if(id==='designColWidths')designColWidths=value.widths||{};
    else if(id==='designProjectOrder')designProjectOrder=value.order||[];
    else if(id==='dateColors')S.dateColors=value.colors||{};
    else if(id==='companyDuty')companyDutyConfig=normalizeCompanyDutyConfig(merge?{...(companyDutyConfig||{}),...value}:value);
  }
}
function localDelete(collectionName,id){
  if(collectionName==='projects')S.projects=S.projects.filter(x=>String(x.id)!==id);
  else if(collectionName==='members')S.members=S.members.filter(x=>String(x.id)!==id&&String(x.uid)!==id);
  else if(collectionName==='homeNotes')S.homeNotes=S.homeNotes.filter(x=>String(x.id)!==id&&String(x.uid)!==id);
  else if(collectionName==='userTodos')S.userTodos=S.userTodos.filter(x=>String(x.id)!==id);
  else if(collectionName==='checks')delete S.checks[id];
  else if(collectionName==='bible'){const stage=bibleStageFromStorageId(id);delete S.bible[stage];S.bibleOrder=S.bibleOrder.filter(x=>x!==stage);}
  else if(collectionName==='dailyLogs')delete S.dailyLogs[id];
  else if(collectionName==='meetingLogs')delete S.meetingLogs[id];
  else if(collectionName==='globalNotes')delete S.globalNotes[id];
  else if(collectionName==='projectTradeSelections')delete S.projectTradeSelections[id];
  else if(['recommendations','recommendationCategories','recommendationRegions','growthItems','announcements','tradeCategories','tradeVendors','otherVendorCategories','otherVendors'].includes(collectionName)){S[collectionName]=S[collectionName].filter(x=>String(x.id)!==id);if(collectionName==='announcements')localStorage.setItem('localPreviewAnnouncements',JSON.stringify(S.announcements));}
}
function localNotify(){
  saveLocalPreviewState();
  clearTimeout(localRenderTimer);
  localRenderTimer=setTimeout(()=>{if(localTestMode&&typeof renderActive==='function')renderActive();},0);
}
async function setDoc(ref,data,options){
  if(!localTestMode)return fbSetDoc(ref,data,options);
  const{collection:collectionName,id}=localParts(ref);localWrite(collectionName,id,data,!!options?.merge);localNotify();return;
}
async function updateDoc(ref,data){
  if(!localTestMode)return fbUpdateDoc(ref,data);
  const{collection:collectionName,id}=localParts(ref);localWrite(collectionName,id,data,true);localNotify();return;
}
async function deleteDoc(ref){
  if(!localTestMode)return fbDeleteDoc(ref);
  const{collection:collectionName,id}=localParts(ref);localDelete(collectionName,id);localNotify();return;
}
async function addDoc(ref,data){
  if(!localTestMode)return fbAddDoc(ref,data);
  const collectionName=localPath(ref).split('/')[0];const id=`local-${collectionName}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  localWrite(collectionName,id,data,false);localNotify();return{id,path:`${collectionName}/${id}`};
}
async function getDoc(ref){
  if(!localTestMode)return fbGetDoc(ref);
  const{collection:collectionName,id}=localParts(ref);const value=localRead(collectionName,id);
  return{id,ref,exists:()=>value!==undefined,data:()=>localClone(value)};
}
async function getDocs(ref){
  if(!localTestMode)return fbGetDocs(ref);
  const collectionName=localPath(ref).split('/')[0];let entries=[];
  if(collectionName==='projects')entries=S.projects.map(x=>[x.id,x]);
  else if(collectionName==='members')entries=S.members.map(x=>[x.id||x.uid,x]);
  else if(collectionName==='homeNotes')entries=S.homeNotes.map(x=>[x.id||x.uid,x]);
  else if(collectionName==='userTodos')entries=S.userTodos.map(x=>[x.id,x]);
  else if(collectionName==='checks')entries=Object.entries(S.checks).map(([id,items])=>[id,{items}]);
  else if(collectionName==='bible')entries=Object.entries(S.bible).map(([stage,value])=>[bibleStorageId(stage),value]);
  else if(collectionName==='projectTradeSelections')entries=Object.entries(S.projectTradeSelections).map(([id,categories])=>[id,{categories}]);
  else if(['recommendations','recommendationCategories','recommendationRegions','growthItems','announcements','tradeCategories','tradeVendors','otherVendorCategories','otherVendors'].includes(collectionName))entries=S[collectionName].map(x=>[x.id,x]);
  return{docs:entries.map(([id,value])=>({id,ref:doc(db,collectionName,id),data:()=>localClone(value)}))};
}
function writeBatch(database){
  if(!localTestMode)return fbWriteBatch(database);
  const ops=[];return{
    set:(ref,data,options)=>ops.push(()=>setDoc(ref,data,options)),
    update:(ref,data)=>ops.push(()=>updateDoc(ref,data)),
    delete:(ref)=>ops.push(()=>deleteDoc(ref)),
    commit:async()=>{for(const op of ops)await op();}
  };
}
const MEETING_ROWS=[
  {id:'meet1',name:'客戶會議/丈量'},
  {id:'meet2',name:'廠商會議'},
  {id:'meet3',name:'丈量'},
  {id:'meet4',name:'其他'}
];
let activePanel='home',calMode='month',monthOffset=0,selectedTag=null;
const progressMonthScrollPositions={};
let activeBibleStage=null,activeBibleWs=null,bibleView='edit',dragSrc=null,dragModeOn=false,bibleItemDrag=null;
let stageDragInProgress=false,pendingBibleRender=false;
let expandedBibleItems={};
let openPicker=null;
let scheduleSelected=null,scheduleEditing=null,scheduleEditOriginal='';
let expandedProjs={},expandedFields={};
let designCols=null;
let designColWidths={},designProjectOrder=[],designEditMode=false;
let designBlueColsGlobalOpen=false;
let designStructureMigrationAttempted=false;

const $=id=>document.getElementById(id);
const WORD_BIBLE_IMPORT = {"一、規劃平面配置圖前之會議": {"before": [{"text": "冷氣提前15分鐘開好，會議相關資料備妥，客戶資料研讀", "subs": ["會議室清潔", "準備名片", "印製客戶基本資料及業主相關訊息，並填寫基本資訊", "開電腦(設定桌面專案捷徑)", "開IPAD施工寶典", "會議中錄音"]}, "客戶裝修需求表，須確實詢問知悉管道", "確認標的物未來居住使用人數、各空間機能需求", "與業主一同觀看生活照片及聊天並詢問Q&A", {"text": "是否有智慧家庭需求(現在或未來)", "subs": ["燈具", "空調", "窗簾"]}, {"text": "確認現有建材及設備是否更換", "subs": ["空調類需求：吊隱(壁控/遙控)", "壁掛", "全熱", "VAF", "吊隱式除濕機等"]}, "確認現有廚具顏色及設備、現有衛浴設備以及鏡櫃或浴櫃是否需更換或施作", {"text": "空間需求", "subs": ["玄關(汙衣櫃、鞋子數量、落塵區、穿鞋椅)", "客廳(電視或投影、沙發形式)", "書房(開放或獨間)", "廚房(開放或封閉、電器櫃需求)", "餐廳(幾人坐餐桌、餐邊櫃需求)", "房間(床尺寸、衣櫃收納量、汙衣區、梳妝桌需求)", "浴室(汙衣籃、電熱毛巾架、吹風機)", "其他需求(監視器、防潮箱、保險箱、按摩椅、運動器材、嬰兒床等)", "車庫(電動車電源)"]}, "廚具用電需求為何？電器收納需求？冰箱型號等…", "特殊用電需求：RO淨水器電壓、洗烘衣機、各式活動電器、掃地機器人型號(是否需要自動上下水等)", "風水禁忌：開門見灶、對門煞、樑壓頭頂、床頭開窗等", "確認業主預算金額", "(客變)請業主提供客變窗口、客變期限", "(客變)告知客變重點內容：建材、設備、隔間以及水弱電…等", "(客變)著重注意客變項目：儲下型淨水器機型？電壓？", "(客變)著重注意客變項目：是否需要洗烘衣機？電壓？", "(客變)著重注意客變項目：掃地機器人收納處、是否預留給排水？", "(客變)確認建商附設建材及設備是否更換", "(客變)確認建設是否附贈全室或廚房天花板，並建議業主辦退方便未來施工", "(老屋)現場鋁門窗是否換新？", "(老屋)水電管線是否換新(電線、給排水、糞管、化糞池等)？", {"text": "(老屋)確認天然氣使用情形", "subs": ["是否有天然氣", "詢問是否須使用"]}, "整理會議紀錄及待確認事項給業主", "錄音及資料歸檔，並新增/更新案件狀態表"], "during": [], "after": []}, "二、繪製客變平面圖前(建商Q&A)": {"before": ["請業主提供建設客變須知及流程並詳讀", "確認是否為智慧建築，智慧建築有規範一定距離的插座位置及各空間的弱電數量", {"text": "確認「全室地坪」或「玄關地坪」是否可", "subs": ["全部打底點交", "局部打底點交"]}, {"text": "確認建材或設備(木地板.磁磚.馬桶.暖風機.面盆等)是否可以", "subs": ["辦退", "點交"]}, "確認廚具是否另行與廚具廠商客變並提前接洽客變程度為何", {"text": "確認建設是否附贈天花板，並辦退", "subs": ["全室", "廚房"]}, {"text": "確認可變更or取消隔間位置", "subs": ["浴室隔間", "廚房隔間"]}, "確認可新增or取消的電箱內Breaker及插座(專迴或一般)數量、弱電數量", {"text": "確認可新增or取消的給排水(中島用或掃地機器人用)", "subs": ["冷排", "套管"]}, "若可以辦退，設備是否可點交(馬桶.暖風機.面盆…等)", "是否可新增or位移插座、網路、電視、電話，電箱能新增專迴數量及專迴電壓多少", {"text": "是否可位移給排水位置(中島用)", "subs": ["冷排", "套管"]}, "確認建設公司開關切方向為直向或橫向、並以未來設計方向設定", "確認建商電箱尚可新增的插座", "是否為智慧建築(繪製客變圖需要)", "確認樓高、樑高或窗戶等尺寸", "確認建設客變流程"], "during": [], "after": []}, "三、丈量": {"before": [{"text": "丈量前準備", "subs": ["平面圖／客變圖面／空白A3丈量圖，共4張", "業主需求單", "測距儀(檢查電力)", "捲尺", "4色筆", "備用電池"]}], "during": [{"text": "全戶尺寸丈量圖", "subs": ["總長、樓高、樑寬樑高", "窗戶台度高度", "門高度", "牆厚(扣門框)", "工陽", "冷氣室外機", "建商廁所窗戶", "公設保護", "電梯門、電梯內箱", "梯間斜面&梯下立面圖", "透天／別墅確樓梯階數", "標記正北位置"]}, {"text": "水電弱電圖", "subs": ["電箱、弱電箱位置", "電氣、弱電位置(專用迴路、特殊高度標示)", "IC面板", "緊急照明", "客變圖面檢查水電、弱電等", "給排水位置"]}, {"text": "開關迴路圖", "subs": ["開關位置(特殊高度標示)"]}, {"text": "穿樑套管圖(若無此圖可寫在尺寸圖)", "subs": ["消防灑水頭低點", "消防灑水幹管低點", "消防灑水頭數量及繪製相對位置", "消防水閥繪製相對位置", "冷排高度及繪製相對位置(檢查是否在樑位因為無法修改)", "偵煙數量及繪製相對位置", "穿樑套管低點", "吊管維修處繪製相對位置"]}, "地坪若有架高丈量圖上請寫±0位置，窗戶寫法：窗高／5(架高)+60(台度)，板下樑下寫法：5(架高)+230(板下樑下)", {"text": "拍攝各空間照片", "subs": ["電箱內部", "公設梯廳", "原廁所+原廚房之插座近拍", "前後露臺", "冷氣放置處", "吊管處近拍", "IC面板背後線路拍照", "客浴馬桶", "消防開關閥位置", "老屋樓梯、樓梯平台及梯間照片細節多拍"]}, "至櫃台拿裝修管理辦法"], "after": ["拍攝照片歸檔", "新增/更新案件狀態表"]}, "四、平面配置圖繪製": {"before": [{"text": "繪製放樣丈量尺寸平面圖", "subs": ["繪製樑位及文字高度", "繪製電箱並保留原圖"]}, {"text": "複製新的平面圖與H-wall一起Block", "subs": ["樑位及文字高度一起Block"]}, "詳讀平面配置會議時業主的需求資料，並依照需求配置", "平面圖繪製時，即將預算列入繪製的思考重點"], "during": ["建議可由手繪開始發想2-3版本", "電器櫃寬度以60cm為標規，若業主堅持小一點，須告知並非所有電器都可置放", "新作隔間有房門，牆厚度至少8cm以上", "注意冰箱型號思考開門迴轉半徑(是否有額外冷凍櫃需求)", "家具圖塊簡化，有使用到的自行修改", "放置樑的圖塊", "繪製指北針後，思考風向、日照...等", "未規劃到的浴室及陽台地磚線無須繪製，室內空間仍需繪製", "整理待確認事項及業主提供事項，並在平面圖文字敘述", "(老屋)規劃浴室毛巾架位置(避免馬桶上方)", "(老屋)兩個空間隔間牆拆除時，依經驗兩側牆面不會是同一個平面，應加上木作單面隔間整平", "(老屋)規劃冷氣室外機位置，水平寬度一台需抓100~120cm"], "after": ["再次詳讀業主需求資料並一一檢查", {"text": "確認更新案名、繪圖日期、圖號、頁數", "subs": ["案名", "繪圖日期", "圖號", "頁數"]}, "確認是否已提前與業主預約，如尚未預約，請通知主管進行安排"]}, "五、平面配置圖會議": {"before": [{"text": "冷氣提前15分鐘開好，並準備", "subs": ["影印平面圖", "資料本", "會議室清潔"]}, {"text": "影印設計合約", "subs": ["計算實際坪數", "確認設計費", "開IPAD施工寶典", "開電腦", "會議中錄音"]}], "during": ["若案場僅更換門框及門扇，原地面未重新施作，需告知業主因新門框尺寸不同，地坪可能出現破口，收邊條恐無法遮蔽。"], "after": ["錄音及資料歸檔，並新增/更新案件狀態表"]}, "六、設計合約簽約": {"before": [], "during": ["確認風格示意圖", "確認業主平面配置圖修改事項"], "after": ["整理待確認事項及拍攝會議紀錄傳至群組", "錄音及準備新資料夾歸檔，並更新案件狀態表"]}, "七、建商客變圖繪製": {"before": ["工程名稱請加上業主姓氏(EX:精銳嚮未來G07吳宅)", {"text": "再次確認各項客變許可範圍", "subs": ["浴室", "廚房廚具", "地坪建材", "插座數量", "給排水等"]}, "再次確認是否為智慧建築，若是需詳讀智慧建築的水電弱電等法規"], "during": [{"text": "隔間建材變更圖", "subs": ["使用建設公司提供之CAD圖檔及圖塊繪製", "隔間變更處框粗虛線並標註尺寸", "建材及設備類變更框粗線並附上文字說明", "油漆部分基本以批土保留、水泥漆或乳膠漆辦退", "木地板鋪設方向繪製及文字說明", "若建設公司附贈全室或廚房天花皆經業主同意後皆辦退(浴室天花板不用辦退)", "提前與業主聯繫約客變圖說會議時程，並提醒會議時間約1.5~2小時"]}, {"text": "電燈迴路變更圖", "subs": ["變更主要位置(未來未裝修面等)即可，其餘待裝修後自行施作", "日後才自行施作於隔間的開關非必要請預留於板下或相鄰的壁面並文字註明預留線長(EX:板下出線，L:300cm)", "施作於隔間的開關預留線長皆抓未來設定距離+100cm以上", "日後才自行施作於裝修面的開關(EX:衣櫃側板、床頭壁板等)請預留在相鄰的壁面並文字註明預留線長", "若建設公司不同意預留線長或線長有限制，請直接取消新增或位移，待未來裝修後自行施作", "臥室皆以雙切為主"]}, {"text": "電氣變更圖", "subs": ["變更主要位置(未來未裝修面等)即可、其餘待裝修後自行施作", "日後才自行施作於隔間的插座非必要請預留於板下或相鄰的壁面並文字註明預留線長(EX:板下出線，L:300cm)", "施作於隔間的插座預留線長皆抓未來設定距離+100cm以上", "日後才自行施作於裝修面的插座(EX:衣櫃側板、床頭壁板等)請預留在相鄰的壁面並文字註明預留線長", "智慧建築之插座需離大門、房門、浴室門左右兩側180cm內(浴室內插座不受法規限制)", "智慧建築之插座與插座間的距離為360cm", "冰箱插座客變皆以H:185~190cm為主", "電視插座客變皆以H:110cm為主，除了冰箱處的緊急插座外，其餘緊急插座請預留給電視為主", "床邊桌插座客變皆以H:65cm為主", "書桌、餐桌旁插座客變皆以H:85cm為主"]}, {"text": "弱電變更圖", "subs": ["變更主要位置(未來未裝修面等)即可、其餘待裝修後自行施作", "智慧建築之弱電須在各單間的空間保留C+T+TV各一", "弱電位置需對照電氣插座位置做確認擺放"]}, {"text": "給排水變更圖", "subs": ["需注意建設公司同意給排水客變範圍", "需注意業主是否有除濕機、掃地機器人的自動上下水需求"]}, {"text": "空調排水、套管變更圖", "subs": ["空調排水依照業主安裝「壁掛式空調」或「吊隱式空調」設定排水高度", "套管變更需先了解管線相對跑管路徑", "套管變更因關係到結構問題、盡量以不變更或小變動為主"]}], "after": ["確認各項變更數量為新增或移位", "確認是否已提前與業主預約，如尚未預約，請通知主管進行安排"]}, "八、業主客變圖會議": {"before": [{"text": "冷氣提前15分鐘開好，並準備", "subs": ["影印客變圖", "資料本", "開IPAD施工寶典", "開電腦", "會議室清潔", "會議中錄音"]}], "during": ["業主確認各項變更項目，日後自行施作部分注意需與業主解說", "確認業主客變當天是否到場，若無法請業主簽認客變委託"], "after": ["整理待確認事項及拍攝會議紀錄傳至群組", "依修改之項目更改於圖面", "錄音及資料歸檔，並更新案件狀態表", "與業主確認圖面後，先寄送電子圖說給建設公司及廚具廠商，縮短客變會議時間"]}, "九、建商客變圖會議": {"before": [{"text": "準備原建商配置圖", "subs": ["公司規劃後客變圖", "廚具圖", "業主資料", "客變委託書"]}], "during": [], "after": [{"text": "告知待建商回傳修正之客變圖說及追加減帳後", "subs": ["幫業主確認項目及數量", "提醒業主匯款第二期設計費"]}, "錄音及資料歸檔，並新增/更新案件狀態表"]}, "十、3D繪製": {"before": [], "during": ["配置建材時請參考材料選用指引", {"text": "配置家具、窗飾及燈飾等軟裝品項", "subs": ["業主需保留之家具建模"]}, {"text": "大板磚", "subs": ["加厚請控制3.5cm以上", "做為桌面時，底材僅限退縮1cm，以免撞擊之風險"]}, "櫃體設計注意使用上是否有通風需求(鞋櫃、電視機櫃等)", "玄關預留可置物平台、抽屜以及可擺放常穿鞋子的空間(例如鞋櫃下方懸空處)", "注意拉門門片若在樑下方，則天花板高程需在樑下方至少7cm", "注意櫃體門片打開是否撞到玄關門把手、房間門把手或任何物品", "再次確認電箱位置，並依照位置規劃設計", "再次確認電器櫃寬度請以60cm為標規，若業主堅持小一點須告知並未所有電器都可置放", "再次注意冰箱位置需思考開門迴轉半徑使否有阻礙", "設計按壓式滑軌，門片與櫃體會有6mm縫隙，建議設計成頂板蓋門片", "Kawajun重柱系統在原牆面需覆板", "人造石厚度設計最少3cm，2.4cm太薄會變形", "洗碗機的檯面下緣到地板淨高82cm即可，若是斜把手淨高要86cm", "確認IH爐下是否有足夠的散熱空間", "嚴禁浴室地板施作塗料", "壁/地磁磚如需對縫，需確認磁磚尺寸是否一致", "新作牆面如有開窗，窗框厚度為10cm，牆厚度至少大於12cm", "鋁窗「下開天」寬度超過180cm需加中立柱", "鋁窗高度超過260cm(正新)/220cm(國田)需開天", "三合一通風門最大尺寸為100*240cm，若超過應開天，且玻璃僅能用5mm", "確認吊隱式除濕機濾網抽換空間及方向(應有30cm以上),下方維修孔尺寸大於機器本體"], "after": ["彙整材質、視角及SK轉3Ds提供給渲圖廠商", "渲染圖完成後確認網頁文字是否皆為繁體", "製作建材表單", "選定之磁磚可提前請廠商送小樣至公司開會使用", "製作3D會議提案簡報，整體風格、區域設計或細節等等之示意圖", "確認是否已提前與業主預約，如尚未預約，請通知主管進行安排"]}, "十一、3D會議": {"before": [{"text": "冷氣提前15分鐘開好並準備", "subs": ["平面配置圖", "建材備妥(木皮、油漆、系統板、玻璃、崁燈等，其他相關建材準備網址頁面)", "開電腦(3D網址、SK模型)", "會議室清潔", "開IPAD施工寶典", "會議中錄音"]}], "during": ["確認公共空間各櫃內機能需求為何", {"text": "確認全室尤其廚房電器部分的用電需求為何及", "subs": ["廚房水槽龍頭位置"]}, "確認臥室衣櫃櫃內機能需求為何", {"text": "確認各窗窗簾種類是否有需要修改及", "subs": ["是否需要電動窗簾或預留插座供日後使用"]}, "確認家具及窗簾的種類及項目", "會議尾聲與業主再次確認修改項目", "提醒業主「原裝家具」或「原裝燈飾」等軟裝通常無現貨，期貨約4-6個月，若確定購買，請提前確認下訂"], "after": ["若有其他空間需挑選之磁磚或需看實體的大板材料，請提前預約業主至門市挑選，並在挑選後確認磁磚庫存", "整理待確認事項及拍攝會議紀錄傳至群組", "修改項目修正SK模型後提供照片供業主確認", "錄音及資料歸檔，並更新案件狀態表"]}, "十二、繪製施工圖": {"before": ["確認3D設計是否還有後續新增修改的部分，並確實轉達繪製人員", "確實修正3D設計後之平面配置圖", "再次確認現場丈量圖，包含樑位、窗高、穿樑套管高度及冷氣排水位置等等，減少後續設計上錯誤", "樓梯除非有特別設計再繪製，欄杆及扶手設計僅繪製一個單元即可", "配置建材時請參考材料選用指引"], "during": ["開啟圖塊整合，依照施工圖流程順序繪製，若有圖塊或敘述需補充得隨時自行增加", {"text": "八張平面大圖", "subs": [{"text": "第一張_平面配置圖：", "subs": ["選取圖層「I-地板材質」後連同平面圖+樑位再次Block", "無法標註在剖立面圖之任何施工事項，應文字說明(整合圖塊有範例)，若為透天則集中在各樓層平面配置圖", "文字說明：電梯門及電梯車廂尺寸", "文字說明：在「圖框外」打上公設地面、壁面面積", "文字說明：建商浴室窗戶尺寸", "文字說明：面蓋樣式、油漆色號、窗簾+家具報價種類及項目", "整理前次會議之修改內容及刪除需向業主確認之事項，並以文字說明"]}, {"text": "第二張_隔間配置圖：", "subs": ["複製平面配置圖並全部炸開(X)", "地板線、文字及樑Block刪除", "除了牆線、窗戶、黃色隔間牆(含斜線) 外，其餘改為地板線", "不含H-WALL後BLOCK，再放上「H-WALL」", "最後標上隔間尺寸(標註型式注意)"]}, {"text": "第三張_天花板配置圖：", "subs": ["複製「隔間配置圖」", "用「圖層木工(綠色)」畫天花板後獨立Block", "用「空調配置」圖層畫空調、除濕機、全熱交換器及其所需的出回風口後獨立Block", "放上「樑位Block」及「H-WALL」", "標註天花板尺寸、高程文字(標註型式注意)", "規劃走廊維修孔隱藏網路、變壓器用(若有其他維修孔可使用，可自行判斷)", "規劃廚房維修孔(若廚房頂板有樓上的吊管)", "規劃消防幹管水閥維修孔", "薄膜燈的LED燈條要離薄膜15cm以上", "其他吊管處需開維修孔45*45cm 或 30*60cm", "方型嵌燈開孔繪製並標註尺寸"]}, {"text": "第四張_空調配管圖：", "subs": ["複製「隔間配置圖」", "放上「樑位Block」、「天花板Block」、「空調配置Block」、「H-WALL」", "用「水電弱電取消」放上現場套管位置及原有冷氣排水位置(老屋不用)，並繪製：", "壁掛冷氣的中心位置標註(吊隱式不用)", "新增/移位冷排位置，注意洩水是否足夠", "確認冷排及冷媒管上方是否有拉門軌道", "配置吊隱式空調「線控開關位置」或「天花隱藏式感應器」", "全熱交換器面板位置規劃", "吊隱除濕機面板位置規劃", "聚合線繪製", "吊隱式空調", "吊隱式除濕機", "全熱交換器(或新風機、VAF)之出回風口風管路徑及排水路徑", "圖框左邊放管線、冷排圖塊說明", "注意：空調外機因冷凍油循環因素，應低於內機，如現地因素外機須高於內機時，垂直距離不超過5米", "(老屋)確實繪製冷氣外機位置，注意外機高度是否會高於窗戶", "(老屋)確認冷氣室外機位置，水平寬度一台需抓100~120cm，並間隔20~30cm置放"]}, {"text": "第五張_燈具配置圖：", "subs": ["複製「隔間配置圖」", "放上「樑位Block」、「天花板Block」、「H-WALL」、「空調配置」", "畫上鋁擠型條燈及燈具後獨立Block", "畫上偵溫、偵煙及灑水頭(不用Block)", "再標註尺寸(標註型式注意)", "打開專案「03-CAD圖面」內「消防灑水頭及偵煙器會置規範」配置消防設備", "確認灑水頭位置不可在任何機器下方", "確認各櫃體或門片打開是否會撞到消防設備或除了一般平面崁燈以外的燈具", "鋁擠型標註文字說明：位置、長度、支數 (EX: 天花板下10*10鋁擠型燈條100cm*2支)", "配置浴室抽風扇/暖風機", "配置影音設備機櫃抽風扇", "確認原有建商浴室是否配置燈具", "天花板高度若只有220cm以下，思考是否改成7w光源", "圖框左邊放上燈具圖塊說明", "圖塊說明不常用的燈具型號", "圖塊說明文字打上抽風扇/暖風機型號"]}, {"text": "第六張_燈具迴路圖：", "subs": ["複製「隔間配置圖」及「燈具Block」後", "畫上原有開關符號", "再新增/移位(老屋直接新增)", "並標註尺寸、文字(標註型式注意)", "聚合線繪製各燈具迴路", "確認是否規劃電鈴", "確認是否規劃one touch", "確認是否規劃埋壁式感應面板", "配置浴室&影音設備機抽風扇開關/暖風機面板(線控)", "圖框左邊放開關圖塊說明"]}, {"text": "第七張_水電弱電配置圖：", "subs": ["複製「隔間配置圖」", "放樣全部原有的水電弱電", "再新增/移位(老屋直接新增)", "網路C(透天別墅評估是否放弱電箱即可，不用在天花板)", "確認預留天花板插座&網路", "預留監視器插座/網路", "確認電子衣櫥插座H:30cm", "電器櫃的插座畫在面對的中心偏下", "水槽下的給排水與龍頭安裝位置垂直錯開，給排水H45cm，插座在30&45cm", "馬桶給水中心偏左25cm，給水H15cm、插座H30cm，", "沖洗器給水中心偏右30~35cm、H60cm", "前後陽台、車庫給水H:65cm、地排配置", "畫上", "抽油煙機電源中心偏邊10cm、H180cm", "暖風機電源", "確認抽風機是否為遙控，若是的畫需配電源", "鐵捲門電源", "空調外機電源(老屋)", "吊扇電源", "確認廚房電器用品使用機型及用電", "任何擺放電器的櫃體深度需考量機體深度外，須包含插座頭深度或是插座位置是否偏邊", "確認配電需求", "一般插座約7個/1P", "110V專插/1P", "220V專插/2P", "冷氣室外機1台/2P", "原有電箱如現場無法加大且需新增斷路器時，須將木作牆面墊厚 12 cm，並增設大電箱", "預留電風扇、空氣清淨機、落地型除濕機的插座", "洗衣機給水H120cm、電源配置H120cm、地排配置", "熱水器冷熱水H120cm、電源配置H120cm", "圖框左邊放開關圖塊說明"]}, {"text": "第八張_平面索引圖：", "subs": ["複製「平面配置圖」並移至旁邊炸開，關掉地板線、木地板、TEXT後，再把圖面移至圖框內"]}]}, {"text": "施工圖繪製順序", "subs": ["01：畫平面索引圖(可自行判斷是否先請主管檢查後再繼續繪製)", {"text": "02：複製多個「平面配置圖」", "subs": ["選圖層「A-Wall」繪製矩形rec（高度固定150cm，長度依各剖面放置）", "用XC擷取", "兩個空間分開畫、所有施工空間每面牆都需繪製(例：客房、小孩房)", "浴室、露臺、工陽若無施工則不用繪製"]}, "03：複製多個圖框，擷取圖與立面圖離100cm，先畫一張立面，上下置中圖框，再拉建構線輔助樓板及地板線(圖層I-天花隔間)", "04：全部擷取圖放到圖框，選圖層「A-Wall」複製全部垂直牆線，再刪除不必要的線", {"text": "05：立面圖上畫上", "subs": ["樑位", "窗戶正面剖面", "門正面剖面", "選圖層「H-wall」在各剖立面圖上分開hatch"]}, "06：繪製隔間配置圖(參考第二張)", "07：繪製天花配置圖(參考第三張)", "08：繪製空調配管圖(參考第四張)", {"text": "09：開啟雙視窗", "subs": ["選圖層「I-天花隔間」在全部立面圖上，用PL畫天花板線"]}, {"text": "10：畫所有立面圖線條", "subs": ["櫃內圖", "大樣圖", "規劃玄關明鏡", "各臥室穿衣鏡", "房門及玄關門旁若有櫃體應補板3cm", "新作浴櫃須包含衛生紙架功能", "電視牆電視處空間請以凹槽方式做規劃(可參考連結)", "三合一通風門最大尺寸為100*240cm，若超過應開天，且玻璃僅能用5mm", "玻璃欄杆需使用5+5mm膠合玻璃", "電箱若是在櫃體的左右側板上，應注意鉸鍊位置是否無法安裝", "再次注意洗碗機的檯面下緣到地板，若是斜把手要86cm，正常82cm即可", "再次注意櫃體門片打開是否撞到玄關門把手、房間門把手或任何物品", "再次確認Kawajun重柱系統在原牆面需木工覆板 / 系統覆板", "再次確認IH爐下是否有足夠的散熱空間", "放刀叉盤的桶寬建議以整數為主(例:60.70.80.90cm)", "(老屋)電箱尺寸38*61*D10.5(參考喬成路26P)", "(老屋)弱電箱尺寸38*40*D10"]}, {"text": "11：Hatch所有立面圖、放材質照片", "subs": ["新增/包框的窗戶應Hatch玻璃及框色，但原有窗戶及三合一門除外", "依據「電梯大小」及「材料尺寸」評估木皮、系統板材、玻璃、鏡子的可搬運性，並繪製分割線。", "有紋路走向的板材，下單以及現場需確認紋路走向", "思考電梯大小"]}, {"text": "12：圖塊放置", "subs": ["吊衣桿及衣服", "冷氣正面剖面", "電視", "床架正面", "床頭櫃正面", "馬桶", "淋浴龍頭", "臉盆(臉盆深度需考量龍頭安裝空間，下崁式臉盆深度需小於浴櫃總深至少13cm才有空間安裝一般龍頭)", "選圖層「I-活動家具」改虛線，繪製活動電器立面(冰箱、掃地機器人及其他電器等)"]}, {"text": "13：選標註型式「1比30」標註所有立面圖尺寸，正面標註「寬度及高度」，剖面標「深度」", "subs": ["沒剖到的面標在上方擷取圖", "櫃內圖的板厚「系統18mm」或「木工20mm」不標註，除非不同於這兩種規格"]}, {"text": "14：剖立面圖標註", "subs": ["思考是否需要線孔蓋(電視櫃、化妝桌、書桌等)，並文字說明。例：5.5cm白色線孔蓋(可參考東浩群組)", "思考是否需要通風蓋(鞋櫃、汙衣櫃...等)，並文字說明。例：60cm白色通風蓋(可參考東浩群組)", "大板磚當檯面使用時，底材應使用木作夾板當底材，並文字說明", "木作覆板需標註文字", "木作隔間若沒有在隔間配置圖上標註的，應在立面圖文字說明；若有則不用標註", "木作美耐板貼作處若為人體會使用到的陽角(桌板、扶手...等)，應在立面圖標註陽角導1分導角", "室內玻璃若邊框有鐵件、溝槽的、或門片用的，用5mm即可", "若沒有或太大片則用8mm", "門片後明鏡文字範例：5mm無銅明鏡30*150cm", "Blum一般鉸鍊為100度、特殊角度鉸鍊為-95度鉸鍊及155度鉸鍊", "若有貼磚需馬貝填縫請進入材料選用指引參考公司既有庫存並選定標註", "廚房壁磚應填環氧樹脂，並文字說明", "把手提前選定後，應文字說明", "若尚未決定應寫「崁把手另選」或「外鎖把手另選」"]}, {"text": "15：文字放置", "subs": ["抽屜", "天花板高度", "櫃內圖", "大樣圖處", "橫拉門", "挑選衛浴設備", "挑選廚具設備", "所有立面圖標示進退面", "思考夾板加強處"]}, "16：畫燈具配置圖", "17：畫燈具迴路圖", {"text": "18：畫水電弱電配置圖", "subs": ["確認開關、插座是否需要補板", "USB插座深度須預留5cm厚"]}, {"text": "19：在立面圖放上", "subs": ["水電弱電開關圖塊", "鋁擠型燈", "電箱+弱電箱虛線"]}, {"text": "20：圖框修改", "subs": ["工程名稱並加上業主姓氏宅(EX:精銳嚮未來G07吳宅)", "日期", "圖號", "頁數", "圖面名稱(透天別墅寫樓層)例：2F主臥、3F小孩房"]}, "21：設定頁面設置管理員(依頁數設定)", {"text": "22：規劃拆除圖給工務看不用給業主看", "subs": ["拆除區域太少可在平面圖以文字敘述"]}]}], "after": ["請該專案主管協助檢查，並依文字紀錄、不好紀錄的直接討論並修改", "確認是否已提前與業主預約，如尚未預約，請通知主管進行安排"]}, "十三、施工圖會議": {"before": [{"text": "冷氣提前15分鐘開好並", "subs": ["印製圖面", "建材備妥(木皮、油漆、系統板、玻璃、崁燈等，其他相關建材準備網址頁面)", "開電腦(3D網址、SK模型)", "會議室清潔", "開IPAD施工寶典", "會議中錄音"]}], "during": ["確認平面圖上的待確認事項", "再次確認電器櫃寬度以60cm為標規，若業主堅持小一點須告知並未所有電器都可置放", "說明抽屜門片及抽盒高度的關係，並詢問業主抽屜收納物品為何", "確認抽屜是否要加裝鎖", "確認電視壁掛架尺寸", {"text": "確認工程報價單是否需要報價", "subs": ["空調型號", "開關面板品牌顏色", "填寫至施工圖第一頁"]}, {"text": "詢問業主客戶是否允許使用", "subs": ["客浴", "使用停車格，若不行需紀錄"]}, {"text": "保留紙本施工圖說給業主", "subs": ["是", "否，並提醒業主下次將施工圖帶回抽換圖面"]}, "確認是否已有裝修管理辦法，若沒有則向業主確認"], "after": ["整理待確認事項及拍攝會議紀錄傳至群組", "若業主有修改一律複製CAD檔案，檔名備註第X次修改", "錄音及資料歸檔，並更新案件狀態表"]}, "十四、工程估價單": {"before": ["Eliz家具粗估", "Norman窗簾粗估", "陪業主現場挑磚壁/地磁磚如需對縫,需確認磁磚尺寸是否一致"], "during": ["橫拉門、摺疊門要加滑軌五金價格", "確認平面圖是否有其他需估價項目", {"text": "確認是否有局部拆除項目", "subs": ["再次核對平面圖及丈量圖是否有拆除牆面"]}, "確認是否施作冷氣安全欄", "注意火爐位置日否變換位置，需新增修改瓦斯管費用 / 新增瓦斯不鏽鋼管延伸費用", "提供現場照片及圖面給空調廠商報價", "詳閱社區裝修管理辦法是否規定外機擺放位置及台數", "完成後打開所有隱藏的項目"], "after": [{"text": "請同事檢查報價單JYUE檢查", "subs": ["水電口數", "燈具口數", "木工窗簾盒、層板跟油漆符合", "圓弧尺寸"]}, {"text": "其他人檢查", "subs": ["公式", "單價金額", "確認數量跟備註右側比對(木工油漆坪數要比右側高)"]}]}, "十五、工程估價單會議": {"before": ["備妥選定建材至會議室擺放", "影印一份工程合約", "提醒業主帶回舊圖面並影印新圖面，若修改圖量少，僅影印修改圖面後做抽換", "請主管影印工程估價單、ELIZ估價單、NORMAN估價單"], "during": ["若未重新打底直接於原地面鋪設木地板，需明確告知業主可能發生卡扣斷裂的風險", "告知業主吊燈樣式需提前確認樣式，以利水電出線放樣，若日後欲修改會酌收修改費，且視情況可能無法修改", {"text": "提醒業主簽約日帶兩副鑰匙", "subs": ["櫃台一副", "我們一副"]}], "after": ["整理待確認事項及拍攝會議紀錄傳至群組", "若業主已確認修改之項目，「報價單」及「CAD檔案」一律複製新檔，檔名備註第X次修改", "若業主有取消施作之項目，圖面請直接刪除", "視情況判斷提醒業主匯款設計費", "錄音及資料歸檔，並更新案件狀態表"]}, "十六、工程簽約會議": {"before": ["詢問主管是否備妥選定建材至會議室擺放", "詳讀室內裝修申請表並將業主需簽名處做紀錄", "再次提醒業主簽約日帶兩副鑰匙"], "during": ["提供室內裝修申請表給業主簽名"], "after": ["拍攝工程合約及設計合約上傳至群組，並計算請款金額(工程第一期+設計尾款)及提醒匯款時程", "提醒公司承辦應承保工程保險", "監工人員確認進場時間，提早繳交保證金及室內裝修管理辦法", {"text": "繳交室內裝修管理辦法後，並與社區確認進出動線、相關規定後", "subs": ["群組記事本新增案件資訊(可參考其他工地)"]}, "請主管影印「無價格」及「廠商數量」之報價單，並提醒主管隱藏黃色之項目及廠商數量", {"text": "應提前告知/下單請廠商保留：", "subs": ["木地板工程", "系統櫃工程前三個月"]}]}, "十七、開工": {"before": ["提醒業主匯款第一期工程款", "開工拜拜，需詢問業主是否參與", {"text": "準備項目：", "subs": ["馬桶刷", "馬桶蓋", "掃把 ", "畚箕", "有隅專用箱(拜拜當桌子)", "拜拜專用包(確認打火機)"]}, {"text": "購買", "subs": ["金紙+線香", "雞腿便當", "水果三種(籽少的，例如:香蕉.蘋果.梨子.橘子.釋迦不行)"]}, "依照報價單項目，確認是否需設置沉澱桶，並請廠商協助"], "during": ["開工儀式執行後拍照，並拿紅包袋裝鐵鎚至房屋陰角敲兩三下", "檢查室內窗框、門框有無受損", "檢查屋主車位狀況", "檢查不鏽鋼水槽(刮傷、鏽斑等)，大項缺失可先告知業主", "公設缺失檢查", "以上缺失用紙膠帶貼完後並「拍照」及「錄影」後，請櫃檯人員清點", "確認施工人員進出動線、停車位、卸貨區及相關規定後，在業主群組建立記事本"], "after": ["拿金紙去附近的土地公廟燒", "「開工照片」及「缺失照片」上傳至業主群組"]}, "十八、保護工程": {"before": [], "during": ["檢查是否依照裝修管理規範施作"], "after": ["檢查公設區域牆面角材是否穩固(常有角材掉落狀況)"]}, "十九、鷹架工程": {"before": ["與廠商預約現勘"], "during": ["鷹架固定件壁拉桿鎖點位置應於窗邊，利於拆架後修補", "鷹架搭設應距離建築物本體20~25cm"], "after": []}, "二十、打除工程": {"before": ["配合一米基準線，確定門高、窗高拆除的尺寸", "現場標示需打除之區域，並放樣高程基準線，後續工班皆已此基準線下去施工", "提前告知廠商建築物正面鷹架搭設一律帆布+網", "注意：廁所牆面一律打除見底", "(老屋)打除工班進場前應請水電廠商於前一天進場預設臨時水"], "during": ["(老屋)新作門/窗處(包框不算)，牆面邊框5-10cm應切割打除見底，以利於後續泥作廠商進場崁縫後可黏膠條。"], "after": ["(老屋)第一次進場全室大方向打/拆除完成後，拿圖面至現場核對後，應約工班二次進場細修"]}, "二十一、水電工程": {"before": ["請廠商確認燈具迴路電壓(非常特殊建案才有可能為220v)", "與廠商現場對圖、放樣、確認位置及高程", "確認是否能夠打地板並告知廠商", "消防灑水頭修改前請至管委會告知關閉消防警報系統", "特殊水電、弱電面蓋請確認預埋盒尺寸，並提供給廠商", "(老屋)確認新作的吊管處，是否與後續冷氣內機的管線衝突"], "during": ["再次確認消防灑水頭位移管線時，應確認是否與空調系統「全熱交換器 / 除濕機」之管線界面產生衝突", "客浴馬桶蓋更換(若業主不給使用則不用更換)", "確認偵煙、偵溫器、燈具未來固定位置是否會被櫃子開門擋到", "確認緊急按鈕是否作用(需先跟櫃台告知會拆掉日後恢復)", "「RC牆」及「濕式隔間」管溝修補一律使用水泥砂，嚴禁使用發泡補管溝。            「乾式隔間」會請木工修補", "拉線完成時，應檢查每一個線材皆有做記號", "IC面板拆除後，保護好放到有隅專用箱"], "after": ["(老屋)注意事項：給水管壓力測試(完美水壓)2.2-3kg/cm2,如超過3.5kg/cm2應設置減壓閥", "消防防灑水頭完成後需至管委會告知並恢復消防警報系統"]}, "二十二、鋼構工程": {"before": ["鋼梯放樣應與鋼構場商現場會同確認細部尺寸，出圖後二次確認尺寸", "鋼構樓梯請勿做兩側有斜度的(進德街)，需事先跟廠商說明", {"text": "與廠商確認材料進場實現地腳路及尺寸如何配合", "subs": ["吊掛方式", "出入口通道高度及寬度"]}, "鋼構樓梯請勿做兩側有斜度的(進德街事件)，需事先跟廠商說明"], "during": [], "after": ["確認焊道處是否滿焊且做好防鏽處理"]}, "二十三、鋁門窗工程": {"before": ["窗框長*寬尺寸應退縮結構開口3cm，利於崁縫"], "during": ["提醒施工人員立框安裝時，須依據一米基準線確認地板完成面高程，以確保安裝高度一致"], "after": ["窗框施工完成後，請勿拆保護紙", "內扇安裝前應與廠商確認三點連洞大勾把手的高度"]}, "二十四、冷氣工程": {"before": ["確認工作陽台雜物是否清除", "外機鎖掛位置，盡量不要突出窗戶"], "during": ["確認工作陽台冷氣套管是否確實填塞，以免溫差導致冷氣滴水", "廠商冷排試水，確認是否洩水順暢、有無漏水等"], "after": ["開啟空調長時間測試有無漏水"]}, "二十五、泥作工程": {"before": ["案場如有地坪打底工項應先開全室一米基準線", "磚牆/RC牆打底前確實要求施工者洗牆", "地坪打底厚度如超過8cm以上，應做二次施工並告知廠商", "牆面打底厚度如超過5cm以上，應做二次施工並告知廠商", "又土防水粉應先行備妥", "若有施作磚牆隔間有門框門扇工程，應與廠商確認門框厚度以利控制牆厚"], "during": ["不同地坪材質(例如木地板、磁磚、無縫地坪)，應確認泥作打底厚度是否須配合", "又土防水粉應確實攪拌於水泥砂中，嚴格要求不可加入噴固精"], "after": ["抽樣檢查牆面/地面打底是否有起砂或空殼，尤其是龜裂處", "抽樣檢查牆面粉光可是否有不平整(用手掌觸摸)"]}, "二十六、防水工程": {"before": ["地坪防水施作前應確認素地是否有雜物", "廠商施作：牆面防水施作前應確認突起物刮除乾淨", "廠商施作：外牆防水塗裝原磁磚處確實佈塗底漆", "攜帶角鋁請廠商固定後一併防水施作"], "during": ["檢查地板排水管應佈塗防水於管內", "檢查地板排水管邊應確實黏貼不織布", {"text": "廁所", "subs": ["地面+角隅15cm全面覆貼長纖不織布", "立面防水施作全區H200cm"]}], "after": ["完全乾燥後，帶PE棒至現場，執行積水測試72小時"]}, "二十七、磁磚工程": {"before": ["素地清潔，現場放樣磁磚起磚位置，可一起評估現場相關裝修面之相對位置或視覺關係", "確認電梯車廂尺寸是否能進大板磚"], "during": ["磁磚與異材質接縫一律填補環氧樹酯", "磁磚現場加工背切45°時，應確認切斷處是否有跳釉"], "after": ["檢查磁磚填縫是否飽縫及色變"]}, "二十八、木作工程": {"before": ["確認拉門滑軌品牌後跟睿鵬訂購軌道，若橫拉門為黑色，則軌道需訂購黑色，其餘顏色一般以鋁色為主", "確認拉門滑軌數量後，至B1F拿取並通知會計部", "確認崁燈高度是否足夠", "確認施作區域有無後鋪設木地板，櫃體上升預留木地板厚度", "準備櫃體嵌入燈條樣品等方便木工開孔", "崁入式條燈預埋尺寸寬度+1mm、深度+1mm，並確認控制線是否好抽拉", "提醒該案設計師挑選木作、系統櫃之把手及門鎖(注意抽屜深度、門片厚度)", "與廠商確認塗料處底板一律封塗裝底板", "若有施作木作隔間有門框門扇工程，應與廠商確認門框厚度以利控制牆厚", "(老屋)確認工程契約書，廠商進場後提醒業主匯款工程款"], "during": ["提醒吊燈、壁燈以及吸頂燈安裝處為木作，需在底材補強，補強空間可拉至W100-120cm", "天花板封板前，檢查燈具出線有是否放在配置附近，減少燈具拉線困擾", "提醒廠商拉門軌道要分兩節，後續才可拆卸維修", "確認偵煙、偵溫器、燈具未來固定位置是否會被櫃子開門擋到", "預約燈具廠商來鑽孔", "天花板封板後，須檢查鋁擠型條之燈控線是否有預留出線，並確認是否已施作燈溝槽", "提醒設計師與業主預約挑選家具、窗飾及燈飾等等軟裝品項"], "after": ["若有繃布打板、磁磚底板...等，或其他須保留之物品，請明顯標記於物品"]}, "二十九、油漆工程": {"before": ["與廠商現場對圖，並說明施作範圍及漆類種類", "與廠商現場核對取消的水電、弱電位置", "廠商進場後確認工程契約書並提醒業主匯款工程款"], "during": ["特殊塗料施作後，負責該案之設計師需至現場確認紋路等細節，沒問題後再上面漆", "提醒施工人員在批土、噴塗時作業時，一律不准踩踏已完成之櫃體、桌板"], "after": ["提醒施工人員，木皮、烤漆噴漆完成後，應使用瓦楞板保護已施作的物品"]}, "三十、軟裝挑選": {"before": ["準備平面配置圖、比例尺、3D圖及相關材質的小樣"], "during": [{"text": "確認圖面沙發尺寸", "subs": ["是否遮蔽插座", "是否有門片打開會撞到家具"]}, "除窗簾廠商Norman之外，請其他廠商與業主自行留聯繫方式並提供報價及簽約，以免三方爭議"], "after": ["與廠商再次核對顏色及尺寸"]}, "三十一、系統丈量": {"before": ["CAD複製新檔案，把無相關的資訊刪除(EX:木工、油漆、標註尺寸...)後，注意分樓層必須寫在圖面名稱上，並影印圖面", "確認「施工廠商時間」及傳圖面下單確定「系統出貨時間」後，再安排施工進度", {"text": "上項日期確定後", "subs": ["通知司機「載運時間」並設定前一周更新載運材數", "且更新施工進度"]}], "during": ["再次確認門片打開是否會撞到門扇的把手、馬桶、開關、插座...等", "確認每個門片的蝴蝶鉸鍊深度，決定補板寬度", "確認地坪於未鋪設保護板之狀態下，須主動提醒廠商施作攜帶保護板，相關費用由公司負擔。"], "after": []}, "三十二、系統拆料": {"before": [], "during": ["確認嵌把手挑選或外鎖把手另選，並提醒設計部挑選且說明安裝位置", "確認開關、插座是否需補板", "有安裝洗碗機且日後會鋪設木地板的話，洗碗機底部需以18板墊高，並再次注意機器高度(請參考說明書)", "確認是否有10~12cm調整腳或需上下疊，並寫在丈量圖上", "其他五金(上掀桿、壁掛器、支撐架、檯面支撐架....等)，寫在丈量圖上", "確認桶高若達天花板最高點，現場將無法正常組裝，應評估改為上下兩桶。"], "after": ["系統顏色及施工方法等，拆料後再與繪圖人員進行確認", "拆料後的圖面提供給廠商，待廠商回覆對圖時間"]}, "三十三、系統對圖": {"before": ["開啟CAD檔及準備丈量圖"], "during": ["若有修改項目直接在CAD裡面改", "確認滑軌深度並寫在丈量圖上"], "after": ["用營光筆在丈量圖上標記需叫貨的五金(廚具五金.線孔蓋.支撐架.12cm踢腳...等)", {"text": "「系統出貨時間」前一周安排統計五金數量並叫貨", "subs": ["通知撿五金人員"]}, "核對報價單項目確定設備項目", "水槽下嵌、臉盆下嵌、IH爐平接，需事先叫貨至人造石廠商"]}, "三十四、系統工程": {"before": [{"text": "系統施工第一天需影印圖面至現場", "subs": ["禾邁、九灃：開關迴路圖、水電弱電配置圖                                                                  ", "新櫃族：拆料圖、開關迴路圖、水電弱電配置圖"]}, "與廠商說明安裝順序及圖面重點"], "during": ["新工班需確認施工標準細節(藏螺絲、指縫檔板要用L片...等)", "與工班確認現場缺板材、五金狀況，即時與板材廠聯絡補料", "確認可丈量時間並預約檯面廠商(廚房檯面、面盆檯面...等)", "請工班檢查是否有瑕疵、缺料，補料後一併請師傅收尾", "與工班確認矽利康施打範圍"], "after": []}, "三十五、人造石／石英石工程": {"before": ["丈量時檯面應蓋過水槽0.5-1公分（滴水）水槽離前緣5cm"], "during": [], "after": []}, "三十六、系統鋁框工程": {"before": ["櫃體門片可待確認系統對圖後，再跟廠商下單", {"text": "櫃體的橫拉門應待櫃體完成後，再預約廠商丈量。", "subs": ["若有鋪設木地板應告知廠商，下單應扣木地板高度"]}, "系鋁框鉸鍊公司只用黑騎士，應告知廠商"], "during": [], "after": []}, "三十七、燈具工程": {"before": ["「燈具配置圖」及「燈具迴路圖」轉PDF檔傳給廠商", "安裝業主自購燈具，若由我們拆封檢查燈具，應拍照給業主"], "during": ["(廠商放樣)挖孔須視現場角材做調整"], "after": []}, "三十八、鐵件工程": {"before": ["丈量時應與廠商現場會同確認細部尺寸，廠商出圖後再次確認尺寸", "丈量時須與廠商確認材料進場之動線可行性，包含現地腳路、配合方式、吊掛方式，以及出入口通道的高度與寬度"], "during": ["確認鋼材焊接處是否滿焊"], "after": ["確認螺絲頭是否有內縮完成面1mm"]}, "三十九、玻璃工程": {"before": ["告知廠商電梯尺寸及玻璃尺寸，確認是否可以搬運", "確認玻璃分割位置"], "during": ["噴砂玻璃的沙面，安裝方向應朝手摸不到的地方避免指紋"], "after": ["檢查玻璃表面是否有明顯刮痕"]}, "四十、門框門扇工程": {"before": ["與廠商確認門框厚度 (控制牆厚) 出入面"], "during": ["門片絞鍊鎖螺絲時，容易飄掉傷及表面，建議貼上大力膠後再鎖螺絲"], "after": []}, "四十一、木地板工程": {"before": ["聯絡廠商現勘，確認施作範圍、品牌及顏色", {"text": "與廠商確認區隔條位置", "subs": ["房門的收邊條應在門片正下方"]}], "during": ["鋪設前，與師傅現場討論起始點，盡量抓櫃體、牆面垂直以及平行", "確認工程估價單是否有矽利康工程，若有則提醒施工人員請勿打矽利康"], "after": []}, "四十二、清潔工程": {"before": ["與施工人員檢查現場的烤漆、特殊塗料等檢查是否有缺失", "提醒施工人員不鏽鋼水槽應先用水將粉塵沖掉，確認是否有刮痕"], "during": [], "after": ["再次確認不鏽鋼水槽是否有刮痕"]}, "四十三、矽利康工程": {"before": ["與廠商預約施工日期後，告知應備料的顏色"], "during": ["會同廠商現場核對顏色及位置"], "after": []}, "四十四、水電收尾": {"before": ["會同廠商確認開關插座面蓋型號、數量，並且提早準備到現場", "提醒施工人員表面裝修材為、玻璃、明鏡、磁磚、大板時，安裝面蓋時應用手工具鎖緊螺絲"], "during": [], "after": [{"text": "要求錄影拍照確認", "subs": ["插座", "網路等是否正常使用"]}, "確認緊急壓扣是否作用", "確認所有面蓋是否有水平"]}, "四十五、初驗": {"before": ["設計部找交屋禮", "初驗出席人員需提前至案場巡視，且工程部需告知其注意事項", "準備缺失表單、工程合約、驗屋工具包(紙膠帶、濕紙巾、筆、豆豆貼、插座檢測器)、交屋文件夾及透明內頁資料袋等", "與工務部確認電器產品遙控器等置放位置", "若有工作物來不及完成或大項缺失，請工務部提前告知初驗出席人員"], "during": ["詢問業主是否需帶買掛畫釣勾", "確認各種業主需要另行安裝之五金位置", "各項缺失需貼上編號", "各類設備說明書集結成冊交給業主", "點交當天須跟屋主提及完工攝影，並預約時段", "告知業主缺改善大約時程，並提醒缺改後由業主自行前往工地現場複驗"], "after": []}};
const STATUS_OPTS=[
  {v:'contact',l:'接洽中',bg:'#F1EFE8',color:'#6B6558'},
  {v:'cv',l:'客變案',bg:'#FCEBEB',color:'var(--red)'},
  {v:'design',l:'設計中',bg:'var(--gl)',color:'var(--gd)'},
  {v:'prog',l:'施工中',bg:'var(--pl)',color:'var(--pd)'},
  {v:'done',l:'已完工',bg:'var(--gl)',color:'var(--gd)'},
];
// Table-row sort order is intentionally different from the dropdown/stat
// order above: 設計中 → 施工中 → 客變案 → 已完工.
const STATUS_SORT_RANK={contact:0,design:1,prog:2,cv:3,done:4};
const SCOLS=["#EEEDFE","#E1F5EE","#FAEEDA","#FCEBEB","#E6F1FB","#EAF3DE","#FBEAF0","#F1EFE8"];
const STCS=["#3C3489","#085041","#633806","#791F1F","#0C447C","#27500A","#72243E","#444441"];
function sc(i){return SCOLS[i%SCOLS.length]}function tc(i){return STCS[i%STCS.length]}
function statusInfo(v){return STATUS_OPTS.find(o=>o.v===v)||STATUS_OPTS[0]}
function isAdmin(){return currentRole==='admin'||currentRole==='manager'}
function canEditProjects(role=currentRole){return role==='manager'||role==='admin'||role==='staff'}
function canDeleteProjects(role=currentRole){return role==='manager'}
function memberDisplayName(m){if(!m)return'成員';return m.displayName||m.name||(m.email?m.email.split('@')[0]:'成員');}
function memberTag(m){if(!m)return'?';if(m.tagInitial)return m.tagInitial;return memberDisplayName(m).charAt(0);}
function activeMembersList(){return S.members.filter(m=>(m.role==='admin'||m.role==='staff'||m.role==='manager')&&m.status!=='resigned');}
function markableMembersList(){return activeMembersList().filter(m=>m.role!=='manager');}
// Daily work log rows exclude the "管理員" (company/manager account) role —
// that role doesn't do site work, so it shouldn't be asked to log it.
function dailyLogMembersList(){return markableMembersList();}
function orderedDailyLogMembers(){
  const members=dailyLogMembersList();
  const saved=dailyLogMemberOrder;
  const rank=new Map(saved.map((uid,i)=>[uid,i]));
  return members.slice().sort((a,b)=>{
    const ar=rank.has(a.uid)?rank.get(a.uid):Number.MAX_SAFE_INTEGER;
    const br=rank.has(b.uid)?rank.get(b.uid):Number.MAX_SAFE_INTEGER;
    return ar-br;
  });
}
let dailyLogMemberOrder=[];
let dailyMemberDragUid=null;
window.dailyMemberDragStart=function(e,uid){
  if(!isAdmin()){e.preventDefault();return;}
  dailyMemberDragUid=uid;e.dataTransfer.effectAllowed='move';
};
window.dailyMemberDragOver=function(e){if(isAdmin()&&dailyMemberDragUid){e.preventDefault();e.dataTransfer.dropEffect='move';}};
window.dailyMemberDrop=async function(e,targetUid){
  e.preventDefault();
  if(!isAdmin()||!dailyMemberDragUid||dailyMemberDragUid===targetUid)return;
  const members=orderedDailyLogMembers();
  const from=members.findIndex(m=>m.uid===dailyMemberDragUid),to=members.findIndex(m=>m.uid===targetUid);
  if(from<0||to<0)return;
  const moved=members.splice(from,1)[0];members.splice(to,0,moved);dailyMemberDragUid=null;
  dailyLogMemberOrder=members.map(m=>m.uid);
  setSyncing();
  await setDoc(doc(db,'globalNotes','dailyLogMemberOrder'),{order:dailyLogMemberOrder,uid:currentUser.uid,updatedAt:serverTimestamp()},{merge:true});
  setSynced();
  if(activePanel==='progress')renderProgress();
};
const DEFAULT_DESIGN_COL_NAMES=['會議人員','平面圖','客變圖','3D圖','施工圖','報價單'];
const DEFAULT_DESIGN_COLS=[
  ...DEFAULT_DESIGN_COL_NAMES.map(name=>({name,kind:'member',collapsible:true})),
  {name:'備註',kind:'note',collapsible:false},
  ...Array.from({length:20},(_,i)=>({name:String(i+1),kind:'text',collapsible:false}))
];
// Keep the production Firebase structure and local preview structure identical.
// Legacy columns keep their original storage key so renaming 欄位7… to 1…20
// never discards data already saved in project.designProgress.
function normalizeDesignCols(raw){
  const source=(Array.isArray(raw)&&raw.length?raw:DEFAULT_DESIGN_COLS).map(c=>{
    if(typeof c==='string')return{name:c,key:c,kind:DEFAULT_DESIGN_COL_NAMES.includes(c)?'member':'text',collapsible:DEFAULT_DESIGN_COL_NAMES.includes(c)};
    return{...c,key:c.key||c.name};
  });
  const existingBlue=source.filter(c=>c.collapsible||c.kind==='member');
  const defaultBlue=DEFAULT_DESIGN_COL_NAMES.map(name=>({name,key:name,kind:'member',collapsible:true}));
  const blue=Array.from({length:6},(_,i)=>({...defaultBlue[i],...(existingBlue[i]||{}),collapsible:true,kind:'member'}));
  const red=source.filter(c=>!c.collapsible&&c.kind!=='member');
  const oldNote=red.find(c=>c.kind==='note'||c.name==='備註');
  const legacyNumbered=red.filter(c=>c!==oldNote);
  const note={name:'備註',key:oldNote?.key||oldNote?.name||'備註',kind:'note',collapsible:false};
  const numbered=Array.from({length:20},(_,i)=>{
    const display=String(i+1);
    const exact=legacyNumbered.find(c=>c.name===display);
    const legacy=exact||legacyNumbered[i];
    return{name:display,key:legacy?.key||legacy?.name||display,kind:'text',collapsible:false};
  });
  return[...blue,note,...numbered];
}
function getDesignCols(){
  const raw=designCols||DEFAULT_DESIGN_COLS;
  return normalizeDesignCols(raw);
}

function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r}
function isSameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function fmtDate(d){return`${d.getMonth()+1}/${d.getDate()}`}
function fmtDay(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function today(){return new Date()}
function getWeekDates(){
  return getMonthDates();
}
function getMonthDates(){
  const b=today();
  const target=new Date(b.getFullYear(),b.getMonth()+monthOffset,1);
  const y=target.getFullYear(),m=target.getMonth();
  const daysInMonth=new Date(y,m+1,0).getDate();
  return Array.from({length:daysInMonth},(_,i)=>new Date(y,m,i+1));
}
function progressMonthKey(offset=monthOffset){const base=today(),target=new Date(base.getFullYear(),base.getMonth()+offset,1);return`${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}`;}
function defaultProgressScrollLeft(offset=monthOffset){return offset===0?Math.max(0,(today().getDate()-2)*180):0;}
function rememberProgressMonthScroll(){if(calMode==='month')progressMonthScrollPositions[progressMonthKey()]=captureProgressHScroll();}
function progressScrollLeftForMonth(offset=monthOffset){const saved=progressMonthScrollPositions[progressMonthKey(offset)];return Number.isFinite(saved)?saved:defaultProgressScrollLeft(offset);}

function getBibleStages(){
  if(S.bibleOrder&&S.bibleOrder.length)return[...new Set(S.bibleOrder)];
  return Object.keys(S.bible).filter(k=>k!=='orderConfig');
}
function displayStageName(stage){
  return String(stage||'').replace(/^.*?、\s*/,'').trim();
}
// 排程可能仍保存已刪除或改名前的階段鍵值。只要其顯示名稱可唯一對應
// 到現有施工寶典，就在畫面上自動接回該階段，避免失去 checklist 連結。
function resolveBibleStage(stage,label){
  if(stage&&S.bible[stage])return stage;
  const name=displayStageName(label||stage);
  if(!name)return '';
  const matches=getBibleStages().filter(candidate=>S.bible[candidate]&&displayStageName(candidate)===name);
  return matches.length===1?matches[0]:'';
}
const DEFAULT_BIBLE_PHASE_LABELS={before:'工程前',during:'工程中',after:'工程後'};
function biblePhaseLabel(stage,phase){
  const label=S.bible[stage]?.phaseLabels?.[phase];
  return String(label||'').trim()||DEFAULT_BIBLE_PHASE_LABELS[phase]||'';
}
function getBiblePhaseItems(stage,phase){const b=S.bible[stage];return(b&&b[phase])?b[phase]:[];}
// A bible item used to always be a plain string. It can now be an object
// {text, subs:[...]} so it can carry indented sub-items. This normalizes
// either shape so the rest of the code only has to handle one format.
function normalizeBibleItem(it){
  if(typeof it==='string')return{text:it,subs:[]};
  return{text:it?.text||'',subs:Array.isArray(it?.subs)?it.subs:[]};
}
function flattenPhaseItems(rawArr,depth){
  depth=depth||0;
  const flat=[];
  (rawArr||[]).forEach(it=>{
    const n=normalizeBibleItem(it);
    flat.push({text:n.text,depth:depth,isSub:depth>0});
    flat.push(...flattenPhaseItems(n.subs,depth+1));
  });
  return flat;
}
function flatPhaseCount(rawArr){return(rawArr||[]).reduce((s,it)=>s+1+flatPhaseCount(normalizeBibleItem(it).subs),0);}
// Path-based helpers so items can nest to any depth (item -> sub-item ->
// sub-sub-item ...). A path is an array of indices, e.g. [2] is the 3rd
// top-level item, [2,0] is its 1st sub-item, [2,0,1] its 2nd sub-sub-item.
function replaceAtPath(arr,path,newNode){
  const copy=[...arr];
  if(path.length===1){copy[path[0]]=newNode;return copy;}
  const cur=normalizeBibleItem(copy[path[0]]);
  copy[path[0]]={text:cur.text,subs:replaceAtPath(cur.subs,path.slice(1),newNode)};
  return copy;
}
function addChildAtPath(arr,path,text){
  const copy=[...arr];
  const cur=normalizeBibleItem(copy[path[0]]);
  if(path.length===1){
    copy[path[0]]={text:cur.text,subs:[...cur.subs,text]};
  }else{
    copy[path[0]]={text:cur.text,subs:addChildAtPath(cur.subs,path.slice(1),text)};
  }
  return copy;
}
function removeAtPath(arr,path){
  const copy=[...arr];
  if(path.length===1){copy.splice(path[0],1);return copy;}
  const cur=normalizeBibleItem(copy[path[0]]);
  copy[path[0]]={text:cur.text,subs:removeAtPath(cur.subs,path.slice(1))};
  return copy;
}
function getNodeAtPath(arr,path){
  let node=arr[path[0]];
  for(let k=1;k<path.length;k++)node=normalizeBibleItem(node).subs[path[k]];
  return node;
}
function flatIndexAtPath(data,phase,path){
  const before=data.before||[],during=data.during||[];
  let offset=0;
  if(phase!=='before')offset+=flatPhaseCount(before);
  if(phase==='after')offset+=flatPhaseCount(during);
  let arr=data[phase]||[];
  for(let level=0;level<path.length;level++){
    const idx=path[level];
    for(let i=0;i<idx;i++)offset+=1+flatPhaseCount(normalizeBibleItem(arr[i]).subs);
    if(level<path.length-1){
      offset+=1;
      arr=normalizeBibleItem(arr[idx]).subs;
    }
  }
  return offset;
}
function getAllBibleItemsMeta(stage){
  const b=S.bible[stage]||{before:[],during:[],after:[]};
  return[...flattenPhaseItems(b.before),...flattenPhaseItems(b.during),...flattenPhaseItems(b.after)];
}
function getAllBibleItems(stage){return getAllBibleItemsMeta(stage).map(x=>x.text);}
// For a completed project, use the frozen snapshot taken when it was marked
// done, so later edits to the live 施工寶典 template don't shift/relabel
// its already-checked items. Active projects always use the live template.
function projectBibleData(proj,stage){
  if(proj&&proj.status==='done'&&proj.bibleSnapshot&&proj.bibleSnapshot[stage])return proj.bibleSnapshot[stage];
  return S.bible[stage]||{before:[],during:[],after:[]};
}
function projectBibleItemsMeta(proj,stage){
  const b=projectBibleData(proj,stage);
  return[...flattenPhaseItems(b.before),...flattenPhaseItems(b.during),...flattenPhaseItems(b.after)];
}
function projectBibleItems(proj,stage){return projectBibleItemsMeta(proj,stage).map(x=>x.text);}
function pendingCount(projId,stage){
  if(!stage)return null;
  const proj=S.projects.find(p=>p.id===projId);
  const items=projectBibleItems(proj,stage);if(!items.length)return null;
  const stored=S.checks[`${projId}_${stage}`]||[];
  return items.length-items.filter((_,i)=>stored[i]?.done||stored[i]?.skip).length;
}
function pendBadge(n){
  if(n===null)return'';
  if(n===0)return`<span class="pend pend-g">✓</span>`;
  return`<span class="pend pend-r">${n}</span>`;
}
// Shared row renderer for a bible checklist item — ✓ means done, ✗ means
// "seen but not applicable to this site". Both count as resolved. Sub-items
// (item.isSub) render indented under their parent.
function renderCheckItemRow(projId,stage,idx,item,isEstimate){
  const cls=item.done?'done':(item.skip?'skip':'');
  const depth=item.depth||(item.isSub?1:0);
  const stageStarted=(S.checks[`${projId}_${stage}`]||[]).some(row=>row?.done||row?.skip);
  const showPending=stageStarted&&!item.done&&!item.skip;
  return`<div class="ws-cl-item ${cls}"${depth>0?` style="padding-left:${depth*26}px"`:''}>
    <div class="ck-btns">
      <span class="ck-pending-marker ${showPending?'show':''}" aria-hidden="true"></span>
      <button type="button" class="ck-btn ${item.done?'on-done':''}" title="完成" onclick="setCheckStatus('${projId}','${stage}',${idx},'done')">✓</button>
      <button type="button" class="ck-btn ${item.skip?'on-skip':''}" title="不適用" onclick="setCheckStatus('${projId}','${stage}',${idx},'skip')">✗</button>
    </div>
    <label>${depth>0?'└ ':''}${item.text}</label>
    ${isEstimate?`<input type="number" class="ck-amount" placeholder="金額" value="${item.amount||''}" onclick="event.stopPropagation()" onchange="setCheckAmount('${projId}','${stage}',${idx},this.value)">`:''}
  </div>`;
}
function setSynced(){
  if(localTestMode){$('sdot').style.background='var(--amber)';$('slbl').textContent='本機測試';return;}
  $('sdot').style.background='#1D9E75';$('slbl').textContent='已同步';
}
function setSyncing(){
  if(localTestMode){$('sdot').style.background='var(--amber)';$('slbl').textContent='本機測試';return;}
  $('sdot').style.background='var(--amber)';$('slbl').textContent='同步中';
}
function setOffline(){$('sdot').style.background='var(--red)';$('slbl').textContent='離線'}
