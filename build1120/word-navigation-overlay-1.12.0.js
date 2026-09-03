(()=>{
'use strict';
if(window.__RB_WORD_NAV_1120__)return;
window.__RB_WORD_NAV_1120__=true;

const VERSION='1.12.0';
const HB_RX=/(?:hebrew\s*books?|hebrewbooks|hebrew-books|היברו\s*בוקס|היברובוקס)/i;
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let navQuery='';
let lastSignature='';
let lastToolbar=null;

function visible(el){
  if(!el||!el.getBoundingClientRect)return false;
  const r=el.getBoundingClientRect(),s=getComputedStyle(el);
  return s.display!=='none'&&s.visibility!=='hidden'&&r.width>2&&r.height>2;
}

function textOf(el){
  return [el?.textContent,el?.getAttribute?.('title'),el?.getAttribute?.('aria-label'),el?.getAttribute?.('data-tooltip')].filter(Boolean).join(' ');
}

function removeHebrewBooks(root=document){
  const nodes=root.querySelectorAll?.('button,a,[role="button"],[role="tab"],summary,label,li,nav span')||[];
  for(const el of nodes){
    if(el.closest?.('#rb1120-wordnav'))continue;
    if(HB_RX.test(textOf(el))){
      el.style.setProperty('display','none','important');
      el.setAttribute('aria-hidden','true');
      el.dataset.rb1120HebrewbooksRemoved='1';
    }
  }
}

function blockHebrewBooksLinks(){
  document.addEventListener('click',e=>{
    const a=e.target?.closest?.('a');
    if(a&&HB_RX.test(String(a.href||'')+' '+textOf(a))){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);
  if(!window.__RB_WORD_NAV_1120_OPEN_PATCHED__){
    window.__RB_WORD_NAV_1120_OPEN_PATCHED__=true;
    const originalOpen=window.open?.bind(window);
    if(originalOpen){
      window.open=(url,...rest)=>HB_RX.test(String(url||''))?null:originalOpen(url,...rest);
    }
  }
}

function identifySelect(s){
  if(!visible(s)||s.closest('#rb1111-side')||s.closest('#rb1120-wordnav'))return null;
  const opts=[...s.options].slice(0,120).map(o=>(o.textContent||'').trim()).filter(Boolean);
  if(opts.length<2)return null;
  const joined=opts.join('|');
  const near=((s.parentElement?.innerText||'')+' '+(s.closest('section,div')?.innerText||'')).slice(0,500);
  const all=joined+' '+near;
  if(/ספר המדע|ספר אהבה|ספר זמנים|ספר נשים|ספר קדושה|ספר הפלאה|ספר זרעים|ספר עבודה|ספר קרבנות|ספר טהרה|ספר נזקים|ספר קניין|ספר משפטים|ספר שופטים/.test(all))return {kind:'book',label:'ספר',weight:0};
  if(/הלכות\s+[א-ת]|הלכות/.test(all)&&!/הלכה\s+[א-ת]/.test(joined))return {kind:'laws',label:'הלכות',weight:1};
  if(/פרק\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שביעי|שמיני|תשיעי|עשירי|[א-ת][׳']?)/.test(joined)||/\bפרק\b/.test(near))return {kind:'chapter',label:'פרק',weight:2};
  if(/הלכה\s+(?:[א-ת][׳']?|ראשונה|שנייה|שלישית)/.test(joined)||/\bהלכה\b/.test(near))return {kind:'halakha',label:'הלכה',weight:3};
  return null;
}

function sourceSelects(){
  const found=[];
  for(const s of document.querySelectorAll('select')){
    const meta=identifySelect(s);
    if(meta)found.push({s,...meta,top:s.getBoundingClientRect().top,left:s.getBoundingClientRect().left});
  }
  found.sort((a,b)=>a.weight-b.weight||a.top-b.top||b.left-a.left);
  const unique=[];
  const seen=new Set();
  for(const item of found){
    if(seen.has(item.kind))continue;
    seen.add(item.kind);unique.push(item);
  }
  return unique;
}

function fireSelect(s,index){
  if(!s||index<0||index>=s.options.length)return;
  s.selectedIndex=index;
  s.dispatchEvent(new Event('input',{bubbles:true}));
  s.dispatchEvent(new Event('change',{bubbles:true}));
  setTimeout(()=>{lastSignature='';renderWordNav(true);},250);
}

function clickOriginal(rx){
  const b=[...document.querySelectorAll('button')].find(x=>!x.closest('#rb1111-side')&&!x.closest('#rb1120-wordnav')&&visible(x)&&rx.test((x.textContent||'').trim()));
  if(b)b.click();
}

function ensureWordNav(){
  const side=$('rb1111-side');
  if(!side)return null;
  const navView=side.querySelector('.rb1111-view[data-view="nav"]');
  if(!navView)return null;
  const old=$('rb1111-navbody');
  if(old)old.style.setProperty('display','none','important');
  let pane=$('rb1120-wordnav');
  if(!pane){
    pane=document.createElement('div');pane.id='rb1120-wordnav';pane.className='rb1120-wordnav';
    pane.innerHTML=`<div class="rb1120-navhead"><div><b>ניווט</b><span>כמו חלונית הניווט של Word</span></div></div><div class="rb1120-find"><span aria-hidden="true">⌕</span><input id="rb1120-navq" placeholder="חפש בכותרות..." autocomplete="off"><button id="rb1120-clear" title="נקה חיפוש">×</button></div><div class="rb1120-viewtabs"><button class="on" data-viewmode="headings">כותרות</button><button data-viewmode="current">המיקום הנוכחי</button></div><div id="rb1120-current" class="rb1120-current"></div><div id="rb1120-outline" class="rb1120-outline"></div><div class="rb1120-navfoot"><button id="rb1120-prev">הקודם</button><button id="rb1120-next">הבא</button></div>`;
    navView.appendChild(pane);
    const q=$('rb1120-navq');
    q?.addEventListener('input',()=>{navQuery=q.value||'';lastSignature='';renderWordNav(true)});
    $('rb1120-clear')?.addEventListener('click',()=>{navQuery='';if(q)q.value='';lastSignature='';renderWordNav(true);q?.focus()});
    $('rb1120-prev')?.addEventListener('click',()=>clickOriginal(/ההלכה הקודמת|הקודם|קודם|‹|←/));
    $('rb1120-next')?.addEventListener('click',()=>clickOriginal(/ההלכה הבאה|הבא|›|→/));
    pane.addEventListener('click',e=>{
      const item=e.target.closest('[data-rb-level][data-rb-index]');
      if(!item)return;
      const level=item.dataset.rbLevel,index=Number(item.dataset.rbIndex);
      const src=sourceSelects().find(x=>x.kind===level);
      if(src)fireSelect(src.s,index);
    });
    pane.querySelectorAll('[data-viewmode]').forEach(btn=>btn.addEventListener('click',()=>{
      pane.querySelectorAll('[data-viewmode]').forEach(x=>x.classList.toggle('on',x===btn));
      pane.classList.toggle('current-only',btn.dataset.viewmode==='current');
    }));
  }
  return pane;
}

function renderWordNav(force=false){
  const pane=ensureWordNav();if(!pane)return;
  const levels=sourceSelects();
  const signature=levels.map(x=>x.kind+':'+x.s.selectedIndex+':'+x.s.options.length).join('|')+'|q='+navQuery;
  if(!force&&signature===lastSignature)return;
  lastSignature=signature;
  const current=$('rb1120-current'),outline=$('rb1120-outline');
  if(!current||!outline)return;
  if(!levels.length){
    current.innerHTML='';outline.innerHTML='<div class="rb1120-empty">פתח ספר או הלכה, והכותרות יופיעו כאן אוטומטית.</div>';return;
  }
  current.innerHTML='<div class="rb1120-current-title">המיקום הנוכחי</div>'+levels.map(x=>`<div class="rb1120-crumb"><span>${esc(x.label)}</span><b>${esc((x.s.options[x.s.selectedIndex]?.textContent||'').trim())}</b></div>`).join('');
  const needle=navQuery.trim().toLocaleLowerCase('he');
  outline.innerHTML=levels.map((x,levelIndex)=>{
    const opts=[...x.s.options].map((o,i)=>({i,text:(o.textContent||'').trim()})).filter(o=>!needle||o.text.toLocaleLowerCase('he').includes(needle));
    const active=x.s.selectedIndex;
    const rows=opts.slice(0,220).map(o=>`<button class="rb1120-heading ${o.i===active?'active':''}" data-rb-level="${x.kind}" data-rb-index="${o.i}" style="--indent:${levelIndex}"><span class="rb1120-caret">${levelIndex<levels.length-1?'›':'·'}</span><span>${esc(o.text)}</span></button>`).join('');
    return `<section class="rb1120-level" data-kind="${x.kind}"><div class="rb1120-levelname">${esc(x.label)}</div>${rows||'<div class="rb1120-noresult">אין התאמות</div>'}</section>`;
  }).join('');
  const active=outline.querySelector('.rb1120-heading.active');
  if(active&&!needle)setTimeout(()=>active.scrollIntoView({block:'nearest'}),0);
}

function enhanceToolbar(){
  const buttons=[...document.querySelectorAll('button')].filter(b=>!b.closest('#rb1111-side')&&!b.closest('#rb1120-wordnav')&&visible(b));
  const hits=buttons.filter(b=>/נקד|בדוק מקור|שאל את המאגר|מחקר|העתק|הדבק|גזור|יישור|מרכז|שמור|תצוגה מקדימה|הפק Word|מאסטר|ביטול|שחזור/.test((b.textContent||'').trim()));
  const candidates=new Map();
  for(const b of hits){
    let p=b.parentElement,depth=0;
    while(p&&depth++<4){
      const r=p.getBoundingClientRect();
      if(r.width>500&&r.height>34&&r.height<180){candidates.set(p,(candidates.get(p)||0)+1);break;}
      p=p.parentElement;
    }
  }
  const best=[...candidates.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(best&&best!==lastToolbar){
    if(lastToolbar)lastToolbar.classList.remove('rb1120-editor-ribbon');
    lastToolbar=best;best.classList.add('rb1120-editor-ribbon');
    if(!best.querySelector('.rb1120-ribbon-caption')){
      const cap=document.createElement('div');cap.className='rb1120-ribbon-caption';cap.innerHTML='<b>בית</b><span>לוח עריכה</span>';best.prepend(cap);
    }
  }
}

function installStyles(){
  if($('rb1120-style'))return;
  const style=document.createElement('style');style.id='rb1120-style';style.textContent=`
#rb1111-side{width:360px!important;background:#f7f8fa!important;border-left:1px solid #d1d7de!important;box-shadow:-4px 0 14px rgba(31,50,71,.10)!important;color:#202a35!important}
body.rb1111-open>#root{width:calc(100% - 360px)!important;max-width:calc(100% - 360px)!important;margin-right:360px!important}
.rb1111-head{height:54px!important;background:#ffffff!important;color:#1e2f40!important;border-bottom:1px solid #d7dde4!important;padding:0 14px!important;box-shadow:0 1px 0 rgba(0,0,0,.02)!important}.rb1111-head b{font-size:16px!important}.rb1111-head small{color:#667585!important;opacity:1!important}.rb1111-close{margin-right:auto!important;border:0!important;background:#eef1f5!important;color:#31475c!important;border-radius:4px!important;padding:6px 10px!important}
.rb1111-tabs{display:flex!important;background:#fff!important;border-bottom:1px solid #d8dee5!important;padding:0 6px!important}.rb1111-tab{flex:1!important;border:0!important;background:transparent!important;color:#4c5d6f!important;padding:10px 4px 9px!important;font:600 11px/1.2 inherit!important;border-radius:0!important;box-shadow:none!important}.rb1111-tab.on{color:#1f4e79!important;background:transparent!important;box-shadow:inset 0 -3px #2b579a!important}
#rb1111-handle{background:#2b579a!important;border-color:#2b579a!important;border-radius:4px 0 0 4px!important;width:25px!important;box-shadow:-2px 0 8px rgba(0,0,0,.12)!important}
.rb1111-searchline{background:#fff!important;border-bottom:1px solid #d9dfe6!important;padding:9px!important}.rb1111-searchline input,.rb1111-field,.rb1111-chatbox textarea{border:1px solid #c7d0da!important;border-radius:3px!important;box-shadow:inset 0 1px 2px rgba(0,0,0,.03)!important}.rb1111-btn,.rb1111-navactions button,.rb1111-actions button{border:1px solid #c9d1da!important;border-radius:3px!important;background:#fff!important;color:#2e4255!important}.rb1111-btn.primary{background:#2b579a!important;color:#fff!important;border-color:#2b579a!important}.rb1111-btn.gold{background:#fff!important;color:#2b579a!important;border-color:#9fb5cc!important}.rb1111-chips{background:#f6f7f9!important;border-bottom:1px solid #dce1e6!important}.rb1111-chip{border-radius:12px!important;background:#fff!important;border-color:#d2d9e0!important;color:#44576a!important}.rb1111-chip.on{background:#e8f0f8!important;border-color:#9db6cf!important;color:#1f4e79!important}.rb1111-results{background:#f4f6f8!important}.rb1111-result{border-radius:3px!important;border-right:3px solid #2b579a!important}.rb1111-result.on{background:#eaf2fb!important}.rb1111-chatlog{background:#f4f6f8!important}.rb1111-ai{border-right-color:#2b579a!important}.rb1111-toast{background:#223a53!important;border-radius:4px!important}
.rb1120-wordnav{display:flex;flex:1;min-height:0;flex-direction:column;background:#f7f8fa;color:#25384b}.rb1120-navhead{padding:13px 14px 7px;background:#fff}.rb1120-navhead b{display:block;font-size:17px;font-weight:650}.rb1120-navhead span{display:block;color:#788592;font-size:11px;margin-top:2px}.rb1120-find{display:flex;align-items:center;gap:6px;margin:8px 10px;background:#fff;border:1px solid #b9c3cd;border-radius:3px;height:34px;padding:0 8px}.rb1120-find span{font-size:18px;color:#6c7a88}.rb1120-find input{border:0!important;outline:0!important;box-shadow:none!important;min-width:0;flex:1;background:transparent;font:inherit;color:#263746}.rb1120-find button{border:0;background:transparent;color:#667482;font-size:17px;cursor:pointer;padding:0 2px}.rb1120-viewtabs{display:flex;padding:0 10px;border-bottom:1px solid #d8dee5;background:#fff}.rb1120-viewtabs button{border:0;background:transparent;padding:7px 10px;color:#58697a;font:600 11px inherit;border-bottom:2px solid transparent;cursor:pointer}.rb1120-viewtabs button.on{color:#2b579a;border-bottom-color:#2b579a}.rb1120-current{padding:8px 10px;background:#eef2f6;border-bottom:1px solid #d8dee5}.rb1120-current-title{font-size:10px;text-transform:uppercase;letter-spacing:.02em;color:#748292;margin-bottom:4px}.rb1120-crumb{display:grid;grid-template-columns:58px 1fr;gap:7px;align-items:center;padding:2px 0;font-size:11px}.rb1120-crumb span{color:#788592}.rb1120-crumb b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#2a3c4d}.rb1120-outline{flex:1;min-height:0;overflow:auto;background:#fff;padding:6px 0}.rb1120-level{border-bottom:1px solid #edf0f3;padding:4px 0}.rb1120-levelname{padding:5px 12px;color:#7b8794;font-size:10px;font-weight:700;text-transform:uppercase}.rb1120-heading{display:flex;width:100%;align-items:center;gap:4px;text-align:right;border:0;background:transparent;color:#2e3d4c;font:500 12px/1.35 inherit;padding:6px 10px 6px calc(10px + (var(--indent) * 12px));cursor:pointer;border-right:3px solid transparent}.rb1120-heading:hover{background:#f0f4f8}.rb1120-heading.active{background:#e6f0fa;color:#173f68;border-right-color:#2b579a;font-weight:700}.rb1120-caret{width:12px;color:#7e8b98;font-size:15px;line-height:1}.rb1120-noresult,.rb1120-empty{padding:18px 14px;color:#7d8995;text-align:center;font-size:12px}.rb1120-navfoot{display:flex;gap:6px;padding:8px 10px;background:#f5f7f9;border-top:1px solid #d9dfe5}.rb1120-navfoot button{flex:1;border:1px solid #c8d0d8;background:#fff;color:#32495f;border-radius:3px;padding:7px;font:600 11px inherit;cursor:pointer}.rb1120-wordnav.current-only .rb1120-outline{display:none}.rb1120-wordnav.current-only .rb1120-current{flex:1;background:#fff;padding-top:16px}
.rb1120-editor-ribbon{background:#f7f8fa!important;border:1px solid #d1d7de!important;border-radius:3px!important;padding:5px 6px 6px!important;gap:3px!important;box-shadow:0 1px 2px rgba(0,0,0,.04)!important}.rb1120-editor-ribbon button{border:1px solid transparent!important;background:transparent!important;border-radius:3px!important;color:#283c50!important;min-height:30px!important;padding:5px 8px!important}.rb1120-editor-ribbon button:hover{background:#e7eef6!important;border-color:#c5d3e1!important}.rb1120-editor-ribbon select,.rb1120-editor-ribbon input{border:1px solid #c5ccd4!important;border-radius:3px!important;background:#fff!important;min-height:30px!important}.rb1120-ribbon-caption{display:flex!important;align-items:baseline!important;gap:7px!important;padding:0 6px 4px!important;border-bottom:1px solid #dde2e8!important;margin-bottom:4px!important;width:100%!important}.rb1120-ribbon-caption b{color:#2b579a!important;font-size:12px!important}.rb1120-ribbon-caption span{color:#7b8793!important;font-size:10px!important}
@media(max-width:1050px){#rb1111-side{width:330px!important}body.rb1111-open>#root{width:calc(100% - 330px)!important;max-width:calc(100% - 330px)!important;margin-right:330px!important}}
`;
  document.head.appendChild(style);
}

function polishSidebarLabels(){
  const side=$('rb1111-side');if(!side)return;
  const head=side.querySelector('.rb1111-head b');if(head)head.textContent='ניווט ומחקר';
  const tab=side.querySelector('.rb1111-tab[data-tab="nav"]');if(tab)tab.textContent='ניווט';
}

function tick(){
  installStyles();
  polishSidebarLabels();
  removeHebrewBooks();
  renderWordNav();
  enhanceToolbar();
}

function boot(){
  installStyles();
  blockHebrewBooksLinks();
  tick();
  const mo=new MutationObserver(()=>{removeHebrewBooks();lastSignature='';});
  mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['title','aria-label']});
  setInterval(tick,900);
  console.info('Rambam Bahir Word Navigation '+VERSION+' loaded');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
