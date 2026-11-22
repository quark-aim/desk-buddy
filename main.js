const { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { spawn } = require('child_process');

if (!app.requestSingleInstanceLock()) { app.quit(); }

const W = 320, H = 248, MARGIN = 8;
let win, tray, fgProc, mediaProc;
const stateFile = () => path.join(app.getPath('userData'), 'state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; }
}
function saveState(s) {
  try { fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch {}
}

/* ---------- tiny PNG generator for tray icon (no asset files needed) ---------- */
function makeIcon() {
  const size = 32, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const d = Math.hypot(x - 15.5, y - 15.5);
      const eye = (Math.abs(x - 11) < 2.2 || Math.abs(x - 21) < 2.2) && Math.abs(y - 13) < 3.2;
      if (d < 14) { const c = eye ? [20, 24, 40] : [125, 249, 255]; raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = 255; }
    }
  }
  const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = table[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return nativeImage.createFromBuffer(png);
}

/* ---------- window movement ---------- */
let anim;
function slideTo(x, y) {
  if (!win) return;
  clearInterval(anim);
  const [sx, sy] = win.getPosition();
  const t0 = Date.now(), dur = 380;
  anim = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    win.setBounds({ x: Math.round(sx + (x - sx) * e), y: Math.round(sy + (y - sy) * e), width: W, height: H });
    if (p >= 1) { clearInterval(anim); persistPos(); }
  }, 8);
}
function persistPos() {
  const s = loadState() || {}; const [x, y] = win.getPosition(); s.pos = { x, y }; saveState(s);
}
function move(dir) {
  const b = win.getBounds(), wa = screen.getDisplayMatching(b).workArea;
  let x = b.x, y = b.y;
  switch (dir) {
    case 'left': x = wa.x + MARGIN; break;
    case 'right': x = wa.x + wa.width - W - MARGIN; break;
    case 'center': x = wa.x + Math.round((wa.width - W) / 2); break;
    case 'top': y = wa.y + MARGIN; break;
    case 'bottom': y = wa.y + wa.height - H - MARGIN; break;
    case 'nudge-left': x = Math.max(wa.x, b.x - 300); break;
    case 'nudge-right': x = Math.min(wa.x + wa.width - W, b.x + 300); break;
  }
  slideTo(x, y);
}

/* ---------- background helpers (PowerShell, no native modules) ---------- */
const ps = (script) => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });

function startForegroundWatcher() {
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class FG { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }
"@
$last = ""; $lastS = ""
while ($true) {
  $h = [FG]::GetForegroundWindow(); $sb = New-Object System.Text.StringBuilder 256
  [void][FG]::GetWindowText($h, $sb, 256); $p = 0; [void][FG]::GetWindowThreadProcessId($h, [ref]$p)
  $n = ""; try { $n = (Get-Process -Id $p).ProcessName } catch {}
  $cur = "FG|$n|" + $sb.ToString()
  if ($cur -ne $last) { Write-Output $cur; $last = $cur }
  $s = ""; try { $s = (Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1).MainWindowTitle } catch {}
  $curS = "SP|" + $s
  if ($curS -ne $lastS) { Write-Output $curS; $lastS = $curS }
  Start-Sleep -Milliseconds 1500
}`;
  fgProc = ps(script);
  let buf = '';
  fgProc.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!win || win.isDestroyed()) continue;
      if (line.startsWith('FG|')) { const [, proc, ...t] = line.split('|'); win.webContents.send('foreground', { proc, title: t.join('|') }); }
      else if (line.startsWith('SP|')) win.webContents.send('spotify', line.slice(3));
    }
  });
}

function startMediaKeys() {
  const script = `
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, int f, int e); }'
while (($l = [Console]::In.ReadLine()) -ne $null) {
  $k = [byte][int]$l.Trim()
  [K]::keybd_event($k, 0, 0, 0); [K]::keybd_event($k, 0, 2, 0)
}`;
  mediaProc = ps(script);
}
/* ---------- voice (Windows built-in System.Speech, offline) ---------- */
let voiceProc, listening = false, voiceTimer;
function ensureVoice() {
  if (voiceProc) return;
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Speech
  $e = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $e.SetInputToDefaultAudioDevice()
  $e.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $e.InitialSilenceTimeout = [TimeSpan]::FromSeconds(5)
  $e.EndSilenceTimeout = [TimeSpan]::FromSeconds(0.8)
  $e.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(1.0)
  Write-Output "READY"
} catch { Write-Output ("ERR|" + $_.Exception.Message); exit }
while (($l = [Console]::In.ReadLine()) -ne $null) {
  try {
    $r = $e.Recognize([TimeSpan]::FromSeconds(9))
    if ($r -and $r.Text) { Write-Output ("HEARD|" + $r.Text) } else { Write-Output "NONE" }
  } catch { Write-Output ("ERR|" + $_.Exception.Message) }
}`;
  voiceProc = ps(script);
  let buf = '';
  voiceProc.stdout.on('data', (d) => {
    buf += d.toString('utf8'); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      const [type, ...rest] = line.split('|');
      if (type !== 'READY') { listening = false; clearTimeout(voiceTimer); }
      if (win && !win.isDestroyed()) win.webContents.send('voice-result', { type, text: rest.join('|') });
    }
  });
  voiceProc.on('exit', () => { voiceProc = null; if (listening) { listening = false; win && win.webContents.send('voice-result', { type: 'ERR', text: 'speech engine stopped' }); } });
}
function voiceListen() {
  if (listening) return;
  ensureVoice(); listening = true;
  win.webContents.send('voice-result', { type: 'LISTENING', text: '' });
  voiceProc.stdin.write('listen\n');
  clearTimeout(voiceTimer);
  voiceTimer = setTimeout(() => { if (listening) { listening = false; win.webContents.send('voice-result', { type: 'NONE', text: '' }); } }, 25000);
}

const KEYS = { playpause: 0xB3, next: 0xB0, prev: 0xB1, volup: 0xAF, voldown: 0xAE, mute: 0xAD };

/* ---------- app ---------- */
function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const saved = (loadState() || {}).pos;
  const pos = saved || { x: wa.x + wa.width - W - MARGIN, y: wa.y + wa.height - H - MARGIN };
  win = new BrowserWindow({
    width: W, height: H, x: pos.x, y: pos.y,
    frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.setMinimumSize(W, H); win.setMaximumSize(W, H); win.setResizable(false);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.showInactive());
  win.on('moved', persistPos);
}

function toggleVisible() { win.isVisible() ? win.hide() : win.showInactive(); }

function setupTray() {
  tray = new Tray(makeIcon());
  tray.setToolTip('Desk Buddy');
  const build = () => Menu.buildFromTemplate([
    { label: 'Show / Hide', click: toggleVisible },
    { label: 'Slide left', click: () => move('left') },
    { label: 'Slide right', click: () => move('right') },
    { label: 'Center', click: () => move('center') },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => { const s = loadState() || {}; s.autoStart = i.checked; saveState(s); setAutoStart(i.checked); } },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.on('click', toggleVisible);
  tray.on('right-click', () => tray.popUpContextMenu(build()));
}

function setAutoStart(on) {
  app.setLoginItemSettings(app.isPackaged
    ? { openAtLogin: on }
    : { openAtLogin: on, path: process.execPath, args: [app.getAppPath()] });
}

app.whenReady().then(() => {
  createWindow();
  setupTray();
  startForegroundWatcher();
  startMediaKeys();

  // keep the Windows startup entry pointing at this folder (re-synced every launch unless turned off from the tray)
  if ((loadState() || {}).autoStart !== false) setAutoStart(true);

  globalShortcut.register('Control+Alt+Left', () => move('left'));
  globalShortcut.register('Control+Alt+Right', () => move('right'));
  globalShortcut.register('Control+Alt+Up', () => move('top'));
  globalShortcut.register('Control+Alt+Down', () => move('bottom'));
  globalShortcut.register('Control+Alt+H', toggleVisible);
  globalShortcut.register('Control+Alt+V', voiceListen);
  globalShortcut.register('Control+Alt+Space', () => { win.show(); win.focus(); win.webContents.send('open-command'); });

  ipcMain.handle('state:get', () => (loadState() || {}).data || null);
  ipcMain.on('state:set', (_, data) => { const s = loadState() || {}; s.data = data; saveState(s); });
  ipcMain.on('move', (_, dir) => move(dir));
  ipcMain.on('media', (_, k) => { if (KEYS[k] && mediaProc) mediaProc.stdin.write(KEYS[k] + '\n'); });
  ipcMain.on('open-spotify', () => shell.openExternal('spotify:'));
  let drag = null;
  ipcMain.on('drag-start', () => { drag = { m: screen.getCursorScreenPoint(), p: win.getPosition() }; clearInterval(anim); });
  ipcMain.on('drag-move', () => { if (!drag) return; const c = screen.getCursorScreenPoint(); win.setBounds({ x: drag.p[0] + c.x - drag.m.x, y: drag.p[1] + c.y - drag.m.y, width: W, height: H }); });
  ipcMain.on('drag-end', () => { drag = null; persistPos(); });
  ipcMain.on('voice-listen', voiceListen);
  ipcMain.on('hide', () => win.hide());
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('focus-window', () => { win.focus(); });

  if (process.env.BUDDY_SHOT) require(process.env.BUDDY_SHOT); // dev-only: screenshot script
});

app.on('second-instance', () => { if (win) { win.showInactive(); } });
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { fgProc.kill(); mediaProc.kill(); voiceProc && voiceProc.kill(); } catch {} });
app.on('window-all-closed', (e) => e.preventDefault());
