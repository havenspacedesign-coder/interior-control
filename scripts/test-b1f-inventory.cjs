const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const fields={},alerts=[],saved=new Map();let sequence=0,checked=[];
const seed=()=>({items:[{id:'tape',name:'養生膠帶',stockQty:3,unit:'捲',unitPrice:0,categoryIds:[]}],usages:[],logs:[],orders:[],categories:[],carts:{},standaloneSites:[]});
const c={console,Promise,Map,Set,Date,localTestMode:true,currentUser:{uid:'tester',displayName:'測試'},b1fStore:seed(),b1fProductSearch:'',b1fFlash:'',b1fView:'products',S:{projects:[{id:'a',name:'A 工地'},{id:'b',name:'B 工地'}]},
  $:id=>fields[id]||{value:'',style:{}},alert:message=>alerts.push(message),confirm:()=>true,
  localStorage:{setItem:(key,value)=>saved.set(key,value),getItem:key=>saved.get(key)},
  b1fDataV3:()=>c.b1fStore,b1fStoreKeyV3:()=> 'test',b1fSeedV3:seed,b1fSaveV3:()=>saved.set('test',JSON.stringify(c.b1fStore)),
  b1fItem:id=>c.b1fData().items.find(item=>item.id===id),b1fNow:()=> '2026-11-05T00:00:00Z',b1fId:prefix=>prefix+'-'+(++sequence),
  b1fSiteById:(id,store)=>c.S.projects.find(p=>p.id===id)||(store||c.b1fData()).standaloneSites.find(p=>p.id===id),b1fStandaloneSites:store=>store.standaloneSites,
  b1fCategories:()=>c.b1fData().categories,b1fCategoryTags:()=>'',b1fMoney:n=>'$'+n,escAttr:String,isAdmin:()=>true,b1fCanDispose:()=>true,
  renderB1F:()=>{},closeMo:()=>{},setSyncing:()=>{},setSynced:()=>{},setOffline:()=>{},serverTimestamp:()=> 'now',doc:()=>({}),db:{},
  b1fSiteMaterialLists:()=>[],document:{addEventListener:()=>{},getElementById:()=>null,querySelectorAll:()=>checked},addEventListener:()=>{}};
c.window=c;vm.createContext(c);
vm.runInContext(read('app/features/b1f/shared-store.js'),c);
vm.runInContext(read('app/features/b1f/product-management.js'),c);
// Exercise the final production handler, which supersedes the shared-store handler.
vm.runInContext(read('app/features/b1f/site-materials.js').split(/\r?\n/).find(line=>line.startsWith('window.confirmB1FCart=')),c);
vm.runInContext(read('app/features/b1f/site-materials.js').split(/\r?\n/).find(line=>line.startsWith('function b1fSiteMaterialUsageStats(')),c);
const run=(name,...args)=>{c.args=args;return vm.runInContext(`${name}(...args)`,c);};
const stock=()=>{const s=run('b1fInventory',c.b1fItem('tape'));return[s.total,s.inUse,s.available];};
const visible=()=>run('b1fSortedProductsV7').some(item=>item.id==='tape');
async function issue(site,quantity){fields['b1f-cart-project']={value:site};c.b1fCart().push({itemId:'tape',qty:quantity});await c.confirmB1FCart();}
async function main(){
  const original=JSON.stringify(c.b1fStore);assert.deepEqual(stock(),[3,0,3]);assert.equal(JSON.stringify(c.b1fStore),original);
  await issue('a',1);assert.deepEqual(stock(),[3,1,2]);await issue('b',1);assert.deepEqual(stock(),[3,2,1]);
  assert.equal(run('b1fInventory',c.b1fItem('tape')).sites.length,2);
  assert.equal(run('b1fInventoryQuantityMarkup',c.b1fItem('tape')),'1捲(2)');
  assert.equal(run('b1fInventoryTooltipText',c.b1fItem('tape')),'A 工地：1捲\nB 工地：1捲');
  const a=c.b1fStore.usages.find(row=>row.projectId==='a'),b=c.b1fStore.usages.find(row=>row.projectId==='b');
  fields['b1f-action-qty']={value:'1'};fields['b1f-action-note']={value:''};
  await c.confirmB1FUsageAction(a.id,'used');assert.deepEqual(stock(),[2,1,1]);assert.equal(c.b1fStore.usages.find(row=>row.id===b.id).inUseQty,1);
  checked=[{dataset:{id:b.id}}];fields['b1f-return-qty-'+b.id]={value:'1'};await c.confirmB1FReturn();assert.deepEqual(stock(),[2,0,2]);
  assert.equal(run('b1fInventoryQuantityMarkup',c.b1fItem('tape')),'2捲');
  assert.equal(run('b1fInventoryTooltipText',c.b1fItem('tape')),'');
  const cards=run('b1fProductsMarkupV7');assert(!cards.includes('b1f-inventory-details'));assert(cards.includes('b1f-inventory-trigger'));
  await issue('a',2);assert.deepEqual(stock(),[2,2,0]);assert(visible());assert(run('b1fInventoryMarkup',c.b1fItem('tape')).includes('工地使用中'));
  const active=c.b1fStore.usages.at(-1);await c.confirmB1FUsageAction(active.id,'used');assert.deepEqual(stock(),[1,1,0]);assert(visible());
  await c.confirmB1FUsageAction(active.id,'disposed');assert.deepEqual(stock(),[0,0,0]);assert(!visible());assert(c.b1fItem('tape'));
  const logCount=c.b1fStore.logs.length;fields['b1f-restock-qty']={value:'2'};fields['b1f-restock-note']={value:'補貨'};await c.confirmB1FRestock('tape');assert.deepEqual(stock(),[2,0,2]);assert(visible());assert.equal(c.b1fStore.logs.length,logCount+1);assert.equal(c.b1fStore.items.length,1);
  await c.confirmB1FInventoryDispose('tape');assert.deepEqual(stock(),[1,0,1]);
  // Concurrent requests cannot issue twice or charge twice, even with enough stock.
  c.b1fItem('tape').stockQty=3;c.b1fItem('tape').unitPrice=10;fields['b1f-cart-project']={value:'b'};c.b1fCart().push({itemId:'tape',qty:1});
  const orders=c.b1fStore.orders.length;await Promise.all([c.confirmB1FCart(),c.confirmB1FCart()]);assert.equal(c.b1fStore.orders.length,orders+1);assert.deepEqual(stock(),[3,1,2]);assert.equal(c.b1fStore.logs.filter(row=>row.type==='charge').length,1);
  const before=JSON.stringify(c.b1fStore);await assert.rejects(run('b1fCommit',store=>{store.items[0].stockQty=-1;}));assert.equal(JSON.stringify(c.b1fStore),before);
  await assert.rejects(run('b1fCommit',store=>{store.logs.push({id:'bad'});throw Error('failure');}));assert.equal(JSON.stringify(c.b1fStore),before);
  assert.equal(run('b1fInventory',JSON.parse(JSON.stringify(c.b1fItem('tape'))),JSON.parse(saved.get('test'))).total,3);
  await c.deleteB1FProduct('tape');assert(c.b1fItem('tape'));assert(alerts.some(message=>message.includes('工地領用中')));
  // Formal transaction uses the same fields and derived balance without migration.
  c.localTestMode=false;let formal=JSON.parse(JSON.stringify(c.b1fStore));
  c.fbRunTransaction=async(_db,change)=>change({get:async()=>({exists:()=>true,data:()=>formal}),set:(_ref,value)=>{formal=value;}});
  await run('b1fCommit',store=>{store.items[0].stockQty+=1;});assert.equal(run('b1fInventory',formal.items[0],formal).total,4);assert.equal(formal.logs.length,c.b1fStore.logs.length);
  assert(!JSON.stringify(formal).includes('stockTotal'));
  c.localTestMode=true;c.b1fStore=seed();c.b1fItem('tape').stockQty=0.3;
  await issue('a',0.1);await issue('b',0.2);assert.deepEqual(stock(),[0.3,0.3,0]);
  assert.equal(c.b1fStore.orders.length,2);
  c.b1fStore.usages=[{itemId:'tape',siteMaterialListId:'list',issuedQty:3,returnedQty:1,usedQty:1,disposedQty:0,inUseQty:1}];
  const stats=run('b1fSiteMaterialUsageStats',{id:'list'},'tape');assert.equal(stats.used,1);assert.equal(stats.inUse,1);assert.equal(stats.issued,3);assert.equal(stats.returned,1);
  console.log('PASS: 3→A→B→used→return example; zero available stays visible; partial consumption; disposal hides without deletion; restock restores same ID; zero/paid items; charge once; transaction rollback; reload persistence; active-usage deletion guard; formal transaction compatibility.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
