// Runtime-composed source module. Keep declarations in shared application scope.
// ── Company home / modular grid ──
const HOME_MODULE_LIBRARY=[
  {type:'announcements',title:'公司公告',min:null,max:null},
  {type:'message-board',title:'留言板',min:null,max:null},
  {type:'recommendations',title:'推薦分享',min:null,max:null},
  {type:'growth-list',title:'計畫性成長清單',min:{w:3,h:2},max:null},
  {type:'company-duty',title:'公司值日／掃地',min:null,max:null},
  {type:'today-news',title:'有隅特報',min:{w:3,h:3},max:null},
  {type:'daily-quiz',title:'每日猜題',min:null,max:null},
  {type:'daily-joke',title:'每日笑話',min:null,max:null},
  {type:'daily-nonsense',title:'每日一句廢話',min:null,max:null}
];
const MEETING_COLOR_ROWS=[
  ['#000000','#434343','#666666','#999999','#b7b7b7','#cccccc','#d9d9d9','#efefef','#f3f3f3','#ffffff'],
  ['#980000','#ff0000','#ff9900','#ffff00','#00ff00','#00ffff','#4a86e8','#0000ff','#9900ff','#ff00ff'],
  ['#e6b8af','#f4cccc','#fce5cd','#fff2cc','#d9ead3','#d0e0e3','#c9daf8','#cfe2f3','#d9d2e9','#ead1dc'],
  ['#dd7e6b','#ea9999','#f9cb9c','#ffe599','#b6d7a8','#a2c4c9','#a4c2f4','#9fc5e8','#b4a7d6','#d5a6bd'],
  ['#cc4125','#e06666','#f6b26b','#ffd966','#93c47d','#76a5af','#6d9eeb','#6fa8dc','#8e7cc3','#c27ba0'],
  ['#a61c00','#cc0000','#e69138','#f1c232','#6aa84f','#45818e','#3c78d8','#3d85c6','#674ea7','#a64d79'],
  ['#85200c','#990000','#b45f06','#bf9000','#38761d','#134f5c','#1155cc','#0b5394','#351c75','#741b47'],
  ['#5b0f00','#660000','#783f04','#7f6000','#274e13','#0c343d','#1c4587','#073763','#20124d','#4c1130']
];
const MEETING_STANDARD_COLORS=['#000000','#ffffff','#4a86e8','#e24b4a','#ef9f27','#f1c232','#1d9e75','#00a2ae'];
const HOME_INITIAL_MODULE_TYPES=HOME_MODULE_LIBRARY.map(x=>x.type);
const HOME_COLS=20;
let companyHomeLayout={version:1,modules:[]};
let personalHomeLayout=null;
let homeLayoutMode='personal';
let homeEditMode=false;
let homePointerState=null;
let homeGridObserver=null;
let homeRenderedModules=[];
let todayJoke=null,jokeVotes=[],customJokes=[],builtinJokes=[],jokeLibraryPromise=null,jokeDailyUnsub=null,jokeDocUnsub=null,jokeVotesUnsub=null,jokeCustomUnsub=null,jokeLoading=false;
let todayQuiz=null,quizAnswers=[],quizMonthAnswers=[],quizUserAnswers=[],quizSelected='',quizDailyUnsub=null,quizDocUnsub=null,quizAnswersUnsub=null,quizMonthUnsub=null,quizUserUnsub=null,quizLoading=false,localQuizRotation={order:[],cursor:0,lastQuizId:'',round:0};
let todayWaste=null,wasteQuotes=[],wasteReactions=[],wasteFavorite=false,wasteLoading=false,wasteDailyUnsub=null,wasteQuotesUnsub=null,wasteReactionsUnsub=null,wasteFavoriteUnsub=null,localWasteRotation={round:0,usedIds:[],remainingIds:[],lastQuoteId:''};
let todayNews=null,todayNewsLoading=false,todayNewsSlide=0;
let companyDutyConfig={groups:[],memberOrder:[],anchorMonth:''},companyDutyDraft=null;
const LOCAL_QUIZ_FALLBACKS=[
  {question:'下列哪一個是太陽系中體積最大的行星？',options:{A:'地球',B:'木星',C:'火星',D:'金星'},answer:'B',analytic:'木星是太陽系中體積與質量最大的行星。'},
  {question:'人體中面積最大的器官是？',options:{A:'心臟',B:'肝臟',C:'皮膚',D:'肺'},answer:'C',analytic:'皮膚覆蓋全身，是人體面積最大的器官。'},
  {question:'一公升的水大約等於多少公斤？',options:{A:'0.1 公斤',B:'0.5 公斤',C:'1 公斤',D:'10 公斤'},answer:'C',analytic:'在常溫下，一公升水的重量約為一公斤。'}
];
const LOCAL_QUIZ_BANK=LOCAL_QUIZ_FALLBACKS.map((q,i)=>({id:'local-quiz-'+(i+1),...q,category:'一般常識',difficulty:'easy',source:'local-test',sourceId:'local-'+(i+1),enabled:true}));
const LOCAL_JOKE_FALLBACKS=[
  {title:'會議準時開始',content:'主管問：「為什麼今天大家都準時？」同事回答：「因為行事曆把會議寫成『準時下班說明會』。」'},
  {title:'設計師的浪漫',content:'客戶問設計師：「這盞燈有什麼特色？」設計師說：「關掉之後，電費特別浪漫。」'},
  {title:'工地冷知識',content:'師傅說今天一定能完工。大家聽完都笑了，因為今天是星期五。'}
];
function homeClone(v){return JSON.parse(JSON.stringify(v));}
function homeModuleDefinition(type){return HOME_MODULE_LIBRARY.find(x=>x.type===type);}
function homeDefaultSize(){return{w:3,h:2};}
function homeConstrainModuleSize(type,w,h,maxWidth=HOME_COLS){const def=homeModuleDefinition(type),min=def?.min||{w:1,h:1},max=def?.max||{w:HOME_COLS,h:99};w=Math.max(min.w,Math.min(max.w,maxWidth,w));h=Math.max(min.h,Math.min(max.h,h));if(type==='today-news'){w=Math.max(3,w);h=Math.max(3,h);if(w>h+1)w=h+1;if(h>w+1)h=w+1;w=Math.min(w,maxWidth);if(h>w+1)h=w+1;}return{w,h};}
function normalizeHomeModule(raw,index){
  const def=homeModuleDefinition(raw.type);if(!def)return null;
  const size=homeDefaultSize(),x=Math.max(0,Math.min(HOME_COLS-1,Number(raw.x)||0)),rect=homeConstrainModuleSize(raw.type,Number(raw.w)||size.w,Number(raw.h)||size.h,HOME_COLS-x);
  return{id:String(raw.id||`${raw.type}-${Date.now()}-${index}`),type:raw.type,x,y:Math.max(0,Number(raw.y)||0),w:rect.w,h:rect.h,required:!!raw.required,hidden:!!raw.hidden};
}
function normalizeHomeLayout(raw){const modules=(Array.isArray(raw?.modules)?raw.modules:[]).map(normalizeHomeModule).filter(Boolean);let growth=modules.find(m=>m.type==='growth-list');if(!growth){const size={w:6,h:3};growth=homeFindSpace({id:'company-growth-list',type:'growth-list',x:0,y:0,...size,required:true,hidden:false},modules,0);modules.push(growth);}growth.required=true;growth.hidden=false;return{version:2,modules};}
function initialCompanyHomeLayout(){
  const modules=[];HOME_INITIAL_MODULE_TYPES.forEach((type,index)=>{const size=homeDefaultSize(),fresh=homeFindSpace({id:`company-${type}`,type,x:0,y:0,w:size.w,h:size.h,required:false,hidden:false},modules,0);modules.push(fresh);});return{version:2,modules};
}
function enabledCompanyModules(){return companyHomeLayout.modules.filter(m=>homeModuleDefinition(m.type));}
function syncPersonalHomeLayout(raw){
  const source=normalizeHomeLayout(raw),enabled=enabledCompanyModules(),enabledTypes=new Set(enabled.map(m=>m.type));
  source.modules=source.modules.filter(m=>enabledTypes.has(m.type));
  enabled.forEach(companyModule=>{let personal=source.modules.find(m=>m.type===companyModule.type);if(personal){personal.required=!!companyModule.required;personal.hidden=personal.required?false:!!personal.hidden;}else{const size=homeDefaultSize(),fresh=homeFindSpace({id:`personal-${companyModule.type}-${Date.now()}`,type:companyModule.type,x:companyModule.x,y:companyModule.y,w:companyModule.w||size.w,h:companyModule.h||size.h,required:!!companyModule.required,hidden:false},source.modules,companyModule.y);source.modules.push(fresh);}});
  source.modules=homePack(source.modules);return source;
}
function activeHomeLayout(){
  if(homeLayoutMode==='company'&&isAdmin())return companyHomeLayout;
  if(!personalHomeLayout)personalHomeLayout=syncPersonalHomeLayout(null);
  return personalHomeLayout;
}
function homeSizeTier(m){const area=m.w*m.h;return area<=6?'small':area<=15?'medium':'large';}
function homeCellsOverlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function homeCanPlace(item,placed){return item.x>=0&&item.x+item.w<=HOME_COLS&&item.y>=0&&!placed.some(other=>homeCellsOverlap(item,other));}
function homeFindSpace(item,placed,startY){
  for(let y=Math.max(0,startY||0);y<200;y++)for(let x=0;x<=HOME_COLS-item.w;x++){const candidate={...item,x,y};if(homeCanPlace(candidate,placed))return candidate;}
  return{...item,x:0,y:0};
}
function homeReflow(modules,targetId,targetRect){
  const target=modules.find(m=>m.id===targetId);if(!target)return modules;
  const first={...target,...targetRect,x:Math.max(0,Math.min(HOME_COLS-targetRect.w,targetRect.x)),y:Math.max(0,targetRect.y)};
  const placed=[first];
  modules.filter(m=>m.id!==targetId).sort((a,b)=>a.y-b.y||a.x-b.x).forEach(m=>{placed.push(homeCanPlace(m,placed)?{...m}:homeFindSpace(m,placed,m.y));});
  return placed;
}
function homePack(modules){
  const placed=[];modules.slice().sort((a,b)=>a.y-b.y||a.x-b.x).forEach(m=>placed.push(homeCanPlace(m,placed)?{...m}:homeFindSpace(m,placed,0)));return placed;
}
function homeGridMetrics(){const grid=$('home-grid');if(!grid)return{unit:80,gap:8};const width=grid.clientWidth;return{unit:width/HOME_COLS,gap:8};}
function stableHomeMembers(){const roleOrder={admin:0,staff:1};return activeMembersList().filter(m=>m.role!=='manager').sort((a,b)=>(roleOrder[a.role]??2)-(roleOrder[b.role]??2));}
function homeStickyColumns(module){return Math.max(1,Math.round((Number(module.w)||3)/3));}
function homeDisplayModules(){return homePack(activeHomeLayout().modules.map(m=>({...m,hidden:false})));}
function setHomeGridMetrics(){const wrap=$('home-grid-wrap'),grid=$('home-grid');if(!wrap||!grid)return;const unit=homeGridMetrics().unit;wrap.style.setProperty('--home-unit',unit+'px');homeRenderedModules=homeDisplayModules();const rows=Math.max(18,...homeRenderedModules.map(m=>m.y+m.h));grid.style.height=Math.ceil(rows*unit)+'px';homeRenderedModules.forEach(m=>{const el=grid.querySelector(`[data-home-id="${m.id}"]`);if(el)el.setAttribute('style',homeModuleStyle(m));});}
function homeModuleStyle(m){const unit=homeGridMetrics().unit,modules=homeRenderedModules.length?homeRenderedModules:[m],minX=Math.min(...modules.map(x=>x.x)),maxX=Math.max(...modules.map(x=>x.x+x.w)),offset=homeEditMode?0:Math.max(0,(HOME_COLS-(maxX-minX))/2-minX),sticky=m.type==='message-board'?`;--sticky-columns:${homeStickyColumns(m)}`:'';return`left:${(m.x+offset)*unit+4}px;top:${m.y*unit+4}px;width:${m.w*unit-8}px;height:${m.h*unit-8}px${sticky}`;}
function renderHome(){
  const el=$('panel-home');if(!el)return;
  const scrollX=window.scrollX,scrollY=window.scrollY;
  if(homeLayoutMode==='company'&&!isAdmin())homeLayoutMode='personal';
  const layout=activeHomeLayout(),canManageGlobal=isSystemAdmin();
  const visible=homeDisplayModules();homeRenderedModules=visible;
  el.innerHTML=`<div class="home-shell">
    <div class="home-head"><div class="home-heading"><div><h1>我的首頁</h1><p>模塊化公司首頁</p></div></div>
      <div class="home-actions">
        ${homeEditMode?`<button class="btn btn-p btn-sm" onclick="finishHomeEdit()">完成編輯</button>`:`<button class="btn btn-sm" onclick="startHomeEdit()">自訂首頁</button>`}
      </div>
    </div>
    <div class="home-grid-wrap ${homeEditMode?'editing':''}" id="home-grid-wrap"><div class="home-grid" id="home-grid">
      ${visible.length?visible.map(m=>renderHomeModule(m,canManageGlobal)).join(''):`<div class="home-empty">目前尚未建立首頁模塊</div>`}
    </div></div>
  </div>`;
  requestAnimationFrame(()=>{setHomeGridMetrics();if(homeGridObserver)homeGridObserver.disconnect();homeGridObserver=new ResizeObserver(setHomeGridMetrics);const grid=$('home-grid');if(grid)homeGridObserver.observe(grid);window.scrollTo(scrollX,scrollY);});
}
function renderHomeModule(m,canManageGlobal){
  const def=homeModuleDefinition(m.type),tier=m.displayTier||homeSizeTier(m);
  return`<section class="home-module" data-home-id="${m.id}" data-home-type="${m.type}" data-size-tier="${tier}" style="${homeModuleStyle(m)}" onpointerdown="homeModulePointerDown(event,'${m.id}')">
    ${m.type==='announcements'?'':`<div class="home-module-head"><span class="home-module-title">${def.title}</span><span class="home-module-badges"><span class="home-module-badge">${tier==='small'?'小':tier==='medium'?'中':'大'}</span></span></div>`}
    <div class="home-module-body">${m.type==='announcements'?renderAnnouncementsModule(tier):m.type==='message-board'?renderStickyWallModule(tier):m.type==='recommendations'?renderRecommendationModule(tier):m.type==='growth-list'?renderGrowthModule(tier):m.type==='company-duty'?renderCompanyDutyModule(tier):m.type==='today-news'?renderTodayNewsModule(tier,m):m.type==='daily-joke'?renderDailyJokeModule(tier):m.type==='daily-quiz'?renderDailyQuizModule(tier):m.type==='daily-nonsense'?renderDailyWasteModule(tier):'<div class="home-placeholder">Placeholder</div>'}</div><div class="home-resize-handle" data-resize="true" onpointerdown="homeResizePointerDown(event,'${m.id}')"></div>
  </section>`;
}
window.switchHomeLayout=function(mode){if(homeEditMode)return;homeLayoutMode=mode==='company'&&isAdmin()?'company':'personal';renderHome();}
window.startHomeEdit=function(){homeEditMode=true;renderHome();}
window.finishHomeEdit=async function(){homeEditMode=false;await saveHomeLayout();renderHome();}
window.toggleHomeRequired=async function(type){if(!isSystemAdmin())return;const m=companyHomeLayout.modules.find(x=>x.type===type);if(m){m.required=!m.required;personalHomeLayout=syncPersonalHomeLayout(personalHomeLayout);await saveCompanyHomeLayout();renderHome();}}
window.removeHomeModule=function(id){
  const layout=activeHomeLayout(),m=layout.modules.find(x=>x.id===id);if(!m)return;
  if(homeLayoutMode==='personal'){if(m.required)return;m.hidden=true;}else if(isAdmin())layout.modules=layout.modules.filter(x=>x.id!==id);
  renderHome();
}
window.openHomeModuleLibrary=function(){
  if(!homeEditMode)return;const layout=activeHomeLayout();
  const enabledTypes=new Set(enabledCompanyModules().map(m=>m.type));
  const rows=HOME_MODULE_LIBRARY.map(def=>{const existing=layout.modules.find(m=>m.type===def.type),companyModule=companyHomeLayout.modules.find(m=>m.type===def.type),enabled=enabledTypes.has(def.type);if(!enabled&&!isSystemAdmin())return'';if(!enabled)return`<div class="module-library-item"><div class="module-library-name">${def.title}</div><button class="btn btn-sm btn-p module-library-add" onclick="enableCompanyHomeModule('${def.type}')">新增至全公司</button></div>`;const required=!!companyModule?.required,shown=required||!existing?.hidden;return`<div class="module-library-item"><div class="module-library-name">${def.title}</div><div class="module-library-controls"><button class="module-switch ${required?'on':''} ${!isSystemAdmin()?'locked':''}" type="button" aria-label="${def.title}鎖定顯示" aria-pressed="${required}" ${!isSystemAdmin()?'disabled':''} onclick="setHomeModuleRequired('${def.type}',${!required})"></button><button class="module-switch ${shown?'on':''}" type="button" aria-label="${def.title}個人顯示" aria-pressed="${shown}" ${required?'disabled':''} onclick="setHomeModuleVisibility('${def.type}',${!shown})"></button></div></div>`;}).join('');
  $('mo-content').classList.add('module-manager-modal');$('mo-content').innerHTML=`<div class="mo-title">模塊管理</div><div class="mo-sub">「鎖定顯示」由管理員設定；「個人顯示」只影響自己的首頁。</div><div class="module-library-header"><span>模塊</span><span>鎖定顯示</span><span>個人顯示</span></div><div class="module-library">${rows}</div><div class="mo-footer"><button class="btn" onclick="closeMo()">關閉</button></div>`;$('modal').style.display='flex';
}
window.setHomeModuleVisibility=function(type,shown){const m=activeHomeLayout().modules.find(x=>x.type===type);if(m&&!m.required){m.hidden=!shown;renderHome();openHomeModuleLibrary();}}
window.setHomeModuleRequired=async function(type,required){if(!isSystemAdmin())return;const m=companyHomeLayout.modules.find(x=>x.type===type);if(m){m.required=!!required;personalHomeLayout=syncPersonalHomeLayout(personalHomeLayout);await saveCompanyHomeLayout();renderHome();openHomeModuleLibrary();}}
window.enableCompanyHomeModule=async function(type){if(!isSystemAdmin()||companyHomeLayout.modules.some(m=>m.type===type))return;const size=homeDefaultSize(),fresh=homeFindSpace({id:`company-${type}`,type,x:0,y:0,w:size.w,h:size.h,required:false,hidden:false},companyHomeLayout.modules,0);companyHomeLayout.modules.push(fresh);personalHomeLayout=syncPersonalHomeLayout(personalHomeLayout);await saveCompanyHomeLayout();closeMo();renderHome();}
window.homeModulePointerDown=function(e,id){
  if(!homeEditMode||e.button!==0||e.target.closest('button'))return;
  const layout=activeHomeLayout(),m=layout.modules.find(x=>x.id===id),el=e.currentTarget;if(!m||!el)return;
  const resizing=!!e.target.closest('[data-resize]');
  beginHomePointer(e,id,m,el,resizing);
}
window.homeResizePointerDown=function(e,id){
  if(!homeEditMode||e.button!==0)return;e.preventDefault();e.stopPropagation();
  const layout=activeHomeLayout(),m=layout.modules.find(x=>x.id===id),el=e.target.closest('.home-module');if(!m||!el)return;
  beginHomePointer(e,id,m,el,true);
}
function beginHomePointer(e,id,m,el,resizing){e.preventDefault();homePointerState={id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,original:{...m},resizing,el};el.classList.add(resizing?'resizing':'dragging');document.addEventListener('pointermove',homeModulePointerMove);document.addEventListener('pointerup',homeModulePointerUp,{once:true});document.addEventListener('pointercancel',homeModulePointerUp,{once:true});}
function homeModulePointerMove(e){
  const s=homePointerState;if(!s||e.pointerId!==s.pointerId)return;const unit=homeGridMetrics().unit,dx=Math.round((e.clientX-s.startX)/unit),dy=Math.round((e.clientY-s.startY)/unit);
  if(s.resizing){const size=homeConstrainModuleSize(s.original.type,s.original.w+dx,s.original.h+dy,HOME_COLS-s.original.x),w=size.w,h=size.h;if(s.original.type==='message-board')s.el.style.setProperty('--sticky-columns',homeStickyColumns({...s.original,w}));s.preview={...s.original,w,h};s.el.style.width=(w*unit-8)+'px';s.el.style.height=(h*unit-8)+'px';}
  else{const x=Math.max(0,Math.min(HOME_COLS-s.original.w,s.original.x+dx)),y=Math.max(0,s.original.y+dy);s.preview={...s.original,x,y};s.el.style.left=(x*unit+4)+'px';s.el.style.top=(y*unit+4)+'px';}
}
function homeModulePointerUp(e){
  const s=homePointerState;if(!s)return;s.el.classList.remove('dragging','resizing');document.removeEventListener('pointermove',homeModulePointerMove);document.removeEventListener('pointerup',homeModulePointerUp);document.removeEventListener('pointercancel',homeModulePointerUp);if(s.preview){const layout=activeHomeLayout();layout.modules=homeReflow(layout.modules,s.id,s.preview);homePointerState=null;renderHome();return;}homePointerState=null;
}
async function loadHomeLayouts(){
  try{
    if(localTestMode){const savedCompany=localStorage.getItem('companyHomeLayout'),savedPersonal=localStorage.getItem('personalHomeLayout');companyHomeLayout=savedCompany?normalizeHomeLayout(JSON.parse(savedCompany)):initialCompanyHomeLayout();personalHomeLayout=syncPersonalHomeLayout(savedPersonal?JSON.parse(savedPersonal):null);return;}
    const companySnap=await getDoc(doc(db,'homeLayouts','company-default'));companyHomeLayout=companySnap.exists()?normalizeHomeLayout(companySnap.data()):initialCompanyHomeLayout();
    if(currentUser){const personalSnap=await getDoc(doc(db,'homeLayouts','user-'+currentUser.uid));personalHomeLayout=syncPersonalHomeLayout(personalSnap.exists()?personalSnap.data():null);}
  }catch(error){console.error('home layout load failed',error);companyHomeLayout=normalizeHomeLayout(companyHomeLayout);}
}
async function saveCompanyHomeLayout(){try{companyHomeLayout=normalizeHomeLayout(companyHomeLayout);if(localTestMode){localStorage.setItem('companyHomeLayout',JSON.stringify(companyHomeLayout));return;}await setDoc(doc(db,'homeLayouts','company-default'),{...companyHomeLayout,ownerUid:'company',updatedAt:serverTimestamp()});}catch(error){console.error('company home layout save failed',error);alert('公司模塊設定暫時無法儲存，請稍後再試。');}}
async function saveHomeLayout(){
  const layout=normalizeHomeLayout(activeHomeLayout());if(homeLayoutMode==='company'&&isAdmin())companyHomeLayout=layout;else personalHomeLayout=layout;
  try{if(localTestMode){localStorage.setItem(homeLayoutMode==='company'?'companyHomeLayout':'personalHomeLayout',JSON.stringify(layout));return;}const id=homeLayoutMode==='company'&&isAdmin()?'company-default':'user-'+currentUser.uid;await setDoc(doc(db,'homeLayouts',id),{...layout,ownerUid:homeLayoutMode==='company'?'company':currentUser.uid,updatedAt:serverTimestamp()});}catch(error){console.error('home layout save failed',error);alert('首頁版面暫時無法儲存，請稍後再試。');}
}
