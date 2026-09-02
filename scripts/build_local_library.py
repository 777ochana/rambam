import json, urllib.request, urllib.parse, sqlite3, os, re, time, hashlib, tempfile, shutil
from concurrent.futures import ThreadPoolExecutor, as_completed

INDEX='https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json'
VERSIONS='https://www.sefaria.org/api/texts/versions/{}'
OUT='resources/torah-library.sqlite'
MAN='resources/corpus-manifest.json'
ALLOWED={'Public Domain','CC0','CC-BY','CC-BY-SA'}

TANAKH_COMMENTATORS=[
 'Rashi on ','Ibn Ezra on ','Ramban on ','Sforno on ','Or HaChaim on ','Kli Yakar on ',
 'Metzudat David on ','Metzudat Zion on ','Radak on ','Malbim on '
]
TALMUD_COMMENTATORS=[
 'Rashi on ','Tosafot on ','Rif on ','Rosh on ','Rabbeinu Chananel on ','Rabbeinu Yonah on ',
 'Rashba on ','Ritva on ','Ran on ','Meiri on ','Maharsha on ','Maharshal on ',
 'Chidushei Rashba','Chidushei HaRitva','Chidushei Ritva','Chidushei HaMeiri','Chidushei Meiri','Chidushei HaRan'
]
MIDRASH=[
 'Genesis Rabbah','Exodus Rabbah','Leviticus Rabbah','Numbers Rabbah','Deuteronomy Rabbah',
 'Midrash Tanchuma','Mekhilta','Sifra','Sifrei Bamidbar','Sifrei Devarim','Pesikta','Yalkut Shimoni',
 'Avot DeRabbi Natan',"Avot d'Rabbi Natan"
]
RESPONSA=['Teshuvot HaRashba','Rivash','Radbaz',"Noda B'Yehuda",'Noda BiYehuda','Chatam Sofer','Igrot Moshe','Yabia Omer','Yechaveh Daat']
THOUGHT=['Guide for the Perplexed','Moreh Nevukhim','Eight Chapters','Shemonah Perakim','Duties of the Heart','Chovot HaLevavot','Mesilat Yesharim','Derekh Hashem','Nefesh HaChaim','Orchot Tzadikim','Shaarei Teshuvah']
HALAKHIC_CLASSICS=[
 'Sefer HaMitzvot','Sefer HaChinukh','Sefer Mitzvot Gadol','Sefer Mitzvot Katan','Sefer Yereim','Yereim',
 'Or Zarua','Mordechai','Arukh HaShulchan','Kitzur Shulchan Arukh','Beit Yosef','Darchei Moshe','Bach','Prisha','Drisha'
]


def request(url,timeout=35,tries=3):
    last=None
    for i in range(tries):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'HaYad-HaHazaka/1.7.0','Accept':'application/json'})
            return urllib.request.urlopen(req,timeout=timeout)
        except Exception as e:
            last=e; time.sleep(.35*(i+1))
    raise last

def get_json(url):
    with request(url) as r: return json.load(r)

def starts_any(t,arr):
    tl=t.casefold(); return any(tl.startswith(x.casefold()) for x in arr)

def contains_any(t,arr):
    tl=t.casefold(); return any(x.casefold() in tl for x in arr)

def target_cat(b):
    c=b.get('categories',[]); t=b.get('title',''); tl=t.casefold()
    if 'mishnah berurah' in tl: return None
    # Primary corpora
    if 'Tanakh' in c and 'Commentary' not in c: return 'tanakh'
    if 'Mishnah' in c and 'Commentary' not in c: return 'mishnah'
    if 'Tosefta' in c and 'Commentary' not in c: return 'tosefta'
    if 'Talmud' in c and 'Bavli' in c and 'Commentary' not in c: return 'bavli'
    if 'Talmud' in c and ('Yerushalmi' in c or 'Jerusalem Talmud' in c) and 'Commentary' not in c: return 'yerushalmi'
    if t.startswith('Mishneh Torah') and ' on Mishneh Torah' not in t: return 'rambam'
    if t.startswith('Shulchan Arukh') and ' on Shulchan Arukh' not in t: return 'shulchan_arukh'
    if t.startswith('Tur') or t.startswith('Arbaah Turim') or t.startswith("Arba'ah Turim"): return 'tur'
    # For a Rambam research tool, include every legally permitted commentary on Rambam / SA / Tur.
    if ' on Mishneh Torah' in t: return 'rishonim'
    if ' on Shulchan Arukh' in t: return 'shulchan_arukh'
    if ' on Tur' in t: return 'tur'
    # Selected classical commentaries
    if starts_any(t,TANAKH_COMMENTATORS): return 'rishonim'
    if starts_any(t,TALMUD_COMMENTATORS): return 'rishonim'
    if starts_any(t,MIDRASH): return 'midrash'
    if starts_any(t,RESPONSA): return 'responsa'
    if starts_any(t,THOUGHT): return 'thought'
    if starts_any(t,HALAKHIC_CLASSICS): return 'halakhah'
    # Bartenura / Rambam commentary on Mishnah
    if t.startswith('Bartenura on ') or t.startswith('Rambam on Mishnah') or t.startswith('Mishnah Commentary of the Rambam'):
        return 'rishonim'
    return None

def normalize(s):
    s=re.sub('[\u0591-\u05C7]','',s)
    s=s.replace('״','"').replace('׳',"'").replace('־','-')
    s=re.sub('<[^>]+>',' ',s)
    return re.sub(r'\s+',' ',s).strip()

def flatten(x,path=()):
    if isinstance(x,str):
        s=re.sub('<[^>]+>',' ',x); s=re.sub(r'\s+',' ',s).strip()
        if s: yield path,s
    elif isinstance(x,list):
        for i,v in enumerate(x): yield from flatten(v,path+(i+1,))
    elif isinstance(x,dict):
        # Complex Sefaria texts use named schema nodes. Preserve stable textual path labels in sequence order.
        for _,v in x.items(): yield from flatten(v,path)

def make_ref(title,path,sections):
    if not path: return title
    if sections and sections[0]=='Daf':
        n=path[0]; daf=(n+3)//2; amud='a' if n%2 else 'b'; rest=':'.join(map(str,path[1:]))
        return f'{title} {daf}{amud}'+(f':{rest}' if rest else '')
    return title+' '+':'.join(map(str,path))

def safe_vtitle(s):
    # Same illegal filename characters stripped by Sefaria's exporter.
    return re.sub(r'[/:()<>"|?*\\\r\n\t]','',s or '').strip().casefold()

def he_version(v):
    return str(v.get('language','')).casefold() in {'he','hebrew'} or str(v.get('actualLanguage','')).casefold() in {'he','hebrew'}

def choose_title(item):
    title,cands=item
    try:
        meta=get_json(VERSIONS.format(urllib.parse.quote(title,safe='')))
    except Exception as e:
        return title,None,'versions-api: '+type(e).__name__
    by={safe_vtitle(b.get('versionTitle')):b for b in cands}
    good=[]
    for v in meta if isinstance(meta,list) else []:
        lic=(v.get('license') or '').strip(); vt=v.get('versionTitle') or ''
        if lic not in ALLOWED or not he_version(v): continue
        b=by.get(safe_vtitle(vt))
        if not b: continue
        priority=v.get('priority') or 0
        try: priority=float(priority)
        except: priority=0
        score=(1000 if v.get('isPrimary') else 0)+(100 if v.get('isSource') else 0)+priority
        good.append((score,lic,v,b))
    if not good:
        return title,None,'no matched permitted Hebrew version'
    good.sort(key=lambda x:x[0],reverse=True)
    return title,good[0],None

def download(sel,tmpdir):
    score,lic,meta,b=sel; title=b['title']
    fn=hashlib.sha1((title+'|'+(b.get('versionTitle') or '')).encode()).hexdigest()+'.json'; p=os.path.join(tmpdir,fn)
    try:
        with request(b['json_url'],timeout=90,tries=3) as src,open(p,'wb') as dst: shutil.copyfileobj(src,dst)
        return title,sel,p,None
    except Exception as e:
        return title,sel,None,type(e).__name__

os.makedirs('resources',exist_ok=True)
if os.path.exists(OUT): os.remove(OUT)
idx=get_json(INDEX)
groups={}
for b in idx.get('books',[]):
    if b.get('language')!='Hebrew' or b.get('versionTitle')=='merged' or not b.get('json_url') or not target_cat(b): continue
    groups.setdefault(b.get('title',''),[]).append(b)
print('CANDIDATE TITLES',len(groups),flush=True)

selected=[]; excluded=[]
with ThreadPoolExecutor(max_workers=24) as ex:
    futs=[ex.submit(choose_title,item) for item in groups.items()]
    for i,f in enumerate(as_completed(futs),1):
        title,sel,err=f.result()
        if sel: selected.append(sel)
        else: excluded.append({'title':title,'reason':err})
        if i%40==0: print('LICENSE',i,'/',len(futs),'selected',len(selected),flush=True)
print('LICENSED TITLES',len(selected),flush=True)
if len(selected)<20:
    print('SAMPLE EXCLUDED',excluded[:20],flush=True)

tmpdir=tempfile.mkdtemp(prefix='hayad-corpus-'); downloaded=[]
try:
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs=[ex.submit(download,s,tmpdir) for s in selected]
        for i,f in enumerate(as_completed(futs),1):
            title,sel,p,err=f.result()
            if p: downloaded.append((sel,p))
            else: excluded.append({'title':title,'reason':'download: '+err})
            if i%25==0: print('DOWNLOAD',i,'/',len(futs),'ok',len(downloaded),flush=True)

    db=sqlite3.connect(OUT); db.execute('PRAGMA journal_mode=OFF'); db.execute('PRAGMA synchronous=OFF')
    db.execute('CREATE TABLE books(title TEXT PRIMARY KEY,he_title TEXT,category TEXT,license TEXT,version_title TEXT,source_url TEXT,segments INTEGER DEFAULT 0)')
    db.execute('CREATE TABLE segments(id INTEGER PRIMARY KEY,book TEXT,he_book TEXT,category TEXT,ref TEXT,text TEXT,normalized TEXT,seq INTEGER)')
    db.execute("CREATE VIRTUAL TABLE segments_fts USING fts5(normalized,content='segments',content_rowid='id',tokenize='unicode61')")
    included=[]
    for i,(sel,p) in enumerate(downloaded,1):
        score,lic,meta,b=sel; title=b['title']
        try:
            with open(p,encoding='utf-8-sig') as f: d=json.load(f)
            sections=d.get('sectionNames',[]); he=d.get('heTitle') or title; c=target_cat(b); rows=[]; seq=0
            for pp,s in flatten(d.get('text',[])):
                seq+=1; rows.append((title,he,c,make_ref(title,pp,sections),s,normalize(s),seq))
            if not rows:
                excluded.append({'title':title,'reason':'empty text'}); continue
            db.executemany('INSERT INTO segments(book,he_book,category,ref,text,normalized,seq) VALUES(?,?,?,?,?,?,?)',rows)
            db.execute('INSERT OR REPLACE INTO books(title,he_title,category,license,version_title,source_url,segments) VALUES(?,?,?,?,?,?,?)',(title,he,c,lic,meta.get('versionTitle') or b.get('versionTitle',''),b['json_url'],len(rows)))
            included.append({'title':title,'heTitle':he,'category':c,'license':lic,'versionTitle':meta.get('versionTitle') or b.get('versionTitle'),'segments':len(rows),'sourceUrl':b['json_url']})
            if i%20==0: db.commit()
        except Exception as e:
            excluded.append({'title':title,'reason':'parse: '+str(e)})
        if i%25==0: print('INDEX',i,'/',len(downloaded),'included',len(included),flush=True)
    db.commit(); db.execute("INSERT INTO segments_fts(segments_fts) VALUES('rebuild')")
    db.execute('CREATE INDEX idx_segments_book_seq ON segments(book,seq)'); db.execute('CREATE INDEX idx_segments_category ON segments(category)'); db.commit()
    counts=dict(db.execute('SELECT category,count(*) FROM books GROUP BY category').fetchall()); segments=db.execute('SELECT count(*) FROM segments').fetchone()[0]; db.close()
finally:
    shutil.rmtree(tmpdir,ignore_errors=True)

manifest={'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'candidateTitles':len(groups),'included':included,'excluded':excluded,'rule':'Per-version license checked with official Sefaria Versions API; matched to Sefaria Export filename using exporter-safe version title. Allowed Public Domain/CC0/CC-BY/CC-BY-SA; CC-BY-NC/Copyright/unknown excluded; Mishnah Berurah excluded by user request.','categoryCounts':counts,'segments':segments}
h=hashlib.sha256()
with open(OUT,'rb') as f:
    for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
manifest['sha256']=h.hexdigest()
with open(MAN,'w',encoding='utf8') as f: json.dump(manifest,f,ensure_ascii=False,indent=2)
print('DONE',len(included),'books',segments,'segments',manifest['sha256'],flush=True)
