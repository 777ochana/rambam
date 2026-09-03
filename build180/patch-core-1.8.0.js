const fs = require('fs');
const [,, mainPath, packagePath] = process.argv;
if (!mainPath || !packagePath) throw new Error('Usage: patch-core-1.8.0.js <main.js> <package.json>');
let s = fs.readFileSync(mainPath, 'utf8');
if (!s.includes('LOCAL_CORPUS_176')) throw new Error('1.7.6 local-corpus backend must be applied first');
if (s.includes('LOCAL_CORE_180')) throw new Error('1.8.0 core library already applied');

const zoomListener = `_electron.app.on('browser-window-created', (_event, window) => {\n  try { window.webContents.setZoomFactor(1); } catch {}\n});`;
if (!s.includes(zoomListener)) throw new Error('1.7.6 browser-window marker missing');

const helpers = String.raw`
// LOCAL_CORE_180 — local Torah library is promoted to a persistent core workspace layer.
const CORE_CATEGORY_LABELS_180 = {
  all: 'כל המאגר', rambam: 'רמב״ם', rishonim: 'ראשונים', bavli: 'תלמוד בבלי',
  yerushalmi: 'תלמוד ירושלמי', mishnah: 'משנה', tosefta: 'תוספתא', tanakh: 'תנ״ך',
  tur: 'טור', shulchan_arukh: 'שולחן ערוך', midrash: 'מדרש', responsa: 'שו״ת',
  halakhah: 'הלכה', thought: 'מחשבה'
};
function coreNormalizeQuestion180(value) {
  const stop = new Set(['מה','מי','איך','למה','האם','איפה','היכן','כתוב','נאמר','מצא','מצאו','לי','את','על','של','לפי','מהו','מהי','מהם','מהן','בעניין','בנושא','ביחס']);
  return (0, _core.normalizeHebrew)(String(value || '')).split(/\\s+/).filter(x => x.length > 1 && !stop.has(x)).slice(0, 14).join(' ');
}
function coreSearch180(query, category = 'all', mode = 'literal', limit = 60) {
  const raw = String(query || '').slice(0, 500);
  const normalized = mode === 'ask' ? coreNormalizeQuestion180(raw) : (0, _core.normalizeHebrew)(raw);
  if (!normalized) return { query: raw, normalized, results: [], elapsedMs: 0, mode, category };
  const started = Date.now();
  const terms = normalized.split(/\\s+/).filter(x => x.length > 1).slice(0, 14);
  const attempts = mode === 'literal'
    ? ['"' + normalized.replace(/"/g, '') + '"', terms.map(x => '"' + x.replace(/"/g, '') + '"').join(' AND '), terms.map(x => '"' + x.replace(/"/g, '') + '"').join(' OR ')]
    : [terms.map(x => '"' + x.replace(/"/g, '') + '"').join(' AND '), terms.map(x => '"' + x.replace(/"/g, '') + '"').join(' OR ')];
  const cat = Object.prototype.hasOwnProperty.call(CORE_CATEGORY_LABELS_180, category) ? category : 'all';
  const where = cat === 'all' ? '' : ' AND s.category=' + sqlQuote(cat);
  for (const expression of attempts.filter(Boolean)) {
    const sql = 'SELECT s.id,s.book,s.he_book,s.category,s.ref,s.text,s.seq,bm25(segments_fts) AS rank FROM segments_fts JOIN segments s ON s.id=segments_fts.rowid WHERE segments_fts MATCH ' + sqlQuote(expression) + where + ' ORDER BY rank LIMIT ' + Math.min(Math.max(Number(limit) || 60, 1), 80) + ';';
    const rows = runLocalSql(sql);
    if (rows.length) return { query: raw, normalized, results: rows, elapsedMs: Date.now() - started, mode, category: cat };
  }
  return { query: raw, normalized, results: [], elapsedMs: Date.now() - started, mode, category: cat };
}
function coreStats180() {
  const totals = runLocalSql("SELECT (SELECT count(*) FROM books) AS books,(SELECT count(*) FROM segments) AS segments;")[0] || { books: 0, segments: 0 };
  const categories = runLocalSql("SELECT category,count(*) AS books,sum(segments) AS segments FROM books GROUP BY category ORDER BY count(*) DESC;");
  return { books: Number(totals.books || 0), segments: Number(totals.segments || 0), categories };
}
function coreCatalog180(q = '', category = 'all') {
  const term = (0, _core.normalizeHebrew)(String(q || '').slice(0, 120));
  const cat = Object.prototype.hasOwnProperty.call(CORE_CATEGORY_LABELS_180, category) ? category : 'all';
  let where = cat === 'all' ? '1=1' : 'category=' + sqlQuote(cat);
  if (term) {
    const like = '%' + term.replace(/[%_]/g, '') + '%';
    where += ' AND (title LIKE ' + sqlQuote(like) + ' OR he_title LIKE ' + sqlQuote(like) + ')';
  }
  return runLocalSql('SELECT title,he_title,category,license,segments FROM books WHERE ' + where + ' ORDER BY COALESCE(NULLIF(he_title,\'\'),title) COLLATE NOCASE LIMIT 180;');
}
function coreContext180(id, radius = 3) {
  const n = Number(id || 0);
  if (!Number.isFinite(n) || n <= 0) return { selected: null, rows: [] };
  const selected = runLocalSql('SELECT id,book,he_book,category,ref,text,seq FROM segments WHERE id=' + Math.floor(n) + ' LIMIT 1;')[0];
  if (!selected) return { selected: null, rows: [] };
  const r = Math.min(Math.max(Number(radius) || 3, 1), 8);
  const rows = runLocalSql('SELECT id,book,he_book,category,ref,text,seq FROM segments WHERE book=' + sqlQuote(selected.book) + ' AND seq BETWEEN ' + Math.max(0, Number(selected.seq) - r) + ' AND ' + (Number(selected.seq) + r) + ' ORDER BY seq;');
  return { selected, rows };
}
function coreSend180(win, rid, ok, data) {
  try {
    const payload = JSON.stringify({ rid, ok, data });
    win.webContents.executeJavaScript('window.__RB_CORE_RECEIVE__ && window.__RB_CORE_RECEIVE__(' + JSON.stringify(payload) + ')', true).catch(() => {});
  } catch (error) { console.warn('LOCAL_CORE_180 send failed', error); }
}
function coreHandleNavigation180(win, event, url) {
  if (!String(url || '').startsWith('rambam-local://')) return false;
  event.preventDefault();
  try {
    const u = new URL(url); const rid = u.searchParams.get('rid') || '';
    const action = u.hostname || u.pathname.replace(/^\\//, '');
    let data;
    if (action === 'stats') data = coreStats180();
    else if (action === 'catalog') data = coreCatalog180(u.searchParams.get('q') || '', u.searchParams.get('category') || 'all');
    else if (action === 'search') data = coreSearch180(u.searchParams.get('q') || '', u.searchParams.get('category') || 'all', u.searchParams.get('mode') || 'literal', Number(u.searchParams.get('limit') || 60));
    else if (action === 'context') data = coreContext180(u.searchParams.get('id') || '', Number(u.searchParams.get('radius') || 3));
    else throw new Error('Unknown local-core action: ' + action);
    coreSend180(win, rid, true, data);
  } catch (error) { coreSend180(win, '', false, { message: String(error && error.message || error) }); }
  return true;
}
function coreDockInjection180() { return String.raw`(()=>{
if(window.__RB_CORE_180__)return;window.__RB_CORE_180__=true;
const CATS={all:'כל המאגר',rambam:'רמב״ם',rishonim:'ראשונים',bavli:'בבלי',yerushalmi:'ירושלמי',mishnah:'משנה',tosefta:'תוספתא',tanakh:'תנ״ך',tur:'טור',shulchan_arukh:'שולחן ערוך',midrash:'מדרש',responsa:'שו״ת',halakhah:'הלכה',thought:'מחשבה'};
let seq=0,pending=new Map(),lastResults=[],selected=null,currentMode='literal',currentCategory='all',currentView='search';
window.__RB_CORE_RECEIVE__=raw=>{try{const m=JSON.parse(raw),p=pending.get(m.rid);if(!p)return;pending.delete(m.rid);m.ok?p.resolve(m.data):p.reject(new Error(m.data&&m.data.message||'שגיאה במאגר'));}catch{}};
function request(action,params={}){return new Promise((resolve,reject)=>{const rid='r'+Date.now()+'_'+(++seq);pending.set(rid,{resolve,reject});const q=new URLSearchParams({...params,rid});const a=document.createElement('a');a.href='rambam-local://'+action+'/?'+q.toString();a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>{if(pending.has(rid)){pending.delete(rid);reject(new Error('המאגר לא החזיר תשובה בזמן'));}},12000);});}
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
const style=document.createElement('style');style.id='rb-core-180-style';style.textContent=`
#rb-core-bar,#rb-core-dock{font-family:Arial,'Noto Sans Hebrew','David',sans-serif;direction:rtl;color:#173456;box-sizing:border-box}
#rb-core-bar{position:fixed;left:10px;right:10px;bottom:8px;height:54px;z-index:2147483000;background:linear-gradient(180deg,#fffefb,#fbf5e8);border:1px solid #d7b76b;border-top:3px solid #b78b31;border-radius:10px;box-shadow:0 8px 28px rgba(28,42,67,.16);display:grid;grid-template-columns:auto auto 1fr auto;gap:8px;align-items:center;padding:6px 9px}
#rb-core-brand{border:0;background:#173f70;color:#fff;border-radius:7px;padding:9px 13px;font-weight:800;white-space:nowrap;cursor:pointer}#rb-core-brand span{color:#f5d98a;font-size:11px;margin-right:6px}
.rb-core-mode{border:1px solid #d0d7df;background:#fff;color:#173456;border-radius:6px;padding:8px 10px;font-weight:700;cursor:pointer}.rb-core-mode.on{border-color:#b78b31;background:#f8ecd0;color:#725317}
#rb-core-quick{display:flex;gap:6px;min-width:0}#rb-core-q{width:100%;min-width:120px;border:1px solid #cbd3dc;border-radius:7px;background:#fff;padding:9px 11px;font-size:14px;outline:none}#rb-core-q:focus{border-color:#b78b31;box-shadow:0 0 0 2px rgba(183,139,49,.12)}
#rb-core-go{border:0;border-radius:7px;background:#b58a34;color:white;font-weight:800;padding:9px 15px;cursor:pointer;white-space:nowrap}#rb-core-expand{border:1px solid #cbd3dc;background:#fff;border-radius:7px;padding:8px 10px;cursor:pointer}
#rb-core-dock{position:fixed;left:10px;right:10px;bottom:70px;height:min(46vh,480px);z-index:2147482999;background:#fffefb;border:1px solid #d7b76b;border-radius:12px;box-shadow:0 18px 50px rgba(25,40,66,.24);display:none;overflow:hidden}#rb-core-dock.open{display:grid;grid-template-rows:auto auto 1fr}
#rb-core-top{display:flex;align-items:center;gap:8px;padding:9px 12px;background:linear-gradient(90deg,#f7edd7,#fffefb);border-bottom:1px solid #ead9b5}#rb-core-title{font-weight:900;color:#173f70;font-size:16px}#rb-core-stats{font-size:12px;color:#7b6943}.rb-core-view{border:1px solid #d2d9e0;background:white;border-radius:6px;padding:7px 10px;font-weight:700;cursor:pointer}.rb-core-view.on{background:#173f70;color:#fff;border-color:#173f70}#rb-core-close{margin-right:auto;border:0;background:transparent;font-size:20px;color:#5a6470;cursor:pointer}
#rb-core-cats{display:flex;gap:5px;overflow:auto;padding:7px 10px;border-bottom:1px solid #e3e6ea;background:#fcfbf7}.rb-core-cat{flex:0 0 auto;border:1px solid #d7dde4;background:white;border-radius:15px;padding:5px 10px;font-size:12px;cursor:pointer}.rb-core-cat.on{border-color:#b78b31;background:#f8ecd0;color:#725317;font-weight:800}
#rb-core-main{display:grid;grid-template-columns:minmax(330px,.9fr) minmax(420px,1.25fr);min-height:0;direction:rtl}#rb-core-list{overflow:auto;border-left:1px solid #e2e5e9;background:#fafafa;padding:8px}#rb-core-preview{overflow:auto;padding:14px 18px;background:#fff}
.rb-core-card{border:1px solid #dbe0e5;border-right:4px solid #c29a43;border-radius:8px;background:#fff;padding:9px 10px;margin-bottom:7px;cursor:pointer}.rb-core-card:hover,.rb-core-card.on{border-color:#c29a43;background:#fffaf0}.rb-core-card b{display:block;color:#173f70}.rb-core-card em{display:block;font-style:normal;color:#9a7426;font-size:12px;margin:2px 0}.rb-core-card p{margin:5px 0 0;line-height:1.45;color:#394553;font-size:13px;max-height:58px;overflow:hidden}
#rb-core-preview h3{margin:0;color:#173f70;font-size:18px}#rb-core-preview .ref{color:#9a7426;font-weight:700;margin:4px 0 10px}#rb-core-preview .txt{white-space:pre-wrap;line-height:1.75;font-size:15px;color:#26384c}#rb-core-preview .ctx{border-right:3px solid #e3c77e;padding:7px 10px;margin:7px 0;background:#fffdf7;border-radius:5px}#rb-core-preview .ctx.sel{background:#fbf0d4;border-right-color:#b78b31}
#rb-core-actions{display:flex;gap:7px;margin:10px 0;flex-wrap:wrap}#rb-core-actions button{border:1px solid #cbd3dc;background:#fff;border-radius:6px;padding:7px 10px;cursor:pointer}#rb-core-actions button.primary{background:#173f70;color:white;border-color:#173f70}
#rb-core-empty{color:#7b8490;padding:28px;text-align:center}#rb-core-library{display:none;grid-column:1/3;overflow:auto;padding:12px;background:#fff}#rb-core-library.open{display:block}.rb-core-catcard{display:inline-flex;gap:7px;align-items:center;border:1px solid #ddd6c8;border-radius:8px;background:#fffaf0;margin:4px;padding:8px 12px;cursor:pointer}.rb-core-book{display:grid;grid-template-columns:1fr auto;gap:8px;border-bottom:1px solid #edf0f2;padding:8px 4px}.rb-core-book b{color:#173f70}.rb-core-book small{color:#7d8690}
@media(max-width:900px){#rb-core-bar{grid-template-columns:auto 1fr auto}.rb-core-mode{display:none}#rb-core-main{grid-template-columns:1fr}#rb-core-list{border-left:0;border-bottom:1px solid #e2e5e9;max-height:180px}#rb-core-dock{height:58vh}}
`;document.head.appendChild(style);
const bar=document.createElement('div');bar.id='rb-core-bar';bar.innerHTML='<button id="rb-core-brand">מאגר מקומי <span id="rb-core-mini">LOCAL</span></button><div><button class="rb-core-mode on" data-mode="literal">מצא מקור</button><button class="rb-core-mode" data-mode="ask">שאל את המאגר</button></div><div id="rb-core-quick"><input id="rb-core-q" placeholder="מצא מקור: הדבק משפט, מילה או ביטוי..."><button id="rb-core-go">חפש</button></div><button id="rb-core-expand">▴</button>';document.body.appendChild(bar);
const dock=document.createElement('section');dock.id='rb-core-dock';dock.innerHTML='<div id="rb-core-top"><div id="rb-core-title">המאגר התורני המקומי</div><div id="rb-core-stats">טוען נתונים...</div><button class="rb-core-view on" data-view="search">חיפוש במאגר</button><button class="rb-core-view" data-view="library">ספריית הספרים</button><button id="rb-core-close">×</button></div><div id="rb-core-cats"></div><div id="rb-core-main"><div id="rb-core-list"><div id="rb-core-empty">המאגר הוא שכבת עבודה קבועה. כתוב שאילתה בשורה למטה ובחר “מצא מקור” או “שאל את המאגר”.</div></div><div id="rb-core-preview"><h3>תצוגה מקדימה</h3><div class="txt">בחר תוצאה כדי לראות את המקור וההקשר המלא מבלי לעזוב את ההלכה.</div></div><div id="rb-core-library"></div></div>';document.body.appendChild(dock);
const $=id=>document.getElementById(id);function open(){dock.classList.add('open');$('rb-core-expand').textContent='▾'}function close(){dock.classList.remove('open');$('rb-core-expand').textContent='▴'}
function setMode(m){currentMode=m;document.querySelectorAll('.rb-core-mode').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));$('rb-core-q').placeholder=m==='literal'?'מצא מקור: הדבק משפט, מילה או ביטוי...':'שאל את המאגר: למשל — מה כתבו הראשונים על דין זה?';}
function setCategory(c){currentCategory=c;document.querySelectorAll('.rb-core-cat').forEach(b=>b.classList.toggle('on',b.dataset.cat===c));if(currentView==='library')loadLibrary();}
function renderCats(stats){$('rb-core-cats').innerHTML=Object.keys(CATS).map(k=>'<button class="rb-core-cat '+(k==='all'?'on':'')+'" data-cat="'+k+'">'+esc(CATS[k])+'</button>').join('');$('rb-core-stats').textContent=Number(stats.books).toLocaleString()+' ספרים · '+Number(stats.segments).toLocaleString()+' קטעים · LOCAL';$('rb-core-mini').textContent=Number(stats.books).toLocaleString()+' ספרים';}
async function search(){const q=$('rb-core-q').value.trim();if(!q)return;open();currentView='search';document.querySelectorAll('.rb-core-view').forEach(b=>b.classList.toggle('on',b.dataset.view==='search'));$('rb-core-library').classList.remove('open');$('rb-core-list').style.display='block';$('rb-core-preview').style.display='block';$('rb-core-list').innerHTML='<div id="rb-core-empty">מחפש במאגר המקומי...</div>';try{const r=await request('search',{q,category:currentCategory,mode:currentMode,limit:'70'});lastResults=r.results||[];if(!lastResults.length){$('rb-core-list').innerHTML='<div id="rb-core-empty">לא נמצא מקור מתאים. נסה פחות מילים, ביטוי אחר או “כל המאגר”.</div>';$('rb-core-preview').innerHTML='<h3>לא נמצאו תוצאות</h3><div class="txt">השאילתה שנבדקה: '+esc(r.normalized||q)+'</div>';return;}$('rb-core-list').innerHTML=lastResults.map((x,i)=>'<article class="rb-core-card" data-i="'+i+'"><b>'+esc(x.he_book||x.book)+'</b><em>'+esc(x.ref||'')+'</em><p>'+esc(x.text||'')+'</p></article>').join('');selectResult(0);}catch(e){$('rb-core-list').innerHTML='<div id="rb-core-empty">שגיאה: '+esc(e.message)+'</div>';}}
async function selectResult(i){const x=lastResults[i];if(!x)return;selected=x;document.querySelectorAll('.rb-core-card').forEach((c,j)=>c.classList.toggle('on',j===i));$('rb-core-preview').innerHTML='<h3>'+esc(x.he_book||x.book)+'</h3><div class="ref">'+esc(x.ref||'')+'</div><div id="rb-core-actions"><button class="primary" id="rb-copy-text">העתק</button><button id="rb-copy-ref">העתק עם מקור</button><button id="rb-copy-hagaha">העתק להגה</button></div><div class="txt">'+esc(x.text||'')+'</div><div id="rb-core-context"><div id="rb-core-empty">טוען הקשר...</div></div>';$('rb-copy-text').onclick=()=>copy(x.text||'');$('rb-copy-ref').onclick=()=>copy((x.text||'')+'\n('+((x.he_book||x.book)+' — '+(x.ref||''))+')');$('rb-copy-hagaha').onclick=()=>copy((x.text||'')+' ['+(x.he_book||x.book)+' '+(x.ref||'')+']');try{const c=await request('context',{id:String(x.id),radius:'3'});$('rb-core-context').innerHTML=(c.rows||[]).map(y=>'<div class="ctx '+(Number(y.id)===Number(x.id)?'sel':'')+'"><b>'+esc(y.ref||'')+'</b><div>'+esc(y.text||'')+'</div></div>').join('');}catch{$('rb-core-context').innerHTML='';}}
function copy(t){if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t);else{const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}}
async function loadLibrary(){open();currentView='library';document.querySelectorAll('.rb-core-view').forEach(b=>b.classList.toggle('on',b.dataset.view==='library'));$('rb-core-library').classList.add('open');$('rb-core-list').style.display='none';$('rb-core-preview').style.display='none';$('rb-core-library').innerHTML='<div id="rb-core-empty">טוען ספרייה...</div>';try{const books=await request('catalog',{q:'',category:currentCategory});$('rb-core-library').innerHTML='<div style="margin-bottom:8px;font-weight:800;color:#173f70">'+esc(CATS[currentCategory])+' — '+books.length+' ספרים מוצגים</div>'+books.map(b=>'<div class="rb-core-book"><div><b>'+esc(b.he_title||b.title)+'</b><small>'+esc(b.title||'')+'</small></div><div>'+Number(b.segments||0).toLocaleString()+' קטעים</div></div>').join('');}catch(e){$('rb-core-library').innerHTML='<div id="rb-core-empty">'+esc(e.message)+'</div>';}}
$('rb-core-brand').onclick=open;$('rb-core-expand').onclick=()=>dock.classList.contains('open')?close():open;$('rb-core-close').onclick=close;$('rb-core-go').onclick=search;$('rb-core-q').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});document.querySelectorAll('.rb-core-mode').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('rb-core-cats').onclick=e=>{const b=e.target.closest('.rb-core-cat');if(b)setCategory(b.dataset.cat)};$('rb-core-list').onclick=e=>{const c=e.target.closest('.rb-core-card');if(c)selectResult(Number(c.dataset.i))};document.querySelectorAll('.rb-core-view').forEach(b=>b.onclick=()=>b.dataset.view==='library'?loadLibrary():(currentView='search',b.classList.add('on'),$('rb-core-library').classList.remove('open'),$('rb-core-list').style.display='block',$('rb-core-preview').style.display='block'));
document.addEventListener('click',e=>{if(e.target.closest('#rb-core-bar,#rb-core-dock'))return;const b=e.target.closest('button');if(!b)return;const t=(b.textContent||'').replace(/\s+/g,' ').trim();if(t==='בדוק מקור'||t==='בדיקת מקור'||t==='שאל את המאגר'){e.preventDefault();e.stopImmediatePropagation();open();$('rb-core-q').focus();}},true);
request('stats').then(renderCats).catch(()=>{$('rb-core-stats').textContent='LOCAL · המאגר מותקן'});setMode('literal');
})();`; }
`;

const insertionMarker = '// Restore the original 1.6.3 visual scale if a previous experimental build left a Chromium zoom state behind.';
if (!s.includes(insertionMarker)) throw new Error('1.7.6 core insertion marker missing');
s = s.replace(insertionMarker, helpers + '\n' + insertionMarker);

const enhancedListener = `_electron.app.on('browser-window-created', (_event, window) => {\n  try { window.webContents.setZoomFactor(1); } catch {}\n  window.webContents.on('will-navigate', (event, url) => { coreHandleNavigation180(window, event, url); });\n  window.webContents.on('did-finish-load', () => {\n    try { window.webContents.setZoomFactor(1); } catch {}\n    window.webContents.executeJavaScript(coreDockInjection180(), true).catch(error => console.warn('LOCAL_CORE_180 injection failed', error));\n  });\n});`;
s = s.replace(zoomListener, enhancedListener);

fs.writeFileSync(mainPath, s, 'utf8');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = '1.8.0';
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2), 'utf8');
console.log('Applied 1.8.0 core local-library workspace; renderer files remain unchanged.');
