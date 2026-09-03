const fs=require('fs');
const [,,mainPath,packagePath]=process.argv;
if(!mainPath||!packagePath)throw new Error('Usage: patch-core-1.8.1.js <main.js> <package.json>');
let s=fs.readFileSync(mainPath,'utf8');
if(!s.includes('LOCAL_CORPUS_176'))throw new Error('1.7.6 local-corpus backend must be applied first');
if(s.includes('LOCAL_CORE_181'))throw new Error('1.8.1 Core Library already applied');
const zoomListener="_electron.app.on('browser-window-created', (_event, window) => {\n  try { window.webContents.setZoomFactor(1); } catch {}\n});";
if(!s.includes(zoomListener))throw new Error('1.7.6 browser-window marker missing');
const helpers=String.raw`
// LOCAL_CORE_181 — local Torah library is a core workspace layer; renderer files remain untouched.
const CORE_CATEGORY_LABELS_181={all:'כל המאגר',rambam:'רמב״ם',rishonim:'ראשונים',bavli:'תלמוד בבלי',yerushalmi:'תלמוד ירושלמי',mishnah:'משנה',tosefta:'תוספתא',tanakh:'תנ״ך',tur:'טור',shulchan_arukh:'שולחן ערוך',midrash:'מדרש',responsa:'שו״ת',halakhah:'הלכה',thought:'מחשבה'};
function coreNormalizeQuestion181(value){
  const stop=new Set(['מה','מי','איך','למה','האם','איפה','היכן','כתוב','נאמר','מצא','מצאו','לי','את','על','של','לפי','מהו','מהי','מהם','מהן','בעניין','בנושא','ביחס','מקור','מקורות']);
  return (0,_core.normalizeHebrew)(String(value||'')).split(/\s+/).filter(x=>x.length>1&&!stop.has(x)).slice(0,16).join(' ');
}
function coreSearch181(query,category,mode,limit){
  const raw=String(query||'').slice(0,500),cat=Object.prototype.hasOwnProperty.call(CORE_CATEGORY_LABELS_181,category)?category:'all';
  const normalized=mode==='ask'?coreNormalizeQuestion181(raw):(0,_core.normalizeHebrew)(raw);
  if(!normalized)return{query:raw,normalized,results:[],elapsedMs:0,mode:mode||'literal',category:cat};
  const started=Date.now(),terms=normalized.split(/\s+/).filter(x=>x.length>1).slice(0,16);
  const attempts=mode==='ask'?[terms.map(x=>'"'+x.replace(/"/g,'')+'"').join(' AND '),terms.map(x=>'"'+x.replace(/"/g,'')+'"').join(' OR ')]:['"'+normalized.replace(/"/g,'')+'"',terms.map(x=>'"'+x.replace(/"/g,'')+'"').join(' AND '),terms.map(x=>'"'+x.replace(/"/g,'')+'"').join(' OR ')];
  const where=cat==='all'?'':' AND s.category='+sqlQuote(cat),max=Math.min(Math.max(Number(limit)||60,1),100);
  for(const expression of attempts.filter(Boolean)){
    const sql='SELECT s.id,s.book,s.he_book,s.category,s.ref,s.text,s.seq,bm25(segments_fts) AS rank FROM segments_fts JOIN segments s ON s.id=segments_fts.rowid WHERE segments_fts MATCH '+sqlQuote(expression)+where+' ORDER BY rank LIMIT '+max+';';
    const rows=runLocalSql(sql);if(rows.length)return{query:raw,normalized,results:rows,elapsedMs:Date.now()-started,mode:mode||'literal',category:cat};
  }
  return{query:raw,normalized,results:[],elapsedMs:Date.now()-started,mode:mode||'literal',category:cat};
}
function coreStats181(){
  const totals=runLocalSql("SELECT (SELECT count(*) FROM books) AS books,(SELECT count(*) FROM segments) AS segments;")[0]||{books:0,segments:0};
  const categories=runLocalSql("SELECT category,count(*) AS books,sum(segments) AS segments FROM books GROUP BY category ORDER BY count(*) DESC;");
  return{books:Number(totals.books||0),segments:Number(totals.segments||0),categories};
}
function coreCatalog181(q,category,limit){
  const term=(0,_core.normalizeHebrew)(String(q||'').slice(0,150)),cat=Object.prototype.hasOwnProperty.call(CORE_CATEGORY_LABELS_181,category)?category:'all';
  let where=cat==='all'?'1=1':'category='+sqlQuote(cat);
  if(term){const like='%'+term.replace(/[%_]/g,'')+'%';where+=' AND (title LIKE '+sqlQuote(like)+' OR he_title LIKE '+sqlQuote(like)+')';}
  return runLocalSql('SELECT title,he_title,category,license,segments FROM books WHERE '+where+' ORDER BY COALESCE(NULLIF(he_title,\'\'),title) COLLATE NOCASE LIMIT '+Math.min(Math.max(Number(limit)||500,1),1000)+';');
}
function coreContext181(id,radius){
  const n=Number(id||0);if(!Number.isFinite(n)||n<=0)return{selected:null,rows:[]};
  const selected=runLocalSql('SELECT id,book,he_book,category,ref,text,seq FROM segments WHERE id='+Math.floor(n)+' LIMIT 1;')[0];if(!selected)return{selected:null,rows:[]};
  const r=Math.min(Math.max(Number(radius)||3,1),8),rows=runLocalSql('SELECT id,book,he_book,category,ref,text,seq FROM segments WHERE book='+sqlQuote(selected.book)+' AND seq BETWEEN '+Math.max(0,Number(selected.seq)-r)+' AND '+(Number(selected.seq)+r)+' ORDER BY seq;');
  return{selected,rows};
}
function coreSend181(win,rid,ok,data){
  try{const payload=JSON.stringify({rid,ok,data});win.webContents.executeJavaScript('window.__RB_CORE_RECEIVE__&&window.__RB_CORE_RECEIVE__('+payload+')',true).catch(()=>{});}catch(error){console.warn('LOCAL_CORE_181 send failed',error);}
}
function coreHandleNavigation181(win,event,url){
  if(!String(url||'').startsWith('rambam-local://'))return false;event.preventDefault();let rid='';
  try{const u=new URL(url);rid=u.searchParams.get('rid')||'';const action=u.hostname||u.pathname.replace(/^\//,'');let data;
    if(action==='stats')data=coreStats181();
    else if(action==='catalog')data=coreCatalog181(u.searchParams.get('q')||'',u.searchParams.get('category')||'all',Number(u.searchParams.get('limit')||500));
    else if(action==='search')data=coreSearch181(u.searchParams.get('q')||'',u.searchParams.get('category')||'all',u.searchParams.get('mode')||'literal',Number(u.searchParams.get('limit')||60));
    else if(action==='context')data=coreContext181(u.searchParams.get('id')||'',Number(u.searchParams.get('radius')||3));
    else throw new Error('Unknown local-core action: '+action);coreSend181(win,rid,true,data);
  }catch(error){coreSend181(win,rid,false,{message:String(error&&error.message||error)});}return true;
}
function coreUiPath181(){return _nodePath.default.join(process.resourcesPath,'core-library','core-library-ui.js');}
function coreUiScript181(){try{return _nodeFs.default.readFileSync(coreUiPath181(),'utf8');}catch(error){console.warn('LOCAL_CORE_181 UI file missing',coreUiPath181(),error&&error.message);return '';}}
`;
const insertionMarker='// Restore the original 1.6.3 visual scale if a previous experimental build left a Chromium zoom state behind.';
if(!s.includes(insertionMarker))throw new Error('1.7.6 core insertion marker missing');
s=s.replace(insertionMarker,helpers+'\n'+insertionMarker);
const enhanced="_electron.app.on('browser-window-created', (_event, window) => {\n  try { window.webContents.setZoomFactor(1); } catch {}\n  window.webContents.on('will-navigate', (event, url) => { coreHandleNavigation181(window, event, url); });\n  window.webContents.on('did-finish-load', () => {\n    try { window.webContents.setZoomFactor(1); } catch {}\n    const ui = coreUiScript181();\n    if (ui) window.webContents.executeJavaScript(ui, true).catch(error => console.warn('LOCAL_CORE_181 UI injection failed', error));\n  });\n});";
s=s.replace(zoomListener,enhanced);
fs.writeFileSync(mainPath,s,'utf8');
const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));pkg.version='1.8.1';fs.writeFileSync(packagePath,JSON.stringify(pkg,null,2),'utf8');
console.log('Applied LOCAL_CORE_181 using external core-library-ui.js; original renderer files untouched.');
