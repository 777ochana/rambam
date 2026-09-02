const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');
const Module = require('node:module');

const resources = process.resourcesPath;
const originalAsar = path.join(resources, 'app-1.6.3-original.asar');
const dbPath = path.join(resources, 'local-library', 'torah-library.sqlite');
const sqliteExe = path.join(resources, 'local-library', 'sqlite3.exe');
const masterName = 'ספר שופטים גרסת מסטר.docx';
const resourceMaster = path.join(resources, 'master', masterName);
let fallbackMaster = false;
let cachedBooks = null;

function log(message) {
  try {
    const file = path.join(app.getPath('userData'), 'local-library-1.7.4.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {}
}

function sqlQuote(value) { return String(value).replace(/'/g, "''"); }
function normalizeHebrew(value = '') {
  return String(value).normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'")
    .replace(/[־–—]/g, '-')
    .replace(/[^\u05D0-\u05EAa-zA-Z0-9\s'"-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function categoryHe(category) {
  return ({tanakh:'תנ״ך',mishnah:'משנה',tosefta:'תוספתא',bavli:'תלמוד בבלי',yerushalmi:'תלמוד ירושלמי',rambam:'רמב״ם',rishonim:'ראשונים',tur:'טור',shulchan_arukh:'שולחן ערוך',midrash:'מדרש',responsa:'שו״ת',halakhah:'הלכה',thought:'מחשבה'})[category] || category || 'ספר תורני';
}
function runSqlSync(sql) {
  if (!fs.existsSync(sqliteExe) || !fs.existsSync(dbPath)) return [];
  try {
    const out = execFileSync(sqliteExe, ['-json', '-readonly', dbPath, sql], { windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return out.trim() ? JSON.parse(out) : [];
  } catch (error) { log(`SQL sync failed: ${error.message}`); return []; }
}
function runSql(sql) {
  return new Promise((resolve, reject) => {
    execFile(sqliteExe, ['-json', '-readonly', dbPath, sql], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(String(stderr || error.message || error)));
      try { resolve(stdout.trim() ? JSON.parse(stdout) : []); } catch (parseError) { reject(parseError); }
    });
  });
}

function localStateFile() { return path.join(app.getPath('userData'), 'local-library-state.json'); }
function readLocalState() { try { return JSON.parse(fs.readFileSync(localStateFile(), 'utf8')); } catch { return { disabled: [] }; } }
function writeLocalState(state) {
  fs.mkdirSync(path.dirname(localStateFile()), { recursive: true });
  fs.writeFileSync(localStateFile(), JSON.stringify(state, null, 2), 'utf8');
}

function builtInDocuments() {
  if (cachedBooks) return cachedBooks;
  const disabled = new Set(readLocalState().disabled || []);
  const rows = runSqlSync('SELECT title,he_title,category,license,segments FROM books ORDER BY COALESCE(he_title,title);');
  cachedBooks = rows.map(row => {
    const key = String(row.title || row.he_title || '');
    return {
      id: `builtin:${key}`,
      enabled: !disabled.has(key),
      source: 'local-built-in',
      title: row.he_title || row.title,
      author: '',
      edition: `מאגר LOCAL · ${Number(row.segments || 0).toLocaleString('he-IL')} קטעים`,
      license: row.license || '',
      category: categoryHe(row.category),
      hash: crypto.createHash('sha256').update(key).digest('hex'),
      blocks: [],
      createdAt: '2026-09-02T00:00:00.000Z',
      _dbTitle: key,
      _segmentCount: Number(row.segments || 0)
    };
  });
  log(`Loaded ${cachedBooks.length} local books metadata`);
  return cachedBooks;
}

function selectedBuiltIn(documentIds) {
  const ids = Array.isArray(documentIds) ? documentIds : [];
  if (!ids.length) return null;
  return ids.filter(id => String(id).startsWith('builtin:')).map(id => String(id).slice(8));
}

async function searchBuiltIn(query, documentIds = [], mode = 'hybrid') {
  const q = normalizeHebrew(query).slice(0, 500);
  if (!q || !fs.existsSync(dbPath)) return [];
  const selected = selectedBuiltIn(documentIds);
  if (Array.isArray(selected) && selected.length === 0 && documentIds.length) return [];
  const disabled = new Set(readLocalState().disabled || []);
  const words = q.split(/\s+/).filter(word => word.length > 1).slice(0, 14);
  const attempts = mode === 'exact' ? [{expr:`"${q.replace(/"/g,'')}"`,score:100}] : mode === 'all_words' ? [{expr:words.map(w=>`"${w.replace(/"/g,'')}"`).join(' AND '),score:88}] : [
    {expr:`"${q.replace(/"/g,'')}"`,score:100},
    {expr:words.map(w=>`"${w.replace(/"/g,'')}"`).join(' AND '),score:88},
    {expr:words.map(w=>`"${w.replace(/"/g,'')}"`).join(' OR '),score:72}
  ];
  let bookFilter = '';
  if (Array.isArray(selected)) {
    const allowed = selected.filter(book => !disabled.has(book));
    if (!allowed.length) return [];
    bookFilter = ` AND s.book IN (${allowed.map(book => `'${sqlQuote(book)}'`).join(',')})`;
  } else if (disabled.size) {
    bookFilter = ` AND s.book NOT IN (${[...disabled].map(book => `'${sqlQuote(book)}'`).join(',')})`;
  }
  for (const attempt of attempts) {
    if (!attempt.expr) continue;
    const sql = `SELECT s.id,s.book,s.he_book,s.category,s.ref,s.text,s.normalized,bm25(segments_fts) AS rank FROM segments_fts JOIN segments s ON s.id=segments_fts.rowid WHERE segments_fts MATCH '${sqlQuote(attempt.expr)}'${bookFilter} ORDER BY rank LIMIT 80;`;
    try {
      const rows = await runSql(sql);
      if (rows.length) return rows.map(row => ({
        id: `builtin-segment:${row.id}`,
        documentId: `builtin:${row.book}`,
        title: row.he_book || row.book,
        author: '',
        locator: row.ref || 'קטע במאגר המקומי',
        exactText: row.text || '',
        normalized: row.normalized || normalizeHebrew(row.text || ''),
        score: attempt.score,
        category: categoryHe(row.category),
        source: 'local-built-in'
      }));
    } catch (error) { log(`FTS failed: ${error.message}`); }
  }
  return [];
}

function repairMasterSource() {
  try {
    if (fs.existsSync(resourceMaster)) return;
    const managed = path.join(app.getPath('userData'), 'masters', masterName);
    fs.mkdirSync(path.dirname(resourceMaster), { recursive: true });
    if (fs.existsSync(managed)) {
      fs.copyFileSync(managed, resourceMaster);
      log('Recovered bundled master source from the existing managed 1.6.3 master.');
      return;
    }
    fallbackMaster = true;
    log('No managed master exists. 1.6.3 will start without a default Sanhedrin master; the original upload-master screen remains available.');
  } catch (error) { fallbackMaster = true; log(`Master recovery failed: ${error.message}`); }
}

if (!fs.existsSync(originalAsar)) throw new Error('Original 1.6.3 app.asar backup is missing. Reinstall 1.6.3 before applying 1.7.4.');
repairMasterSource();

const originalStorageModule = require(path.join(originalAsar, 'dist-electron', 'storage.js'));
const originalMasterModule = require(path.join(originalAsar, 'dist-electron', 'master.js'));
const OriginalJsonStore = originalStorageModule.JsonStore;

class LocalLibraryStore extends OriginalJsonStore {
  read() {
    const state = super.read();
    const privateKnowledge = (state.knowledge || []).filter(doc => !String(doc.id || '').startsWith('builtin:'));
    return { ...state, knowledge: [...builtInDocuments(), ...privateKnowledge] };
  }
  write(state) {
    const clean = { ...state, knowledge: (state.knowledge || []).filter(doc => !String(doc.id || '').startsWith('builtin:')) };
    return super.write(clean);
  }
  async search(query, documentIds = [], mode = 'hybrid') {
    const ids = Array.isArray(documentIds) ? documentIds : [];
    const privateIds = ids.filter(id => !String(id).startsWith('builtin:'));
    const searchPrivate = !ids.length || privateIds.length;
    const local = await searchBuiltIn(query, ids, mode);
    const privateResults = searchPrivate ? super.search(query, privateIds, mode) : [];
    const seen = new Set();
    return [...local, ...privateResults].filter(item => {
      const key = `${item.title}|${item.locator}|${item.exactText}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a,b) => (b.score || 0) - (a.score || 0)).slice(0, 80);
  }
  removeKnowledge(id) {
    if (!String(id).startsWith('builtin:')) return super.removeKnowledge(id);
    const key = String(id).slice(8); const state = readLocalState();
    state.disabled = Array.from(new Set([...(state.disabled || []), key])); writeLocalState(state); cachedBooks = null; return true;
  }
  setKnowledgeEnabled(id, enabled) {
    if (!String(id).startsWith('builtin:')) return super.setKnowledgeEnabled(id, enabled);
    const key = String(id).slice(8); const state = readLocalState(); const disabled = new Set(state.disabled || []);
    if (enabled) disabled.delete(key); else disabled.add(key);
    state.disabled = [...disabled]; writeLocalState(state); cachedBooks = null; return true;
  }
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const fromOriginal = parent && String(parent.filename || '').includes('app-1.6.3-original.asar');
  if (fromOriginal && request === './storage') return { ...originalStorageModule, JsonStore: LocalLibraryStore };
  if (fromOriginal && request === './master' && fallbackMaster) {
    return { ...originalMasterModule, parseMaster: function(masterPath) {
      try { if (!fs.existsSync(masterPath) || fs.statSync(masterPath).size < 1000) return null; } catch { return null; }
      return originalMasterModule.parseMaster(masterPath);
    }};
  }
  return originalLoad.call(this, request, parent, isMain);
};

if (fallbackMaster) {
  const originalCopy = fs.copyFileSync;
  fs.copyFileSync = function(source, destination, ...rest) {
    if (path.resolve(String(source)) === path.resolve(resourceMaster) && !fs.existsSync(resourceMaster)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, Buffer.alloc(0));
      return;
    }
    return originalCopy.call(fs, source, destination, ...rest);
  };
}

log('Starting original 1.6.3 main process with UI untouched and local-library storage bridge enabled.');
require(path.join(originalAsar, 'dist-electron', 'main.js'));
