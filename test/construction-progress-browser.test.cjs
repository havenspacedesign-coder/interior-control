// Use an isolated headless browser context and the real local test app.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const origin = 'http://127.0.0.1:4180';
const dates = { september: '2026-09-02', october: '2026-10-02', next: '2026-10-03', november: '2026-11-02', novemberNext: '2026-11-03' };
const stage = '測試木作';
const fixture = `
window.progressTestFixture = {
  role(role){
    currentRole=role;
    currentUser={uid:'qa-'+role,displayName:'測試 '+role};
    renderActive();
  },
  seed(role,dates,stage){
    this.role(role);
    S.members=['manager','admin','staff','supervisor'].map(role=>({uid:'qa-'+role,name:'測試 '+role,role,status:'active'}));
    S.projects=[{id:'qa-site',name:'月份驗收案件',status:'prog',createdAt:'2026-09-01',siteNote:'舊版工地備註',
      schedule:Object.entries(dates).filter(([key])=>['september','october','november'].includes(key))
        .map(([key,date])=>({date,stage,label:stage,note:'原始排程 '+key}))}];
    S.meetingLogs=Object.fromEntries(Object.entries(dates).filter(([key])=>['september','october','november'].includes(key))
      .map(([key,date])=>['meet1_'+date,{rowId:'meet1',date,items:[{text:'原始會議 '+key,mentions:[]}]}]));
    S.dailyLogs=Object.fromEntries(S.members.map(member=>[member.uid+'_'+dates.october,{uid:member.uid,date:dates.october,text:'原始施工日誌'}]));
    S.privateNotes={work:{},personal:{[dates.october]:[{text:'原始個人記事'}]}};
    S.checks={}; S.tradeCategories=[{id:'qa-trade',name:'測試工班'}];
    S.projectTradeSelections={'qa-site':{'qa-trade':{none:true}}};
    S.bibleOrder=[...Array.from({length:16},(_,i)=>'測試設計 '+i),stage];
    S.bible={[stage]:{before:['確認歷史檢核'],during:[],after:[]}};
    renderActive(); saveLocalPreviewState();
  },
  seedCompletionTypes(){
    const source=S.projects[0];
    S.projects=['月份驗收案件','結案測試乙','結案測試丙','結案測試丁'].map((name,index)=>({
      ...structuredClone(source),id:index?'qa-close-'+index:'qa-site',name,initialInspectionDate:'2026-09-15',
      stageHistory:projectStageInitial('prog','2026-09-01')
    }));
    S.projectTradeSelections=Object.fromEntries(S.projects.map(project=>[project.id,{'qa-trade':{none:true}}]));
    S.meetingLogs['meet1_2026-11-02'].items.push({text:'[proj:月份驗收案件] 十一月報告會議',mentions:[]});
    renderActive(); saveLocalPreviewState();
  },
  seedSecondScheduleProject(){
    S.projects.push({id:'qa-site-two',name:'第二個驗收案件',status:'prog',schedule:[]});
    renderActive();saveLocalPreviewState();
  },
  receiveScheduleNote(date,note){
    const project=S.projects.find(item=>item.id==='qa-site'),month=date.slice(0,7);
    const schedule=progressMonthSchedule(project,month).map(item=>item.date===date?{...item,note}:item);
    project.progressMonths={...project.progressMonths,[month]:{...project.progressMonths?.[month],schedule}};
    renderProgress();
  },
  seedDesignClosures(){
    const designProgress=Object.fromEntries(getDesignCols().filter(col=>col.collapsible).map(col=>[col.key||col.name,'已填']));
    S.projects=['未簽約驗收案','設計終止驗收案','設計完成驗收案','工程完成驗收案'].map((name,index)=>({
      id:'qa-design-'+index,name,status:'design',createdAt:'2026-10-01',designProgress,schedule:[]
    }));
    S.projectTradeSelections=Object.fromEntries(S.projects.map(project=>[project.id,{'qa-trade':{none:true}}]));
    renderActive(); saveLocalPreviewState();
  },
  seedCrossMonth({from,to,start,previous,workNote,personalNote,event,meeting}){
    S.projects[0].schedule.push(event,{...event,date:to,note:'目的日原排程',_progressItemId:'qa-existing'});
    S.privateNotes={work:{[from]:[workNote],[to]:[{text:'目的日原記事'}]},personal:{[start]:[personalNote]}};
    S.meetingLogs['meet1_'+from]={rowId:'meet1',date:from,items:[meeting]};
    S.meetingLogs['meet1_'+to]={rowId:'meet1',date:to,items:[{text:'目的日原會議',mentions:[]}]};
    S.dailyLogs['qa-staff_'+from]={uid:'qa-staff',date:from,text:'既有日誌',assigned:[{id:'meeting:meet1:0',text:meeting.text}]};
    S.dailyLogs['qa-staff_'+to]={uid:'qa-staff',date:to,text:'目的日日誌',assigned:[]};
    S.privateNotes.personal[previous]=[{text:'上個月原記事'}];
    saveLocalPreviewState();
    renderProgress(true);
  },
  scrollCrossMonth(scroller,position){
    const max=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
    syncHScrollPosition(scroller,position==='end'?max:position==='start'?0:max/2);
  },
  adjacentMonthDate(month,side){return progressAdjacentMonthDate(month,side);},
  failCrossMonthLocalSave(){
    const original=saveLocalPreviewState;
    saveLocalPreviewState=function(strict){
      if(!strict)return original(strict);
      saveLocalPreviewState=original;
      throw new Error('模擬本機無法寫入');
    };
  },
  seedCompletedFilters(){
    const closed=[['未簽約分類案',['未簽約']],['設計終止分類案',['設計終止']],['設計完成分類案',['設計完成']],
      ['工程完成分類案',['工程完成']],['缺結案類型案'],['未知結案類型案',['舊類型']],
      ['複選結案案',['舊類型','設計完成','工程完成','設計完成']]];
    S.projects.push(...closed.map(([name,completionTypes],index)=>({
      id:'qa-completion-filter-'+index,name,status:'done',...(completionTypes?{completionTypes}:{})
    })));
    renderActive(); saveLocalPreviewState();
  },
  seedDesignChecklist(stage){
    const col=getDesignCols().find(col=>!col.collapsible&&col.kind!=='note'&&col.kind!=='member');
    S.projects[0].status='design';
    S.projects[0].designProgress={[col.key||col.name]:'#'+stage};
    S.bible[stage].before=Array.from({length:24},(_,index)=>'檢核 '+(index+1));
    renderActive();saveLocalPreviewState();
  },
  delayChecklistWrites(){
    const actual=writeProgressCheckItems;
    this.checklistWrites=0;
    writeProgressCheckItems=async(...args)=>{
      this.checklistWrites++;
      const succeeded=await new Promise(resolve=>{this.releaseChecklistWrite=resolve;});
      if(!succeeded)throw new Error('模擬 Firebase 拒絕寫入');
      return actual(...args);
    };
  },
  receiveChecklistSnapshot(key,record){
    applyProgressCheckSnapshot({docChanges:()=>[{type:'modified',doc:{id:key,data:()=>record}}]});
  },
  refreshSyncIndicator(){setSynced();},
  async order(ids,month){await writeProgressOrder(ids,month);},
  async change(id,patch){
    const project=S.projects.find(item=>item.id===id);
    const history=patch.status&&patch.status!==project.status?projectStageTransition(project,patch.status):null;
    await writeProjectStageChange(project,patch,history);
  },
  seedLegacyCompletions(){
    const source=S.projects[0];
    S.projects=['河南路住宅案','舊完工驗收案乙'].map((name,index)=>({
      ...structuredClone(source),id:index?'qa-legacy-2':'local-third-project',name,status:'done',
      contractEnd:'2026-08-15',finish:'2026-08-15',initialInspectionDate:'2026-08-16',progressCompletedOn:'2026-08-17',
      schedule:[...source.schedule,{...source.schedule[0],date:'2026-01-02',note:'一月施工文字'}]
    }));
    renderActive(); saveLocalPreviewState();
  },
  read(){
    return structuredClone({project:S.projects.find(p=>p.id==='qa-site'),projects:S.projects,archivedProjects:S.progressArchivedProjects,meetings:S.meetingLogs,
      logs:S.dailyLogs,notes:S.privateNotes,checks:S.checks,checkRecords:S.progressCheckRecords});
  }
};`;

async function open(browser, role, mobile = false, viewport) {
  const context = await browser.newContext({ timezoneId: 'Asia/Taipei', viewport: viewport??(mobile ? { width: 390, height: 844 } : { width: 1440, height: 950 }) });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname !== '/app/test-bootstrap.js') return route.continue();
    const response = await route.fetch({ maxRedirects: 0 });
    await route.fulfill({ response, body: (await response.text()) + fixture });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+08:00'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : (errors.push(dialog.message()), dialog.dismiss()));
  await page.goto(origin + '/test/index.html#progress');
  await page.locator('html[data-app-ready="true"]').waitFor({ state: 'attached' });
  await page.locator('#local-test-btn').click();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('interiorFocusedTestSession')), '1');
  await goToProgress(page);
  await page.evaluate(({ role, dates, stage }) => window.progressTestFixture.seed(role, dates, stage), { role, dates, stage });
  return { page, context, errors };
}

const read = page => page.evaluate(() => window.progressTestFixture.read());
const siteRow = page => page.locator('#panel-progress tr').filter({ has: page.locator('td.site-hd', { hasText: '月份驗收案件' }) });
const meet = (page, date, row = 'meet1') => page.locator('[data-meeting-cell="' + row + '|' + date + '"]');
const work = (page, date) => siteRow(page).locator('.ev-cell').nth(Number(date.slice(-2)) - 1);
const visible = locator => locator.waitFor({ state: 'visible' });
async function goToProgress(page) {
  await visible(page.locator('#app-screen'));
  if (await page.locator('.wk-lbl').isVisible()) return;
  const menu = page.locator('#mobile-menu-toggle');
  if (await menu.isVisible()) await menu.click();
  await page.locator('[data-tab="progress"]').click();
  await visible(page.locator('.wk-lbl'));
}
async function month(page, direction, target) {
  await page.locator('.nav-btn').nth(direction === -1 ? 0 : 1).click();
  await visible(page.locator('.wk-lbl').filter({ hasText: '2026年 ' + target + '月' }));
}
async function edit(locator, text) {
  await locator.fill(text);
  await locator.evaluate(element => element.blur());
}
async function move(page, from, to, payload) {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const source = await from.elementHandle();
  await source.dispatchEvent('dragstart', { dataTransfer: transfer });
  await transfer.evaluate((data, text) => { if (!data.getData('text/plain')) data.setData('text/plain', text); }, payload);
  await to.dispatchEvent('drop', { dataTransfer: transfer });
  await source.dispatchEvent('dragend', { dataTransfer: transfer });
  await source.dispose();
  await transfer.dispose();
}
async function check(page, predicate) {
  await page.waitForFunction(predicate, undefined, { timeout: 5000 });
}
async function editMeeting(page, date, text) {
  await meet(page, date).locator('.meet-chip').dblclick();
  await edit(meet(page, date).locator('input.meet-chip'), text);
  await visible(meet(page, date).getByText(text, { exact: true }));
}
async function editSchedule(page, date, text) {
  const field = work(page, date).locator('.ev-field');
  await field.dblclick();
  await edit(field, text);
  await visible(work(page, date).getByText(text, { exact: true }));
}
async function openChecklist(page, date) {
  await work(page, date).locator('.ev-chip').click();
  await visible(page.locator('#mo-content').getByText('確認歷史檢核', { exact: true }));
}
async function closeModal(page) {
  await page.locator('#mo-content').getByRole('button', { name: '關閉', exact: true }).click();
}

async function scheduleSave(browser){
  const {page,context,errors}=await open(browser,'manager');
  try{
    await page.evaluate(()=>window.progressTestFixture.seedSecondScheduleProject());
    const another=page.locator('#panel-progress tr').filter({has:page.locator('td.site-hd',{hasText:'第二個驗收案件'})});
    const anotherCell=another.locator('.ev-cell').nth(Number(dates.november.slice(-2))-1);
    const add=async cell=>{
      await cell.locator('.add-ev-btn').click();
      await cell.locator('.stage-search-item').filter({hasText:stage}).click();
      await visible(cell.locator('.ev-chip'));
    };
    await add(work(page,dates.novemberNext));
    await add(anotherCell);
    await editSchedule(page,dates.novemberNext,'新增後修改的施工備註');
    await page.reload();
    await goToProgress(page);
    await visible(work(page,dates.novemberNext).getByText('新增後修改的施工備註',{exact:true}));
    await visible(anotherCell.locator('.ev-chip'));

    const field=work(page,dates.novemberNext).locator('.ev-field');
    await field.dblclick();
    await field.fill('舊畫面的編輯');
    await page.evaluate(date=>window.progressTestFixture.receiveScheduleNote(date,'另一帳號較新的編輯'),dates.novemberNext);
    await field.press('Enter');
    await visible(work(page,dates.novemberNext).getByText('另一帳號較新的編輯',{exact:true}));
    assert.deepEqual(errors,['工程進度已被更新，請確認最新資料後再操作。']);
    await editSchedule(page,dates.novemberNext,'讀取最新版本後重試');
    await work(page,dates.novemberNext).locator('.ev-row').hover();
    await work(page,dates.novemberNext).locator('.ev-del').click();
    await work(page,dates.novemberNext).locator('.ev-chip').waitFor({state:'hidden'});
    assert.equal(await anotherCell.locator('.ev-chip').count(),1);
    console.log('PASS browser: add on different dates/projects, edit, reload, stale edit rejection, retry and delete.');
  }finally{await context.close();}
}

async function completion(browser) {
  const { page, context, errors } = await open(browser, 'manager');
  try {
    const ids=['qa-site','qa-close-1','qa-close-2','qa-close-3'];
    const names=['月份驗收案件','結案測試乙','結案測試丙','結案測試丁'];
    const types=['未簽約','設計終止','設計完成','工程完成'];
    const roster = () => page.locator('#panel-progress td.site-hd').filter({has:page.locator('textarea')}).allTextContents();
    const status = name => page.locator('#panel-overview tr').filter({hasText:name}).locator('select.status-sel');
    await page.evaluate(async ids=>{window.progressTestFixture.seedCompletionTypes();await window.progressTestFixture.order(ids);},ids);
    assert.equal(await siteRow(page).count(),1);
    await page.locator('[data-tab="overview"]').click();
    for(const [i,name] of names.entries()){
      assert.equal(await status(name).inputValue(),'prog');
      await status(name).selectOption('done');
      await page.locator('#ct-'+i).check();
      if(i===3){
        await page.locator('#ct-insp-y').fill('2026');
        await page.locator('#ct-insp-m').fill('9');
        await page.locator('#ct-insp-d').fill('15');
      }
      await page.locator('#mo-content').getByRole('button',{name:'確定',exact:true}).click();
      await status(name).waitFor({state:'hidden'});
    }
    const closed=await read(page);
    assert.deepEqual(closed.projects.map(p=>[p.status,p.completionTypes]),types.map(type=>['done',[type]]));
    assert(closed.projects.every(p=>p.progressClosedAt.startsWith('2026-11-11')&&p.initialInspectionDate==='2026-09-15'));
    await page.reload();
    const overview=page.locator('#panel-overview');
    await page.locator('[data-tab="overview"]').click();
    await overview.locator(':scope > .stats > .stat').filter({hasText:'已完工'}).click();
    for(const [i,name] of names.entries()){
      const row=overview.getByRole('row').filter({hasText:name});
      await visible(row.getByRole('cell',{name:types[i],exact:true}));
      assert.equal(await status(name).inputValue(),'done');
    }
    assert.deepEqual((await read(page)).projects.map(p=>[p.status,p.completionTypes]),types.map(type=>['done',[type]]));
    await overview.getByRole('button',{name:/返回案件總覽/}).click();
    await page.locator('[data-tab="progress"]').click();
    await visible(siteRow(page).getByText('完工',{exact:true}));
    const november=await roster();
    assert.equal(november.length,4);
    names.forEach((name,index)=>assert.match(november[index],new RegExp(name)));
    await page.setViewportSize({width:390,height:844});
    assert.deepEqual(await roster(),november);
    await month(page,1,12);
    assert.equal((await roster()).length,0);
    await page.setViewportSize({width:1440,height:950});
    await page.clock.setFixedTime(new Date('2026-12-11T12:00:00+08:00'));
    await page.locator('[data-tab="overview"]').click();
    await page.evaluate(async ids=>{
      const fixture=window.progressTestFixture;
      await fixture.change(ids[0],{status:'prog',name:'十二月重新施工'});
      await fixture.change(ids[1],{status:'prog',name:'十二月復工乙'});
      await fixture.change(ids[3],{completionTypes:['設計完成'],initialInspectionDate:'2026-08-01'});
      await fixture.order([ids[1],ids[0],ids[2],ids[3]]);
    },ids);
    await page.locator('[data-tab="progress"]').click();
    assert.match((await roster())[0],/十二月復工乙/);
    assert.match((await roster())[1],/十二月重新施工/);
    await month(page,-1,11);
    assert.deepEqual(await roster(),november);
    await visible(work(page,dates.november).getByText('原始排程 november'));
    await visible(meet(page,dates.november).getByText('原始會議 november'));
    await edit(siteRow(page).locator('textarea'),'十一月專屬備註');
    await page.evaluate(ids=>window.progressTestFixture.order([ids[2],ids[0],ids[1],ids[3]],'2026-11'),ids);
    await visible(page.locator('#panel-progress td.site-hd').filter({has:page.locator('textarea')}).first().filter({hasText:'結案測試丙'}));
    assert.match((await roster())[0],/結案測試丙/);
    await month(page,1,12);
    assert.match((await roster())[0],/十二月復工乙/);
    assert.equal(await page.locator('#panel-progress td.site-hd').filter({hasText:'十二月重新施工'}).locator('textarea').inputValue(),'舊版工地備註');
    await page.locator('[data-tab="overview"]').click();
    await status('十二月重新施工').selectOption('done');
    await page.locator('#ct-3').check();
    await page.locator('#mo-content').getByRole('button',{name:'確定',exact:true}).click();
    await page.getByRole('button',{name:'保留紀錄',exact:true}).click();
    await status('十二月重新施工').waitFor({state:'hidden'});
    assert.match((await read(page)).project.progressClosedAt,/^2026-12-11/);
    await page.evaluate(id=>window.showSiteReport(id),ids[0]);
    await visible(page.locator('#panel-overview').getByText(/十一月報告會議/));
    await page.evaluate(()=>window.closeSiteReport());
    await page.locator('[data-tab="progress"]').click();
    assert.match((await roster()).join(' '),/十二月重新施工/);
    await page.locator('.nav-btn').nth(1).click();
    await visible(page.locator('.wk-lbl').filter({hasText:'2027年 1月'}));
    assert.doesNotMatch((await roster()).join(' '),/十二月重新施工/);
    const after=await read(page);
    assert.deepEqual(after.projects.map(p=>p.schedule),closed.projects.map(p=>p.schedule));
    assert.deepEqual(after.meetings,closed.meetings);
    assert.deepEqual(after.logs,closed.logs);
    await page.evaluate(id=>window.deleteProject(id),ids[1]);
    const archived=await read(page);
    assert.equal(archived.projects.some(project=>project.id===ids[1]),false);
    assert.deepEqual(archived.archivedProjects.find(project=>project.id===ids[1]).schedule,closed.projects[1].schedule);
    await page.reload();
    await goToProgress(page);
    await page.evaluate(()=>window.jumpToDate('2026-11-02'));
    const savedRoster=await roster();
    assert.match(savedRoster[0],/結案測試丙/);
    assert.match(savedRoster[1],/月份驗收案件/);
    assert.match(savedRoster[2],/結案測試乙/);
    assert.equal(await siteRow(page).locator('textarea').inputValue(),'十一月專屬備註');
    await visible(work(page,dates.november).getByText('原始排程 november'));
    await visible(meet(page,dates.november).getByText('原始會議 november'));
    assert.deepEqual(errors,[]);
    console.log('PASS browser: four completion types, November closure after September inspection, independent November roster and edits, December reopening, reclosure and archive, history after reload.');
  } finally { await context.close(); }
}

async function legacyCompletionDates(browser) {
  const { page, context, errors }=await open(browser,'admin');
  try {
    await page.evaluate(()=>window.progressTestFixture.seedLegacyCompletions());
    const before=await read(page);
    await month(page,1,12);
    const site=page.locator('#panel-progress td.site-hd').filter({hasText:'河南路住宅案'});
    await visible(site);
    await page.locator('[data-tab="overview"]').click();
    await page.locator('#panel-overview .stat[onclick*="toggleOverviewCompletedMode"]').click();
    await visible(page.getByRole('columnheader',{name:'設定已完工日',exact:true}));
    const row=page.getByRole('row').filter({hasText:'河南路住宅案'});
    await visible(row.getByRole('cell',{name:/未留結案紀錄/}));
    await row.getByRole('button',{name:'補登月份'}).click();
    const input=page.getByLabel('設定已完工月份',{exact:true});
    assert.equal(await input.inputValue(),'');
    await input.fill('2026-11');
    await page.getByRole('button',{name:'確認儲存'}).click();
    await visible(row.getByText('2026-11',{exact:false}));
    const after=await read(page);
    assert.deepEqual(after,{...before,projects:[{...before.projects[0],progressLegacyClosedMonth:'2026-11'},before.projects[1]]});
    await page.locator('[data-tab="progress"]').click();
    await page.evaluate(()=>window.jumpToDate('2026-11-02'));
    await visible(site.getByText('完工',{exact:true}));
    await month(page,1,12);
    assert.equal(await site.count(),0);
    await page.locator('.nav-btn').nth(1).click();
    await visible(page.locator('.wk-lbl').filter({hasText:'2027年 1月'}));
    assert.equal(await site.count(),0);
    await page.reload();
    await goToProgress(page);
    for(const [day,note] of [['2026-01-02','一月施工文字'],[dates.october,'原始排程 october'],[dates.november,'原始排程 november']]){
      await page.evaluate(day=>window.jumpToDate(day),day);
      await visible(site);
      assert.equal(await site.locator('textarea').inputValue(),'舊版工地備註');
      await visible(site.locator('..').getByText(note,{exact:true}));
    }
    assert.deepEqual(errors,[]);
    console.log('PASS browser: 河南路住宅案 legacy month backfill; 11/2026 visible, 12/2026 and 01/2027 hidden; January, October and November history retained after reload.');
  } finally { await context.close(); }
}

async function designOnlyCompletion(browser) {
  const { page, context, errors }=await open(browser,'manager');
  try {
    const names=['未簽約驗收案','設計終止驗收案','設計完成驗收案','工程完成驗收案'];
    const types=['未簽約','設計終止','設計完成','工程完成'];
    const site=name=>page.locator('#panel-progress td.site-hd').filter({hasText:name});
    const status=name=>page.locator('#panel-overview tr').filter({hasText:name}).locator('select.status-sel');
    await page.evaluate(()=>window.progressTestFixture.seedDesignClosures());
    for(const name of names)assert.equal(await site(name).count(),0);
    await page.locator('[data-tab="overview"]').click();
    for(const [i,name] of names.slice(0,3).entries()){
      await status(name).selectOption('done');
      await page.locator('#ct-'+i).check();
      await page.locator('#mo-content').getByRole('button',{name:'確定',exact:true}).click();
      await status(name).waitFor({state:'hidden'});
    }
    await status(names[3]).selectOption('prog');
    await check(page,()=>window.progressTestFixture.read().projects.find(p=>p.id==='qa-design-3').status==='prog');
    await page.locator('[data-tab="progress"]').click();
    await visible(site(names[3]));
    for(const name of names.slice(0,3))assert.equal(await site(name).count(),0);
    await page.locator('[data-tab="overview"]').click();
    await status(names[3]).selectOption('done');
    await page.locator('#ct-3').check();
    await page.locator('#ct-insp-y').fill('2026');
    await page.locator('#ct-insp-m').fill('11');
    await page.locator('#ct-insp-d').fill('10');
    await page.locator('#mo-content').getByRole('button',{name:'確定',exact:true}).click();
    await status(names[3]).waitFor({state:'hidden'});
    assert.deepEqual((await read(page)).projects.map(p=>[p.status,p.completionTypes[0]]),types.map(type=>['done',type]));
    await page.locator('[data-tab="progress"]').click();
    await visible(site(names[3]).getByText('完工',{exact:true}));
    await page.setViewportSize({width:390,height:844});
    for(const name of names.slice(0,3))assert.equal(await site(name).count(),0);
    await visible(site(names[3]));
    await month(page,1,12);
    for(const name of names)assert.equal(await site(name).count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS browser: design-only closures never enter the construction roster; same-month entry and construction completion retain the row until next month.');
  } finally { await context.close(); }
}

async function completedFilters(browser) {
  const { page, context, errors }=await open(browser,'manager');
  try {
    const panel=page.locator('#panel-overview');
    const filters=panel.getByRole('group',{name:'已完工結案類型'});
    const mainCards=panel.locator(':scope > .stats > .stat');
    const completed=mainCards.filter({hasText:'已完工'});
    const all=filters.getByRole('button',{name:'全部',exact:true});
    const category=type=>filters.locator(`[data-completion-filter="${type}"]`);
    const names=()=>panel.locator('tbody tr td strong').allTextContents().then(rows=>rows.sort());
    const entries=[['未簽約',['未簽約分類案']],['設計終止',['設計終止分類案']],
      ['設計完成',['設計完成分類案','複選結案案']],['工程完成',['工程完成分類案']]];
    const allNames=[...entries.flatMap(([,rows])=>rows),'缺結案類型案','未知結案類型案'].sort();
    await page.evaluate(()=>window.progressTestFixture.seedCompletedFilters());
    const before=await read(page);
    await page.locator('[data-tab="overview"]').click();
    assert.equal(await mainCards.count(),5);
    assert.equal(await filters.count(),0);
    await completed.click();
    assert.equal(await completed.locator('.stat-n').textContent(),String(allNames.length));
    assert.equal(await filters.locator('button.stat').count(),4);
    assert.equal(await all.getAttribute('aria-pressed'),'true');
    assert.deepEqual(await names(),allNames);
    assert.equal(await panel.getByRole('cell',{name:'未分類',exact:true}).count(),2);
    const unclassified=await filters.locator('.overview-completion-unclassified').textContent();
    assert.equal(unclassified,'未分類 2 件');
    let counts=2;
    for(const [type,rows] of entries){
      const button=category(type);
      const count=Number(await button.locator('.stat-n').textContent());
      counts+=count;
      assert.equal(count,rows.length);
      await button.click();
      assert.equal(await button.getAttribute('aria-pressed'),'true');
      assert.deepEqual(await names(),rows.slice().sort());
      await button.click();
      assert.equal(await all.getAttribute('aria-pressed'),'true');
      assert.deepEqual(await names(),allNames);
    }
    assert.equal(counts,Number(await completed.locator('.stat-n').textContent()));
    await category('工程完成').click();
    await all.click();
    assert.deepEqual(await names(),allNames);
    await category('工程完成').click();
    await mainCards.filter({hasText:'施工中'}).click();
    assert.equal(await filters.count(),0);
    assert.deepEqual(await names(),['月份驗收案件']);
    await completed.click();
    assert.deepEqual(await names(),allNames);
    assert.deepEqual(await read(page),before);

    await category('工程完成').click();
    await panel.getByText('工程完成分類案',{exact:true}).click();
    await visible(panel.getByText('工程完成分類案 — 工地總報告表',{exact:true}));
    await panel.getByRole('button',{name:'← 返回案件總覽',exact:true}).click();
    assert.deepEqual(await names(),['工程完成分類案']);
    await panel.getByRole('button',{name:'編輯',exact:true}).click();
    await panel.getByRole('row').filter({hasText:'工程完成分類案'}).getByRole('button',{name:'編輯',exact:true}).click();
    await page.locator('#np-name').fill('已編輯的工程完成案');
    await page.locator('#np-save-btn').click();
    await visible(panel.getByText('已編輯的工程完成案',{exact:true}));
    assert.equal(await category('工程完成').getAttribute('aria-pressed'),'true');
    assert.deepEqual((await read(page)).projects.find(project=>project.name==='已編輯的工程完成案').completionTypes,['工程完成']);

    await page.setViewportSize({width:390,height:844});
    const cards=filters.locator('button.stat');
    const layout=await cards.evaluateAll(buttons=>buttons.map(button=>({
      top:Math.round(button.getBoundingClientRect().top),right:button.getBoundingClientRect().right
    })));
    assert(new Set(layout.map(card=>card.top)).size>1);
    assert(layout.every(card=>card.right<=390));
    await category('設計完成').click();
    assert.deepEqual(await names(),['複選結案案','設計完成分類案'].sort());
    await all.click();
    assert.equal((await names()).length,allNames.length);
    assert.deepEqual(errors,[]);
    console.log('PASS browser: four completed categories and total reconciliation, unclassified and multiple types, toggling, reporting, editing, and mobile wrapping.');
  } finally { await context.close(); }
}

async function createAndCloseUnsignedProject(browser) {
  const { page, context, errors }=await open(browser,'manager');
  try {
    const name='新增未簽約驗收案';
    const panel=page.locator('#panel-overview');
    const done=panel.locator(':scope > .stats > .stat').filter({hasText:'已完工'});
    const filters=panel.getByRole('group',{name:'已完工結案類型'});
    const unsigned=filters.locator('[data-completion-filter="未簽約"]');
    const projectRow=panel.getByRole('row').filter({hasText:name});
    await page.locator('[data-tab="overview"]').click();
    await done.click();
    assert.equal(await filters.locator('button.stat').count(),4);
    assert.deepEqual(await filters.locator('button.stat .stat-n').allTextContents(),['0','0','0','0']);
    await unsigned.click();
    await visible(panel.getByText('尚無案件',{exact:true}));
    await done.click();

    await panel.getByRole('button',{name:/新增案件/}).click();
    await page.locator('#np-name').fill(name);
    await page.locator('#np-type-kind').selectOption('預售屋');
    await page.locator('#np-type-building').selectOption('公寓');
    await page.locator('#np-status').selectOption('contact');
    await page.locator('#np-save-btn').click();
    await visible(projectRow);

    await page.locator('[data-tab="design"]').click();
    await page.locator('#design-table th[title="顯示/隱藏會議人員等欄位"]').click();
    const designRow=page.locator('#design-table tbody tr').filter({hasText:name});
    const memberCells=designRow.locator('td').filter({has:page.locator('.task-tag-btn')});
    assert.equal(await memberCells.count(),6);
    for(let index=0;index<6;index++){
      const cell=memberCells.nth(index);
      await cell.locator('.task-tag-btn').hover();
      await cell.getByRole('checkbox',{name:'測試 staff',exact:true}).check();
    }

    await page.locator('[data-tab="overview"]').click();
    await projectRow.locator('select.status-sel').selectOption('done');
    const modal=page.locator('#mo-content');
    await modal.getByLabel('未簽約',{exact:true}).check();
    await modal.getByRole('button',{name:'確定',exact:true}).click();
    await projectRow.waitFor({state:'hidden'});
    await done.click();
    assert.deepEqual(await filters.locator('button.stat .stat-n').allTextContents(),['1','0','0','0']);
    await unsigned.click();
    await visible(projectRow.getByRole('cell',{name:'未簽約',exact:true}));
    assert.deepEqual(await panel.locator('tbody td strong').allTextContents(),[name]);
    const saved=(await read(page)).projects.find(project=>project.name===name);
    assert.equal(saved.status,'done');
    assert.deepEqual(saved.completionTypes,['未簽約']);

    await page.reload();
    await page.locator('[data-tab="overview"]').click();
    await done.click();
    await unsigned.click();
    await visible(projectRow.getByRole('cell',{name:'未簽約',exact:true}));
    assert.deepEqual((await read(page)).projects.find(project=>project.id===saved.id).completionTypes,['未簽約']);
    assert.deepEqual(errors,[]);
    console.log('PASS browser: zero-count cards, create project via form, meet existing design prerequisites, close as unsigned, filter and reload.');
  } finally { await context.close(); }
}

async function employee(browser, role, mobile) {
  const { page, context, errors } = await open(browser, role, mobile);
  try {
    await editMeeting(page, dates.november, '當月可修改會議');
    await editSchedule(page, dates.november, '當月可修改排程');
    await move(page, work(page, dates.november).locator('.ev-chip'), work(page, dates.novemberNext), 'ev|qa-site|' + dates.november + '|0');
    await visible(work(page, dates.novemberNext).getByText('當月可修改排程'));
    await work(page, dates.november).locator('.add-ev-btn').dispatchEvent('click');
    await page.locator('.stage-search-item').filter({ hasText: stage }).dispatchEvent('click');
    await visible(work(page, dates.november).locator('.ev-chip'));
    await work(page, dates.november).locator('.ev-del').dispatchEvent('click');
    await work(page, dates.november).locator('.ev-chip').waitFor({ state: 'hidden' });
    await month(page, -1, 10);
    const historical = await read(page);
    await visible(page.getByText('歷史月份唯讀', { exact: true }));
    await visible(meet(page, dates.october).getByText('原始會議 october'));
    await visible(work(page, dates.october).getByText('原始排程 october'));
    assert.equal(await meet(page, dates.october).locator('[draggable], [ondblclick], input').count(), 0);
    assert.equal(await work(page, dates.october).locator('[draggable], .add-ev-btn, .ev-del').count(), 0);
    assert.equal(await siteRow(page).locator('textarea[readonly]').count(), 1);
    await page.evaluate(async ({ dates, stage }) => {
      const drop = text => {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        return new DragEvent('drop', { dataTransfer });
      };
      await window.mAdd('meet2', dates.october);
      await window.mSetCellText('meet1', dates.october, '被擋下');
      await window.mDelete('meet1', dates.october, 0);
      await window.mDrop(drop('meet|meet1|' + dates.october + '|0'), 'meet2', dates.november);
      await window.addEvFromStage('qa-site', dates.october, stage);
      await window.scheduleToggleStrike('qa-site', dates.october, 0);
      await window.removeEv('qa-site', dates.october, 0);
      await window.evDrop(drop('ev|qa-site|' + dates.october + '|0'), 'qa-site', dates.november);
      await window.saveProgressSiteNote('qa-site', '2026-10', '被擋下');
    }, { dates, stage });
    assert.deepEqual(await read(page), historical);
    await openChecklist(page, dates.october);
    assert.equal(await page.locator('#mo-content .ck-btn:disabled').count(), 2);
    await closeModal(page);
    const ownLog = page.locator('textarea.log-textarea[onblur*="qa-' + role + '"][onblur*="' + dates.october + '"]');
    assert.equal(await ownLog.count(), 1, role + ' should have an editable historical daily log');
    await edit(ownLog, '自己的歷史日誌已更新');
    assert.equal((await read(page)).logs['qa-' + role + '_' + dates.october].text, '自己的歷史日誌已更新');
    const privateCell = page.locator('[data-pn-cell="personal|' + dates.october + '"]');
    await privateCell.getByText('原始個人記事').dblclick();
    const note = privateCell.locator('input');
    await visible(privateCell.locator('input:focus'));
    await note.fill('自己的歷史記事已更新');
    await note.press('Enter');
    await visible(privateCell.getByText('自己的歷史記事已更新', { exact: true }));
    await month(page, -1, 9);
    await visible(work(page, dates.september).getByText('原始排程 september'));
    await visible(page.getByText('歷史月份唯讀', { exact: true }));
    await page.reload();
    await page.locator('html[data-app-ready="true"]').waitFor({ state: 'attached' });
    await goToProgress(page);
    await page.evaluate(role => window.progressTestFixture.role(role), role);
    const saved = await read(page);
    assert.equal(saved.logs['qa-' + role + '_' + dates.october].text, '自己的歷史日誌已更新');
    assert.equal(saved.notes.personal[dates.october][0].text, '自己的歷史記事已更新');
    assert.deepEqual(errors, []);
    console.log('PASS browser: ' + role + (mobile ? ' mobile' : ' desktop') + ', current editing, historical protections, own historical logs and notes.');
  } finally { await context.close(); }
}

async function administrator(browser) {
  const { page, context, errors } = await open(browser, 'admin');
  try {
    const before = await read(page);
    await month(page, -1, 10);
    await editMeeting(page, dates.october, '管理員歷史會議');
    await move(page, meet(page, dates.october).locator('.meet-chip'), meet(page, dates.next), 'meet|meet1|' + dates.october + '|0');
    await visible(meet(page, dates.next).getByText('管理員歷史會議'));
    await editMeeting(page, dates.october, '管理員新增歷史會議');
    const chip = meet(page, dates.october).getByText('管理員新增歷史會議');
    await chip.click();
    await page.keyboard.press('Delete');
    await chip.waitFor({ state: 'hidden' });
    await editSchedule(page, dates.october, '管理員歷史排程');
    await openChecklist(page, dates.october);
    await page.locator('#mo-content .ck-btn[title="完成"]').click();
    await check(page, () => window.progressTestFixture.read().checkRecords['qa-site_測試木作']?.progressCheckEdits['2026-10']?.[0]?.done);
    await closeModal(page);
    const undo=page.locator('#panel-progress .progress-undo-button');
    assert.match(await undo.getAttribute('title'),/修改工程檢核狀態/);
    await undo.click();
    await check(page,()=>window.progressTestFixture.read().checkRecords['qa-site_測試木作']?.progressCheckEdits['2026-10']?.length===0);
    assert.equal(await work(page,dates.october).locator('[data-check-badge]').textContent(),'1');
    await work(page, dates.next).locator('.add-ev-btn').click();
    await page.locator('.stage-search-item').filter({ hasText: stage }).click();
    await visible(work(page, dates.next).locator('.ev-chip'));
    await work(page, dates.next).locator('.ev-del').dispatchEvent('click');
    await work(page, dates.next).locator('.ev-chip').waitFor({ state: 'hidden' });
    await edit(siteRow(page).locator('textarea'), '只修改十月備註');
    await check(page, () => window.progressTestFixture.read().project.progressMonths['2026-10'].siteNote === '只修改十月備註');
    await month(page, -1, 9);
    await visible(meet(page, dates.september).getByText('原始會議 september'));
    await visible(work(page, dates.september).getByText('原始排程 september'));
    assert.equal(await siteRow(page).locator('textarea').inputValue(), '舊版工地備註');
    await month(page, 1, 10);
    await visible(work(page, dates.october).getByText('管理員歷史排程'));
    await month(page, 1, 11);
    await visible(meet(page, dates.november).getByText('原始會議 november'));
    await visible(work(page, dates.november).getByText('原始排程 november'));
    const after = await read(page);
    assert.deepEqual(after.project.schedule, before.project.schedule);
    assert.deepEqual(after.logs, before.logs);
    assert.deepEqual(errors, []);
    console.log('PASS browser: administrator historical create, edit, move, delete, checklist access, independent months and legacy records.');
  } finally { await context.close(); }
}

async function rapidChecklist(browser){
  const {page,context,errors}=await open(browser,'staff');
  try{
    const key='qa-site_'+stage;
    const design=page.locator('#panel-design');
    const badge=design.locator('[data-check-badge]');
    const modal=page.locator('#mo-content');
    const rows=modal.locator('[data-check-index]');
    const count=modal.locator('[data-check-count]');
    const status=modal.locator('[data-check-status]');
    const syncWarning=page.locator('#checklist-sync-warning');
    const saved=async()=>((await read(page)).checkRecords[key]?.items||[]);
    const toggle=(index,action)=>rows.nth(index).locator(`.ck-btn[title="${action}"]`);
    const release=ok=>page.evaluate(value=>window.progressTestFixture.releaseChecklistWrite(value),ok);
    const writes=n=>page.waitForFunction(value=>window.progressTestFixture.checklistWrites===value,n);
    await page.evaluate(stage=>{
      window.progressTestFixture.seedDesignChecklist(stage);
      window.progressTestFixture.delayChecklistWrites();
    },stage);
    await page.locator('[data-tab="design"]').click();
    await badge.click();
    await visible(count.getByText('0/24 完成'));
    await page.evaluate(()=>{
      const table=document.querySelector('#panel-design table');
      const first=document.querySelector('#mo-content [data-check-index]');
      window.checklistOriginalNodes={table,first};
      const buttons=[...document.querySelectorAll('#mo-content .ck-btn[title="完成"]')];
      buttons.slice(0,20).forEach(button=>button.click());
    });
    assert.equal(await status.isVisible(),false);
    assert.equal(await syncWarning.isVisible(),false);
    assert.equal(await count.textContent(),'20/24 完成');
    assert.equal(await badge.textContent(),'4');
    assert.equal(await modal.locator('.ck-pending-marker.show').count(),4);
    assert.equal((await saved()).length,0);
    await writes(1);
    await page.evaluate(key=>{
      window.progressTestFixture.receiveChecklistSnapshot(key,{items:[]});
      window.progressTestFixture.refreshSyncIndicator();
    },key);
    assert.equal(await count.textContent(),'20/24 完成');
    assert.equal(await page.locator('#slbl').textContent(),'本機測試');
    assert.equal(await status.isVisible(),false);
    assert.equal(await syncWarning.isVisible(),false);
    assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false);
    await page.evaluate(()=>{
      const row=document.querySelector('#mo-content [data-check-index="0"]');
      const skip=row.querySelector('[title="不適用"]');
      const done=row.querySelector('[title="完成"]');
      skip.click();skip.click();done.click();done.click();
    });
    assert.equal(await count.textContent(),'19/24 完成');
    assert.equal(await toggle(0,'完成').getAttribute('aria-pressed'),'false');
    assert.equal(await toggle(0,'不適用').getAttribute('aria-pressed'),'false');
    await status.getByText(/儲存等待過久/).waitFor({state:'visible',timeout:8000});
    await visible(syncWarning.getByText('寶典儲存等待過久',{exact:true}));
    assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false);
    await release(true);
    await writes(2);
    assert.equal(await count.textContent(),'19/24 完成');
    await release(true);
    await check(page,()=>window.progressTestFixture.read().checkRecords['qa-site_測試木作']?.items.filter(item=>item.done).length===19);
    assert.equal(await status.isVisible(),false);
    assert.equal(await syncWarning.isVisible(),false);
    assert.equal(await page.locator('#slbl').textContent(),'本機測試');
    assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),true);
    assert.equal((await saved()).filter(item=>item.done).length,19);
    assert.equal(await page.evaluate(()=>window.checklistOriginalNodes.table===document.querySelector('#panel-design table')&&
      window.checklistOriginalNodes.first===document.querySelector('#mo-content [data-check-index]')),true);

    await toggle(21,'不適用').click();
    await writes(3);
    await toggle(22,'完成').click();
    await release(false);
    await writes(4);
    assert.equal(await toggle(21,'不適用').getAttribute('aria-pressed'),'false');
    assert.match(await status.textContent(),/未儲存/);
    await visible(syncWarning.getByText('寶典儲存失敗',{exact:true}));
    await release(true);
    await visible(status.getByText(/儲存失敗/));
    assert.match(await rows.nth(21).getAttribute('class'),/check-save-failed/);
    assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false);
    assert.equal((await saved())[21]?.skip,undefined);
    assert.equal((await saved())[22]?.done,true);
    await toggle(21,'不適用').click();
    await writes(5);
    await release(true);
    await status.waitFor({state:'hidden'});
    assert.equal(await syncWarning.isVisible(),false);
    assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),true);
    const committed=await saved();
    assert.equal(committed[21].skip,true);
    assert.equal(await count.textContent(),'21/24 完成');
    assert.equal(await badge.textContent(),'3');
    await page.reload();
    await page.locator('[data-tab="design"]').click();
    await badge.click();
    await visible(count.getByText('21/24 完成'));
    assert.deepEqual(await saved(),committed);
    assert.equal(await toggle(21,'不適用').getAttribute('aria-pressed'),'true');
    assert.equal(await modal.locator('.ck-pending-marker.show').count(),3);
    await closeModal(page);
    await page.locator('[data-tab="bible"]').click();
    const bible=page.locator('#panel-bible');
    await bible.getByRole('button',{name:'案件勾選',exact:true}).click();
    const worksite=bible.locator('[data-check-list]');
    const worksiteToggle=worksite.locator('[data-check-index="0"] .ck-btn[title="不適用"]');
    await worksiteToggle.click();
    assert.equal(await worksiteToggle.getAttribute('aria-pressed'),'true');
    assert.equal(await worksite.locator('[data-check-status]').isVisible(),false);
    await check(page,()=>window.progressTestFixture.read().checkRecords['qa-site_測試木作']?.items[0]?.skip);
    assert.equal(await worksite.locator('[data-check-status]').isVisible(),false);
    assert.equal(await syncWarning.isVisible(),false);
    await page.locator('[data-tab="overview"]').click();
    await page.evaluate(()=>showSiteReport('qa-site'));
    const report=page.locator('#site-report-checklist');
    await visible(report.getByText('測試木作（22/24）',{exact:true}));
    await page.evaluate(key=>{
      const report=document.querySelector('#site-report-checklist');
      window.checklistReportNode=report;
      const record=window.progressTestFixture.read().checkRecords[key];
      record.items[23]={done:true};
      window.progressTestFixture.receiveChecklistSnapshot(key,record);
    },key);
    await visible(report.getByText('測試木作（23/24）',{exact:true}));
    assert.equal(await page.evaluate(()=>window.checklistReportNode===document.querySelector('#site-report-checklist')),true);
    assert.deepEqual(errors,[]);
    console.log('PASS browser: silent normal saves, slow and failed save warnings, leave guard, 20 rapid clicks, retry, badges, reload, worksite checklist.');
  }finally{await context.close();}
}

async function nativeCrossMonthDrag(browser,viewport) {
  const {page,context,errors}=await open(browser,'manager',false,viewport);
  const from='2026-11-30',to='2026-12-01',start='2026-11-01',previous='2026-10-31';
  await page.evaluate(data=>window.progressTestFixture.seedCrossMonth(data),{
    from,to,start,previous,workNote:{text:'132'},personalNote:{text:'左側驗證'},
    event:{date:from,stage,label:stage,note:'測試排程'},meeting:{text:'測試會議',mentions:[]},
  });
  try{
    const hint=page.locator('.progress-month-drag-edge');
    const notice=page.locator('.progress-month-move-notice');
    const chip=(type,date,text)=>page.locator('[data-pn-cell="'+type+'|'+date+'"] .pn-chip').filter({hasText:text});
    async function startAtMonthEnd(source,side){
      await source.evaluate(el=>el.closest('tr').scrollIntoView({block:'center',inline:'nearest'}));
      const area=await source.evaluate(el=>{
        const rect=el.closest('.hscroll-sync').getBoundingClientRect();
        return {x:(rect.left+rect.right)/2,y:Math.max(0,rect.top)+12};
      });
      await page.mouse.move(area.x,area.y);
      await page.mouse.wheel(side==='left'?-12000:12000,0);
      await page.waitForFunction(({side})=>{
        const host=document.querySelector('[data-pn-cell]').closest('.hscroll-sync');
        const bar=document.querySelector('#progress-bottom-hscroll');
        return side==='left'?host.scrollLeft<=1:host.scrollLeft>=bar.scrollWidth-bar.clientWidth-1;
      },{side});
      const point=await source.evaluate(el=>{
        const chipBox=el.getBoundingClientRect(),table=el.closest('.hscroll-sync').getBoundingClientRect();
        return {x:chipBox.left+24,y:chipBox.top+chipBox.height/2,right:table.right,left:table.left};
      });
      assert.ok(point.x>=point.left&&point.x<=point.right,JSON.stringify(point));
      await page.mouse.move(point.x,point.y);
      await page.mouse.down();
      return point;
    }
    const before=(await read(page)).notes;
    const source=chip('work',from,'132');
    let point=await startAtMonthEnd(source,'right');
    await page.mouse.move(point.right-8,point.y,{steps:18});
    await visible(hint.getByText('移至 2026/12/01，放開即可移動'));
    await page.mouse.move(point.right+6,point.y,{steps:5});
    await visible(hint.getByText('移至 2026/12/01，放開即可移動'));
    assert.deepEqual((await read(page)).notes,before);
    await page.mouse.move(point.right-65,point.y,{steps:7});
    await hint.waitFor({state:'hidden'});
    await page.mouse.up();
    assert.deepEqual((await read(page)).notes,before);
    point=await startAtMonthEnd(source,'right');
    await page.mouse.move(point.right+6,point.y,{steps:20});
    await visible(hint.getByText('移至 2026/12/01，放開即可移動'));
    await page.mouse.up();
    await visible(notice.getByText('已移至 2026/12/01'));
    assert.deepEqual((await read(page)).notes.work[to],[{text:'目的日原記事'},{text:'132'}]);
    assert.deepEqual((await read(page)).notes.work[from],[]);

    point=await startAtMonthEnd(chip('personal',start,'左側驗證'),'left');
    await page.mouse.move(point.left+100,point.y,{steps:10});
    assert.equal(await hint.isVisible(),false);
    await page.mouse.move(point.left-6,point.y,{steps:15});
    await visible(hint.getByText('移至 2026/10/31，放開即可移動'));
    await page.mouse.up();
    await visible(notice.getByText('已移至 2026/10/31'));
    assert.deepEqual((await read(page)).notes.personal[previous],[{text:'上個月原記事'},{text:'左側驗證'}]);
    assert.match(await page.locator('.wk-lbl').textContent(),/2026年 11月/);
    await page.reload();
    await goToProgress(page);
    assert.deepEqual((await read(page)).notes.work[to],[{text:'目的日原記事'},{text:'132'}]);
    assert.deepEqual((await read(page)).notes.personal[previous],[{text:'上個月原記事'},{text:'左側驗證'}]);
    assert.deepEqual(errors,[]);
    console.log('PASS native mouse: '+viewport.width+'x'+viewport.height+', both outer edges, cancellation and reload.');
  }finally{await context.close();}
}

async function crossMonthDrag(browser) {
  const {page,context,errors}=await open(browser,'manager');
  const from='2026-11-30',to='2026-12-01',previous='2026-10-31',start='2026-11-01';
  const workNote={text:'跨月工地記事',color:'#228866',bg:'#ffef99',completed:true,strike:true};
  const personalNote={text:'跨月私人記事',color:'#1166aa',link:{url:'https://example.com',label:'資料'}};
  const event={date:from,stage,label:stage,note:'跨月排程',color:'#224488',completed:true,_progressItemId:'qa-schedule'};
  const meeting={text:'跨月會議',color:'#446688',completed:true,mentions:['qa-staff']};
  await page.evaluate(data=>window.progressTestFixture.seedCrossMonth(data),
    {from,to,previous,start,workNote,personalNote,event,meeting});
  const note=(type,date)=>page.locator('[data-pn-cell="'+type+'|'+date+'"] .pn-chip[draggable="true"]').first();
  const hint=page.locator('.progress-month-drag-edge');
  const notice=page.locator('.progress-month-move-notice');
  async function begin(locator,position){
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const element=await locator.elementHandle();
    const drag=await element.evaluateHandle((chip,position)=>{
      const scroller=chip.closest('.hscroll-sync');
      window.progressTestFixture.scrollCrossMonth(scroller,position);
      const data=new DataTransfer();
      chip.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));
      return {chip,scroller,data};
    },position);
    return {
      async send(type,side,offset=8){
        await drag.evaluate(({scroller,data},{type,side,offset})=>{
          const box=scroller.getBoundingClientRect();
          scroller.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:data,
            clientX:side==='left'?box.left+offset:box.right-offset,clientY:Math.max(0,box.top)+12,ctrlKey:true}));
        },{type,side,offset});
      },
      async end(){
        await drag.evaluate(({chip,data})=>chip.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:data})));
        await drag.dispose();await element.dispose();
      },
      async geometry(){return drag.evaluate(({scroller})=>({host:scroller.getBoundingClientRect().toJSON(),
        table:scroller.querySelector('table')?.getBoundingClientRect().toJSON(),
        scrollLeft:scroller.scrollLeft,width:scroller.scrollWidth,client:scroller.clientWidth,
        scrollers:[...document.querySelectorAll('.hscroll-sync')].map(el=>[el.id,el.scrollWidth-el.clientWidth,el.scrollLeft])}));},
    };
  }
  try{
    const rollover=await page.evaluate(()=>[['2024-03','left'],['2025-03','left'],['2026-01','left'],
      ['2026-12','right'],['2026-05','left']].map(([month,side])=>window.progressTestFixture.adjacentMonthDate(month,side)));
    assert.deepEqual(rollover,['2024-02-29','2025-02-28','2025-12-31','2027-01-01','2026-04-30']);

    const middle=await begin(note('personal',start),'middle');
    const before=await read(page);
    await middle.send('dragover','left');
    assert.equal(await hint.isVisible(),false);
    await middle.send('drop','left');
    await middle.end();
    assert.deepEqual((await read(page)).notes,before.notes);

    const personal=await begin(note('personal',start),'start');
    await personal.send('dragover','left',100);
    assert.equal(await hint.isVisible(),false);
    await personal.send('dragover','left');
    await visible(hint.getByText('移至 2026/10/31，放開即可移動'));
    assert.deepEqual((await read(page)).notes,before.notes);
    await personal.send('dragover','left',100);
    assert.equal(await hint.isVisible(),false);
    await personal.send('drop','left',100);
    await personal.end();
    assert.deepEqual((await read(page)).notes,before.notes);

    for(const [locator,position,side,message] of [
      [note('personal',start),'start','left','2026/10/31'],
      [note('work',from),'end','right','2026/12/01'],
      [meet(page,from).locator('.meet-chip'),'end','right','2026/12/01'],
      [work(page,from).locator('.ev-chip'),'end','right','2026/12/01'],
    ]){
      const drag=await begin(locator,position);
      await drag.send('dragover',side);
      try{await visible(hint.getByText('移至 '+message+'，放開即可移動'));}
      catch(error){throw new Error(locator+': '+JSON.stringify(await drag.geometry()),{cause:error});}
      await drag.send('drop',side);await drag.end();
      await visible(notice.getByText('已移至 '+message,{exact:true}));
      assert.match(await page.locator('.wk-lbl').textContent(),/2026年 11月/);
    }
    const moved=await read(page);
    assert.deepEqual(moved.notes.work[to],[{text:'目的日原記事'},workNote]);
    assert.deepEqual(moved.notes.personal[previous],[{text:'上個月原記事'},personalNote]);
    assert.deepEqual(moved.notes.work[from],[]);assert.deepEqual(moved.notes.personal[start],[]);
    assert.deepEqual(moved.meetings['meet1_'+from].items,[]);
    assert.deepEqual(moved.meetings['meet1_'+to].items,[{text:'目的日原會議',mentions:[]},meeting]);
    assert.equal(moved.logs['qa-staff_'+from].assigned.length,0);
    assert.equal(moved.logs['qa-staff_'+from].text,'既有日誌');
    assert.equal(moved.logs['qa-staff_'+to].assigned[0].id,'meeting:meet1:1');
    assert.equal(moved.logs['qa-staff_'+to].text,'目的日日誌');
    assert.deepEqual(moved.project.progressMonths['2026-12'].schedule.filter(item=>item.date===to)
      .map(({note,_progressItemId})=>[note,_progressItemId]),[['目的日原排程','qa-existing'],['跨月排程','qa-schedule']]);
    assert.ok(!moved.project.progressMonths['2026-11'].schedule.some(item=>item._progressItemId==='qa-schedule'));

    await page.reload();await goToProgress(page);await month(page,1,12);
    assert.equal(await meet(page,to).locator('.meet-chip').count(),2);
    await visible(meet(page,to).locator('.meet-chip').filter({hasText:'跨月會議'}));
    assert.deepEqual((await read(page)).notes,moved.notes);
    const deniedMeeting=await begin(meet(page,to).locator('.meet-chip').filter({hasText:'跨月會議'}),'start');
    await page.evaluate(()=>window.progressTestFixture.failCrossMonthLocalSave());
    await deniedMeeting.send('drop','left');await deniedMeeting.end();
    await visible(notice.getByText(/移動未儲存.*模擬本機無法寫入/));
    assert.deepEqual((await read(page)).meetings,moved.meetings);
    assert.deepEqual((await read(page)).logs,moved.logs);
    const scheduleSource=work(page,to).locator('.ev-row').filter({hasText:'跨月排程'}).locator('.ev-chip');
    const failure=await begin(scheduleSource,'start');
    const beforeFailure=(await read(page)).project;
    await page.evaluate(()=>window.progressTestFixture.failCrossMonthLocalSave());
    await failure.send('drop','left');await failure.end();
    await visible(notice.getByText(/移動未儲存.*模擬本機無法寫入/));
    assert.deepEqual((await read(page)).project,beforeFailure);

    const originalNote=note('work',to);
    const deniedNote=await begin(originalNote,'start');
    await page.evaluate(()=>window.progressTestFixture.failCrossMonthLocalSave());
    await deniedNote.send('drop','left');await deniedNote.end();
    await visible(notice.getByText(/移動未儲存.*模擬本機無法寫入/));
    assert.deepEqual((await read(page)).notes,moved.notes);
    await originalNote.evaluate(chip=>{
      chip.closest('tr').scrollIntoView({block:'center'});
      window.progressTestFixture.scrollCrossMonth(chip.closest('.hscroll-sync'),'start');
    });
    const pos=await originalNote.evaluate(chip=>{
      const bounds=chip.getBoundingClientRect();
      const edge=chip.closest('.hscroll-sync').getBoundingClientRect().left;
      return {x:bounds.left+25,y:bounds.top+bounds.height/2,edge};
    });
    await page.mouse.move(pos.x,pos.y);
    await page.mouse.down();
    await page.mouse.move(pos.x-18,pos.y,{steps:4});
    await page.mouse.move(pos.edge+8,pos.y,{steps:12});
    await visible(hint.getByText('移至 2026/11/30，放開即可移動'));
    assert.deepEqual((await read(page)).notes,moved.notes);
    await page.mouse.up();
    await visible(notice.getByText('已移至 2026/11/30',{exact:true}));
    assert.deepEqual((await read(page)).notes.work[from],[{text:'目的日原記事'}]);
    assert.deepEqual(errors,[]);
    console.log('PASS browser: month boundaries, no write before drop, preserve occupied cells, confirmed moves for all date drags, failure and reload.');
  }finally{await context.close();}
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [label, test] of [
      ['completion', completion], ['completed filters',completedFilters], ['new unsigned project',createAndCloseUnsignedProject], ['design-only completion',designOnlyCompletion], ['legacy completion dates', legacyCompletionDates], ['staff desktop', b => employee(b, 'staff', false)],
      ['staff mobile', b => employee(b, 'staff', true)],
      ['supervisor desktop', b => employee(b, 'supervisor', false)],
      ['supervisor mobile', b => employee(b, 'supervisor', true)], ['administrator', administrator],
      ['rapid checklist',rapidChecklist], ['schedule save and conflict retry',scheduleSave], ['cross month drag',crossMonthDrag],
      ['native cross month drag',async browser=>{
        for(const viewport of [{width:1627,height:901},{width:1050,height:800}])await nativeCrossMonthDrag(browser,viewport);
      }]
    ]) {
      if(process.env.PROGRESS_BROWSER_CASE&&label!==process.env.PROGRESS_BROWSER_CASE)continue;
      try{await test(browser);}
      catch(error){console.error(label, error);process.exitCode=1;}
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
