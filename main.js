const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut,
  nativeImage, Notification, shell, clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

const ROOT = 'C:\\Projetos';
const IGNORE = new Set(['.vscode', 'node_modules', '.git', '$RECYCLE.BIN']);
const DATA_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'notch-bar');
const STATUS_DIR = path.join(DATA_DIR, 'status');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const STATUS_STALE_MS = 12 * 60 * 60 * 1000;
const GIT_CACHE_MS = 60 * 1000;

const COLLAPSED = { width: 250, height: 46 };
const TOAST = { width: 380, height: 46 };
const EXPANDED = { width: 500, height: 640 };

let win = null;
let tray = null;
let expanded = false;
let toastTimer = null;
let peeking = false;
let hiddenByFullscreen = false;
let icons = {};
let config = { favorites: [], recents: [], settings: {} };
let stats = {};
let lastScan = [];
let prevStates = null;
let vscodeOpen = [];
let prCounts = {};
const gitCache = new Map(); // path -> { dirty, ts }

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------- config / stats ----------
const DEFAULT_SETTINGS = { sounds: true, toastMs: 4000, displayId: null };

function loadConfig() {
  try {
    config = { favorites: [], recents: [], settings: {}, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {}
  config.settings = { ...DEFAULT_SETTINGS, ...(config.settings || {}) };
}

function saveConfig() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));
  } catch {}
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadStats() {
  try {
    stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    stats = {};
  }
}

function saveStats() {
  try {
    // mantém só os últimos 30 dias
    const keys = Object.keys(stats).sort().slice(-30);
    stats = Object.fromEntries(keys.map((k) => [k, stats[k]]));
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
  } catch {}
}

function fmtDur(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return null;
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60 ? (m % 60) + 'm' : ''}`;
}

function bumpStat(name) {
  const t = todayKey();
  stats[t] = stats[t] || {};
  stats[t][name] = (stats[t][name] || 0) + 1;
  saveStats();
  send('stats', stats[t]);
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// ---------- janela ----------
function targetDisplay() {
  const id = config.settings.displayId;
  return screen.getAllDisplays().find((d) => d.id === id) || screen.getPrimaryDisplay();
}

function centerBounds(size) {
  const wa = targetDisplay().workArea;
  return {
    x: Math.round(wa.x + (wa.width - size.width) / 2),
    y: wa.y,
    width: size.width,
    height: Math.min(size.height, wa.height - 16),
  };
}

function setExpanded(v) {
  if (!win) return;
  expanded = v;
  peeking = false;
  send('peek', false);
  clearTimeout(toastTimer);
  send('toast', null);
  win.setBounds(centerBounds(v ? EXPANDED : COLLAPSED));
  send('mode', v);
  if (v) {
    win.show();
    win.focus();
    refreshGit();
    refreshVSCode();
    refreshPRs();
  }
}

function toggle() {
  setExpanded(!expanded);
}

// ---------- projetos ----------
function scanProjects() {
  const cats = [];
  let entries = [];
  try {
    entries = fs.readdirSync(ROOT, { withFileTypes: true });
  } catch {
    return cats;
  }
  for (const cat of entries) {
    if (!cat.isDirectory() || IGNORE.has(cat.name)) continue;
    const catPath = path.join(ROOT, cat.name);
    let subs = [];
    try {
      subs = fs
        .readdirSync(catPath, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !IGNORE.has(d.name));
    } catch {}
    const projects = subs
      .map((d) => {
        const p = path.join(catPath, d.name);
        let mtime = 0;
        try {
          mtime = fs.statSync(p).mtimeMs;
        } catch {}
        return { name: d.name, path: p, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
    cats.push({ name: cat.name, path: catPath, projects });
  }
  lastScan = cats;
  return cats;
}

function projectNameFor(cwd) {
  const cl = (cwd || '').toLowerCase();
  for (const cat of lastScan) {
    for (const p of cat.projects) {
      const pl = p.path.toLowerCase();
      if (cl === pl || cl.startsWith(pl + '\\')) return p.name;
    }
  }
  return (cwd || '').split('\\').filter(Boolean).pop() || cwd;
}

function openInVSCode(target) {
  exec(`code "${target}"`);
  config.recents = [
    { path: target, ts: Date.now() },
    ...config.recents.filter((r) => r.path !== target),
  ].slice(0, 10);
  saveConfig();
  send('config', config);
  setExpanded(false);
}

// ---------- status do Claude ----------
function readStatuses() {
  const out = [];
  let files = [];
  try {
    files = fs.readdirSync(STATUS_DIR);
  } catch {
    return out;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const fp = path.join(STATUS_DIR, f);
    try {
      const s = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (Date.now() - (s.ts || 0) > STATUS_STALE_MS) {
        fs.unlinkSync(fp);
        continue;
      }
      out.push(s);
    } catch {}
  }
  return out;
}

function ackSession(id) {
  const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    fs.unlinkSync(path.join(STATUS_DIR, safe + '.json'));
  } catch {}
  pushStatuses(true);
}

function notifyStatus(s) {
  const name = projectNameFor(s.cwd);
  let n;
  if (s.state === 'done') {
    const dur = s.startTs ? fmtDur(Date.now() - s.startTs) : null;
    n = new Notification({
      title: `✓ ${name} — terminou${dur ? ` em ${dur}` : ''}`,
      body: s.summary || 'Clique para abrir no VS Code',
    });
    n.on('click', () => {
      ackSession(s.sessionId);
      openInVSCode(s.cwd);
    });
  } else {
    n = new Notification({
      title: `${name} — Claude precisa de você`,
      body: s.detail || 'Aguardando sua resposta',
    });
    n.on('click', () => openInVSCode(s.cwd));
  }
  n.show();
}

function showToast(s) {
  if (expanded || peeking || !win) return;
  clearTimeout(toastTimer);
  win.setBounds(centerBounds(TOAST));
  send('toast', {
    name: projectNameFor(s.cwd),
    cwd: s.cwd,
    sessionId: s.sessionId,
    dur: s.startTs ? fmtDur(Date.now() - s.startTs) : null,
  });
  toastTimer = setTimeout(() => {
    send('toast', null);
    if (!expanded) win.setBounds(centerBounds(COLLAPSED));
  }, config.settings.toastMs || 4000);
}

function updateTray(statuses) {
  if (!tray) return;
  const working = statuses.filter((s) => s.state === 'working').length;
  const waiting = statuses.filter((s) => s.state === 'waiting').length;
  const done = statuses.filter((s) => s.state === 'done').length;
  let key = 'default';
  if (waiting) key = 'wait';
  else if (done) key = 'done';
  else if (working) key = 'working';
  if (icons[key]) tray.setImage(icons[key]);
  const parts = [];
  if (working) parts.push(`${working} trabalhando`);
  if (waiting) parts.push(`${waiting} esperando você`);
  if (done) parts.push(`${done} pronto(s)`);
  tray.setToolTip(parts.length ? `Dynamic Island — ${parts.join(' · ')}` : 'Dynamic Island Projects (Ctrl+Alt+P)');
}

function handleStatusChanges(statuses) {
  if (prevStates) {
    for (const s of statuses) {
      const prev = prevStates.get(s.sessionId);
      if (prev && prev !== s.state) {
        if (s.state === 'done') {
          notifyStatus(s);
          showToast(s);
          bumpStat(projectNameFor(s.cwd));
          if (config.settings.sounds !== false) send('chime', 'done');
        } else if (s.state === 'waiting') {
          notifyStatus(s);
          if (config.settings.sounds !== false) send('chime', 'waiting');
        }
      }
    }
  }
  prevStates = new Map(statuses.map((s) => [s.sessionId, s.state]));
  updateTray(statuses);
}

let lastStatusJson = '';
function pushStatuses(force) {
  if (!win) return;
  const statuses = readStatuses();
  const j = JSON.stringify(statuses);
  if (force || j !== lastStatusJson) {
    lastStatusJson = j;
    send('claude-status', statuses);
    handleStatusChanges(statuses);
  }
}

function watchStatuses() {
  try {
    fs.mkdirSync(STATUS_DIR, { recursive: true });
  } catch {}
  let t = null;
  try {
    fs.watch(STATUS_DIR, () => {
      clearTimeout(t);
      t = setTimeout(() => pushStatuses(false), 200);
    });
  } catch {}
  setInterval(() => pushStatuses(false), 3000); // fallback
}

// ---------- git ----------
function gitBranch(p) {
  try {
    const head = fs.readFileSync(path.join(p, '.git', 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref:')) return head.split('/').pop();
    return head.slice(0, 7);
  } catch {
    return null;
  }
}

function gitRemoteUrl(p) {
  try {
    const conf = fs.readFileSync(path.join(p, '.git', 'config'), 'utf8');
    const m = conf.match(/\[remote "origin"\][^[]*?url\s*=\s*(.+)/);
    if (!m) return null;
    let url = m[1].trim();
    const ssh = url.match(/^git@([^:]+):(.+)$/);
    if (ssh) url = `https://${ssh[1]}/${ssh[2]}`;
    return url.replace(/\.git$/, '');
  } catch {
    return null;
  }
}

let gitRefreshing = false;
async function refreshGit() {
  if (gitRefreshing) return;
  gitRefreshing = true;
  try {
    if (!lastScan.length) scanProjects();
    const projects = lastScan.flatMap((c) => c.projects);
    const targets = projects.filter((p) => {
      try {
        return fs.existsSync(path.join(p.path, '.git'));
      } catch {
        return false;
      }
    });

    // branch é leitura de arquivo, manda na hora (com dirty do cache)
    const quick = {};
    for (const p of targets) {
      const cached = gitCache.get(p.path);
      quick[p.path] = { branch: gitBranch(p.path), dirty: cached ? cached.dirty : false };
    }
    send('git-status', quick);

    const now = Date.now();
    const queue = targets.filter((p) => {
      const c = gitCache.get(p.path);
      return !c || now - c.ts > GIT_CACHE_MS;
    });
    let i = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (i < queue.length) {
          const p = queue[i++];
          const dirty = await new Promise((res) =>
            exec(
              `git -C "${p.path}" status --porcelain --no-renames`,
              { timeout: 5000, maxBuffer: 512 * 1024 },
              (err, out) => res(err ? false : out.trim().length > 0)
            )
          );
          gitCache.set(p.path, { dirty, ts: Date.now() });
          send('git-status', { [p.path]: { branch: gitBranch(p.path), dirty } });
        }
      })
    );
  } finally {
    gitRefreshing = false;
  }
}

// ---------- PRs abertas (gh CLI, silencioso se não existir) ----------
function refreshPRs() {
  exec(
    'gh search prs --author "@me" --state open --json repository --limit 100',
    { timeout: 20000, maxBuffer: 1024 * 1024 },
    (err, out) => {
      if (err) return;
      try {
        const arr = JSON.parse(out);
        const counts = {};
        for (const pr of arr) {
          const n = ((pr.repository && pr.repository.name) || '').toLowerCase();
          if (n) counts[n] = (counts[n] || 0) + 1;
        }
        prCounts = counts;
        send('pr-status', counts);
      } catch {}
    }
  );
}

// ---------- janelas do VS Code abertas ----------
function refreshVSCode() {
  exec(
    'tasklist /fi "imagename eq Code.exe" /v /fo csv',
    { timeout: 8000, maxBuffer: 1024 * 1024 },
    (err, out) => {
      if (err) return;
      const names = new Set();
      for (const line of out.split('\n')) {
        const cols = line.match(/"([^"]*)"/g);
        if (!cols || cols.length < 2) continue;
        const title = cols[cols.length - 1].replace(/^"|"$/g, '');
        if (!title || title === 'N/A' || !title.includes('Visual Studio Code')) continue;
        const parts = title.split(' - ');
        if (parts.length >= 2) names.add(parts[parts.length - 2].trim().toLowerCase());
      }
      const arr = [...names].sort();
      if (JSON.stringify(arr) !== JSON.stringify(vscodeOpen)) {
        vscodeOpen = arr;
        send('vscode-open', arr);
      }
    }
  );
}

// ---------- criar / clonar ----------
function createProject(category, name) {
  const safe = String(name).replace(/[<>:"/\\|?*]/g, '').trim();
  if (!safe) return false;
  const dir = path.join(ROOT, category, safe);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return false;
  }
  exec(`git -C "${dir}" init`);
  openInVSCode(dir);
  return true;
}

function cloneRepo(url, category) {
  const catPath = path.join(ROOT, category);
  const name = url.replace(/\.git$/, '').split('/').pop().split(':').pop() || 'repo';
  const target = path.join(catPath, name);
  new Notification({ title: 'Clonando…', body: `${name} → ${category}` }).show();
  return new Promise((res) => {
    exec(`git clone "${url}"`, { cwd: catPath, timeout: 300000 }, (err) => {
      if (err) {
        new Notification({ title: '✗ Falha ao clonar', body: url }).show();
        res(false);
        return;
      }
      new Notification({ title: '✓ Repositório clonado', body: name }).show();
      scanProjects();
      openInVSCode(target);
      res(true);
    });
  });
}

// ---------- atalhos de favoritos ----------
function registerFavShortcuts() {
  for (let i = 1; i <= 9; i++) {
    try {
      globalShortcut.unregister(`Control+Alt+${i}`);
    } catch {}
  }
  (config.favorites || []).slice(0, 9).forEach((p, i) => {
    try {
      globalShortcut.register(`Control+Alt+${i + 1}`, () => openInVSCode(p));
    } catch {}
  });
}

// ---------- menu de contexto ----------
function openTerminal(p) {
  exec(`wt -d "${p}"`, (err) => {
    if (err) exec(`start "" /D "${p}" cmd`);
  });
}

function showItemMenu(p) {
  const isFav = config.favorites.includes(p);
  const template = [
    {
      label: isFav ? '★  Remover dos favoritos' : '☆  Adicionar aos favoritos',
      click: () => {
        config.favorites = isFav
          ? config.favorites.filter((f) => f !== p)
          : [...config.favorites, p];
        saveConfig();
        registerFavShortcuts();
        send('config', config);
      },
    },
    { type: 'separator' },
    { label: 'Abrir no VS Code', click: () => openInVSCode(p) },
    { label: 'Abrir no Explorer', click: () => shell.openPath(p) },
    { label: 'Abrir terminal aqui', click: () => openTerminal(p) },
    { label: 'Copiar caminho', click: () => clipboard.writeText(p) },
  ];
  const remote = gitRemoteUrl(p);
  if (remote) {
    template.push({ label: 'Abrir repositório no navegador', click: () => shell.openExternal(remote) });
  }
  Menu.buildFromTemplate(template).popup({ window: win });
}

// ---------- fullscreen watcher ----------
function watchFullscreen() {
  let ps;
  try {
    ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'scripts', 'fullscreen-watch.ps1')],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch {
    return;
  }
  ps.stdout.on('data', (d) => {
    const lines = d.toString().trim().split('\n');
    const v = lines[lines.length - 1].trim() === '1';
    if (v && !hiddenByFullscreen && !expanded) {
      hiddenByFullscreen = true;
      win.hide();
    } else if (!v && hiddenByFullscreen) {
      hiddenByFullscreen = false;
      win.showInactive();
    }
  });
  ps.on('error', () => {});
  app.on('will-quit', () => {
    try {
      ps.kill();
    } catch {}
  });
}

// ---------- criação ----------
function createWindow() {
  win = new BrowserWindow({
    ...centerBounds(COLLAPSED),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile('index.html');

  win.on('blur', () => {
    if (expanded) setExpanded(false);
  });

  screen.on('display-metrics-changed', () => {
    win.setBounds(centerBounds(expanded ? EXPANDED : COLLAPSED));
  });
}

function createTray() {
  const load = (n) => nativeImage.createFromPath(path.join(__dirname, 'assets', n));
  icons = {
    default: load('icon.png'),
    working: load('icon-working.png'),
    done: load('icon-done.png'),
    wait: load('icon-wait.png'),
  };
  tray = new Tray(icons.default);
  tray.setToolTip('Dynamic Island Projects (Ctrl+Alt+P)');

  const menu = Menu.buildFromTemplate([
    { label: 'Abrir painel  (Ctrl+Alt+P)', click: () => setExpanded(true) },
    { label: 'Recarregar projetos', click: () => send('refresh') },
    { type: 'separator' },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings({ path: process.execPath, args: [app.getAppPath()] }).openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          path: process.execPath,
          args: [app.getAppPath()],
        });
      },
    },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggle);
}

app.whenReady().then(() => {
  app.setAppUserModelId(process.execPath);
  loadConfig();
  loadStats();
  scanProjects();

  ipcMain.handle('get-projects', () => {
    refreshGit();
    return scanProjects();
  });
  ipcMain.handle('get-claude-status', () => readStatuses());
  ipcMain.handle('get-config', () => config);
  ipcMain.handle('get-stats', () => stats[todayKey()] || {});
  ipcMain.handle('get-vscode-open', () => vscodeOpen);
  ipcMain.handle('get-pr-status', () => prCounts);
  ipcMain.handle('get-displays', () => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `Monitor ${i + 1} (${d.size.width}×${d.size.height})${d.id === primary ? ' — principal' : ''}`,
    }));
  });
  ipcMain.handle('set-setting', (_e, kv) => {
    config.settings = { ...config.settings, ...kv };
    saveConfig();
    if ('displayId' in kv) win.setBounds(centerBounds(expanded ? EXPANDED : COLLAPSED));
    return config;
  });
  ipcMain.handle('toggle-favorite', (_e, p) => {
    config.favorites = config.favorites.includes(p)
      ? config.favorites.filter((f) => f !== p)
      : [...config.favorites, p];
    saveConfig();
    registerFavShortcuts();
    return config;
  });
  ipcMain.handle('create-project', (_e, { category, name }) => createProject(category, name));
  ipcMain.handle('clone-repo', (_e, { url, category }) => cloneRepo(url, category));
  ipcMain.on('set-peek', (_e, opts) => {
    if (expanded || !win) return;
    const on = !!(opts && opts.on);
    if (on === peeking) return;
    peeking = on;
    if (on) {
      const h = Math.min((opts && opts.height) || 200, 340);
      win.setBounds(centerBounds({ width: 430, height: h }));
      send('peek', true);
    } else {
      send('peek', false);
      win.setBounds(centerBounds(COLLAPSED));
    }
  });
  ipcMain.on('open-project', (_e, p) => openInVSCode(p));
  ipcMain.on('set-mode', (_e, v) => setExpanded(!!v));
  ipcMain.on('ack-session', (_e, id) => ackSession(id));
  ipcMain.on('item-menu', (_e, p) => showItemMenu(p));

  createWindow();
  createTray();
  watchStatuses();
  watchFullscreen();
  refreshVSCode();
  refreshPRs();
  setInterval(refreshVSCode, 10000);
  setInterval(refreshPRs, 5 * 60 * 1000);
  globalShortcut.register('Control+Alt+P', toggle);
  registerFavShortcuts();

  app.on('second-instance', () => setExpanded(true));
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());
