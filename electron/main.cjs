const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');

let win, corpusDb, privateDb;
const isDev = !app.isPackaged;

const STOP = new Set('איפה היכן כתוב נאמר נמצא מופיע מצא לי את המקור מה מהו מהי האם כיצד איך למה לגבי בענין בעניין על של מן מתוך אצל יש ישנו ישנה לדעת לפי אומר אמר פוסק פסק הדין הלכה הלכות'.split(' '));

function norm(s = '') {
  return s.normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'")
    .replace(/[־–—]/g, '-')
    .replace(/[^\u05D0-\u05EAa-zA-Z0-9\s'"-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function clean(q = '') {
  return norm(q)
    .replace(/^(איפה|היכן)\s+(כתוב|נאמר|נמצא|מופיע)\s+/, '')
    .replace(/^מצא\s+(לי\s+)?(את\s+)?(המקור\s+)?/, '')
    .trim();
}
function chatClean(q = '') {
  const c = clean(q);
  const words = c.split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
  return words.join(' ') || c;
}

function corpusPath() { return isDev ? path.join(process.cwd(), 'resources', 'torah-library.sqlite') : path.join(process.resourcesPath, 'torah-library.sqlite'); }
function privatePath() { return path.join(app.getPath('userData'), 'private-library.sqlite'); }
function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function draftsPath() { return path.join(app.getPath('documents'), 'מכון הרמב״ם הבהיר', 'טיוטות'); }

function initPrivate() {
  const db = new Database(privatePath());
  db.pragma('journal_mode=WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS segments(id INTEGER PRIMARY KEY,book TEXT,he_book TEXT,category TEXT,ref TEXT,text TEXT,normalized TEXT,seq INTEGER);
  CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(normalized,content='segments',content_rowid='id',tokenize='unicode61');
  CREATE TABLE IF NOT EXISTS books(title TEXT PRIMARY KEY,he_title TEXT,category TEXT,license TEXT,segments INTEGER DEFAULT 0);`);
  return db;
}
function openDbs() {
  if (fs.existsSync(corpusPath())) corpusDb = new Database(corpusPath(), { readonly: true, fileMustExist: true });
  privateDb = initPrivate();
}

function qdb(db, q, category, limit, source) {
  if (!db) return [];
  const c = clean(q);
  if (!c) return [];
  const words = c.split(/\s+/).filter(Boolean).slice(0, 14);
  const where = category === 'all' ? '' : ' AND s.category=? ';
  const extra = category === 'all' ? [] : [category];
  const attempts = [
    `"${c.replace(/"/g, '')}"`,
    words.map(w => `"${w.replace(/"/g, '')}"`).join(' AND '),
    words.join(' OR ')
  ];
  for (const m of attempts) {
    if (!m) continue;
    try {
      const rows = db.prepare(`SELECT s.id,s.book,s.he_book,s.category,s.ref,s.text,s.seq,bm25(segments_fts) rank
        FROM segments_fts JOIN segments s ON s.id=segments_fts.rowid
        WHERE segments_fts MATCH ? ${where} ORDER BY rank LIMIT ?`).all(m, ...extra, limit);
      if (rows.length) return rows.map(r => ({ ...r, source }));
    } catch { }
  }
  return [];
}
function search(q, category = 'all', limit = 80) {
  const t = Date.now();
  const a = qdb(corpusDb, q, category, limit, 'built-in');
  const b = qdb(privateDb, q, category, Math.max(10, limit >> 2), 'private');
  const seen = new Set();
  const results = [...a, ...b].filter(r => {
    const k = r.book + '|' + r.ref + '|' + r.text;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, limit);
  return { query: clean(q), elapsedMs: Date.now() - t, results };
}
function context(db, id, radius, source) {
  if (!db) return null;
  const row = db.prepare('SELECT * FROM segments WHERE id=?').get(id);
  if (!row) return null;
  return { selected: row, rows: db.prepare('SELECT * FROM segments WHERE book=? AND seq BETWEEN ? AND ? ORDER BY seq').all(row.book, Math.max(0, row.seq - radius), row.seq + radius), source };
}

function localChatAnswer(hits) {
  if (!hits.length) return 'לא מצאתי במאגר המקומי מקור מתאים. נסה לנסח במילות המקור, לבחור קטגוריה, או להזין ציטוט קצר יותר.';
  const first = hits[0];
  const excerpt = first.text.length > 850 ? first.text.slice(0, 850) + '…' : first.text;
  let a = `מצאתי התאמה מרכזית ב${first.he_book || first.book}, ${first.ref}:\n\n${excerpt}`;
  if (hits.length > 1) a += '\n\nמקורות נוספים:\n' + hits.slice(1, 6).map((x, i) => `[${i + 2}] ${x.he_book || x.book} — ${x.ref}`).join('\n');
  return a;
}

function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { return { model: 'gpt-5.6-luna' }; } }
function writeSettings(x) { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(x, null, 2), 'utf8'); }
function decryptKey(s) { if (!s?.apiKeyEncrypted) return ''; try { return safeStorage.decryptString(Buffer.from(s.apiKeyEncrypted, 'base64')); } catch { return ''; } }
function publicAI() { const s = readSettings(); return { model: s.model || 'gpt-5.6-luna', hasKey: !!decryptKey(s) }; }
function saveAI(x) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows Safe Storage אינו זמין');
  const old = readSettings(), next = { ...old, model: x.model || old.model || 'gpt-5.6-luna' };
  if (x.apiKey?.trim()) next.apiKeyEncrypted = safeStorage.encryptString(x.apiKey.trim()).toString('base64');
  writeSettings(next); return publicAI();
}
async function testAI(x = {}) {
  const s = readSettings(), key = x.apiKey?.trim() || decryptKey(s);
  if (!key) return { ok: false, error: 'לא הוזן API Key' };
  try { const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } }); return r.ok ? { ok: true } : { ok: false, error: `OpenAI HTTP ${r.status}` }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}
function outputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  for (const item of data?.output || []) for (const c of item?.content || []) if (typeof c?.text === 'string' && c.text.trim()) return c.text.trim();
  return '';
}
async function aiGroundedAnswer(question, hits) {
  const s = readSettings(), key = decryptKey(s);
  if (!key) throw new Error('לא הוגדר API Key במחשב זה');
  const sources = hits.slice(0, 8).map((x, i) => `[${i + 1}] ${x.he_book || x.book} | ${x.ref}\n${x.text}`).join('\n\n');
  const input = `אתה מסייע במחקר תורני לספר הגהה על הרמב"ם. השב בעברית אך ורק על סמך המקורות המצורפים. אין להמציא מקור או מראה מקום. אחרי כל קביעה כתוב [מספר מקור]. אם אין בסיס מספיק — אמור זאת.\n\nשאלה: ${question}\n\nמקורות:\n${sources}`;
  const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: s.model || 'gpt-5.6-luna', input, max_output_tokens: 750 }) });
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}`);
  const text = outputText(await r.json());
  if (!text) throw new Error('לא התקבלה תשובה מן המודל');
  return text;
}
async function groundedChat(q, category = 'all', useAI = false) {
  const t = Date.now();
  const query = chatClean(q);
  let found = search(query, category, 18);
  if (!found.results.length && query !== clean(q)) found = search(clean(q), category, 18);
  const sources = found.results.slice(0, 8);
  let answer = localChatAnswer(sources), mode = 'local', aiError = null;
  if (useAI && sources.length) {
    try { answer = await aiGroundedAnswer(q, sources); mode = 'ai'; }
    catch (e) { aiError = String(e.message || e); }
  }
  return { question: q, answer, sources, mode, aiError, elapsedMs: Date.now() - t };
}

async function ocrImage(p) {
  const langPath = isDev ? path.join(process.cwd(), 'resources', 'ocr') : path.join(process.resourcesPath, 'ocr');
  const w = await createWorker('heb', 1, { langPath, gzip: false });
  try { return (await w.recognize(p)).data.text || ''; } finally { await w.terminate(); }
}
function insertPrivate(title, text) {
  const ps = text.split(/\n+/).map(x => x.trim()).filter(x => x.length > 2);
  privateDb.transaction(() => {
    const ins = privateDb.prepare('INSERT INTO segments(book,he_book,category,ref,text,normalized,seq) VALUES(?,?,?,?,?,?,?)');
    const fts = privateDb.prepare('INSERT INTO segments_fts(rowid,normalized) VALUES(?,?)');
    ps.forEach((p, i) => { const x = ins.run(title, title, 'private', `${title} — קטע ${i + 1}`, p, norm(p), i); fts.run(x.lastInsertRowid, norm(p)); });
    privateDb.prepare('INSERT OR REPLACE INTO books(title,he_title,category,license,segments) VALUES(?,?,?,?,?)').run(title, title, 'private', 'פרטי — באחריות המשתמש', ps.length);
  })(); return ps.length;
}
async function importSource() {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'ספרים ומסמכים', extensions: ['txt', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff'] }] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const p = r.filePaths[0], e = path.extname(p).toLowerCase(); let text = '';
  if (e === '.txt') text = fs.readFileSync(p, 'utf8'); else if (e === '.docx') text = (await mammoth.extractRawText({ path: p })).value; else if (e === '.pdf') text = (await pdfParse(fs.readFileSync(p))).text || ''; else text = await ocrImage(p);
  if (!text.trim()) return { ok: false, error: 'לא חולץ טקסט. PDF סרוק יטופל בגרסת OCR עמוד-עמוד.' };
  const title = path.basename(p, e), count = insertPrivate(title, text); return { ok: true, title, count };
}
async function pickMaster() {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'מאסטר', extensions: ['docx', 'pdf', 'txt'] }] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const p = r.filePaths[0], e = path.extname(p).toLowerCase();
  const text = e === '.docx' ? (await mammoth.extractRawText({ path: p })).value : e === '.pdf' ? (await pdfParse(fs.readFileSync(p))).text : fs.readFileSync(p, 'utf8');
  return { ok: true, path: p, name: path.basename(p), text };
}

function createWindow() {
  win = new BrowserWindow({ width: 1540, height: 940, minWidth: 1080, minHeight: 680, backgroundColor: '#F7F2E8', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  isDev ? win.loadURL('http://127.0.0.1:5173') : win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}
app.whenReady().then(() => { openDbs(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('library:stats', () => { const z = db => db ? db.prepare('SELECT (SELECT count(*) FROM books) books,(SELECT count(*) FROM segments) segments').get() : { books: 0, segments: 0 }; return { builtIn: z(corpusDb), private: z(privateDb), offline: true }; });
ipcMain.handle('library:search', (_, x) => search(x.q, x.category, x.limit));
ipcMain.handle('library:chat', (_, x) => groundedChat(x.q, x.category, !!x.useAI));
ipcMain.handle('library:context', (_, x) => context(x.source === 'private' ? privateDb : corpusDb, Number(x.id), x.radius, x.source));
ipcMain.handle('library:books', (_, x) => { const cat = x.category || 'all', run = (db, source) => db ? db.prepare(`SELECT title,he_title,category,license,segments FROM books ${cat === 'all' ? '' : 'WHERE category=?'} ORDER BY he_title,title`).all(...(cat === 'all' ? [] : [cat])).map(b => ({ ...b, source })) : []; return [...run(corpusDb, 'built-in'), ...run(privateDb, 'private')]; });
ipcMain.handle('library:import', () => importSource());
ipcMain.handle('master:pick', () => pickMaster());
ipcMain.handle('draft:save', (_, x) => { fs.mkdirSync(draftsPath(), { recursive: true }); fs.writeFileSync(path.join(draftsPath(), 'current-draft.txt'), x.text || '', 'utf8'); return { ok: true }; });
ipcMain.handle('draft:load', () => { const p = path.join(draftsPath(), 'current-draft.txt'); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; });
ipcMain.handle('ai:get-settings', () => publicAI());
ipcMain.handle('ai:save-settings', (_, x) => saveAI(x));
ipcMain.handle('ai:test', (_, x) => testAI(x));
ipcMain.handle('ai:delete-key', () => { const s = readSettings(); delete s.apiKeyEncrypted; writeSettings(s); return publicAI(); });
