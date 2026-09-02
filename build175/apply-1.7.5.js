const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const cp = require('child_process');

const payload = process.argv[2];
const quiet = process.argv.includes('--quiet');
const selftest = process.argv.includes('--selftest');
const logPath = path.join(os.tmpdir(), 'HaYad-1.7.5-install.log');
const resultPath = path.join(os.tmpdir(), 'HaYad-1.7.5-result.json');
function log(msg){ try{fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');}catch{} }
function fail(code,msg,extra){ const data={ok:false,code,message:msg,extra:extra||null,log:logPath}; log(`ERROR ${code}: ${msg}${extra?` / ${extra}`:''}`); try{fs.writeFileSync(resultPath,JSON.stringify(data,null,2),'utf8');}catch{} const e=new Error(msg); e.exitCode=code; throw e; }
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
    const p=path.join(dir,rel); if(!fs.existsSync(p)){log(`Renderer file missing: ${rel}`);return false;}
    const got=sha(p); if(got!==want){log(`Renderer hash mismatch ${rel} expected=${want} actual=${got}`);return false;}
  }
  return true;
}
function patchableOriginal(dir){
  const main=path.join(dir,'dist-electron','main.js');
  if(!fs.existsSync(main)) return false;
  const text=fs.readFileSync(main,'utf8');
  return text.includes("_electron.ipcMain.handle('knowledge:list', () => store.read().knowledge)") && text.includes("function ensureMaster() {") && !text.includes('LOCAL_CORPUS_174') && !text.includes('LOCAL_CORPUS_175');
}
function quickCheck(sqlite,db){
  try{
    const out=cp.execFileSync(sqlite,['-readonly',db,'PRAGMA quick_check;'],{windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
    return String(out).trim()==='ok';
  }catch(e){log(`SQLite check failed: ${e.message}`);return false;}
}
function stopApp(target){
  try{
    const files=fs.readdirSync(target,{withFileTypes:true}).filter(x=>x.isFile()&&x.name.toLowerCase().endsWith('.exe')&&!/unins|uninstall|elevate/i.test(x.name));
    for(const f of files){try{cp.execFileSync('taskkill.exe',['/IM',f.name,'/F','/T'],{windowsHide:true,stdio:'ignore'});}catch{}}
  }catch{}
}
function freeBytes(target){
  try{const s=fs.statfsSync(target);return Number(s.bavail)*Number(s.bsize);}catch{return Number.MAX_SAFE_INTEGER;}
}
async function main(){
  fs.writeFileSync(logPath,`[${new Date().toISOString()}] Starting HaYad 1.7.5 Node installer\n`,'utf8');
  if(!payload || !fs.existsSync(payload)) fail(2,'Payload folder is missing',payload||'');
  const asarDir=path.join(payload,'asar-tool','node_modules','@electron','asar');
  const patcher=path.join(payload,'patch-main-1.7.5.js');
  const sevenZip=path.join(payload,'tools','7z.exe');
  const sqliteBundled=path.join(payload,'local-library','sqlite3.exe');
  const archive=path.join(payload,'local-library','library.zip');
  for(const p of [asarDir,patcher,sevenZip,sqliteBundled,archive]) if(!fs.existsSync(p)) fail(3,'Installer payload is incomplete',p);
  const asar=require(asarDir);
  if(selftest){
    cp.execFileSync(sevenZip,['i'],{windowsHide:true,stdio:'pipe',timeout:30000});
    cp.execFileSync(sqliteBundled,['-version'],{windowsHide:true,stdio:'pipe',timeout:30000});
    const tmp=path.join(os.tmpdir(),'HaYad175SelfTest');rm(tmp);ensureDir(tmp);
    fs.writeFileSync(path.join(tmp,'hello.txt'),'ok','utf8');
    const testAsar=path.join(os.tmpdir(),'HaYad175SelfTest.asar');try{fs.rmSync(testAsar,{force:true});}catch{}
    await asar.createPackage(tmp,testAsar);
    const out=path.join(os.tmpdir(),'HaYad175SelfTestOut');rm(out);ensureDir(out);await Promise.resolve(asar.extractAll(testAsar,out));
    if(fs.readFileSync(path.join(out,'hello.txt'),'utf8')!=='ok') fail(4,'ASAR self-test failed');
    rm(tmp);rm(out);try{fs.rmSync(testAsar,{force:true});}catch{}
    log('SELFTEST OK: Node + ASAR + 7-Zip + SQLite');
    return;
  }

  let target=null;
  for(const p of listCandidates()) if(fs.existsSync(path.join(p,'resources','app.asar'))){target=p;break;}
  if(!target) fail(11,'לא נמצאה התקנת 1.6.3 קיימת. התקן תחילה את 1.6.3 המקורית.');
  log(`Target=${target}`);
  stopApp(target);
  const res=path.join(target,'resources');
  const current=path.join(res,'app.asar');
  const backup=path.join(res,'app-1.6.3-original.asar');
  const wrapper=path.join(res,'app');
  const workRoot=path.join(os.tmpdir(),'HaYad175Work'); rm(workRoot); ensureDir(workRoot);

  let base=null;
  const candidateOrder=[backup,current].filter((v,i,a)=>a.indexOf(v)===i && fs.existsSync(v));
  for(const candidate of candidateOrder){
    const checkDir=path.join(workRoot,'check-'+crypto.randomBytes(4).toString('hex')); ensureDir(checkDir);
    try{
      await Promise.resolve(asar.extractAll(candidate,checkDir));
      if(validateRenderer(checkDir) && patchableOriginal(checkDir)){base=candidate; log(`Validated pristine 1.6.3 base: ${candidate}`); rm(checkDir); break;}
      log(`Candidate is not pristine 1.6.3 backend: ${candidate}`);
    }catch(e){log(`Candidate extract failed ${candidate}: ${e.message}`);} finally{rm(checkDir);}
  }
  if(!base) fail(12,'לא נמצאה חבילת 1.6.3 מקורית ונקייה עם העיצוב המאושר. לא בוצע שינוי.');
  if(!fs.existsSync(backup)){fs.copyFileSync(base,backup);log('Saved original 1.6.3 backup');}

  const work=path.join(workRoot,'app'); ensureDir(work); await Promise.resolve(asar.extractAll(base,work));
  if(!validateRenderer(work)) fail(13,'בדיקת נעילת העיצוב נכשלה לפני העדכון.');
  cp.execFileSync(process.execPath,[patcher,path.join(work,'dist-electron','main.js'),path.join(work,'package.json')],{windowsHide:true,stdio:'pipe',encoding:'utf8',maxBuffer:16*1024*1024});
  if(!validateRenderer(work)) fail(14,'קבצי הממשק השתנו בניגוד לנעילה.');
  const patchedMain=fs.readFileSync(path.join(work,'dist-electron','main.js'),'utf8');
  if(!patchedMain.includes('LOCAL_CORPUS_175')) fail(15,'שכבת המאגר לא נוספה ל-backend.');

  const newAsar=path.join(workRoot,'app-1.7.5.asar');
  await asar.createPackage(work,newAsar);
  const verify=path.join(workRoot,'verify');ensureDir(verify);await Promise.resolve(asar.extractAll(newAsar,verify));
  if(!validateRenderer(verify)) fail(16,'בדיקת ASAR סופית נכשלה: הממשק אינו זהה ל-1.6.3.');
  log('UI HASH LOCK OK — renderer byte-identical to 1.6.3');

  const libDir=path.join(res,'local-library'); ensureDir(libDir);
  const sqlite=path.join(libDir,'sqlite3.exe'); fs.copyFileSync(sqliteBundled,sqlite);
  const db=path.join(libDir,'torah-library.sqlite');
  let dbOk=fs.existsSync(db)&&quickCheck(sqlite,db);
  if(!dbOk){
    if(freeBytes(target)<4*1024*1024*1024) fail(17,'נדרשים לפחות 4GB פנויים להתקנת המאגר המקומי.');
    try{fs.rmSync(db,{force:true});}catch{}
    cp.execFileSync(sevenZip,['x','-y',archive,`-o${libDir}`],{windowsHide:true,encoding:'utf8',timeout:20*60*1000,maxBuffer:16*1024*1024});
    if(!fs.existsSync(db)||!quickCheck(sqlite,db)) fail(18,'בדיקת תקינות המאגר המקומי נכשלה לאחר הפריסה.');
    log(`Local corpus installed: ${fs.statSync(db).size} bytes`);
  } else log('Existing local corpus passed quick_check; extraction skipped');

  try{
    if(fs.existsSync(wrapper)){fs.rmSync(wrapper,{recursive:true,force:true});log('Removed obsolete 1.7.2/1.7.3 wrapper');}
    fs.copyFileSync(newAsar,current);
  }catch(e){
    try{if(fs.existsSync(backup))fs.copyFileSync(backup,current);}catch{}
    fail(19,'החלפת app.asar נכשלה; הוחזר גיבוי 1.6.3.',e.message);
  }
  const finalDir=path.join(workRoot,'final-check');ensureDir(finalDir);await Promise.resolve(asar.extractAll(current,finalDir));
  if(!validateRenderer(finalDir)){
    try{fs.copyFileSync(backup,current);}catch{}
    fail(20,'בדיקת העיצוב לאחר ההתקנה נכשלה; הוחזר 1.6.3.');
  }
  const finalMain=fs.readFileSync(path.join(finalDir,'dist-electron','main.js'),'utf8');
  if(!finalMain.includes('LOCAL_CORPUS_175')){
    try{fs.copyFileSync(backup,current);}catch{}
    fail(21,'בדיקת backend לאחר ההתקנה נכשלה; הוחזר 1.6.3.');
  }
  fs.writeFileSync(path.join(res,'rambam-bahir-1.7.5.json'),JSON.stringify({version:'1.7.5',base:'1.6.3',ui:'sha256-locked-original',localLibrary:true,installer:'node-no-powershell',installedAt:new Date().toISOString()},null,2),'utf8');
  rm(workRoot);
  fs.writeFileSync(resultPath,JSON.stringify({ok:true,version:'1.7.5',target,log:logPath},null,2),'utf8');
  log('SUCCESS 1.7.5 installed');
  if(!quiet){
    try{
      const exe=fs.readdirSync(target).find(n=>n.toLowerCase().endsWith('.exe')&&!/unins|uninstall|elevate/i.test(n));
      if(exe){const p=cp.spawn(path.join(target,exe),[],{detached:true,stdio:'ignore',windowsHide:false});p.unref();}
    }catch(e){log(`Launch skipped: ${e.message}`);}
  }
}

main().then(()=>process.exit(0)).catch(err=>{
  const code=Number(err.exitCode)||30;
  if(!fs.existsSync(resultPath)){try{fs.writeFileSync(resultPath,JSON.stringify({ok:false,code,message:err.message,log:logPath},null,2),'utf8');}catch{}}
  log(`FATAL ${code}: ${err.stack||err.message}`);
  process.exit(code);
});
