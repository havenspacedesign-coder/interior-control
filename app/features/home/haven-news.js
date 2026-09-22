// Runtime-composed source module. Keep declarations in shared application scope.
/* The photo is a direct link; the remaining newspaper surface still opens the full briefing. */
renderTodayNewsModule=function(tier,m){
  if(todayNewsLoading&&!todayNews)return'<div class="today-news-loading">有隅特報載入中…</div>';
  const items=Array.isArray(todayNews?.news)?todayNews.news:[];
  if(!items.length)return'<div class="today-news-empty">有隅特報準備中</div>';
  const[id]=havenTemplate(),compact=(m?.w||3)<=3||(m?.h||3)<=3,lead=items[0],rest=items.slice(1,compact?3:6),date=new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',weekday:'short'}).format(new Date());
  const feature=`<div class="haven-feature"><a class="haven-photo" href="${escAttr(safeNewsUrl(lead.url))}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" aria-label="開啟：${escAttr(lead.title)}"><img src="${escAttr(safeNewsUrl(lead.imageUrl))}" alt="${escAttr(lead.title)}" style="display:block;width:100%;height:100%;object-fit:cover"></a><div class="haven-feature-copy"><div class="haven-kicker">TOP STORY · ${escAttr(lead.category||'設計觀點')}</div><div class="haven-headline">${escAttr(lead.title)}</div><div class="haven-deck">${escAttr(lead.source||'有隅特報')} · 點擊閱讀完整 12 則新聞</div></div></div>`,briefs=`<div class="haven-side">${rest.map((x,i)=>havenStory(x,i+1,id==='gallery')).join('')}</div>`;
  return`<div class="haven-paper haven-${id}" data-compact="${compact}" role="button" tabindex="0" onclick="if(!homeEditMode)showHavenNews()"><div class="haven-mast"><span>HAVEN DAILY</span><span class="haven-mast-title">有隅特報</span><span class="haven-mast-meta">${date} · ${escAttr(todayNewsUpdateLabel(todayNews.updatedAt))} · VOL.${String((new Date().getDate()%99)+1).padStart(3,'0')}<br>DESIGN A BETTER HOME</span></div><div class="haven-layout">${feature}${briefs}</div></div>`;
};
/* Keep the live app on the approved single-template layout from the test page. */
function currentHnImage(item){const url=safeNewsUrl(item.url);return`<a class="hn-image" href="${escAttr(url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><img src="${escAttr(safeNewsUrl(item.imageUrl))}" alt="${escAttr(item.title)}"></a>`;}
function currentHnCopy(item,kicker){return`<div class="hn-kicker">${escAttr(kicker)}</div><div class="hn-title">${escAttr(item.title)}</div><div class="hn-deck">${escAttr(item.source||'HAVEN DAILY')} · A considered view for the week ahead.</div><div class="hn-read">READ MORE →</div>`;}
function currentHnHeader(value){const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/),newsDay=match?new Date(`${value}T12:00:00+08:00`):new Date(),date=match?`${match[2]}/${match[3]}`:new Intl.DateTimeFormat('en-US',{month:'2-digit',day:'2-digit'}).format(newsDay),weekday=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'Asia/Taipei'}).format(newsDay).toUpperCase();return`<header class="haven-paper-head"><div class="hph-brand">DAILY</div><div class="hph-title">HAVEN NEWS</div><div class="hph-meta">A BETTER HOME<br>A BRIGHTER DAY</div><div class="hph-date"><span>${date} · ${weekday}</span><span>SPACE · DESIGN · LIVING</span></div></header>`;}
renderTodayNewsModule=function(tier,m){
  if(todayNewsLoading&&!todayNews)return'<div class="today-news-loading">有隅特報載入中…</div>';
  const items=Array.isArray(todayNews?.news)?todayNews.news:[];
  if(!items.length)return'<div class="today-news-empty">有隅特報準備中</div>';
  const compact=(m?.w||3)<=3||(m?.h||3)<=3,a=items[0],b=items[1%items.length]||a,c=items[2%items.length]||a,d=items[3%items.length]||a;
  const card=(item,index)=>`<article class="hn-card">${currentHnImage(item)}${currentHnCopy(item,`${String(index).padStart(2,'0')} · FEATURE`)}</article>`;
  return`<div class="haven-paper haven-current" data-compact="${compact}" role="button" tabindex="0" aria-label="查看全部模板與新聞" onpointerdown="if(!homeEditMode){event.stopPropagation()}" onclick="if(!homeEditMode){event.stopPropagation();showHavenNews()}">${currentHnHeader(todayNews?.date)}<div class="hn-layout"><section class="hn-hero">${currentHnImage(a)}<div class="hn-hero-copy">${currentHnCopy(a,'TOP STORY')}</div></section><section class="hn-bottom">${card(b,2)}${card(c,3)}${card(d,4)}</section></div><button type="button" class="hn-open-news" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation();showHavenNews()">查看全部模板與新聞　→</button></div>`;
};
window.showHavenNews=function(focus=0){
  const items=Array.isArray(todayNews?.news)?todayNews.news:[];
  $('mo-content').className='mo-box haven-news-modal';
  $('mo-content').innerHTML=`<div class="mo-title">有隅特報</div><div class="mo-sub">目前保留大圖頭版；上方一張主圖、下方三張新聞圖片。</div><div class="haven-news-full-grid">${items.map((item,index)=>`<a class="haven-news-full-card ${index===focus?'focus':''}" id="haven-news-${index}" href="${escAttr(safeNewsUrl(item.url))}" target="_blank" rel="noopener noreferrer"><img src="${escAttr(safeNewsUrl(item.imageUrl))}" alt="${escAttr(item.title)}"><span class="haven-news-full-copy"><span class="haven-news-full-title">${String(index+1).padStart(2,'0')}　${escAttr(item.title)}</span></span></a>`).join('')}</div><div class="mo-footer"><button class="btn" onclick="closeMo()">關閉</button></div>`;
  $('modal').style.display='flex';setTimeout(()=>$('haven-news-'+focus)?.scrollIntoView({block:'nearest'}),0);
};

window.nextHavenTemplate=function(){havenTemplateOffset=(havenTemplateOffset+1)%HAVEN_PRIMARY.length;renderHome();showHavenNews();};
