const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const cp = require('child_process');

const payload = process.argv[2];
const quiet = process.argv.includes('--quiet');
const selftest = process.argv.includes('--selftest');
const logPath = path.join(os.tmpdir(), 'HaYad-1.7.6-install.log');
const resultPath = path.join(os.tmpdir(), 'HaYad-1.7.6-result.json');

function log(msg){ try{fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');}catch{} }
function fail(code,msg,extra){
  const data={ok:false,code,message:msg,extra:extra||null,log:logPath};
  log(`ERROR ${code}: ${msg}${extra?` / ${extra}`:''}`);
  try{fs.writeFileSync(resultPath,JSON.stringify(data,null,2),'utf8');}catch{}
  const e=new Error(msg);e.exitCode=code;throw e;
}
function sha(file){ return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function rm(p){ try{fs.rmSync(p,{recursive:true,force:true});}catch{} }
function listCandidates(){
  const out=[];
  const roots=[process.env.LOCALAPPDATA,process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean);
  for(const root of roots){
    out.push(path.join(root,'hayad-hahazaka'));
    out.push(path.join(root,'Programs','hayad-hahazaka'));
    out.push(path.join(root,'Programs','HaYad-HaHazaka'));
    out.push(path.join(root,'Programs','היד החזקה'));
    out.push(path.join(root,'HaYad-HaHazaka'));
    out.push(path.join(root,'היד החזקה'));
  }
  return [...new Set(out)];
}
function validateRenderer(dir){
  const expected={
    [path.join('dist','assets','index.js')]:'e2a301bad496d87490eaceb091204d2287fa60f00c5d22341403e6f8daa69e76',
    [path.join('dist','assets','index.css')]:'6df2817f475b85236d7c4764d1fa2339673b3d827cd6442fbce042b5dbcefc37',
    [path.join('dist','index.html')]:'74e52686fc6f255043062277f385b45cd85e2fdd16abc42dc00afbe18913de24'
  };
  for(const [rel,want] of Object.entries(expected)){
    const p=path.join(dir,rel);if(!fs.existsSync(p)){log(`Renderer file missing: ${rel}`);return false;}
    const got=sha(p);if(got!==want){log(`Renderer hash mismatch ${rel} expected=${want} actual=${got}`);return false;}
  }
  return true;
}
function patchableOriginal(dir){
  const main=path.join(dir,'dist-electron','main.js');
  if(!fs.existsSync(main)) return false;
  const text=fs.readFileSync(main,'utf8');
  return text.includes("_electron.ipcMain.handle('knowledge:list', () => store.read().knowledge)") &&
    text.includes('function ensureMaster() {') &&
    !text.includes('LOCAL_CORPUS_174') && !text.includes('LOCAL_CORPUS_175') && !text.includes('LOCAL_CORPUS_176');
}
function stopApp(target){
  try{
    const files=fs.readdirSync(target,{withFileTypes:true}).filter(x=>x.isFile()&&x.name.toLowerCase().endsWith('.exe')&&!/unins|uninstall|elevate/i.test(x.name));
    for(const f of files){try{cp.execFileSync('taskkill.exe',['/IM',f.name,'/F','/T'],{windowsHide:true,stdio:'ignore'});}catch{}}
  }catch{}
}
function runSql(sqlite,db,sql){
  return cp.execFileSync(sqlite,['-readonly','-json',db,sql],{windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
}
function inspectCorpus(res){
  const libDir=path.join(res,'local-library');
  const sqlite=path.join(libDir,'sqlite3.exe');
  const db=path.join(libDir,'torah-library.sqlite');
  if(!fs.existsSync(sqlite)||!fs.existsSync(db)) fail(17,'המאגר המקומי אינו מותקן. יש להתקין תחילה את גרסה 1.7.5 המלאה.');
  let quick='';
  try{quick=cp.execFileSync(sqlite,['-readonly',db,'PRAGMA quick_check;'],{windowsHide:true,encoding:'utf8',timeout:120000}).trim();}
  catch(e){fail(18,'לא ניתן לבדוק את מסד המאגר המקומי.',e.message);}
  if(quick!=='ok') fail(18,'בדיקת תקינות המאגר המקומי נכשלה.',quick);
  let stats={books:0,segments:0};
  try{
    const raw=runSql(sqlite,db,"SELECT (SELECT count(*) FROM books) AS books,(SELECT count(*) FROM segments) AS segments;").trim();
    const rows=raw?JSON.parse(raw):[];stats=rows[0]||stats;
  }catch(e){fail(18,'לא ניתן לקרוא את נתוני המאגר המקומי.',e.message);}
  if(Number(stats.books)<100 || Number(stats.segments)<10000) fail(18,'המאגר המקומי קטן או פגום.',JSON.stringify(stats));
  log(`External local corpus OK: ${stats.books} books / ${stats.segments} segments / ${db}`);
  return {db,sqlite,books:Number(stats.books),segments:Number(stats.segments)};
}

async function main(){
  fs.writeFileSync(logPath,`[${new Date().toISOString()}] Starting HaYad 1.7.6 local-library path hotfix\n`,'utf8');
  if(!payload||!fs.existsSync(payload)) fail(2,'Payload folder is missing',payload||'');
  const asarDir=path.join(payload,'asar-tool','node_modules','@electron','asar');
  const patcher=path.join(payload,'patch-main-1.7.6.js');
  for(const p of [asarDir,patcher]) if(!fs.existsSync(p)) fail(3,'Installer payload is incomplete',p);
  const asar=require(asarDir);

  if(selftest){
    const tmp=path.join(os.tmpdir(),'HaYad176SelfTest');rm(tmp);ensureDir(tmp);
    fs.writeFileSync(path.join(tmp,'hello.txt'),'ok','utf8');
    const a=path.join(os.tmpdir(),'HaYad176SelfTest.asar');try{fs.rmSync(a,{force:true});}catch{}
    await asar.createPackage(tmp,a);
    const out=path.join(os.tmpdir(),'HaYad176SelfTestOut');rm(out);ensureDir(out);await Promise.resolve(asar.extractAll(a,out));
    if(fs.readFileSync(path.join(out,'hello.txt'),'utf8')!=='ok') fail(4,'ASAR self-test failed');
    const patchText=fs.readFileSync(patcher,'utf8');
    if(!patchText.includes("process.resourcesPath, 'local-library'")) fail(5,'External corpus path assertion missing');
    if(!patchText.includes("setZoomFactor(1)")) fail(6,'Original scale reset assertion missing');
    rm(tmp);rm(out);try{fs.rmSync(a,{force:true});}catch{}
    log('SELFTEST OK: ASAR + external resources path + original zoom reset');
    return;
  }

  let target=null;
  for(const p of listCandidates()) if(fs.existsSync(path.join(p,'resources','app.asar'))){target=p;break;}
  if(!target) fail(11,'לא נמצאה התקנת היד החזקה קיימת.');
  stopApp(target);
  const res=path.join(target,'resources');
  const corpus=inspectCorpus(res);
  const current=path.join(res,'app.asar');
  const backup=path.join(res,'app-1.6.3-original.asar');
  const wrapper=path.join(res,'app');
  const workRoot=path.join(os.tmpdir(),'HaYad176Work');rm(workRoot);ensureDir(workRoot);

  let base=null;
  for(const candidate of [backup,current].filter((v,i,a)=>a.indexOf(v)===i&&fs.existsSync(v))){
    const check=path.join(workRoot,'check-'+crypto.randomBytes(4).toString('hex'));ensureDir(check);
    try{
      await Promise.resolve(asar.extractAll(candidate,check));
      if(validateRenderer(check)&&patchableOriginal(check)){base=candidate;log(`Validated pristine 1.6.3 base: ${candidate}`);rm(check);break;}
      log(`Candidate is not pristine 1.6.3: ${candidate}`);
    }catch(e){log(`Candidate failed ${candidate}: ${e.message}`);}finally{rm(check);}
  }
  if(!base) fail(12,'לא נמצא גיבוי 1.6.3 מקורי ונקי. העדכון נעצר ללא שינוי בעיצוב.');
  if(!fs.existsSync(backup)){fs.copyFileSync(base,backup);log('Saved pristine 1.6.3 backup');}

  const work=path.join(workRoot,'app');ensureDir(work);await Promise.resolve(asar.extractAll(base,work));
  if(!validateRenderer(work)) fail(13,'בדיקת נעילת העיצוב נכשלה לפני העדכון.');
  cp.execFileSync(process.execPath,[patcher,path.join(work,'dist-electron','main.js'),path.join(work,'package.json')],{windowsHide:true,encoding:'utf8',stdio:'pipe',maxBuffer:16*1024*1024});
  if(!validateRenderer(work)) fail(14,'קבצי ה-UI השתנו. העדכון בוטל.');
  const patched=fs.readFileSync(path.join(work,'dist-electron','main.js'),'utf8');
  if(!patched.includes('LOCAL_CORPUS_176')||!patched.includes("process.resourcesPath, 'local-library'")) fail(15,'תיקון נתיב המאגר לא נוסף ל-backend.');

  const newAsar=path.join(workRoot,'app-1.7.6.asar');await asar.createPackage(work,newAsar);
  const verify=path.join(workRoot,'verify');ensureDir(verify);await Promise.resolve(asar.extractAll(newAsar,verify));
  if(!validateRenderer(verify)) fail(16,'בדיקת ASAR סופית נכשלה: ממשק 1.6.3 אינו זהה.');
  log('UI HASH LOCK OK — index.js, index.css and index.html remain byte-identical to 1.6.3');

  try{
    if(fs.existsSync(wrapper)){fs.rmSync(wrapper,{recursive:true,force:true});log('Removed obsolete resources/app wrapper');}
    fs.copyFileSync(newAsar,current);
  }catch(e){
    try{fs.copyFileSync(backup,current);}catch{}
    fail(19,'החלפת app.asar נכשלה; הוחזר גיבוי 1.6.3.',e.message);
  }

  const finalDir=path.join(workRoot,'final');ensureDir(finalDir);await Promise.resolve(asar.extractAll(current,finalDir));
  if(!validateRenderer(finalDir)){
    try{fs.copyFileSync(backup,current);}catch{}
    fail(20,'בדיקת העיצוב לאחר ההתקנה נכשלה; הוחזר 1.6.3.');
  }
  const finalMain=fs.readFileSync(path.join(finalDir,'dist-electron','main.js'),'utf8');
  if(!finalMain.includes('LOCAL_CORPUS_176')||!finalMain.includes("process.resourcesPath, 'local-library'")){
    try{fs.copyFileSync(backup,current);}catch{}
    fail(21,'בדיקת backend לאחר ההתקנה נכשלה; הוחזר 1.6.3.');
  }

  const meta={version:'1.7.6',base:'1.6.3',ui:'sha256-locked-original',localLibrary:true,externalCorpusPath:corpus.db,books:corpus.books,segments:corpus.segments,zoomFactor:1,installedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(res,'rambam-bahir-1.7.6.json'),JSON.stringify(meta,null,2),'utf8');
  rm(workRoot);
  fs.writeFileSync(resultPath,JSON.stringify({ok:true,target,...meta,log:logPath},null,2),'utf8');
  log(`SUCCESS 1.7.6 installed; UI can now see ${corpus.books} local books`);
  if(!quiet){
    try{
      const exe=fs.readdirSync(target).find(n=>n.toLowerCase().endsWith('.exe')&&!/unins|uninstall|elevate/i.test(n));
      if(exe){const p=cp.spawn(path.join(target,exe),[],{detached:true,stdio:'ignore'});p.unref();}
    }catch(e){log(`Launch skipped: ${e.message}`);}
  }
}

main().then(()=>process.exit(0)).catch(err=>{
  const code=Number(err.exitCode)||30;
  if(!fs.existsSync(resultPath)){try{fs.writeFileSync(resultPath,JSON.stringify({ok:false,code,message:err.message,log:logPath},null,2),'utf8');}catch{}}
  log(`FATAL ${code}: ${err.stack||err.message}`);
  process.exit(code);
});
