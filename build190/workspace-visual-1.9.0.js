(()=>{
if(window.__RB_WORKSPACE_VISUAL_190__)return;window.__RB_WORKSPACE_VISUAL_190__=true;
const HOME_BOOKS=['ספר המדע','ספר אהבה','ספר זמנים','ספר נשים','ספר קדושה','ספר הפלאה','ספר זרעים','ספר עבודה','ספר הקרבנות','ספר טהרה','ספר נזיקין','ספר קנין','ספר משפטים','ספר שופטים'];
const REPL=new Map([
['HebrewBooks','מאגר מקומי'],['HEBREWBOOKS','מאגר מקומי'],['Hebrew Books','מאגר מקומי'],['Hebrew','מאגר מקומי'],
['שאל AI','שאל את המאגר'],['AI שאל','שאל את המאגר'],['שאל את AI','שאל את המאגר'],['שאל את ה-AI','שאל את המאגר'],['שאל את ה AI','שאל את המאגר'],
['שיחה חופשית — ללא חיפוש במאגר','שאל את המאגר — תשובה מבוססת מקורות'],['שיחה חופשית - ללא חיפוש במאגר','שאל את המאגר — תשובה מבוססת מקורות']
]);
function text(){return String(document.body&&document.body.innerText||'')}
function home(){const t=text();let n=0;for(const b of HOME_BOOKS)if(t.includes(b))n++;return n>=10}
function exactRename(){
  const els=document.querySelectorAll('button,a,[role="button"],label,span,strong,h1,h2,h3,h4,div');
  for(const el of els){if(el.children.length>0&&el.tagName!=='BUTTON'&&el.tagName!=='A')continue;const raw=(el.textContent||'').trim();if(!raw)continue;const next=REPL.get(raw);if(next&&raw!==next){el.textContent=next;el.dataset.rbVisualRelabel='1';}}
}
function markSourceCore(){
  document.querySelectorAll('[data-rb-source-core="1"]').forEach(x=>x.removeAttribute('data-rb-source-core'));
  const nodes=[...document.querySelectorAll('button,a,[role="button"],input,textarea,h1,h2,h3,h4,strong,label,span')];
  const hits=nodes.filter(el=>{const s=((el.textContent||'')+' '+(el.placeholder||'')).trim();return /מאגר|מקור|בדוק מקור|שאל את המאגר|ספריית הספרים/.test(s)});
  for(const el of hits){let p=el;for(let i=0;i<4&&p&&p!==document.body;i++,p=p.parentElement){const r=p.getBoundingClientRect();if(r.width>300&&r.height>70&&r.height<700){p.dataset.rbSourceCore='1';break;}}}
  for(const el of document.querySelectorAll('button,a,[role="button"]')){const s=(el.textContent||'').trim();if(/שאל את המאגר/.test(s))el.dataset.rbPrimarySource='1';else if(/בדוק מקור|מצא מקור|מאגר מקומי|ספרייה ומקורות/.test(s))el.dataset.rbSourceAction='1';}
}
function ensureStyle(){if(document.getElementById('rb-workspace-visual-190-style'))return;const st=document.createElement('style');st.id='rb-workspace-visual-190-style';st.textContent=`
body.rb-home-locked-190 #rb-core-bar,body.rb-home-locked-190 #rb-core-dock{display:none!important}
body.rb-workspace-190{background:linear-gradient(180deg,#f7f4ec 0,#f2eee4 100%)!important;color:#18334f!important}
body.rb-workspace-190 button,body.rb-workspace-190 [role="button"]{font-family:Arial,"Noto Sans Hebrew","David",sans-serif;border-radius:8px;transition:box-shadow .16s ease,transform .16s ease,border-color .16s ease}
body.rb-workspace-190 button:hover,body.rb-workspace-190 [role="button"]:hover{box-shadow:0 5px 14px rgba(20,52,83,.12);transform:translateY(-1px)}
body.rb-workspace-190 input,body.rb-workspace-190 textarea,body.rb-workspace-190 select,body.rb-workspace-190 [contenteditable="true"]{border-radius:9px!important;border-color:#cfd7df!important;background:#fffefb!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.85);font-family:Arial,"Noto Sans Hebrew","David",sans-serif}
body.rb-workspace-190 input:focus,body.rb-workspace-190 textarea:focus,body.rb-workspace-190 [contenteditable="true"]:focus{outline:none!important;border-color:#b48a34!important;box-shadow:0 0 0 3px rgba(180,138,52,.13)!important}
body.rb-workspace-190 [data-rb-source-core="1"]{position:relative;border:1px solid #d9c58e!important;border-top:4px solid #b48a34!important;border-radius:13px!important;background:linear-gradient(180deg,#fffdf8 0,#fbf6e9 100%)!important;box-shadow:0 10px 28px rgba(26,55,83,.12)!important}
body.rb-workspace-190 [data-rb-source-core="1"]:before{content:"מרכז המקורות";position:absolute;top:-16px;right:18px;background:#173f70;color:#fff;padding:4px 11px;border-radius:14px;font-size:11px;font-weight:800;letter-spacing:.02em;z-index:5;box-shadow:0 3px 10px rgba(23,63,112,.18)}
body.rb-workspace-190 [data-rb-primary-source="1"]{background:#173f70!important;color:#fff!important;border:1px solid #173f70!important;font-weight:800!important;padding-inline:15px!important}
body.rb-workspace-190 [data-rb-source-action="1"]{background:#fffaf0!important;color:#71521d!important;border:1px solid #c8a85c!important;font-weight:800!important}
body.rb-workspace-190 #rb-core-bar{left:22px!important;right:22px!important;bottom:14px!important;height:68px!important;border:1px solid #d4b768!important;border-top:5px solid #b48a34!important;border-radius:14px!important;background:linear-gradient(180deg,#fffefb,#faf3e3)!important;box-shadow:0 14px 36px rgba(19,48,78,.20)!important;z-index:2147483000!important;padding:9px 11px!important}
body.rb-workspace-190 #rb-core-brand{background:#173f70!important;border-radius:9px!important;padding:11px 16px!important;font-size:14px!important;box-shadow:0 4px 12px rgba(23,63,112,.18)!important}
body.rb-workspace-190 #rb-core-q{height:43px!important;font-size:15px!important;border:1px solid #c9d2dc!important;background:#fff!important}
body.rb-workspace-190 #rb-core-go{height:43px!important;background:#b48a34!important;border-radius:9px!important;font-size:14px!important}
body.rb-workspace-190 #rb-core-open{height:43px!important;border:1px solid #c8a85c!important;color:#71521d!important;background:#fffaf0!important}
body.rb-workspace-190 #rb-core-dock{left:22px!important;right:22px!important;bottom:92px!important;height:min(60vh,610px)!important;border-radius:16px!important;border:1px solid #d4b768!important;box-shadow:0 24px 70px rgba(18,45,74,.28)!important;overflow:hidden!important}
body.rb-workspace-190 #rb-core-head{min-height:52px!important;background:linear-gradient(90deg,#f5e8c8 0,#fffef9 68%)!important;padding-inline:16px!important}
body.rb-workspace-190 #rb-core-head strong{font-size:18px!important;color:#173f70!important}
body.rb-workspace-190 #rb-core-work{grid-template-columns:minmax(360px,.82fr) minmax(480px,1.3fr)!important}
body.rb-workspace-190 .rb-card{border-radius:10px!important;border-right-width:5px!important;padding:11px 12px!important;margin-bottom:9px!important}
body.rb-workspace-190 #rb-core-preview{background:#fffefb!important;padding:19px 22px!important}
body.rb-workspace-190 .rb-book{border-radius:10px!important;background:#fffdf7!important;box-shadow:0 3px 12px rgba(20,52,83,.06)!important}
body.rb-workspace-190:after{content:"";display:block;height:88px;pointer-events:none}
@media(max-width:1050px){body.rb-workspace-190 #rb-core-bar{left:10px!important;right:10px!important}body.rb-workspace-190 #rb-core-dock{left:10px!important;right:10px!important}body.rb-workspace-190 #rb-core-work{grid-template-columns:1fr!important}body.rb-workspace-190 #rb-core-preview{display:none}}
`;document.head.appendChild(st)}
let busy=false;
function apply(){if(busy)return;busy=true;try{ensureStyle();if(home()){document.body.classList.add('rb-home-locked-190');document.body.classList.remove('rb-workspace-190');return}document.body.classList.remove('rb-home-locked-190');document.body.classList.add('rb-workspace-190');exactRename();markSourceCore();}finally{busy=false}}
let timer=null;const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(apply,80)});function start(){if(!document.body)return setTimeout(start,50);obs.observe(document.body,{childList:true,subtree:true,characterData:true});apply();setInterval(apply,1800)}start();
})();