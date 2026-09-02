const fs = require('fs');
const [,, mainPath, packagePath] = process.argv;
if (!mainPath || !packagePath) throw new Error('Usage: patch-main-1.7.5.js <main.js> <package.json>');
let s = fs.readFileSync(mainPath, 'utf8');
const addAfter = (needle, value) => {
  if (!s.includes(needle)) throw new Error('Original 1.6.3 marker missing: ' + needle.slice(0, 80));
  s = s.replace(needle, needle + value);
};
addAfter('var _nodePath = _interopRequireDefault(require("node:path"));\n', 'var _nodeChildProcess = require("node:child_process");\n');
const originalEnsureMaster = `function ensureMaster() {\n  const source = resourcePath('master', 'ספר שופטים גרסת מסטר.docx');\n  const managedDirectory = _nodePath.default.join(_electron.app.getPath('userData'), 'masters');\n  _nodeFs.default.mkdirSync(managedDirectory, {\n    recursive: true\n  });\n  masterPath = _nodePath.default.join(managedDirectory, 'ספר שופטים גרסת מסטר.docx');\n  if (!_nodeFs.default.existsSync(masterPath) || (0, _core.sha256)(_nodeFs.default.readFileSync(masterPath)) !== (0, _core.sha256)(_nodeFs.default.readFileSync(source))) {\n    _nodeFs.default.copyFileSync(source, masterPath);\n    try {\n      _nodeFs.default.chmodSync(masterPath, 0o444);\n    } catch {/* Windows read-only handling varies. */}\n  }\n  parsedMaster = (0, _master.parseMaster)(masterPath);\n}\n`;
const safeEnsureMaster = `function ensureMaster() {\n  const source = resourcePath('master', 'ספר שופטים גרסת מסטר.docx');\n  const managedDirectory = _nodePath.default.join(_electron.app.getPath('userData'), 'masters');\n  _nodeFs.default.mkdirSync(managedDirectory, {\n    recursive: true\n  });\n  masterPath = _nodePath.default.join(managedDirectory, 'ספר שופטים גרסת מסטר.docx');\n  const sourceExists = _nodeFs.default.existsSync(source);\n  const managedExists = _nodeFs.default.existsSync(masterPath);\n  try {\n    if (sourceExists && (!managedExists || (0, _core.sha256)(_nodeFs.default.readFileSync(masterPath)) !== (0, _core.sha256)(_nodeFs.default.readFileSync(source)))) {\n      _nodeFs.default.copyFileSync(source, masterPath);\n      try {\n        _nodeFs.default.chmodSync(masterPath, 0o444);\n      } catch {/* Windows read-only handling varies. */}\n    }\n  } catch (error) {\n    console.warn('Master synchronization skipped:', error && error.message ? error.message : error);\n  }\n  if (_nodeFs.default.existsSync(masterPath)) {\n    try {\n      parsedMaster = (0, _master.parseMaster)(masterPath);\n      return;\n    } catch (error) {\n      console.warn('Managed master could not be parsed:', error && error.message ? error.message : error);\n    }\n  }\n  console.warn('Bundled master DOCX is unavailable; starting safely with an empty default master until a master is loaded by the user.');\n  parsedMaster = {\n    hash: '',\n    filename: 'ספר שופטים גרסת מסטר.docx',\n    chapters: [],\n    analysis: {\n      ooxmlParts: 0, headers: 0, footers: 0, bookmarks: 0, hyperlinks: 0, tables: 0, paragraphs: 0, sanhedrinChapters: 0, sanhedrinHalakhot: 0,\n      annotationStyle: { styleId: null, fontFamily: 'David', fontSizePt: 12, alignment: 'both', lineHeight: 1.5 }\n    }\n  };\n}\n`;
if (!s.includes(originalEnsureMaster)) throw new Error('Original ensureMaster block not found');
s = s.replace(originalEnsureMaster, safeEnsureMaster);
const marker = 'function keyFile() {\n';
if (!s.includes(marker)) throw new Error('Original keyFile marker missing');
const helpers = String.raw`// LOCAL_CORPUS_175 — backend only; renderer is not modified.
function localCorpusDirectory() { return resourcePath('local-library'); }
function localCorpusDbPath() { return _nodePath.default.join(localCorpusDirectory(), 'torah-library.sqlite'); }
function localSqlitePath() { return _nodePath.default.join(localCorpusDirectory(), 'sqlite3.exe'); }
function sqlQuote(value) { return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'"; }
function runLocalSql(sql) {
  const exe = localSqlitePath(), db = localCorpusDbPath();
  if (!_nodeFs.default.existsSync(exe) || !_nodeFs.default.existsSync(db)) return [];
  try {
    const out = (0, _nodeChildProcess.execFileSync)(exe, ['-readonly', '-json', db, sql], { windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 5000 });
    const text = String(out || '').trim();
    return text ? JSON.parse(text) : [];
  } catch (error) {
    console.warn('Local corpus query failed:', (error && error.message) || error);
    return [];
  }
}
function corpusDocumentId(book) { return 'builtin:' + book; }
let corpusCatalogCache = null;
function localCorpusCatalog() {
  if (corpusCatalogCache) return corpusCatalogCache;
  const rows = runLocalSql("SELECT title,he_title,category,license,segments FROM books ORDER BY COALESCE(NULLIF(he_title,''),title) COLLATE NOCASE;");
  corpusCatalogCache = rows.map(row => ({
    id: corpusDocumentId(row.title), enabled: true, source: 'local-corpus', title: row.he_title || row.title,
    author: '', edition: '', license: row.license || '', category: row.category || 'ספר תורני',
    hash: (0, _core.sha256)(String(row.title || '')), textQuality: 'clean',
    blocks: new Array(Number(row.segments || 0)), segmentCount: Number(row.segments || 0),
    createdAt: '2026-09-03T00:00:00.000Z', _bookKey: row.title
  }));
  return corpusCatalogCache;
}
function localCorpusSearch(query, documentIds = [], mode = 'hybrid') {
  const normalized = (0, _core.normalizeHebrew)(String(query || '').slice(0, 500));
  if (!normalized) return [];
  const terms = normalized.split(/\s+/).filter(term => term.length > 1).slice(0, 14);
  if (!terms.length) return [];
  let attempts;
  if (mode === 'exact') attempts = ['"' + normalized.replace(/"/g, '') + '"'];
  else if (mode === 'all_words') attempts = [terms.map(term => '"' + term.replace(/"/g, '') + '"').join(' AND ')];
  else attempts = ['"' + normalized.replace(/"/g, '') + '"', terms.map(term => '"' + term.replace(/"/g, '') + '"').join(' AND '), terms.map(term => '"' + term.replace(/"/g, '') + '"').join(' OR ')];
  const selectedKeys = (Array.isArray(documentIds) ? documentIds : []).filter(id => String(id).startsWith('builtin:')).map(id => String(id).slice(8));
  const allKeys = localCorpusCatalog().map(doc => doc._bookKey);
  let bookClause = '';
  if (selectedKeys.length && selectedKeys.length !== allKeys.length) {
    if (selectedKeys.length <= 300) bookClause = ' AND s.book IN (' + selectedKeys.map(sqlQuote).join(',') + ')';
    else {
      const selectedSet = new Set(selectedKeys), missing = allKeys.filter(key => !selectedSet.has(key));
      if (missing.length && missing.length <= 300) bookClause = ' AND s.book NOT IN (' + missing.map(sqlQuote).join(',') + ')';
    }
  }
  for (const expression of attempts) {
    if (!expression) continue;
    const sql = 'SELECT s.id,s.book,s.he_book,s.category,s.ref,s.text,s.seq,bm25(segments_fts) AS rank FROM segments_fts JOIN segments s ON s.id=segments_fts.rowid WHERE segments_fts MATCH ' + sqlQuote(expression) + bookClause + ' ORDER BY rank LIMIT 80;';
    const rows = runLocalSql(sql);
    if (!rows.length) continue;
    return rows.map((row, index) => ({
      id: 'builtin-segment:' + row.id, documentId: corpusDocumentId(row.book), title: row.he_book || row.book, author: '',
      locator: row.ref || ('קטע ' + (Number(row.seq || 0) + 1)), exactText: row.text || '',
      normalized: (0, _core.normalizeHebrew)(row.text || ''), score: Math.max(72, 100 - index),
      category: row.category || 'ספר תורני', source: 'local-corpus'
    }));
  }
  return [];
}
function combinedKnowledgeList() { return [...localCorpusCatalog(), ...store.read().knowledge]; }
function combinedKnowledgeSearch(query, documentIds = [], mode = 'hybrid') {
  const ids = Array.isArray(documentIds) ? documentIds : [];
  const wantsBuiltIn = !ids.length || ids.some(id => String(id).startsWith('builtin:'));
  const privateIds = ids.filter(id => !String(id).startsWith('builtin:'));
  const builtIn = wantsBuiltIn ? localCorpusSearch(query, ids, mode) : [];
  const local = !ids.length || privateIds.length ? store.search(String(query || '').slice(0, 500), privateIds, mode) : [];
  const seen = new Set();
  return [...builtIn, ...local].filter(item => {
    const key = item.title + '|' + item.locator + '|' + item.exactText;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 80);
}
`;
s = s.replace(marker, helpers + marker);
const oldHandlers = `  _electron.ipcMain.handle('knowledge:list', () => store.read().knowledge);\n  _electron.ipcMain.handle('knowledge:search', (_event, query, documentIds, mode) => store.search(String(query || '').slice(0, 500), Array.isArray(documentIds) ? documentIds.slice(0, 500) : [], ['exact', 'all_words', 'hybrid'].includes(mode) ? mode : 'hybrid'));\n  _electron.ipcMain.handle('knowledge:remove', (_event, id) => ({\n    ok: store.removeKnowledge(String(id || ''))\n  }));\n  _electron.ipcMain.handle('knowledge:set-enabled', (_event, id, enabled) => ({\n    ok: store.setKnowledgeEnabled(String(id || ''), Boolean(enabled))\n  }));\n`;
const newHandlers = `  _electron.ipcMain.handle('knowledge:list', () => combinedKnowledgeList());\n  _electron.ipcMain.handle('knowledge:search', (_event, query, documentIds, mode) => combinedKnowledgeSearch(String(query || '').slice(0, 500), Array.isArray(documentIds) ? documentIds.slice(0, 5000) : [], ['exact', 'all_words', 'hybrid'].includes(mode) ? mode : 'hybrid'));\n  _electron.ipcMain.handle('knowledge:remove', (_event, id) => ({\n    ok: String(id || '').startsWith('builtin:') ? false : store.removeKnowledge(String(id || ''))\n  }));\n  _electron.ipcMain.handle('knowledge:set-enabled', (_event, id, enabled) => ({\n    ok: String(id || '').startsWith('builtin:') ? true : store.setKnowledgeEnabled(String(id || ''), Boolean(enabled))\n  }));\n`;
if (!s.includes(oldHandlers)) throw new Error('Original knowledge IPC block not found');
s = s.replace(oldHandlers, newHandlers);
fs.writeFileSync(mainPath, s, 'utf8');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = '1.7.5';
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2), 'utf8');
console.log('Patched original 1.6.3 backend only; renderer untouched.');
