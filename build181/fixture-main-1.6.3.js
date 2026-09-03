var _nodePath = _interopRequireDefault(require("node:path"));
var _nodeFs = _interopRequireDefault(require("node:fs"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function resourcePath(...parts) { return parts.join('/'); }
let masterPath, parsedMaster;
const _electron = { app:{ getPath(){return '';} }, ipcMain:{ handle(){} } };
const _core = { sha256(){return '';}, normalizeHebrew(v){return String(v||'');} };
const _master = { parseMaster(){return {}; } };
const store = { read(){return {knowledge:[]};}, search(){return [];}, removeKnowledge(){return true;}, setKnowledgeEnabled(){return true;} };
function ensureMaster() {
  const source = resourcePath('master', 'ספר שופטים גרסת מסטר.docx');
  const managedDirectory = _nodePath.default.join(_electron.app.getPath('userData'), 'masters');
  _nodeFs.default.mkdirSync(managedDirectory, {
    recursive: true
  });
  masterPath = _nodePath.default.join(managedDirectory, 'ספר שופטים גרסת מסטר.docx');
  if (!_nodeFs.default.existsSync(masterPath) || (0, _core.sha256)(_nodeFs.default.readFileSync(masterPath)) !== (0, _core.sha256)(_nodeFs.default.readFileSync(source))) {
    _nodeFs.default.copyFileSync(source, masterPath);
    try {
      _nodeFs.default.chmodSync(masterPath, 0o444);
    } catch {/* Windows read-only handling varies. */}
  }
  parsedMaster = (0, _master.parseMaster)(masterPath);
}
function keyFile() {
  return 'key';
}
function registerIpc() {
  _electron.ipcMain.handle('knowledge:list', () => store.read().knowledge);
  _electron.ipcMain.handle('knowledge:search', (_event, query, documentIds, mode) => store.search(String(query || '').slice(0, 500), Array.isArray(documentIds) ? documentIds.slice(0, 500) : [], ['exact', 'all_words', 'hybrid'].includes(mode) ? mode : 'hybrid'));
  _electron.ipcMain.handle('knowledge:remove', (_event, id) => ({
    ok: store.removeKnowledge(String(id || ''))
  }));
  _electron.ipcMain.handle('knowledge:set-enabled', (_event, id, enabled) => ({
    ok: store.setKnowledgeEnabled(String(id || ''), Boolean(enabled))
  }));
}
