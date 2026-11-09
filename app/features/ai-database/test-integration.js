// Composed only by the unified test loader; existing roles remain authoritative.
if (window.__APP_UNIFIED_TEST__ === true) {
  const aiModule = await import(new URL('app/features/ai-database/index.js', window.__APP_BASE_URL__));
  const aiPanel = document.createElement('div');
  aiPanel.id = 'panel-ai-database'; aiPanel.className = 'panel';
  document.querySelector('main.main').append(aiPanel);
  const aiTab = document.createElement('button');
  aiTab.className = 'nav-tab admin-only'; aiTab.dataset.tab = 'ai-database'; aiTab.textContent = 'AI 資料庫';
  const b1fNavigation=document.querySelector('.nav-tabs .b1f-nav');
  if(b1fNavigation)b1fNavigation.before(aiTab);else document.querySelector('.nav-tabs').append(aiTab);
  const aiController = aiModule.mountAiDatabase(aiPanel, {
    canManage: () => !!currentUser && isAdmin(),
    user: () => ({uid:currentUser?.uid || '',name:currentUser?.displayName || '管理員'}),
    onDenied: () => {aiTab.hidden=true;aiTab.classList.remove('show');},
    onReady: () => {if(currentUser&&isAdmin()){aiTab.hidden=false;aiTab.classList.add('show');}}
  });
  const renderBeforeAi = renderActive;
  renderActive = function () {
    aiController.prepare();
    const allowed=!!currentUser&&isAdmin()&&aiController.canDisplay();
    aiTab.hidden=!allowed;aiTab.classList.toggle('show',allowed);
    if (activePanel === 'ai-database') { aiController.render(); return; }
    renderBeforeAi();
  };
  document.querySelectorAll('.nav-tab').forEach(tab=>tab.addEventListener('click',event=>{
    if(activePanel==='ai-database'&&tab!==aiTab){
      if(!aiController.leave()){event.preventDefault();event.stopImmediatePropagation();return;}
      history.replaceState(null,'','#'+tab.dataset.tab);
    }
  },true));
  aiTab.addEventListener('click', () => {
    if (!currentUser || !isAdmin() || !aiController.canDisplay()) return;
    document.querySelectorAll('.nav-tab,.panel').forEach(el => el.classList.remove('active'));
    aiTab.classList.add('active');aiPanel.classList.add('active');activePanel='ai-database';
    const brand=document.getElementById('mobile-nav-brand');if(brand)brand.textContent='AI 資料庫';
    closeMobileNav();history.replaceState(null,'','#ai-database');aiController.render();
  });
}
