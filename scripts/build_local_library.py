import json, urllib.request, sqlite3, os, re, time, hashlib, tempfile, shutil
from concurrent.futures import ThreadPoolExecutor, as_completed

INDEX='https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json'
OUT='resources/torah-library.sqlite'
MAN='resources/corpus-manifest.json'
ALLOWED={'Public Domain','CC0','CC-BY','CC-BY-SA'}
MIDRASH=['Genesis Rabbah','Exodus Rabbah','Leviticus Rabbah','Numbers Rabbah','Deuteronomy Rabbah','Midrash Tanchuma','Mekhilta','Sifra','Sifrei Bamidbar','Sifrei Devarim','Pesikta','Yalkut Shimoni','Avot DeRabbi Natan','Avot d\'Rabbi Natan']
RESPONSA=['Teshuvot HaRashba','Rivash','Radbaz','Noda B\'Yehuda','Noda BiYehuda','Chatam Sofer','Igrot Moshe','Yabia Omer','Yechaveh Daat']
THOUGHT=['Guide for the Perplexed','Moreh Nevukhim','Eight Chapters','Shemonah Perakim','Duties of the Heart','Chovot HaLevavot','Mesilat Yesharim','Derekh Hashem','Nefesh HaChaim','Orchot Tzadikim','Shaarei Teshuvah']
CLASSICS=['Rashi on','Ibn Ezra','Ramban','Sforno','Or HaChaim','Kli Yakar','Metzudat David','Metzudat Zion','Radak','Malbim','Bartenura','Tosafot on','Rif','Rosh','Rabbeinu Chananel','Maharsha','Maharshal','Rabbeinu Yonah','Rashba','Ritva','Ran on','Meiri','Maggid Mishneh','Kesef Mishneh','Lechem Mishneh','Mishneh LaMelech','Migdal Oz','Hagahot Maimoniyot','Maaseh Rokeach','Merkavat HaMishneh','Beit Yosef','Darchei Moshe','Bach','Prisha','Drisha','Sma','Shach','Taz','Magen Avraham','Be’er Heitev','Be\'er Heitev','Shaarei Teshuvah','Pri Megadim','Biur Halacha','Shaar HaTziyun','Arukh HaShulchan','Kitzur Shulchan Arukh','Sefer HaMitzvot','Sefer HaChinukh','Sefer Mitzvot Gadol','Sefer Mitzvot Katan','Yereim','Or Zarua','Mordechai']

def request(url, timeout=40, tries=3):
    last=None
    for i in range(tries):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'HaYad-HaHazaka/1.7.0','Accept':'application/json'})
            return urllib.request.urlopen(req,timeout=timeout)
        except Exception as e:
            last=e
            time.sleep(.35*(i+1))
    raise last

def get_json(url):
    with request(url) as r:
        return json.load(r)

def contains(title, arr):
    t=title.casefold()
    return any(x.casefold() in t for x in arr)

def target_cat(b):
    c=b.get('categories',[]); t=b.get('title',''); tl=t.casefold()
    if 'mishnah berurah' in tl: return None
    if 'Tanakh' in c and 'Commentary' not in c: return 'tanakh'
    if 'Mishnah' in c and 'Commentary' not in c: return 'mishnah'
    if 'Tosefta' in c and 'Commentary' not in c: return 'tosefta'
    if 'Talmud' in c and 'Bavli' in c and 'Commentary' not in c: return 'bavli'
    if 'Talmud' in c and ('Yerushalmi' in c or 'Jerusalem Talmud' in c) and 'Commentary' not in c: return 'yerushalmi'
    if t.startswith('Mishneh Torah') and ' on Mishneh Torah' not in t: return 'rambam'
    if ' on Mishneh Torah' in t: return 'rishonim'
    if t.startswith('Shulchan Arukh') or ' on Shulchan Arukh' in t: return 'shulchan_arukh'
    if t.startswith('Tur') or 'Arbaah Turim' in t or "Arba'ah Turim" in t or ' on Tur' in t: return 'tur'
    if contains(t,MIDRASH): return 'midrash'
    if contains(t,RESPONSA): return 'responsa'
    if contains(t,THOUGHT): return 'thought'
    if contains(t,CLASSICS): return 'rishonim'
    return None

def normalize(s):
    s=re.sub('[\u0591-\u05C7]','',s)
    s=s.replace('״','"').replace('׳',"'").replace('־','-')
    s=re.sub('<[^>]+>',' ',s)
    return re.sub(r'\s+',' ',s).strip()

def flatten(x,path=()):
    if isinstance(x,str):
        s=re.sub('<[^>]+>',' ',x)
        s=re.sub(r'\s+',' ',s).strip()
        if s: yield path,s
    elif isinstance(x,list):
        for i,v in enumerate(x):
            yield from flatten(v,path+(i+1,))

def make_ref(title,path,sections):
    if not path: return title
    if sections and sections[0]=='Daf':
        n=path[0]; daf=(n+3)//2; amud='a' if n%2 else 'b'
        rest=':'.join(map(str,path[1:]))
        return f'{title} {daf}{amud}'+(f':{rest}' if rest else '')
    return title+' '+':'.join(map(str,path))

def candidate_score(b):
    vt=(b.get('versionTitle') or '').casefold()
    score=0
    if 'wikisource' in vt or 'mechon mamre' in vt or 'sefaria community' in vt: score+=30
    if 'vilna' in vt or 'warsaw' in vt or 'public domain' in vt: score+=20
    if 'merged' in vt: score-=1000
    return score

def probe_title(item,tmpdir):
    title,cands=item
    errors=[]
    for b in sorted(cands,key=candidate_score,reverse=True):
        try:
            with request(b['json_url'],timeout=75,tries=2) as r:
                raw=r.read()
            d=json.loads(raw.decode('utf-8-sig'))
            lic=(d.get('license') or '').strip()
            lang=str(d.get('language') or b.get('language') or '').casefold()
            text=d.get('text',[])
            if lang not in {'he','hebrew'}:
                errors.append(f"{b.get('versionTitle')}: non-Hebrew")
                continue
            if lic not in ALLOWED:
                errors.append(f"{b.get('versionTitle')}: {lic or 'no license'}")
                continue
            if not text:
                errors.append(f"{b.get('versionTitle')}: empty")
                continue
            fn=hashlib.sha1((title+'|'+(b.get('versionTitle') or '')).encode()).hexdigest()+'.json'
            p=os.path.join(tmpdir,fn)
            with open(p,'wb') as f: f.write(raw)
            return title,b,p,lic,None
        except Exception as e:
            errors.append(f"{b.get('versionTitle')}: {type(e).__name__}")
    return title,None,None,None,'; '.join(errors[:8]) or 'no permitted Hebrew version'

os.makedirs('resources',exist_ok=True)
if os.path.exists(OUT): os.remove(OUT)
idx=get_json(INDEX)
groups={}
for b in idx.get('books',[]):
    if b.get('language')!='Hebrew' or b.get('versionTitle')=='merged' or not b.get('json_url') or not target_cat(b):
        continue
    groups.setdefault(b.get('title',''),[]).append(b)
print('CANDIDATE TITLES',len(groups),flush=True)

tmpdir=tempfile.mkdtemp(prefix='hayad-corpus-')
selected=[]; excluded=[]
try:
    with ThreadPoolExecutor(max_workers=32) as ex:
        futs=[ex.submit(probe_title,item,tmpdir) for item in groups.items()]
        for i,f in enumerate(as_completed(futs),1):
            title,b,p,lic,err=f.result()
            if p: selected.append((b,p,lic))
            else: excluded.append({'title':title,'reason':err})
            if i%40==0:
                print('PROBE',i,'/',len(futs),'licensed',len(selected),flush=True)
    print('LICENSED TITLES',len(selected),flush=True)

    db=sqlite3.connect(OUT)
    db.execute('PRAGMA journal_mode=OFF'); db.execute('PRAGMA synchronous=OFF')
    db.execute('CREATE TABLE books(title TEXT PRIMARY KEY,he_title TEXT,category TEXT,license TEXT,version_title TEXT,source_url TEXT,segments INTEGER DEFAULT 0)')
    db.execute('CREATE TABLE segments(id INTEGER PRIMARY KEY,book TEXT,he_book TEXT,category TEXT,ref TEXT,text TEXT,normalized TEXT,seq INTEGER)')
    db.execute("CREATE VIRTUAL TABLE segments_fts USING fts5(normalized,content='segments',content_rowid='id',tokenize='unicode61')")
    included=[]
    for i,(b,p,lic) in enumerate(selected,1):
        title=b['title']
        try:
            with open(p,encoding='utf-8-sig') as f: d=json.load(f)
            sections=d.get('sectionNames',[]); he=d.get('heTitle') or title; c=target_cat(b)
            rows=[]; seq=0
            for pp,s in flatten(d.get('text',[])):
                seq+=1
                rows.append((title,he,c,make_ref(title,pp,sections),s,normalize(s),seq))
            if not rows:
                excluded.append({'title':title,'reason':'empty text after flatten'}); continue
            db.executemany('INSERT INTO segments(book,he_book,category,ref,text,normalized,seq) VALUES(?,?,?,?,?,?,?)',rows)
            db.execute('INSERT OR REPLACE INTO books(title,he_title,category,license,version_title,source_url,segments) VALUES(?,?,?,?,?,?,?)',(title,he,c,lic,b.get('versionTitle',''),b['json_url'],len(rows)))
            included.append({'title':title,'heTitle':he,'category':c,'license':lic,'versionTitle':b.get('versionTitle'),'segments':len(rows),'sourceUrl':b['json_url']})
            if i%20==0: db.commit()
        except Exception as e:
            excluded.append({'title':title,'reason':'parse: '+str(e)})
        if i%40==0:
            print('INDEX',i,'/',len(selected),'included',len(included),flush=True)
    db.commit()
    db.execute("INSERT INTO segments_fts(segments_fts) VALUES('rebuild')")
    db.execute('CREATE INDEX idx_segments_book_seq ON segments(book,seq)')
    db.execute('CREATE INDEX idx_segments_category ON segments(category)')
    db.commit()
    counts=dict(db.execute('SELECT category,count(*) FROM books GROUP BY category').fetchall())
    segments=db.execute('SELECT count(*) FROM segments').fetchone()[0]
    db.close()
finally:
    shutil.rmtree(tmpdir,ignore_errors=True)

manifest={
 'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
 'candidateTitles':len(groups),
 'included':included,
 'excluded':excluded,
 'rule':'Each Hebrew edition is validated from its own Sefaria Export JSON license field. Allowed: Public Domain, CC0, CC-BY, CC-BY-SA. CC-BY-NC and unknown licenses excluded. Mishnah Berurah excluded by user request.',
 'categoryCounts':counts,
 'segments':segments
}
h=hashlib.sha256()
with open(OUT,'rb') as f:
    for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
manifest['sha256']=h.hexdigest()
with open(MAN,'w',encoding='utf8') as f: json.dump(manifest,f,ensure_ascii=False,indent=2)
print('DONE',len(included),'books',segments,'segments',manifest['sha256'],flush=True)
