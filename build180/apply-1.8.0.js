const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const cp = require('child_process');

const payload = process.argv[2];
const quiet = process.argv.includes('--quiet');
const selftest = process.argv.includes('--selftest');
const logPath = path.join(os.tmpdir(), 'HaYad-1.8.0-install.log');
const resultPath = path.join(os.tmpdir(), 'HaYad-1.8.0-result.json');
function log(msg){try{fs.appendFileSync(logPath,`[${new Date().toISOString()}] ${msg}\n`,'utf8');}catch{}}
function fail(code,msg,extra){const data={ok:false,code,message:msg,extra:extra||null,log:logPath};log(`ERROR ${code}: ${msg}${extra?` / ${extra}`:''}`);try{fs.writeFileSync(resultPath,JSON.stringify(data,null,2),'utf8')}catch{}const e=new Error(msg);e.exitCode=code;throw e;}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
function ensureDir(p){fs.mkdirSync(p,{recursive:true})}
function rm(p){try{fs.rmSync(p,{recursive:true,force:true})}catch{}}
function listCandidates(){const out=[];for(const root of [process.env.LOCALAPPDATA,process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean)){out.push(path.join(root,'hayad-hahazaka'),path.join(root,'Programs','hayad-hahazaka'),path.join(root,'Programs','HaYad-HaHazaka'),path.join(root,'Programs','היד החזקה'),path.join(root,'HaYad-HaHazaka'),path.join(root,'היד החזקה'));}return[...new Set(out)]}
function validateRenderer(dir){const expected={[path.join('dist','assets','index.js')]:'e2a301bad496d87490eaceb091204d2287fa60f00c5d22341403e6f8daa69e76',[path.join('dist','assets','index.css')]:'6df2817f475b85236d7c4764d1fa2339673b3d827cd6442fbce042b5dbcefc37',[path.join('dist','index.html')]:'74e52686fc6f255043062277f385b45cd85e2fdd16abc42dc00afbe18913de24'};for(const [rel,want] of Object.entries(expected)){const p=path.join(dir,rel);if(!fs.existsSync(p)){log('Renderer file missing: '+rel);return false}const got=sha(p);if(got!==want){log(`Renderer hash mismatch ${rel} expected=${want} actual=${got}`);return false}}return true}
function patchableOriginal(dir){const main=path.join(dir,'dist-electron','main.js');if(!fs.existsSync(main))return false;const t=fs.readFileSync(main,'utf8');return t.includes("_electron.ipcMain.handle('knowledge:list', () => store.read().knowledge)")&&t.includes('function ensureMaster() {')&&!t.includes('LOCAL_CORPUS_176')&&!t.includes('LOCAL_CORE_180')}
function stopApp(target){try{for(const f of fs.readdirSync(target,{withFileTypes:true}).filter(x=>x.isFile()&&x.name.toLowerCase().endsWith('.exe')&&!/unins|uninstall|elevate/i.test(x.name))){try{cp.execFileSync('taskkill.exe',['/IM',f.name,'/F','/T'],{windowsHide:true,stdio:'ignore'})}catch{}}}catch{}}
function inspectCorpus(res){const lib=path.join(res,'local-library'),sqlite=path.join(lib,'sqlite3.exe'),db=path.join(lib,'torah-library.sqlite');if(!fs.existsSync(sqlite)||!fs.existsSync(db))fail(17,'המאגר המקומי אינו מותקן. יש להתקין תחילה את גרסה 1.7.5 המלאה.');let quick='';try{quick=cp.execFileSync(sqlite,['-readonly',db,'PRAGMA quick_check;'],{windowsHide:true,encoding:'utf8',timeout:120000}).trim()}catch(e){fail(18,'לא ניתן לבדוק את המאגר המקומי.',e.message)}if(quick!=='ok')fail(18,'בדיקת תקינות המאגר נכשלה.',quick);let stats={books:0,segments:0};try{const raw=cp.execFileSync(sqlite,['-readonly','-json',db,"SELECT (SELECT count(*) FROM books) AS books,(SELECT count(*) FROM segments) AS segments;"],{windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024}).trim();stats=(raw?JSON.parse(raw):[])[0]||stats}catch(e){fail(18,'לא ניתן לקרוא את נתוני המאגר.',e.message)}if(Number(stats.books)<100||Number(stats.segments)<10000)fail(18,'המאגר המקומי קטן או פגום.',JSON.stringify(stats));return{db,sqlite,books:Number(stats.books),segments:Number(stats.segments)}}

async function main(){
  fs.writeFileSync(logPath,`[${new Date().toISOString()}] Starting HaYad 1.8.0 Core Library update\n`,'utf8');
  if(!payload||!fs.existsSync(payload))fail(2,'Payload folder missing',payload||'');
  const asarDir=path.join(payload,'asar-tool','node_modules','@electron','asar');
  const patch176=path.join(payload,'patch-main-1.7.6.js');
  const patch180=path.join(payload,'patch-core-1.8.0.js');
  for(const p of [asarDir,patch176,patch180])if(!fs.existsSync(p))fail(3,'Installer payload incomplete',p);
  const asar=require(asarDir);
  if(selftest){
    const t180=fs.readFileSync(patch180,'utf8');
    if(!t180.includes('LOCAL_CORE_180')||!t180.includes('rambam-local://')||!t180.includes('rb-core-bar')||!t180.includes('ספריית הספרים'))fail(4,'Core-library injection assertions missing');
    const t176=fs.readFileSync(patch176,'utf8');if(!t176.includes("process.resourcesPath, 'local-library'"))fail(5,'External corpus path assertion missing');
    const tmp=path.join(os.tmpdir(),'HaYad180SelfTest');rm(tmp);ensureDir(tmp);fs.writeFileSync(path.join(tmp,'hello.txt'),'ok','utf8');const a=path.join(os.tmpdir(),'HaYad180SelfTest.asar');try{fs.rmSync(a,{force:true})}catch{}await asar.createPackage(tmp,a);const out=path.join(os.tmpdir(),'HaYad180SelfTestOut');rm(out);ensureDir(out);await Promise.resolve(asar.extractAll(a,out));if(fs.readFileSync(path.join(out,'hello.txt'),'utf8')!=='ok')fail(6,'ASAR self-test failed');rm(tmp);rm(out);try{fs.rmSync(a,{force:true})}catch{}log('SELFTEST OK: core dock + external corpus + ASAR');return;
  }
  let target=null;for(const p of listCandidates())if(fs.existsSync(path.join(p,'resources','app.asar'))){target=p;break}if(!target)fail(11,'לא נמצאה התקנת היד החזקה קיימת.');stopApp(target);
  const res=path.join(target,'resources'),corpus=inspectCorpus(res),current=path.join(res,'app.asar'),backup=path.join(res,'app-1.6.3-original.asar'),wrapper=path.join(res,'app');
  const workRoot=path.join(os.tmpdir(),'HaYad180Work');rm(workRoot);ensureDir(workRoot);
  let base=null;for(const candidate of [backup,current].filter((v,i,a)=>a.indexOf(v)===i&&fs.existsSync(v))){const check=path.join(workRoot,'check-'+crypto.randomBytes(4).toString('hex'));ensureDir(check);try{await Promise.resolve(asar.extractAll(candidate,check));if(validateRenderer(check)&&patchableOriginal(check)){base=candidate;log('Validated pristine 1.6.3 base: '+candidate);break}}catch(e){log('Candidate failed: '+e.message)}finally{rm(check)}}
  if(!base)fail(12,'לא נמצא גיבוי 1.6.3 מקורי ונקי. העדכון נעצר ללא שינוי.');if(!fs.existsSync(backup))fs.copyFileSync(base,backup);
  const work=path.join(workRoot,'app');ensureDir(work);await Promise.resolve(asar.extractAll(base,work));if(!validateRenderer(work))fail(13,'נעילת העיצוב נכשלה לפני העדכון.');
  const mainPath=path.join(work,'dist-electron','main.js'),pkgPath=path.join(work,'package.json');
  cp.execFileSync(process.execPath,[patch176,mainPath,pkgPath],{windowsHide:true,encoding:'utf8',stdio:'pipe',maxBuffer:16*1024*1024});
  cp.execFileSync(process.execPath,[patch180,mainPath,pkgPath],{windowsHide:true,encoding:'utf8',stdio:'pipe',maxBuffer:32*1024*1024});
  if(!validateRenderer(work))fail(14,'קבצי ה-UI של 1.6.3 השתנו. העדכון בוטל.');const patched=fs.readFileSync(mainPath,'utf8');if(!patched.includes('LOCAL_CORPUS_176')||!patched.includes('LOCAL_CORE_180'))fail(15,'שכבת המאגר המרכזית לא נוספה ל-backend.');
  const newAsar=path.join(workRoot,'app-1.8.0.asar');await asar.createPackage(work,newAsar);const verify=path.join(workRoot,'verify');ensureDir(verify);await Promise.resolve(asar.extractAll(newAsar,verify));if(!validateRenderer(verify))fail(16,'בדיקת ASAR סופית נכשלה: ממשק 1.6.3 אינו זהה.');
  try{if(fs.existsSync(wrapper))fs.rmSync(wrapper,{recursive:true,force:true});fs.copyFileSync(newAsar,current)}catch(e){try{fs.copyFileSync(backup,current)}catch{}fail(19,'החלפת app.asar נכשלה; הוחזר 1.6.3.',e.message)}
  const finalDir=path.join(workRoot,'final');ensureDir(finalDir);await Promise.resolve(asar.extractAll(current,finalDir));if(!validateRenderer(finalDir)){try{fs.copyFileSync(backup,current)}catch{}fail(20,'בדיקת העיצוב לאחר ההתקנה נכשלה; הוחזר 1.6.3.')}const finalMain=fs.readFileSync(path.join(finalDir,'dist-electron','main.js'),'utf8');if(!finalMain.includes('LOCAL_CORE_180')){try{fs.copyFileSync(backup,current)}catch{}fail(21,'בדיקת Core Library לאחר ההתקנה נכשלה; הוחזר 1.6.3.')}
  const meta={version:'1.8.0',base:'1.6.3',renderer:'byte-identical',coreLibrary:true,books:corpus.books,segments:corpus.segments,db:corpus.db,installedAt:new Date().toISOString()};fs.writeFileSync(path.join(res,'rambam-bahir-1.8.0.json'),JSON.stringify(meta,null,2),'utf8');rm(workRoot);fs.writeFileSync(resultPath,JSON.stringify({ok:true,target,...meta,log:logPath},null,2),'utf8');log(`SUCCESS 1.8.0: Core Library active with ${corpus.books} books`);
  if(!quiet){try{const exe=fs.readdirSync(target).find(n=>n.toLowerCase().endsWith('.exe')&&!/unins|uninstall|elevate/i.test(n));if(exe){const p=cp.spawn(path.join(target,exe),[],{detached:true,stdio:'ignore'});p.unref()}}catch(e){log('Launch skipped: '+e.message)}}
}
main().then(()=>process.exit(0)).catch(err=>{const code=Number(err.exitCode)||30;if(!fs.existsSync(resultPath)){try{fs.writeFileSync(resultPath,JSON.stringify({ok:false,code,message:err.message,log:logPath},null,2),'utf8')}catch{}}log(`FATAL ${code}: ${err.stack||err.message}`);process.exit(code)});
