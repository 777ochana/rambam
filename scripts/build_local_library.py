import json,urllib.request,urllib.parse,sqlite3,os,re,time,hashlib
INDEX='https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json';VERS='https://www.sefaria.org/api/texts/versions/{}';OUT='resources/torah-library.sqlite';MAN='resources/corpus-manifest.json'
ALLOWED={'Public Domain','CC0','CC-BY','CC-BY-SA'}
MIDRASH=['Genesis Rabbah','Exodus Rabbah','Leviticus Rabbah','Numbers Rabbah','Deuteronomy Rabbah','Midrash Tanchuma','Mekhilta','Sifra','Sifrei Bamidbar','Sifrei Devarim','Pesikta','Yalkut Shimoni','Avot DeRabbi Natan','Avot d\'Rabbi Natan']
RESPONSA=['Teshuvot HaRashba','Rivash','Radbaz','Noda B\'Yehuda','Noda BiYehuda','Chatam Sofer','Igrot Moshe','Yabia Omer','Yechaveh Daat']
THOUGHT=['Guide for the Perplexed','Moreh Nevukhim','Eight Chapters','Shemonah Perakim','Duties of the Heart','Chovot HaLevavot','Mesilat Yesharim','Derekh Hashem','Nefesh HaChaim','Orchot Tzadikim','Shaarei Teshuvah']
CLASSICS=['Rashi on','Ibn Ezra','Ramban','Sforno','Or HaChaim','Kli Yakar','Metzudat David','Metzudat Zion','Radak','Malbim','Bartenura','Tosafot on','Rif','Rosh','Rabbeinu Chananel','Maharsha','Maharshal','Rabbeinu Yonah','Rashba','Ritva','Ran on','Meiri','Maggid Mishneh','Kesef Mishneh','Lechem Mishneh','Mishneh LaMelech','Migdal Oz','Hagahot Maimoniyot','Maaseh Rokeach','Merkavat HaMishneh','Beit Yosef','Darchei Moshe','Bach','Prisha','Drisha','Sma','Shach','Taz','Magen Avraham','Be’er Heitev','Be\'er Heitev','Shaarei Teshuvah','Pri Megadim','Biur Halacha','Shaar HaTziyun','Arukh HaShulchan','Kitzur Shulchan Arukh','Sefer HaMitzvot','Sefer HaChinukh','Sefer Mitzvot Gadol','Sefer Mitzvot Katan','Yereim','Or Zarua','Mordechai']
def get(url,tries=3):
 for i in range(tries):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'HaYad-HaHazaka/1.7.0','Accept':'application/json'})
   with urllib.request.urlopen(req,timeout=90) as r:return json.load(r)
  except Exception:
   if i==tries-1:raise
   time.sleep(1+i)
def contains(title,arr):
 t=title.casefold();return any(x.casefold() in t for x in arr)
def target_cat(b):
 c=b.get('categories',[]);t=b.get('title','');tl=t.casefold()
 if 'mishnah berurah' in tl:return None
 if 'Tanakh' in c and 'Commentary' not in c:return'tanakh'
 if 'Mishnah' in c and 'Commentary' not in c:return'mishnah'
 if 'Tosefta' in c and 'Commentary' not in c:return'tosefta'
 if 'Talmud' in c and 'Bavli' in c and 'Commentary' not in c:return'bavli'
 if 'Talmud' in c and ('Yerushalmi' in c or 'Jerusalem Talmud' in c) and 'Commentary' not in c:return'yerushalmi'
 if t.startswith('Mishneh Torah') and ' on Mishneh Torah' not in t:return'rambam'
 if ' on Mishneh Torah' in t:return'rishonim'
 if t.startswith('Shulchan Arukh') or ' on Shulchan Arukh' in t:return'shulchan_arukh'
 if t.startswith('Tur') or 'Arbaah Turim' in t or "Arba'ah Turim" in t or ' on Tur' in t:return'tur'
 if contains(t,MIDRASH):return'midrash'
 if contains(t,RESPONSA):return'responsa'
 if contains(t,THOUGHT):return'thought'
 if contains(t,CLASSICS):return'rishonim'
 return None
def normalize(s):
 s=re.sub('[\u0591-\u05C7]','',s);s=s.replace('״','"').replace('׳',"'").replace('־','-');s=re.sub('<[^>]+>',' ',s);return re.sub(r'\s+',' ',s).strip()
def flatten(x,path=()):
 if isinstance(x,str):
  s=re.sub('<[^>]+>',' ',x);s=re.sub(r'\s+',' ',s).strip()
  if s:yield path,s
 elif isinstance(x,list):
  for i,v in enumerate(x):yield from flatten(v,path+(i+1,))
def make_ref(title,path,section_names):
 if not path:return title
 if section_names and section_names[0]=='Daf':
  n=path[0];daf=(n+3)//2;amud='a' if n%2 else'b';rest=':'.join(map(str,path[1:]));return f'{title} {daf}{amud}'+(f':{rest}' if rest else'')
 return title+' '+':'.join(map(str,path))
def lang_he(v):return str(v.get('language','')).casefold() in {'he','hebrew'} or str(v.get('actualLanguage','')).casefold() in {'he','hebrew'}
def licensed_candidates(title,book_candidates):
 try:meta=get(VERS.format(urllib.parse.quote(title,safe='')))
 except Exception:return []
 by_title={b.get('versionTitle'):b for b in book_candidates}
 good=[]
 for v in meta if isinstance(meta,list) else []:
  lic=v.get('license') or'';vt=v.get('versionTitle')
  if lic in ALLOWED and lang_he(v) and vt in by_title:
   score=(100 if v.get('isPrimary') else 0)+(20 if v.get('isSource') else 0)+int(float(v.get('priority') or 0));good.append((score,lic,v,by_title[vt]))
 return sorted(good,key=lambda x:x[0],reverse=True)
os.makedirs('resources',exist_ok=True)
if os.path.exists(OUT):os.remove(OUT)
db=sqlite3.connect(OUT);db.execute('PRAGMA journal_mode=OFF');db.execute('PRAGMA synchronous=OFF');db.execute('CREATE TABLE books(title TEXT PRIMARY KEY,he_title TEXT,category TEXT,license TEXT,version_title TEXT,source_url TEXT,segments INTEGER DEFAULT 0)');db.execute('CREATE TABLE segments(id INTEGER PRIMARY KEY,book TEXT,he_book TEXT,category TEXT,ref TEXT,text TEXT,normalized TEXT,seq INTEGER)');db.execute("CREATE VIRTUAL TABLE segments_fts USING fts5(normalized,content='segments',content_rowid='id',tokenize='unicode61')")
idx=get(INDEX);groups={}
for b in idx.get('books',[]):
 if b.get('language')!='Hebrew' or b.get('versionTitle')=='merged' or not b.get('json_url') or not target_cat(b):continue
 groups.setdefault(b.get('title',''),[]).append(b)
manifest={'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'candidateTitles':len(groups),'included':[],'excluded':[],'rule':'Per-version license checked with Sefaria Versions API; allowed: Public Domain, CC0, CC-BY, CC-BY-SA; Mishnah Berurah excluded'}
for n,(title,cands) in enumerate(sorted(groups.items()),1):
 good=licensed_candidates(title,cands)
 if not good:manifest['excluded'].append({'title':title,'reason':'no permitted Hebrew version found'});continue
 included=False
 for score,lic,meta,b in good:
  try:d=get(b['json_url'])
  except Exception:continue
  text=d.get('text',[]);sections=d.get('sectionNames',[]);he=d.get('heTitle') or title;c=target_cat(b);rows=[];seq=0
  for p,s in flatten(text):
   seq+=1;rows.append((title,he,c,make_ref(title,p,sections),s,normalize(s),seq))
  if not rows:continue
  db.executemany('INSERT INTO segments(book,he_book,category,ref,text,normalized,seq) VALUES(?,?,?,?,?,?,?)',rows);db.execute('INSERT OR REPLACE INTO books(title,he_title,category,license,version_title,source_url,segments) VALUES(?,?,?,?,?,?,?)',(title,he,c,lic,b.get('versionTitle',''),b['json_url'],len(rows)));db.commit();manifest['included'].append({'title':title,'heTitle':he,'category':c,'license':lic,'versionTitle':b.get('versionTitle'),'segments':len(rows)});print(f'{n}/{len(groups)} INCLUDE {title} [{lic}] {len(rows)}');included=True;break
 if not included:manifest['excluded'].append({'title':title,'reason':'permitted metadata found but text download/parse failed'})
 time.sleep(.04)
db.execute("INSERT INTO segments_fts(segments_fts) VALUES('rebuild')");db.execute('CREATE INDEX idx_segments_book_seq ON segments(book,seq)');db.execute('CREATE INDEX idx_segments_category ON segments(category)');db.commit();counts=dict(db.execute('SELECT category,count(*) FROM books GROUP BY category').fetchall());segments=db.execute('SELECT count(*) FROM segments').fetchone()[0];db.close();manifest['categoryCounts']=counts;manifest['segments']=segments;h=hashlib.sha256();
with open(OUT,'rb') as f:
 for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
manifest['sha256']=h.hexdigest();json.dump(manifest,open(MAN,'w',encoding='utf8'),ensure_ascii=False,indent=2);print('DONE',len(manifest['included']),'books',segments,'segments',manifest['sha256'])
