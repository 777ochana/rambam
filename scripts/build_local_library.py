import json,urllib.request,sqlite3,os,re,time,hashlib
INDEX='https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json';OUT='resources/torah-library.sqlite';MAN='resources/corpus-manifest.json';ALLOWED={'Public Domain','CC0','CC-BY','CC-BY-SA'}
KEYWORDS=['Rashi','Ibn Ezra','Ramban','Sforno','Or HaChaim','Kli Yakar','Metzudat David','Metzudat Zion','Radak','Malbim','Bartenura','Tosafot','Rif','Rosh','Rabbeinu Chananel','Maharsha','Maharshal','Rabbeinu Yonah','Rashba','Ritva','Ran on','Meiri','Maggid Mishneh','Kesef Mishneh','Lechem Mishneh','Mishneh LaMelech','Migdal Oz','Hagahot Maimoniyot','Maaseh Rokeach','Merkavat HaMishneh','Tur','Beit Yosef','Darchei Moshe','Bach','Prisha','Drisha','Sma','Shach','Taz','Magen Avraham','Be’er Heitev','Be\'er Heitev','Shaarei Teshuvah','Pri Megadim','Biur Halacha','Shaar HaTziyun','Arukh HaShulchan','Kitzur Shulchan Arukh','Sefer HaMitzvot','Sefer HaChinukh','Sefer Mitzvot Gadol','Sefer Mitzvot Katan','Yereim','Or Zarua','Mordechai','Teshuvot HaRashba','Rivash','Radbaz','Noda B\'Yehuda','Chatam Sofer','Guide for the Perplexed','Moreh Nevukhim','Eight Chapters','Shemonah Perakim','Duties of the Heart','Chovot HaLevavot','Mesilat Yesharim','Derekh Hashem','Nefesh HaChaim','Orchot Tzadikim']
def get(url):
 with urllib.request.urlopen(url,timeout=90) as r:return json.load(r)
def cat(b):
 c=b.get('categories',[]);t=b.get('title','')
 if 'Tanakh' in c:return'tanakh'
 if 'Mishnah' in c:return'mishnah'
 if 'Tosefta' in c:return'tosefta'
 if 'Talmud' in c and 'Bavli' in c:return'bavli'
 if 'Talmud' in c and ('Yerushalmi' in c or 'Jerusalem Talmud' in c):return'yerushalmi'
 if t.startswith('Mishneh Torah'):return'rambam'
 if t.startswith('Shulchan Arukh'):return'shulchan_arukh'
 if 'Midrash' in c:return'midrash'
 if any(k.lower() in t.lower() for k in KEYWORDS):
  if any(x in t.lower() for x in ['responsa','teshuvot','rivash','radbaz','noda','chatam sofer']):return'responsa'
  if any(x in t.lower() for x in ['guide for','moreh','eight chapters','shemonah','duties','chovot','mesilat','derekh hashem','nefesh','orchot']):return'thought'
  if 'tur' in t.lower() or any(x in t.lower() for x in ['beit yosef','darchei moshe','bach','prisha','drisha']):return'tur'
  if any(x in t.lower() for x in ['shulchan arukh','sma','shach','taz','magen avraham','heitev','pri megadim','biur halacha','shaarei teshuvah','shaar hatziyun','arukh hashulchan']):return'shulchan_arukh'
  return'rishonim'
 return None
def select(b):
 if b.get('language')!='Hebrew' or b.get('versionTitle')!='merged' or not b.get('json_url'):return False
 t=b.get('title','').lower()
 if 'mishnah berurah' in t:return False
 return cat(b) is not None
def flatten(x,path=()):
 if isinstance(x,str):
  s=re.sub('<[^>]+>',' ',x);s=re.sub(r'\s+',' ',s).strip()
  if s:yield path,s
 elif isinstance(x,list):
  for i,v in enumerate(x):yield from flatten(v,path+(i+1,))
def norm(s):
 s=re.sub('[\u0591-\u05C7]','',s);s=s.replace('״','"').replace('׳',"'").replace('־','-');return re.sub(r'\s+',' ',s).strip()
os.makedirs('resources',exist_ok=True)
if os.path.exists(OUT):os.remove(OUT)
db=sqlite3.connect(OUT);db.execute('PRAGMA journal_mode=OFF');db.execute('CREATE TABLE books(title TEXT PRIMARY KEY,he_title TEXT,category TEXT,license TEXT,source_url TEXT,segments INTEGER DEFAULT 0)');db.execute('CREATE TABLE segments(id INTEGER PRIMARY KEY,book TEXT,he_book TEXT,category TEXT,ref TEXT,text TEXT,normalized TEXT,seq INTEGER)');db.execute("CREATE VIRTUAL TABLE segments_fts USING fts5(normalized,content='segments',content_rowid='id',tokenize='unicode61')")
idx=get(INDEX);books=[b for b in idx['books'] if select(b)];manifest={'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'selected':len(books),'included':[],'excluded':[],'rule':'Hebrew merged; allowed licenses only; Mishnah Berurah excluded'}
for n,b in enumerate(books,1):
 try:d=get(b['json_url'])
 except Exception as e:manifest['excluded'].append({'title':b['title'],'reason':str(e)});continue
 lic=d.get('license') or b.get('license') or ''
 if isinstance(lic,list):lic=', '.join(lic)
 if lic not in ALLOWED:manifest['excluded'].append({'title':b['title'],'license':lic or'unknown'});continue
 title=b['title'];he=d.get('heTitle') or d.get('title') or title;c=cat(b);text=d.get('text',[]);seq=0;rows=[]
 for p,s in flatten(text):
  seq+=1;ref=title+' '+':'.join(map(str,p)) if p else title;rows.append((title,he,c,ref,s,norm(s),seq))
 if not rows:continue
 cur=db.cursor();cur.executemany('INSERT INTO segments(book,he_book,category,ref,text,normalized,seq) VALUES(?,?,?,?,?,?,?)',rows);first=cur.lastrowid-len(rows)+1 if cur.lastrowid else None
 # FTS rebuild is faster and guarantees rowid parity after all inserts.
 db.execute('INSERT OR REPLACE INTO books(title,he_title,category,license,source_url,segments) VALUES(?,?,?,?,?,?)',(title,he,c,lic,b['json_url'],len(rows)));db.commit();manifest['included'].append({'title':title,'category':c,'license':lic,'segments':len(rows)});print(f'{n}/{len(books)} {title} {len(rows)}')
db.execute("INSERT INTO segments_fts(segments_fts) VALUES('rebuild')");db.execute('CREATE INDEX idx_segments_book_seq ON segments(book,seq)');db.execute('CREATE INDEX idx_segments_category ON segments(category)');db.commit();db.close();manifest['sha256']=hashlib.sha256(open(OUT,'rb').read()).hexdigest();json.dump(manifest,open(MAN,'w',encoding='utf8'),ensure_ascii=False,indent=2);print('DONE',len(manifest['included']),'books',manifest['sha256'])