(()=>{
  if(window.__RB_CORE_181__) return;
  window.__RB_CORE_181__=true;

  const CATS={
    all:'כל המאגר',rambam:'רמב״ם',rishonim:'ראשונים',bavli:'בבלי',yerushalmi:'ירושלמי',
    mishnah:'משנה',tosefta:'תוספתא',tanakh:'תנ״ך',tur:'טור',shulchan_arukh:'שולחן ערוך',
    midrash:'מדרש',responsa:'שו״ת',halakhah:'הלכה',thought:'מחשבה'
  };
  let seq=0, pending=new Map(), lastResults=[], selected=null, mode='literal', category='all', view='results', stats=null;

  window.__RB_CORE_RECEIVE__=(message)=>{
    try{
      const m=typeof message==='string'?JSON.parse(message):message;
      const p=pending.get(m.rid); if(!p) return;
      pending.delete(m.rid);
      m.ok?p.resolve(m.data):p.reject(new Error((m.data&&m.data.message)||'שגיאה במאגר המקומי'));
    }catch(error){ console.error('Core Library receive error',error); }
  };

  function request(action,params={}){
    return new Promise((resolve,reject)=>{
      const rid='rb'+Date.now()+'_'+(++seq);
      pending.set(rid,{resolve,reject});
      const qs=new URLSearchParams({...params,rid});
      const a=document.createElement('a');
      a.href='rambam-local://'+action+'/?'+qs.toString();
      a.style.display='none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>{if(pending.has(rid)){pending.delete(rid);reject(new Error('המאגר המקומי לא החזיר תשובה בזמן'));}},15000);
    });
  }

  const esc=(x)=>String(x==null?'':x).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=(n)=>Number(n||0).toLocaleString('he-IL');
  function copy(text){
    const value=String(text||'');
    if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(value).catch(()=>fallbackCopy(value));
    fallbackCopy(value);
  }
  function fallbackCopy(value){const ta=document.createElement('textarea');ta.value=value;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}

  const style=document.createElement('style');
  style.id='rb-core-181-style';
  style.textContent=`
    #rb-core181-bar,#rb-core181-dock,#rb-core181-dock *{box-sizing:border-box}
    #rb-core181-bar,#rb-core181-dock{font-family:Arial,'Noto Sans Hebrew','David',sans-serif;direction:rtl;color:#173456}
    #rb-core181-bar{position:fixed;z-index:2147483000;right:18px;left:18px;bottom:10px;min-height:58px;display:grid;grid-template-columns:auto auto minmax(240px,1fr) auto;gap:8px;align-items:center;padding:7px 9px;background:linear-gradient(180deg,#fffefb,#fbf5e8);border:1px solid #d5b668;border-top:4px solid #b58a34;border-radius:10px;box-shadow:0 8px 28px rgba(24,44,75,.19)}
    #rb-core181-brand{border:0;border-radius:7px;background:#173f70;color:#fff;padding:10px 14px;font-weight:900;cursor:pointer;white-space:nowrap}#rb-core181-brand small{display:block;color:#f3d786;font-size:10px;font-weight:700;margin-top:2px}
    #rb-core181-modes{display:flex;gap:5px}.rb-core181-mode{border:1px solid #cdd4dc;background:#fff;color:#173456;border-radius:6px;padding:9px 11px;font-weight:800;cursor:pointer;white-space:nowrap}.rb-core181-mode.on{border-color:#b58a34;background:#f8ecd0;color:#725317}
    #rb-core181-searchwrap{min-width:0;display:grid;grid-template-columns:minmax(120px,1fr) auto;gap:6px}#rb-core181-q{width:100%;min-width:0;border:1px solid #bdc8d4;border-radius:7px;background:#fff;padding:10px 12px;font-size:15px;outline:none}#rb-core181-q:focus{border-color:#b58a34;box-shadow:0 0 0 2px rgba(181,138,52,.14)}#rb-core181-go{border:0;border-radius:7px;background:#b58a34;color:#fff;padding:10px 16px;font-weight:900;cursor:pointer}
    #rb-core181-open{border:1px solid #bdc8d4;background:#fff;color:#173456;border-radius:7px;padding:9px 11px;font-weight:800;cursor:pointer;white-space:nowrap}
    #rb-core181-dock{position:fixed;z-index:2147482999;right:18px;left:18px;bottom:76px;height:min(58vh,610px);display:none;grid-template-rows:auto auto 1fr;background:#fffefb;border:1px solid #d5b668;border-radius:12px;box-shadow:0 18px 55px rgba(24,44,75,.28);overflow:hidden}#rb-core181-dock.open{display:grid}
    #rb-core181-top{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(90deg,#f7ecd2,#fffefb);border-bottom:1px solid #e7d7ae}#rb-core181-title{font-size:17px;font-weight:900;color:#173f70}#rb-core181-stats{font-size:12px;color:#725f3c}.rb-core181-view{border:1px solid #cfd6dd;background:#fff;border-radius:6px;padding:7px 10px;font-weight:800;cursor:pointer}.rb-core181-view.on{background:#173f70;color:#fff;border-color:#173f70}#rb-core181-close{margin-right:auto;border:0;background:transparent;color:#596575;font-size:23px;cursor:pointer}
    #rb-core181-cats{display:flex;gap:5px;overflow-x:auto;padding:7px 10px;background:#fbfaf6;border-bottom:1px solid #e2e5e9;scrollbar-width:thin}.rb-core181-cat{flex:0 0 auto;border:1px solid #d3dae2;background:#fff;border-radius:15px;padding:6px 10px;font-size:12px;cursor:pointer}.rb-core181-cat.on{border-color:#b58a34;background:#f8ecd0;color:#725317;font-weight:900}
    #rb-core181-main{min-height:0;display:grid;grid-template-columns:minmax(320px,.88fr) minmax(420px,1.22fr);direction:rtl}#rb-core181-list{min-width:0;overflow:auto;padding:8px;background:#fafafa;border-left:1px solid #e1e5e9}#rb-core181-preview{min-width:0;overflow:auto;padding:14px 18px;background:#fff}
    .rb-core181-result{border:1px solid #d9dfe5;border-right:4px solid #c39a43;border-radius:8px;background:#fff;padding:9px 10px;margin-bottom:7px;cursor:pointer}.rb-core181-result:hover,.rb-core181-result.on{border-color:#c39a43;background:#fffaf0}.rb-core181-result b{display:block;color:#173f70}.rb-core181-result em{display:block;font-style:normal;color:#966f22;font-size:12px;margin:2px 0}.rb-core181-result p{margin:5px 0 0;line-height:1.48;color:#394654;font-size:13px;max-height:60px;overflow:hidden}
    #rb-core181-preview h3{margin:0;color:#173f70;font-size:19px}#rb-core181-preview .ref{color:#946d21;font-weight:800;margin:4px 0 10px}#rb-core181-preview .text{white-space:pre-wrap;line-height:1.8;font-size:15px;color:#26384b}.rb-core181-context{border-right:3px solid #e3c77d;padding:7px 10px;margin:7px 0;background:#fffdf7;border-radius:5px}.rb-core181-context.sel{background:#fbf0d3;border-right-color:#b58a34}
    #rb-core181-actions{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}#rb-core181-actions button{border:1px solid #cbd3dc;background:#fff;border-radius:6px;padding:7px 10px;cursor:pointer}#rb-core181-actions button.primary{background:#173f70;color:#fff;border-color:#173f70}
    #rb-core181-empty{padding:30px;text-align:center;color:#7b8490;line-height:1.7}#rb-core181-library{display:none;grid-column:1/3;overflow:auto;padding:12px;background:#fff}#rb-core181-library.open{display:block}#rb-core181-libtools{position:sticky;top:0;z-index:2;display:flex;gap:7px;background:#fff;padding-bottom:9px}#rb-core181-libq{flex:1;border:1px solid #cbd3dc;border-radius:7px;padding:9px 11px}.rb-core181-book{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:12px;align-items:center;border-bottom:1px solid #ece7dd;padding:8px 10px}.rb-core181-book b{color:#173f70}.rb-core181-book small{display:block;color:#818896;margin-top:2px}.rb-core181-book .n{color:#8b6822;font-size:12px;font-weight:700}
    #rb-core181-help{font-size:11px;color:#687383;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @media(max-width:920px){#rb-core181-bar{grid-template-columns:auto 1fr auto;right:8px;left:8px}#rb-core181-modes{grid-column:1/4;order:4}#rb-core181-dock{right:8px;left:8px;height:min(64vh,640px)}#rb-core181-main{grid-template-columns:1fr}#rb-core181-preview{display:none}#rb-core181-library{grid-column:1}.rb-core181-mode{flex:1}#rb-core181-brand small{display:none}}
  `;
  document.head.appendChild(style);

  const bar=document.createElement('section');bar.id='rb-core181-bar';
  bar.innerHTML=`<button id="rb-core181-brand">מאגר מקומי<small id="rb-core181-mini">LOCAL · טוען נתונים…</small></button><div id="rb-core181-modes"><button class="rb-core181-mode on" data-mode="literal">מצא מקור</button><button class="rb-core181-mode" data-mode="ask">שאל את המאגר</button></div><div><div id="rb-core181-searchwrap"><input id="rb-core181-q" autocomplete="off" placeholder="הדבק ציטוט, פסוק, מילה או ביטוי…"><button id="rb-core181-go">חפש</button></div><div id="rb-core181-help">חיפוש מקומי מיידי — ללא AI וללא אינטרנט</div></div><button id="rb-core181-open">פתח מאגר ▴</button>`;
  document.body.appendChild(bar);

  const dock=document.createElement('section');dock.id='rb-core181-dock';
  dock.innerHTML=`<div id="rb-core181-top"><div id="rb-core181-title">המאגר התורני המקומי</div><div id="rb-core181-stats">טוען…</div><button class="rb-core181-view on" data-view="results">תוצאות</button><button class="rb-core181-view" data-view="library">ספריית הספרים</button><button id="rb-core181-close">×</button></div><div id="rb-core181-cats">${Object.entries(CATS).map(([k,v])=>`<button class="rb-core181-cat ${k==='all'?'on':''}" data-cat="${k}">${v}</button>`).join('')}</div><div id="rb-core181-main"><div id="rb-core181-list"><div id="rb-core181-empty">כתוב מקור או שאלה בשורת המאגר. התוצאות יופיעו כאן.</div></div><div id="rb-core181-preview"><div id="rb-core181-empty">בחר תוצאה כדי לראות את המקור המלא וההקשר סביבו.</div></div><div id="rb-core181-library"></div></div>`;
  document.body.appendChild(dock);

  const $=id=>document.getElementById(id);
  const q=$('rb-core181-q'),list=$('rb-core181-list'),preview=$('rb-core181-preview'),library=$('rb-core181-library');
  function openDock(){dock.classList.add('open');$('rb-core181-open').textContent='סגור מאגר ▾';}
  function closeDock(){dock.classList.remove('open');$('rb-core181-open').textContent='פתח מאגר ▴';}
  function setMode(next){mode=next;document.querySelectorAll('.rb-core181-mode').forEach(b=>b.classList.toggle('on',b.dataset.mode===next));if(next==='ask'){q.placeholder='שאל שאלה טבעית, למשל: היכן הרמב״ם עוסק בעדות קרובים?';$('rb-core181-go').textContent='שאל';$('rb-core181-help').textContent='השאלה מפורקת למונחי חיפוש ונבדקת קודם במאגר המקומי';}else{q.placeholder='הדבק ציטוט, פסוק, מילה או ביטוי…';$('rb-core181-go').textContent='חפש';$('rb-core181-help').textContent='חיפוש מקומי מיידי — ללא AI וללא אינטרנט';}}
  function setCategory(next){category=next;document.querySelectorAll('.rb-core181-cat').forEach(b=>b.classList.toggle('on',b.dataset.cat===next));if(view==='library')loadLibrary();}
  function setView(next){view=next;document.querySelectorAll('.rb-core181-view').forEach(b=>b.classList.toggle('on',b.dataset.view===next));const isLib=next==='library';library.classList.toggle('open',isLib);list.style.display=isLib?'none':'block';preview.style.display=isLib?'none':'block';if(isLib)loadLibrary();}
  function renderStats(s){stats=s;const text=`${fmt(s.books)} ספרים · ${fmt(s.segments)} קטעים · LOCAL`;$('rb-core181-stats').textContent=text;$('rb-core181-mini').textContent=text;}

  async function search(){
    const text=q.value.trim();if(!text){q.focus();return;}openDock();setView('results');list.innerHTML='<div id="rb-core181-empty">מחפש במאגר המקומי…</div>';preview.innerHTML='<div id="rb-core181-empty">ממתין לתוצאות…</div>';
    try{const data=await request('search',{q:text,category,mode,limit:'70'});lastResults=data.results||[];selected=null;if(!lastResults.length){list.innerHTML='<div id="rb-core181-empty">לא נמצא מקור מתאים. נסה ביטוי קצר יותר, קטגוריה אחרת או מצב „שאל את המאגר”.</div>';preview.innerHTML='<div id="rb-core181-empty">לא נמצאו תוצאות.</div>';return;}list.innerHTML=lastResults.map((x,i)=>`<article class="rb-core181-result" data-i="${i}"><b>${esc(x.he_book||x.book)}</b><em>${esc(x.ref||'')}</em><p>${esc(x.text||'')}</p></article>`).join('');selectResult(0);}catch(e){list.innerHTML=`<div id="rb-core181-empty">שגיאה בחיפוש: ${esc(e.message)}</div>`;preview.innerHTML='';}
  }
  async function selectResult(i){
    const x=lastResults[i];if(!x)return;selected=x;document.querySelectorAll('.rb-core181-result').forEach((el,j)=>el.classList.toggle('on',j===i));preview.innerHTML=`<h3>${esc(x.he_book||x.book)}</h3><div class="ref">${esc(x.ref||'')}</div><div id="rb-core181-actions"><button class="primary" id="rb-core181-copy">העתק</button><button id="rb-core181-copyref">העתק עם מקור</button><button id="rb-core181-copyhag">העתק להגה</button></div><div class="text">${esc(x.text||'')}</div><div id="rb-core181-context"><div id="rb-core181-empty">טוען הקשר מהספר…</div></div>`;
    $('rb-core181-copy').onclick=()=>copy(x.text||'');$('rb-core181-copyref').onclick=()=>copy(`${x.text||''}\n(${x.he_book||x.book} — ${x.ref||''})`);$('rb-core181-copyhag').onclick=()=>copy(`${x.text||''} [${x.he_book||x.book} ${x.ref||''}]`);
    try{const ctx=await request('context',{id:String(x.id),radius:'3'});$('rb-core181-context').innerHTML=(ctx.rows||[]).map(y=>`<div class="rb-core181-context ${Number(y.id)===Number(x.id)?'sel':''}"><b>${esc(y.ref||'')}</b><div>${esc(y.text||'')}</div></div>`).join('');}catch(e){$('rb-core181-context').innerHTML=`<div id="rb-core181-empty">לא ניתן לטעון הקשר: ${esc(e.message)}</div>`;}
  }
  async function loadLibrary(term=''){
    openDock();library.innerHTML='<div id="rb-core181-empty">טוען את ספריית המאגר…</div>';
    try{const books=await request('catalog',{q:term,category,limit:'800'});library.innerHTML=`<div id="rb-core181-libtools"><input id="rb-core181-libq" placeholder="חפש שם ספר בתוך ${esc(CATS[category])}" value="${esc(term)}"><button class="rb-core181-view" id="rb-core181-libgo">חפש ספר</button></div><div style="font-weight:800;color:#173f70;margin:2px 5px 8px">${esc(CATS[category])} — ${fmt(books.length)} ספרים מוצגים</div>${books.map(b=>`<div class="rb-core181-book"><div><b>${esc(b.he_title||b.title)}</b><small>${esc(b.title||'')}</small></div><div class="n">${fmt(b.segments)} קטעים</div></div>`).join('')}`;$('rb-core181-libgo').onclick=()=>loadLibrary($('rb-core181-libq').value.trim());$('rb-core181-libq').addEventListener('keydown',e=>{if(e.key==='Enter')loadLibrary(e.target.value.trim());});}catch(e){library.innerHTML=`<div id="rb-core181-empty">שגיאה בטעינת הספרייה: ${esc(e.message)}</div>`;}
  }

  $('rb-core181-brand').onclick=openDock;$('rb-core181-open').onclick=()=>dock.classList.contains('open')?closeDock():openDock();$('rb-core181-close').onclick=closeDock;$('rb-core181-go').onclick=search;q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
  document.querySelectorAll('.rb-core181-mode').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('rb-core181-cats').onclick=e=>{const b=e.target.closest('.rb-core181-cat');if(b)setCategory(b.dataset.cat);};list.onclick=e=>{const card=e.target.closest('.rb-core181-result');if(card)selectResult(Number(card.dataset.i));};document.querySelectorAll('.rb-core181-view').forEach(b=>b.onclick=()=>setView(b.dataset.view));

  document.addEventListener('click',e=>{
    if(e.target.closest('#rb-core181-bar,#rb-core181-dock'))return;
    const b=e.target.closest('button');if(!b)return;
    const text=(b.textContent||'').replace(/\s+/g,' ').trim();
    if(text==='בדוק מקור'||text==='בדיקת מקור'||text==='שאל את המאגר'){
      e.preventDefault();e.stopImmediatePropagation();openDock();if(text==='שאל את המאגר')setMode('ask');else setMode('literal');q.focus();
    }
  },true);

  request('stats').then(renderStats).catch(()=>{$('rb-core181-stats').textContent='LOCAL · המאגר מותקן';$('rb-core181-mini').textContent='LOCAL · המאגר מותקן';});
  setMode('literal');
})();
