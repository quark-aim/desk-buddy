const { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, nativeImage, shell, session, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { spawn } = require('child_process');

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer'); // lets the speech model use several threads

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
  // one long-lived PowerShell: media keys + exact system volume (Windows Core Audio)
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, int f, int e); }
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class Audio {
  static IAudioEndpointVolume Vol() {
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null; Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null; var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out epv)); return epv;
  }
  public static float GetVolume() { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void SetVolume(float v) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(v, Guid.Empty)); }
  public static bool GetMute() { bool b = false; Marshal.ThrowExceptionForHR(Vol().GetMute(out b)); return b; }
  public static void SetMute(bool b) { Marshal.ThrowExceptionForHR(Vol().SetMute(b, Guid.Empty)); }
}
'@
function Out-Vol { Write-Output ('VOL|' + [int][Math]::Round([Audio]::GetVolume() * 100) + '|' + [int][Audio]::GetMute()) }
while (($l = [Console]::In.ReadLine()) -ne $null) {
  $t = $l.Trim()
  try {
    if ($t -like 'SET *') {
      $n = [Math]::Max(0, [Math]::Min(100, [int]$t.Substring(4)))
      [Audio]::SetVolume([single]($n / 100.0)); if ($n -gt 0) { [Audio]::SetMute($false) }; Out-Vol
    } elseif ($t -like 'ADD *') {
      $n = [Math]::Max(0, [Math]::Min(100, [Math]::Round([Audio]::GetVolume() * 100) + [int]$t.Substring(4)))
      [Audio]::SetVolume([single]($n / 100.0)); [Audio]::SetMute($false); Out-Vol
    } elseif ($t -like 'MUTE *') {
      [Audio]::SetMute($t.Substring(5) -eq '1'); Out-Vol
    } elseif ($t -match '^\\d+$') {
      $k = [byte][int]$t; [K]::keybd_event($k, 0, 0, 0); [K]::keybd_event($k, 0, 2, 0)
    } elseif ($t -eq 'GET') { Out-Vol }
  } catch {}
}`;
  mediaProc = ps(script);
  let buf = '';
  mediaProc.stdout.on('data', (d) => {
    buf += d.toString('utf8'); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      const mm = line.match(/^VOL\|(\d+)\|(\d)$/);
      if (mm && win && !win.isDestroyed()) win.webContents.send('volume', { vol: +mm[1], muted: mm[2] === '1' });
    }
  });
  mediaProc.stdin.on('error', () => {});
}
/* ---------- voice: offline Whisper (runs in the renderer; model downloaded once) ---------- */
const MODELS = ['whisper-tiny.en', 'whisper-base.en']; // tiny = fast (~1.3 s), base = more accurate (~2.2 s)
const MODEL_FILES = ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
const https = require('https');
const { pathToFileURL } = require('url');

function download(url, dest, onBytes, hops = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'desk-buddy' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) {
        res.resume(); return resolve(download(new URL(res.headers.location, url).href, dest, onBytes, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('download failed (' + res.statusCode + ')')); }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = dest + '.part'; const out = fs.createWriteStream(tmp);
      res.on('data', (c) => onBytes(c.length));
      res.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, dest); resolve(); }));
      out.on('error', reject); res.on('error', reject);
    }).on('error', reject);
  });
}

const modelPromises = {};
const modelRoot = () => path.join(app.getPath('userData'), 'models');
function modelMissing(MODEL) {
  const base = path.join(modelRoot(), MODEL);
  return MODEL_FILES.filter((f) => { try { return fs.statSync(path.join(base, f)).size === 0; } catch { return true; } });
}
function ensureModel(MODEL) {
  if (!MODELS.includes(MODEL)) MODEL = MODELS[0];
  if (modelPromises[MODEL]) return modelPromises[MODEL];
  modelPromises[MODEL] = (async () => {
    const root = modelRoot();
    const base = path.join(root, MODEL);
    const missing = MODEL_FILES.filter((f) => { try { return fs.statSync(path.join(base, f)).size === 0; } catch { return true; } });
    if (missing.length) {
      // sizes first, so progress is a real percentage
      const sizes = {}; let total = 0;
      for (const f of missing) {
        const url = 'https://huggingface.co/Xenova/' + MODEL + '/resolve/main/' + f;
        const size = await new Promise((resolve) => {
          const head = (u, hops = 0) => https.request(u, { method: 'HEAD', headers: { 'User-Agent': 'desk-buddy' } }, (r) => {
            if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && hops < 6) return head(new URL(r.headers.location, u).href, hops + 1);
            resolve(parseInt(r.headers['content-length'] || '0', 10));
          }).on('error', () => resolve(0)).end();
          head(url);
        });
        sizes[f] = size; total += size;
      }
      let done = 0, lastPct = -1;
      for (const f of missing) {
        await download('https://huggingface.co/Xenova/' + MODEL + '/resolve/main/' + f, path.join(base, f), (n) => {
          done += n; const pct = total ? Math.min(99, Math.floor((done / total) * 100)) : 0;
          if (pct !== lastPct && win && !win.isDestroyed()) { lastPct = pct; win.webContents.send('voice-model-progress', pct); }
        });
      }
    }
    return {
      model: MODEL, device: 'wasm', dtype: 'q8',
      modelRoot: pathToFileURL(root).href + '/',
      wasmRoot: pathToFileURL(path.join(__dirname, 'voice', 'vendor')).href + '/',
      threads: Math.max(1, Math.min(4, require('os').cpus().length - 1)),
    };
  })().catch((err) => { delete modelPromises[MODEL]; throw err; });
  return modelPromises[MODEL];
}
function voiceListen() { if (win && !win.isDestroyed()) win.webContents.send('voice-start'); }

/* ---------- "Ask AI": any OpenAI-compatible chat API (Gemini free, Groq free, OpenRouter, OpenAI, Ollama...) ---------- */
// The API key is stored encrypted (Windows DPAPI) and never leaves this process except in the request to the provider you chose.
function getAiKey() {
  const s = loadState() || {};
  if (!s.aiKey) return '';
  try { return safeStorage.decryptString(Buffer.from(s.aiKey, 'base64')); } catch { return ''; }
}
function validBaseUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname));
  } catch { return false; }
}
async function errorOf(res) {
  let detail = '';
  try { const j = JSON.parse(await res.text()); const e = (Array.isArray(j) ? j[0] : j).error; detail = String((e && (e.message || e)) || '').replace(/\s+/g, ' ').slice(0, 90); } catch {}
  return (res.status === 400 || res.status === 401 || res.status === 403) ? 'API key was rejected' + (detail ? ': ' + detail : '.')
    : res.status === 429 ? 'Rate limit hit, wait a little and try again.'
    : res.status === 404 ? 'Model not available' + (detail ? ': ' + detail : ' (check the model name).')
    : res.status === 503 ? 'The AI is busy right now, try again in a moment.'
    : 'The AI service returned an error (' + res.status + ').';
}
const post = (url, headers, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });

// standard OpenAI-style /chat/completions
async function askOpenAI(baseUrl, model, messages, key) {
  const res = await post(baseUrl.replace(/\/+$/, '') + '/chat/completions', key ? { Authorization: 'Bearer ' + key } : {}, { model, messages, max_tokens: 800, temperature: 0.7 });
  if (!res.ok) return { ok: false, error: await errorOf(res), status: res.status };
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return text ? { ok: true, text: String(text).trim() } : { ok: false, error: 'The AI sent an empty answer.' };
}
// Gemini's own API. Newer AI Studio keys ("AQ." prefix) are reported to work here with the x-goog-api-key header.
async function askGeminiNative(model, messages, key) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = { contents, generationConfig: { maxOutputTokens: 800, temperature: 0.7 } };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  const res = await post('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', { 'x-goog-api-key': key }, body);
  if (!res.ok) return { ok: false, error: await errorOf(res), status: res.status };
  const data = await res.json();
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = parts ? parts.map((p) => p.text || '').join('').trim() : '';
  return text ? { ok: true, text } : { ok: false, error: 'The AI sent an empty answer.' };
}
async function aiAsk({ baseUrl, model, messages }) {
  if (!validBaseUrl(baseUrl)) return { ok: false, error: 'Set a valid https:// API address in the AI settings.' };
  if (!model) return { ok: false, error: 'Set a model name in the AI settings.' };
  const key = getAiKey();
  const isLocal = /^http:/i.test(baseUrl);
  if (!key && !isLocal) return { ok: false, error: 'Add your API key in the AI settings first.' };
  messages = messages.slice(-12);
  try {
    if (new URL(baseUrl).hostname === 'generativelanguage.googleapis.com') {
      // Gemini: try its native API first, then the OpenAI-compatible one, and report the more useful error
      let a = await askGeminiNative(model, messages, key);
      if (a.ok) return a;
      if ((a.status === 503 || a.status === 404) && model !== 'gemini-flash-lite-latest') { // busy or retired model: fall back to the lite alias
        const f = await askGeminiNative('gemini-flash-lite-latest', messages, key);
        if (f.ok) return f;
      }
      const b = await askOpenAI(baseUrl, model, messages, key);
      return b.ok ? b : (a.status === 404 ? b : a);
    }
    return await askOpenAI(baseUrl, model, messages, key);
  } catch (err) {
    return { ok: false, error: err && err.name === 'TimeoutError' ? 'The AI took too long to answer.' : 'Could not reach the AI service (offline?).' };
  }
}

/* ---------- speaking: Windows voices render to a wav; the app plays it back sped up for a cute, high voice ---------- */
let ttsProc, ttsId = 0; const ttsPending = {};
function ensureTts() {
  if (ttsProc) return;
  const script = `
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
while (($l = [Console]::In.ReadLine()) -ne $null) {
  $j = $null
  try {
    $j = $l | ConvertFrom-Json
    if ($j.voice) { try { $s.SelectVoice($j.voice) } catch {} } else { try { $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female) } catch {} }
    $s.Rate = 0; $s.Volume = 100
    $s.SetOutputToWaveFile($j.file); $s.Speak([string]$j.text); $s.SetOutputToNull()
  } catch { try { $s.SetOutputToNull() } catch {} }
  if ($j) { Write-Output ('DONE|' + $j.id) }
}`;
  ttsProc = ps(script);
  let buf = '';
  ttsProc.stdout.on('data', (d) => {
    buf += d.toString('utf8'); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      const mm = line.match(/^DONE\|(\d+)$/); const p = mm && ttsPending[mm[1]];
      if (!p) continue; delete ttsPending[mm[1]];
      let data = null; try { data = fs.readFileSync(p.file); } catch {} try { fs.unlinkSync(p.file); } catch {}
      p.resolve(data);
    }
  });
  ttsProc.on('exit', () => { ttsProc = null; Object.values(ttsPending).forEach((p) => p.resolve(null)); });
  ttsProc.stdin.on('error', () => {});
}
function winTtsRender({ text, voice }) {
  return new Promise((resolve) => {
    ensureTts(); const id = ++ttsId;
    const file = path.join(app.getPath('temp'), 'desk-buddy-tts-' + id + '.wav');
    ttsPending[id] = { file, resolve };
    try { ttsProc.stdin.write(JSON.stringify({ id, file, text: String(text || '').slice(0, 800), voice: String(voice || '') }) + '\n'); } catch { delete ttsPending[id]; return resolve(null); }
    setTimeout(() => { if (ttsPending[id]) { delete ttsPending[id]; resolve(null); } }, 25000);
  });
}
/* ---------- Google voice: Gemini text-to-speech (uses your Gemini key); falls back to the Windows voice ---------- */
const CUTE_STYLE = 'Say in a very cute, bubbly, cheerful, high-pitched young girl voice';
let gTtsModel = null;
function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function listTtsModels(key) {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.models || []).map((x) => String(x.name).replace(/^models\//, '')).filter((n) => /tts/i.test(n))
      .sort((a, b) => (/pro/i.test(a) - /pro/i.test(b)) || (/preview/i.test(a) - /preview/i.test(b)) || b.localeCompare(a));
  } catch { return []; }
}
function ttsPrompt(text, fmt) {
  if (fmt === 'A') return 'Say cheerfully: ' + text;
  if (fmt === 'C') return text;
  return "### DIRECTOR'S NOTES\nStyle: very cute, bubbly, cheerful, sweet young girl with a high, playful voice. Smiling while talking.\nPace: lively, a little fast.\n\n### TRANSCRIPT\n" + text;
}
async function geminiTts(text, voiceName, fmt) {
  const key = getAiKey();
  if (!key || !(/^[A-Za-z]{3,20}$/.test(voiceName || ''))) return null;
  const models = gTtsModel ? [gTtsModel] : await listTtsModels(key);
  for (const model of models) {
    try {
      const res = await post('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', { 'x-goog-api-key': key }, {
        contents: [{ parts: [{ text: ttsPrompt(text, fmt) }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
      });
      if (!res.ok) { if (res.status === 429) return null; continue; }
      const data = await res.json();
      const part = ((((data.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData && p.inlineData.data);
      if (!part || /wav/i.test(part.inlineData.mimeType || '')) continue; // (non-streaming path only handles raw PCM)
      const rate = parseInt(((part.inlineData.mimeType || '').match(/rate=(\d+)/) || [])[1], 10) || 24000;
      gTtsModel = model;
      return pcmToWav(Buffer.from(part.inlineData.data, 'base64'), rate);
    } catch { /* try the next model */ }
  }
  return null;
}
async function ttsRender(o) {
  const text = String(o.text || '').slice(0, 500);
  if (o.engine !== 'windows') {
    const wav = await geminiTts(text, o.voice, o.fmt);
    if (wav) return { data: wav, engine: 'google' };
  }
  const data = await winTtsRender({ text, voice: o.engine === 'windows' ? o.voice : '' });
  return data ? { data, engine: 'windows' } : null;
}

/* streaming Google voice: audio starts playing ~1 s after asking instead of waiting for the whole clip */
const ttsAbort = {}, ttsBlocked = {}; let ttsModelList = null, ttsModelListAt = 0;
async function ttsModelsOrdered(key) {
  if (!ttsModelList || Date.now() - ttsModelListAt > 3600e3) { ttsModelList = await listTtsModels(key); ttsModelListAt = Date.now(); }
  const ok = ttsModelList.filter((x) => !(ttsBlocked[x] > Date.now())); // skip models that hit their free-tier limit for a while
  return gTtsModel && ok.includes(gTtsModel) ? [gTtsModel, ...ok.filter((x) => x !== gTtsModel)] : ok;
}
async function streamGeminiTts(id, text, voiceName, signal, send) {
  const key = getAiKey();
  if (!key || !/^[A-Za-z]{3,20}$/.test(voiceName || '')) return false;
  for (const model of await ttsModelsOrdered(key)) {
    let sent = 0;
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "### DIRECTOR'S NOTES\nStyle: very cute, bubbly, cheerful, sweet young girl with a high, playful voice. Smiling while talking.\nPace: lively, a little fast.\n\n### TRANSCRIPT\n" + text }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
        }),
      });
      if (!res.ok) { if (res.status === 429) ttsBlocked[model] = Date.now() + 10 * 60e3; continue; }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n'); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const ev = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = ev.split('\n').find((l) => l.startsWith('data:')); if (!line) continue;
          let j; try { j = JSON.parse(line.slice(5)); } catch { continue; }
          const p = ((((j.candidates || [])[0] || {}).content || {}).parts || []).find((x) => x.inlineData && x.inlineData.data);
          if (!p || /wav/i.test(p.inlineData.mimeType || '')) continue; // only raw PCM chunks
          const rate = parseInt(((p.inlineData.mimeType || '').match(/rate=(\d+)/) || [])[1], 10) || 24000;
          send({ id, pcm: Buffer.from(p.inlineData.data, 'base64'), rate }); sent++; gTtsModel = model;
        }
      }
      if (sent) return true;
    } catch (err) {
      if (signal.aborted) return true;
      if (sent) return true;
    }
  }
  return false;
}

let ttsVoicesCache;
function ttsVoices() {
  if (ttsVoicesCache) return Promise.resolve(ttsVoicesCache);
  return new Promise((resolve) => {
    const p = ps("[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }");
    let out = ''; p.stdout.on('data', (d) => out += d.toString('utf8'));
    p.on('exit', () => { ttsVoicesCache = out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); resolve(ttsVoicesCache); });
    setTimeout(() => resolve([]), 15000);
  });
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
    ? { openAtLogin: on, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath }
    : { openAtLogin: on, path: process.execPath, args: [app.getAppPath()] });
}

app.whenReady().then(() => {
  createWindow();
  setupTray();
  startForegroundWatcher();
  startMediaKeys();

  // keep the Windows startup entry pointing at this folder (re-synced every launch unless turned off from the tray)
  if ((loadState() || {}).autoStart !== false && !process.env.BUDDY_NO_AUTOSTART) setAutoStart(true);

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
  ipcMain.on('open-spotify', (_, uri) => shell.openExternal(typeof uri === 'string' && /^spotify:search:[^\s]{1,300}$/.test(uri) ? uri : 'spotify:'));
  let drag = null;
  ipcMain.on('drag-start', () => { drag = { m: screen.getCursorScreenPoint(), p: win.getPosition() }; clearInterval(anim); });
  ipcMain.on('drag-move', () => { if (!drag) return; const c = screen.getCursorScreenPoint(); win.setBounds({ x: drag.p[0] + c.x - drag.m.x, y: drag.p[1] + c.y - drag.m.y, width: W, height: H }); });
  ipcMain.on('drag-end', () => { drag = null; persistPos(); });
  ipcMain.on('voice-listen', voiceListen);
  ipcMain.handle('voice-ensure-model', (_, model) => ensureModel(model));
  ipcMain.handle('voice-model-exists', (_, model) => MODELS.includes(model) && modelMissing(model).length === 0);
  ipcMain.on('volume', (_, o) => {
    if (!mediaProc || !o) return;
    try {
      if (typeof o.set === 'number') mediaProc.stdin.write('SET ' + Math.max(0, Math.min(100, Math.round(o.set))) + '\n');
      else if (typeof o.add === 'number') mediaProc.stdin.write('ADD ' + Math.max(-100, Math.min(100, Math.round(o.add))) + '\n');
      else if (typeof o.mute === 'boolean') mediaProc.stdin.write('MUTE ' + (o.mute ? 1 : 0) + '\n');
    } catch {}
  });
  ipcMain.handle('tts-stream', async (e, o) => {
    o = o || {}; const id = o.id; const text = String(o.text || '').slice(0, 700);
    const ac = new AbortController(); ttsAbort[id] = ac;
    const send = (msg) => { if (!ac.signal.aborted && win && !win.isDestroyed()) win.webContents.send('tts-chunk', msg); };
    try {
      let ok = false;
      if (o.engine !== 'windows') ok = await streamGeminiTts(id, text, o.voice, ac.signal, send);
      if (!ok && !ac.signal.aborted) {
        const wav = await winTtsRender({ text, voice: o.engine === 'windows' ? o.voice : '' });
        if (wav) send({ id, wav, engine: 'windows' });
      }
    } finally { delete ttsAbort[id]; send({ id, done: true }); }
  });
  ipcMain.on('tts-cancel', (_, id) => { const ac = ttsAbort[id]; if (ac) ac.abort(); });
  ipcMain.handle('tts-render', (_, o) => ttsRender(o || {}));
  ipcMain.handle('tts-voices', () => ttsVoices());
  setTimeout(() => { ensureTts(); const k = getAiKey(); if (k) ttsModelsOrdered(k).catch(() => {}); }, 4000); // warm up so the first answer is spoken without delay
  ipcMain.handle('ai-ask', (_, args) => aiAsk(args || {}));
  ipcMain.handle('ai-has-key', () => !!getAiKey());
  ipcMain.handle('ai-set-key', (_, key) => {
    const s = loadState() || {};
    key = String(key || '').trim();
    if (!key) { delete s.aiKey; saveState(s); return { ok: true, has: false }; }
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Secure key storage is not available on this PC.' };
    s.aiKey = safeStorage.encryptString(key).toString('base64'); saveState(s);
    return { ok: true, has: true };
  });
  // microphone access for voice commands (only for our own window)
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media'));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media');
  ipcMain.on('hide', () => win.hide());
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('focus-window', () => { win.focus(); });

  if (process.env.BUDDY_SHOT) require(process.env.BUDDY_SHOT); // dev-only: screenshot/test script // dev-only: screenshot script
});

app.on('second-instance', () => { if (win) { win.showInactive(); } });
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { fgProc.kill(); mediaProc.kill(); ttsProc && ttsProc.kill(); } catch {} });
app.on('window-all-closed', (e) => e.preventDefault());
