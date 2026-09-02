const { app, safeStorage } = require('electron');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

const resources = process.resourcesPath;
const dbPath = path.join(resources, 'local-library', 'torah-library.sqlite');
const sqliteExe = path.join(resources, 'local-library', 'sqlite3.exe');
const originalAsar = path.join(resources, 'app-1.6.3-original.asar');
let port = 0;

function normalizeHebrew(value='') {
  return String(value).normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'")
    .replace(/[־–—]/g, '-')
    .replace(/[^\u05D0-\u05EAa-zA-Z0-9\s'"-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function sqlQuote(s){ return String(s).replace(/'/g, "''"); }
function safeCategory(c){
  const allowed = new Set(['all','tanakh','mishnah','tosefta','bavli','yerushalmi','rambam','rishonim','tur','shulchan_arukh','midrash','responsa','halakhah','thought']);
  return allowed.has(c) ? c : 'all';
}
function runSql(sql){
  return new Promise((resolve,reject)=>{
    execFile(sqliteExe, ['-json', dbPath, sql], {windowsHide:true,maxBuffer:16*1024*1024}, (err,stdout,stderr)=>{
      if(err) return reject(new Error(String(stderr||err.message||err)));
      try{ resolve(stdout.trim()?JSON.parse(stdout):[]); }catch(e){ reject(e); }
    });
  });
}
async function searchLocal(query, category='all', limit=20){
  const q = normalizeHebrew(query).replace(/["']/g,'');
  if(!q) return {query:q,results:[],elapsedMs:0};
  const started=Date.now();
  const terms=q.split(/\s+/).filter(x=>x.length>1).slice(0,12);
  const attempts=[`"${q}"`, terms.map(x=>`"${x}"`).join(' AND '), terms.join(' OR ')].filter(Boolean);
  const cat=safeCategory(category);
  for(const expr of attempts){
    const where=cat==='all'?'':` AND s.category='${sqlQuote(cat)}'`;
    const sql=`SELECT s.id,s.book,s.he_book,s.category,s.ref,s.text,bm25(segments_fts) AS rank FROM segments_fts JOIN segments s ON s.id=segments_fts.rowid WHERE segments_fts MATCH '${sqlQuote(expr)}'${where} ORDER BY rank LIMIT ${Math.min(Math.max(Number(limit)||20,1),60)};`;
    try{
      const rows=await runSql(sql);
      if(rows.length) return {query:q,results:rows,elapsedMs:Date.now()-started};
    }catch{}
  }
  return {query:q,results:[],elapsedMs:Date.now()-started};
}
async function stats(){
  const rows=await runSql("SELECT (SELECT count(*) FROM books) AS books,(SELECT count(*) FROM segments) AS segments;");
  return rows[0]||{books:0,segments:0};
}
function userDataFile(name){ return path.join(app.getPath('userData'), name); }
function readKey(){
  try{
    const encrypted=fs.readFileSync(userDataFile('openai-key.bin'));
    return safeStorage.isEncryptionAvailable()?safeStorage.decryptString(encrypted):'';
  }catch{return '';}
}
function readSettings(){
  try{return JSON.parse(fs.readFileSync(userDataFile('app-settings.json'),'utf8'));}catch{return {model:'auto'};}
}
async function aiSummary(question,sources){
  const key=readKey(); if(!key) throw new Error('לא הוגדר API Key בהגדרות הקיימות של התוכנה');
  let core=null; try{core=require(path.join(originalAsar,'dist-electron','core.js'));}catch{}
  const configured=readSettings().model||'auto';
  const candidates=core?.resolveAiCandidates?core.resolveAiCandidates(configured,'research',question):[configured==='auto'?'gpt-5.4-mini':configured];
  const sourceText=sources.slice(0,10).map((s,i)=>`[${i+1}] ${s.he_book||s.book} — ${s.ref}\n${s.text}`).join('\n\n');
  const system='אתה מסייע למחקר תורני בספר הגהה על הרמב״ם. ענה אך ורק על בסיס המקורות שסופקו. אין להמציא מקור, ציטוט או מראה מקום. כל טענה עובדתית צריכה הפניה [מספר]. אם המקורות אינם מספיקים אמור זאת בפירוש.';
  let last='';
  for(const model of candidates){
    if(!model) continue;
    const body={model,store:false,input:[{role:'system',content:system},{role:'user',content:`שאלה: ${question}\n\nמקורות מקומיים:\n${sourceText}`} ]};
    if(configured==='auto' && /^gpt-5/.test(model)) body.reasoning={effort:model.endsWith('-sol')?'high':model.endsWith('-terra')||model==='gpt-5.4'?'medium':'low'};
    try{
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
      if(!r.ok){last=`OpenAI ${r.status}: ${(await r.text()).slice(0,300)}`; if(configured!=='auto') break; continue;}
      const data=await r.json(); const text=data.output_text||data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
      if(text) return {text:String(text),model};
    }catch(e){last=String(e.message||e);break;}
  }
  throw new Error(last||'לא התקבלה תשובה מה-AI');
}
async function localChat(question, category='all', useAI=false){
  const found=await searchLocal(question,category,12);
  const sources=found.results.slice(0,10);
  if(!sources.length) return {answer:'לא נמצא במאגר המקומי מקור מתאים לשאלה זו.',sources:[],elapsedMs:found.elapsedMs};
  if(useAI){
    try{const a=await aiSummary(question,sources);return{answer:a.text,sources,elapsedMs:found.elapsedMs,model:a.model};}
    catch(e){return{answer:`נמצאו ${sources.length} מקורות מקומיים. סיכום AI לא הופעל.`,sources,elapsedMs:found.elapsedMs,aiError:String(e.message||e)};}
  }
  const answer=sources.slice(0,5).map((s,i)=>`[${i+1}] ${s.he_book||s.book} — ${s.ref}\n${s.text}`).join('\n\n');
  return {answer,sources,elapsedMs:found.elapsedMs};
}
function send(res,status,data){
  const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type'});res.end(body);
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
  try{
    if(req.url==='/stats') return send(res,200,await stats());
    let raw='';for await(const chunk of req)raw+=chunk; const data=raw?JSON.parse(raw):{};
    if(req.url==='/search') return send(res,200,await searchLocal(data.q,data.category,data.limit));
    if(req.url==='/chat') return send(res,200,await localChat(data.q,data.category,!!data.useAI));
    send(res,404,{error:'not found'});
  }catch(e){send(res,500,{error:String(e.message||e)});}
});
const portReady=new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',()=>{port=server.address().port;resolve(port);}).on('error',reject));

function injection(p){return `(()=>{
if(window.__HAYAD_LOCAL_LIBRARY__)return;window.__HAYAD_LOCAL_LIBRARY__=true;
const PORT=${p};const api=async(path,data)=>{const r=await fetch('http://127.0.0.1:'+PORT+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||'שגיאה');return j};
const css=document.createElement('style');css.textContent='\
#hayad-local-btn{position:fixed;left:18px;bottom:42px;z-index:99998;border:1px solid var(--gold-soft,#D9C185);background:linear-gradient(135deg,var(--royal,#0B2D5B),var(--blue,#174A83));color:white;border-radius:24px;padding:10px 16px;font-weight:800;box-shadow:0 8px 26px #17213a30}#hayad-local-drawer{position:fixed;left:0;top:0;bottom:0;width:min(560px,92vw);z-index:99999;background:var(--surface,#FFFDF7);border-right:1px solid var(--gold-soft,#D9C185);box-shadow:12px 0 36px #17213a33;transform:translateX(-102%);transition:.18s;display:flex;flex-direction:column;direction:rtl;color:var(--ink,#17213A)}#hayad-local-drawer.open{transform:translateX(0)}#hayad-local-head{background:linear-gradient(135deg,var(--royal,#0B2D5B),var(--blue,#174A83));color:white;padding:14px 16px;display:flex;gap:10px;align-items:center}#hayad-local-head b{font-size:17px}#hayad-local-head small{display:block;color:#f2dc9e}#hayad-local-head button{margin-right:auto;background:transparent;color:white;border:0;font-size:24px}#hayad-local-body{padding:12px;overflow:auto;flex:1}#hayad-local-search{display:flex;gap:7px}#hayad-local-q{flex:1;border:1px solid #cfd5dc;border-radius:7px;padding:10px}#hayad-local-go,#hayad-local-ai{border:1px solid var(--gold,#B8903C);border-radius:7px;padding:9px 11px;background:var(--gold,#B8903C);color:white}#hayad-local-ai{background:white;color:var(--royal,#0B2D5B)}#hayad-local-cat{margin-top:8px;width:100%;border:1px solid #cfd5dc;border-radius:6px;padding:8px}#hayad-local-meta{font-size:11px;color:var(--muted,#62697A);margin:8px 2px}#hayad-local-answer{white-space:pre-wrap;line-height:1.65;border:1px solid #dbe1e7;background:white;border-radius:8px;padding:12px;min-height:90px}#hayad-local-tools{display:flex;gap:7px;margin:8px 0}#hayad-local-tools button{border:1px solid #cbd3dd;background:#f8fafb;border-radius:6px;padding:7px 9px}#hayad-local-sources{margin-top:12px}#hayad-local-sources article{border:1px solid #d9e0e7;border-right:3px solid var(--gold,#B8903C);background:white;border-radius:7px;padding:9px;margin:7px 0}#hayad-local-sources b,#hayad-local-sources em{display:block}#hayad-local-sources em{font-style:normal;color:#8b6b27;font-size:12px}#hayad-local-sources p{line-height:1.55;margin:6px 0;white-space:pre-wrap}#hayad-local-sources button{border:1px solid #cbd4df;background:white;border-radius:5px;padding:5px 8px;margin-left:5px}';document.head.appendChild(css);
const btn=document.createElement('button');btn.id='hayad-local-btn';btn.textContent='⌕ שאל את המאגר';document.body.appendChild(btn);
const d=document.createElement('aside');d.id='hayad-local-drawer';d.innerHTML='<div id="hayad-local-head"><div><b>המאגר התורני המקומי</b><small id="hayad-local-stats">LOCAL · ללא אינטרנט</small></div><button id="hayad-local-close">×</button></div><div id="hayad-local-body"><div id="hayad-local-search"><input id="hayad-local-q" placeholder="שאל שאלה או הדבק ציטוט"><button id="hayad-local-go">שאל</button><button id="hayad-local-ai">סכם AI</button></div><select id="hayad-local-cat"><option value="all">כל המאגר</option><option value="rambam">רמב״ם</option><option value="rishonim">ראשונים</option><option value="bavli">תלמוד בבלי</option><option value="yerushalmi">תלמוד ירושלמי</option><option value="mishnah">משנה</option><option value="tanakh">תנ״ך</option><option value="tur">טור</option><option value="shulchan_arukh">שולחן ערוך</option><option value="midrash">מדרש</option><option value="responsa">שו״ת</option><option value="halakhah">הלכה</option></select><div id="hayad-local-meta"></div><div id="hayad-local-tools"><button id="hayad-copy-answer">העתק תשובה</button><button id="hayad-copy-all">העתק עם מקורות</button></div><div id="hayad-local-answer">המאגר מוכן. החיפוש נעשה מקומית במחשב.</div><div id="hayad-local-sources"></div></div>';document.body.appendChild(d);
const $=id=>document.getElementById(id);let last=null;btn.onclick=()=>d.classList.add('open');$('hayad-local-close').onclick=()=>d.classList.remove('open');
api('/stats').then(s=>$('hayad-local-stats').textContent=Number(s.books).toLocaleString()+' ספרים · '+Number(s.segments).toLocaleString()+' קטעים · LOCAL').catch(()=>{});
async function ask(useAI){const q=$('hayad-local-q').value.trim();if(!q)return;$('hayad-local-meta').textContent='מחפש...';$('hayad-local-answer').textContent='';$('hayad-local-sources').innerHTML='';try{last=await api('/chat',{q,category:$('hayad-local-cat').value,useAI});$('hayad-local-meta').textContent='נבדק ב-'+last.elapsedMs+'ms'+(last.model?' · '+last.model:'')+(last.aiError?' · '+last.aiError:'');$('hayad-local-answer').textContent=last.answer||'';$('hayad-local-sources').innerHTML=(last.sources||[]).map((s,i)=>'<article><b>['+(i+1)+'] '+esc(s.he_book||s.book)+'</b><em>'+esc(s.ref||'')+'</em><p>'+esc(s.text||'')+'</p><button data-copy="'+i+'">העתק</button><button data-copyref="'+i+'">העתק עם מקור</button></article>').join('');}catch(e){$('hayad-local-meta').textContent='שגיאה';$('hayad-local-answer').textContent=e.message||String(e)}}
function esc(x){return String(x).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}$('hayad-local-go').onclick=()=>ask(false);$('hayad-local-ai').onclick=()=>ask(true);$('hayad-local-q').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask(false)}});$('hayad-local-sources').onclick=e=>{const b=e.target.closest('button');if(!b||!last)return;const i=Number(b.dataset.copy??b.dataset.copyref);const s=last.sources[i];navigator.clipboard.writeText(b.dataset.copyref!==undefined?(s.text+'\\n('+s.ref+')'):s.text)};$('hayad-copy-answer').onclick=()=>navigator.clipboard.writeText(last?.answer||'');$('hayad-copy-all').onclick=()=>{if(!last)return;navigator.clipboard.writeText((last.answer||'')+'\\n\\nמקורות:\\n'+(last.sources||[]).map((s,i)=>'['+(i+1)+'] '+(s.he_book||s.book)+' — '+s.ref+'\\n'+s.text).join('\\n\\n'))};
})();`}
app.on('browser-window-created',(_event,win)=>{win.webContents.on('did-finish-load',async()=>{try{const p=await portReady;await win.webContents.executeJavaScript(injection(p),true);}catch(e){console.error('local library injection failed',e);}})});
if(!fs.existsSync(originalAsar)) throw new Error('הקובץ המקורי app-1.6.3-original.asar לא נמצא. יש להתקין תחילה את 1.6.3.');
require(path.join(originalAsar,'dist-electron','main.js'));
