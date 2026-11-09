// Runtime-composed on the production app shell. Firebase rules also enforce access.
{
  const panelName='ai-database';
  const tab=document.createElement('button');
  tab.type='button';
  tab.className='nav-tab';
  tab.dataset.tab=panelName;
  tab.textContent='AI 資料庫';
  tab.hidden=true;
  document.querySelector('.nav-tabs .b1f-nav').before(tab);

  let controller=null,panel=null,ownerUid='',navigation=0;
  let openFromUrl=location.hash==='#ai-database';

  function canManageAi(){
    const uid=auth.currentUser?.uid;
    if(!uid||localTestMode||currentUser?.uid!==uid)return false;
    const member=S.members.find(row=>row.id===uid);
    return !!member&&['admin','manager'].includes(member.role)
      &&(member.status??'active')==='active';
  }

  function clearAiRoute(){
    if(location.hash==='#ai-database')history.replaceState(null,'',location.pathname+location.search);
  }

  function discardAi(){
    navigation++;
    controller?.dispose();
    panel?.remove();
    controller=null;
    panel=null;
    ownerUid='';
  }

  function selectTab(nextTab,nextPanel){
    document.querySelectorAll('.nav-tab,.panel').forEach(el=>el.classList.remove('active'));
    nextTab.classList.add('active');
    nextPanel.classList.add('active');
    activePanel=nextTab.dataset.tab;
    const brand=$('mobile-nav-brand');
    if(brand)brand.textContent=nextTab.textContent.trim();
    closeMobileNav();
  }

  async function openAi(){
    if(!canManageAi())return;
    openFromUrl=false;
    const request=++navigation,uid=auth.currentUser.uid;
    try{
      if(!controller){
        const [{mountAiDatabase},{createProductionStore}]=await Promise.all([
          import(new URL('app/features/ai-database/index.js',window.__APP_BASE_URL__)),
          import(new URL('app/features/ai-database/firebase-store.js',window.__APP_BASE_URL__)),
        ]);
        if(request!==navigation||!canManageAi()||auth.currentUser.uid!==uid)return;
        panel=document.createElement('div');
        panel.id='panel-ai-database';
        panel.className='panel';
        document.querySelector('main.main').append(panel);
        ownerUid=uid;
        controller=mountAiDatabase(panel,{
          canManage:()=>canManageAi()&&auth.currentUser?.uid===uid,
          user:()=>({uid,name:currentUser?.displayName||'管理員'}),
          createStore:()=>createProductionStore({db,auth,storage,...aiDatabaseSdk}),
          onDenied:()=>{tab.hidden=true;},
        });
      }
      selectTab(tab,panel);
      history.replaceState(null,'','#ai-database');
      controller.render();
    }catch(error){
      if(request!==navigation||!canManageAi())return;
      console.error('AI 資料庫入口載入失敗',error);
      alert('AI 資料庫暫時無法開啟，請稍後重試。');
    }
  }

  const renderBeforeAi=renderActive;
  renderActive=function(){
    const allowed=canManageAi();
    if(controller&&(!allowed||ownerUid!==auth.currentUser?.uid)){
      discardAi();
      if(activePanel===panelName){
        clearAiRoute();
        selectTab(document.querySelector('.nav-tab[data-tab="home"]'),$('panel-home'));
      }
    }
    tab.hidden=!allowed||!!(controller&&!controller.canDisplay());
    if(activePanel===panelName)return;
    if(openFromUrl&&allowed)void openAi();
    renderBeforeAi();
  };

  onAuthStateChanged(auth,user=>{
    if(controller&&user?.uid!==ownerUid)renderActive();
  });
  tab.addEventListener('click',()=>{void openAi();});
  document.querySelectorAll('.nav-tab').forEach(node=>{
    if(node===tab)return;
    node.addEventListener('click',event=>{
      if(activePanel===panelName&&controller&&!controller.leave()){
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      openFromUrl=false;
      navigation++;
      clearAiRoute();
    },true);
  });
}
