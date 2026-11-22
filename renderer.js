const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const pet = $('#pet'), face = $('#face'), bubble = $('#bubble');

let S = { todos: [], reminders: [], focusMin: 25, breakMin: 5, pomos: 0 };
const save = () => window.buddy.setState(S);

/* ---------------- mood + speech ---------------- */
let baseMood = 'neutral', moodTimer, bubbleTimer;
const SHAPES = {
  cat: 'M5 8 Q12 20 20 9 Q28 20 35 8', smile: 'M8 9 Q14 22 20 22 Q26 22 32 9', open: 'M6 7 Q12 27 20 27 Q28 27 34 7',
  smirk: 'M8 11 Q14 20 20 17 Q28 14 33 8', o: 'M15 9 Q15 25 20 25 Q25 25 25 9', flat: 'M10 15 Q15 15 20 15 Q25 15 30 15',
  sad: 'M9 21 Q14 11 20 11 Q26 11 31 21', wavy: 'M5 16 Q12 8 20 16 Q28 24 35 16' };
const MOUTH = { neutral: 'cat', happy: 'smile', excited: 'open', love: 'smile', wink: 'smirk', wow: 'o', sleepy: 'o', focus: 'flat', alert: 'o', sad: 'sad', music: 'open', dizzy: 'wavy', listen: 'o', cool: 'smirk', think: 'wavy', game: 'open', chill: 'smile', cheer: 'open', shh: 'flat', art: 'smile', mail: 'smile', typing: 'flat' };
const ALIAS = { chill: 'happy', mail: 'happy', art: 'wink', cheer: 'excited', typing: 'focus' };
const FILLED = new Set(['open', 'o']);
const FX = { sleepy: ['💤'], love: ['💕', '💗'], music: ['♪', '♫'], excited: ['✨', '⭐'], sad: ['💧'], think: ['💭'], game: ['🎮'], chill: ['🍿'], cheer: ['🎉', '✨'], art: ['🎨'], mail: ['📧'], cool: ['✨'] };
let fxT;
function emit(ch) {
  const s = document.createElement('span'); s.className = 'fxp'; s.textContent = ch;
  s.style.left = 'calc(50% + ' + (Math.random() * 160 - 80).toFixed(0) + 'px)'; s.style.setProperty('--dx', (Math.random() * 24 - 12).toFixed(0) + 'px');
  $('#fx').append(s); setTimeout(() => s.remove(), 1900);
}
function setMood(m, ms) {
  clearTimeout(moodTimer);
  face.className = m + (ALIAS[m] ? ' ' + ALIAS[m] : ''); if (m === 'think') { gazeLock = Date.now() + 3500; gaze(9, -5); }
  pet.className = ['alert', 'focus', 'music', 'listen'].includes(m) ? m : '';
  const shape = MOUTH[m] || 'cat', p = $('#mouth path');
  p.style.d = "path('" + SHAPES[shape] + "')"; p.style.fill = FILLED.has(shape) ? 'var(--c)' : 'transparent';
  clearInterval(fxT); if (FX[m]) fxT = setInterval(() => emit(FX[m][Math.floor(Math.random() * FX[m].length)]), m === 'love' ? 650 : 1300);
  if (ms) moodTimer = setTimeout(() => setMood(baseMood), ms);
}
function say(msg, ms = 5000, mood) {
  bubble.textContent = msg; bubble.classList.add('show');
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
  if (mood) setMood(mood, Math.max(ms, 2500));
}
function beep(freq = 880, dur = 0.15, times = 2) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
      g.gain.value = 0.08; const t = ctx.currentTime + i * (dur + 0.08);
      o.start(t); o.stop(t + dur);
    }
  } catch {}
}
function alertUser(msg, mood = 'alert') { beep(); say(msg, 9000, mood); }

/* ---------------- panels ---------------- */
function openPanel(name) {
  const cur = $$('.panel.open')[0];
  $$('.panel').forEach((p) => p.classList.remove('open'));
  $$('#dock button').forEach((b) => b.classList.remove('on'));
  if (cur && cur.id === 'p-' + name) return;
  $('#p-' + name).classList.add('open');
  $(`#dock button[data-p=${name}]`).classList.add('on');
  if (name === 'cmd') { window.buddy.focusWindow(); setTimeout(() => $('#cmdIn').focus(), 50); }
  if (name === 'todo') renderTodos();
  if (name === 'rem') renderRems();
}
$$('#dock button').forEach((b) => b.onclick = () => openPanel(b.dataset.p));
window.buddy.onOpenCommand(() => { if (!$('#p-cmd').classList.contains('open')) openPanel('cmd'); else $('#cmdIn').focus(); });

/* ---------------- todos ---------------- */
function addTodo(text) { text = text.trim(); if (!text) return; S.todos.push({ id: Date.now(), text, done: false }); save(); renderTodos(); }
function renderTodos() {
  const ul = $('#todoList'); ul.innerHTML = '';
  S.todos.forEach((t) => {
    const li = document.createElement('li'); if (t.done) li.className = 'done';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = t.done; cb.className = 'nodrag';
    cb.onchange = () => { t.done = cb.checked; save(); renderTodos(); if (t.done) say('Nice, one down! ✨', 3000, 'happy'); };
    const sp = document.createElement('span'); sp.textContent = t.text;
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕';
    x.onclick = () => { S.todos = S.todos.filter((a) => a.id !== t.id); save(); renderTodos(); };
    li.append(cb, sp, x); ul.append(li);
  });
}
$('#todoIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { addTodo(e.target.value); e.target.value = ''; } });

/* ---------------- reminders ---------------- */
function addReminder(text, at) {
  S.reminders.push({ id: Date.now() + Math.random(), text, at }); save(); renderRems();
  const d = new Date(at); say(`Okay! I'll remind you at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 3500, 'happy');
}
function renderRems() {
  const ul = $('#remList'); ul.innerHTML = '';
  S.reminders.sort((a, b) => a.at - b.at).forEach((r) => {
    const li = document.createElement('li');
    const sp = document.createElement('span');
    sp.textContent = new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '  ' + r.text;
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕';
    x.onclick = () => { S.reminders = S.reminders.filter((a) => a.id !== r.id); save(); renderRems(); };
    li.append(sp, x); ul.append(li);
  });
}
$('#remAdd').onclick = () => {
  const text = $('#remText').value.trim() || 'Reminder';
  const mins = parseInt($('#remMin').value, 10), tm = $('#remTime').value;
  let at;
  if (mins > 0) at = Date.now() + mins * 60000;
  else if (tm) { const [h, m] = tm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d < Date.now()) d.setDate(d.getDate() + 1); at = d.getTime(); }
  else return;
  addReminder(text, at); $('#remText').value = ''; $('#remMin').value = ''; $('#remTime').value = '';
};
setInterval(() => {
  const now = Date.now(); const due = S.reminders.filter((r) => r.at <= now);
  if (!due.length) return;
  S.reminders = S.reminders.filter((r) => r.at > now); save();
  due.forEach((r) => alertUser('⏰ ' + r.text)); if ($('#p-rem').classList.contains('open')) renderRems();
}, 1000);

/* ---------------- pomodoro ---------------- */
let pomo = { mode: 'idle', left: S.focusMin * 60, running: false, timer: null };
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
function drawPomo() {
  $('#bigtime').textContent = fmt(pomo.left);
  $('#mode').textContent = pomo.mode === 'focus' ? (pomo.running ? 'focusing 🔥' : 'paused') : pomo.mode === 'break' ? (pomo.running ? 'break time ☕' : 'break paused') : 'ready to focus';
  $('#pomoGo').textContent = pomo.running ? 'Pause' : 'Start';
  const chip = $('#timerChip'); chip.textContent = (pomo.mode === 'break' ? '☕ ' : '🍅 ') + fmt(pomo.left);
  chip.classList.toggle('show', pomo.mode !== 'idle');
}
function startPomo(mode, mins) {
  clearInterval(pomo.timer);
  pomo.mode = mode; pomo.left = (mins || (mode === 'focus' ? S.focusMin : S.breakMin)) * 60; pomo.running = true;
  baseMood = mode === 'focus' ? 'focus' : 'neutral'; setMood(baseMood);
  say(mode === 'focus' ? "Focus mode on. I'll keep watch 👀" : 'Break! Stretch and sip some water 💧', 4000);
  pomo.timer = setInterval(tickPomo, 1000); drawPomo();
}
function tickPomo() {
  if (!pomo.running) return;
  if (--pomo.left > 0) return drawPomo();
  clearInterval(pomo.timer); pomo.running = false;
  if (pomo.mode === 'focus') { S.pomos++; save(); alertUser(`Pomodoro #${S.pomos} done! Take a break 🎉`, 'love'); pomo.mode = 'break'; pomo.left = S.breakMin * 60; baseMood = 'neutral'; }
  else { alertUser('Break over — ready for another round?', 'wow'); pomo.mode = 'idle'; pomo.left = S.focusMin * 60; baseMood = 'neutral'; }
  drawPomo();
}
function stopPomo() { clearInterval(pomo.timer); pomo = { mode: 'idle', left: S.focusMin * 60, running: false, timer: null }; baseMood = 'neutral'; setMood('neutral'); drawPomo(); }
$('#pomoGo').onclick = () => {
  if (pomo.mode === 'idle') return startPomo('focus');
  pomo.running = !pomo.running; baseMood = pomo.running && pomo.mode === 'focus' ? 'focus' : 'neutral'; setMood(baseMood); drawPomo();
};
$('#pomoBreak').onclick = () => startPomo('break');
$('#pomoReset').onclick = stopPomo;

/* ---------------- music ---------------- */
$$('[data-m]').forEach((b) => b.onclick = () => window.buddy.media(b.dataset.m));
$('#openSpot').onclick = () => window.buddy.openSpotify();
let playing = false;
window.buddy.onSpotify((title) => {
  // Spotify's window title is "Artist - Song" while playing, "Spotify ..." when paused/idle
  const isPlaying = !!title && !/^Spotify/i.test(title);
  $('#np').textContent = isPlaying ? '♪ ' + title : title ? 'paused' : 'Spotify not running';
  if (isPlaying && !playing) { if (pomo.mode !== 'focus' || !pomo.running) { baseMood = 'music'; setMood('music'); } }
  if (!isPlaying && playing && baseMood === 'music') { baseMood = pomo.mode === 'focus' && pomo.running ? 'focus' : 'neutral'; setMood(baseMood); }
  playing = isPlaying;
});

/* ---------------- app-aware reactions ---------------- */
const P = (re) => (p) => re.test(p);
const T = (re) => (p, t) => re.test(t);
const RULES = [
  // ---- website / window-title based (most specific first) ----
  { cat: 'github', test: T(/github|gitlab|bitbucket/i), mood: 'cool', anim: 'hop', fx: ['🐙', '✨'], msg: ['GitHub time 🐙 ship it!', 'Commit early, commit often 🌱', 'PR review? I believe in you 🧐'] },
  { cat: 'so', test: T(/stack ?overflow|stackexchange/i), mood: 'think', fx: ['💭', '❓'], msg: ['Copy-paste engineer? Just kidding 😜', 'The real answer is in the 2nd reply 🤔'] },
  { cat: 'ai', test: T(/chatgpt|claude|gemini|copilot|perplexity|deepseek/i), mood: 'think', fx: ['💡', '🧠'], msg: ['Asking the robots? 🤖', 'Big brain time 🧠', 'Ooh, I want to chat too! 🤖'] },
  { cat: 'video', test: T(/youtube|netflix|prime video|twitch|hotstar|disney\+?|crunchyroll/i), mood: 'chill', anim: 'wiggle', fx: ['🍿'], msg: ['Popcorn time 🍿', 'Enjoy the show! ✨', 'Just one episode… right? 😏'] },
  { cat: 'social', test: T(/instagram|facebook|twitter|reddit|tiktok|linkedin|snapchat|pinterest|(^|\W)x\.com/i), mood: 'wow', anim: 'wiggle', fx: ['👀'], msg: ['Doomscroll alert? 👀', 'Just 5 minutes, right? 😏', 'Ooh, what is the internet saying? 🍵'] },
  { cat: 'mail', test: T(/gmail|outlook|inbox|proton ?mail|yahoo mail/i), mood: 'mail', fx: ['📧'], msg: ['Email time 📧 Inbox zero soon?', 'Boring emails ahead… be brave 💪'] },
  { cat: 'work', test: T(/google docs|google sheets|google slides|docs\.google|notion|figma|miro/i), mood: 'typing', fx: ['📄'], msg: ['Getting things done 📄', 'Productive vibes ✨'] },
  { cat: 'shop', test: T(/amazon|flipkart|ebay|myntra|aliexpress|cart|checkout/i), mood: 'love', fx: ['🛍️', '💸'], msg: ['Ooh, shopping! 🛍️ …is it a need or a want?', 'Add to cart? 💸 Careful!'] },
  { cat: 'maps', test: T(/google maps|maps\.google/i), mood: 'think', fx: ['🗺️'], msg: ['Going somewhere? 🗺️ Take me with you!'] },

  // ---- process based ----
  { cat: 'terminal', test: P(/^(windowsterminal|wt|cmd|powershell|pwsh|conhost|bash|mintty|alacritty|wezterm|kitty)$/i), mood: 'cool', anim: 'hop', fx: ['⌨️', '✨'], msg: ['Hacker mode 😎', 'sudo make me a sandwich 🥪', 'Type fast, break nothing 🤞'] },
  { cat: 'code', test: P(/^(code|code - insiders|cursor|windsurf|devenv|idea64|pycharm64|webstorm64|clion64|rider64|androidstudio64|sublime_text|notepad\+\+|atom|zed|vim|nvim)$/i), mood: 'typing', fx: ['💻', '🐛'], msg: ['Coding time! You got this 💻', 'Bug hunting? I believe in you 🐛', 'Tabs or spaces? 👀'] },
  { cat: 'art', test: P(/^(photoshop|illustrator|figma|canva|gimp|inkscape|krita|blender|afterfx|premiere pro|davinciresolve|clipstudiopaint|procreate)$/i), mood: 'art', anim: 'wiggle', fx: ['🎨', '✨'], msg: ['Ooh, creative time! 🎨', 'Make something beautiful ✨', 'Can I see when you are done? 🥺'] },
  { cat: 'work', test: P(/^(winword|excel|powerpnt|onenote|notion|obsidian|acrobat|acrord32|foxitpdfreader|libreoffice|soffice)$/i), mood: 'typing', fx: ['📄'], msg: ['Getting things done 📄', 'Productive vibes ✨', 'Spreadsheets… brave human 📊'] },
  { cat: 'meeting', test: P(/^(zoom|webex|skype|gotomeeting|bluejeans|slack huddle)$/i), mood: 'shh', fx: ['🤫'], msg: ['Shh… meeting time 🤫 I will be quiet', 'Looking good on camera! 📹'] },
  { cat: 'chat', test: P(/^(discord|slack|whatsapp|telegram|signal|ms-teams|teams|messenger|element)$/i), mood: 'happy', anim: 'hop', fx: ['💬'], msg: ['Chatty time 💬', 'Say hi for me! 👋', 'Ooh, who are you talking to? 👀'] },
  { cat: 'spotify', test: P(/^spotify$/i), mood: 'music', anim: 'wiggle', fx: ['♪', '♫'], msg: ['Ooh, music! 🎶', 'Turn it up! 🔊'] },
  { cat: 'game', test: P(/^(steam|steamwebhelper|epicgameslauncher|valorant|valorant-win64-shipping|leagueclient|league of legends|javaw|minecraft|fortniteclient-win64-shipping|cs2|csgo|gta5|robloxplayerbeta|riotclientservices|dota2|overwatch|genshinimpact|apexlegends|r5apex|rocketleague|eldenring)$/i), mood: 'game', anim: 'hop', fx: ['🎮', '⚡'], msg: ['Game on! 🎮 Hydrate!', 'Good luck, have fun! ⚡', 'Do not rage quit 😤'] },
  { cat: 'video', test: P(/^(vlc|mpv|potplayermini64|potplayer|wmplayer|video\.ui|movies & tv|plex)$/i), mood: 'chill', anim: 'wiggle', fx: ['🍿'], msg: ['Enjoy the show 🍿', 'Movie night! 🎬'] },
  { cat: 'calc', test: P(/^(calculatorapp|calculator|calc)$/i), mood: 'think', fx: ['🧮', '➕'], msg: ['Math time 🧮', 'I can count to ten! …usually 🤓'] },
  { cat: 'settings', test: P(/^(systemsettings)$/i), mood: 'think', fx: ['🔧'], msg: ['Tinkering with settings? 🔧', 'Careful, do not break me 🥺'] },
  { cat: 'taskmgr', test: P(/^(taskmgr|perfmon|resmon)$/i), mood: 'wow', fx: ['🕵️'], msg: ['Is something misbehaving? 🕵️', 'Please do not end my task 🥺'] },
  { cat: 'files', test: P(/^explorer$/i), mood: 'think', fx: ['🔍'], msg: ['Looking for something? 🔍', 'Organizing files? So tidy ✨'] },
  { cat: 'torrent', test: P(/^(utorrent|qbittorrent|bittorrent)$/i), mood: 'cool', fx: ['🏴‍☠️'], msg: ['Arr matey 🏴‍☠️', 'I did not see anything 🙈'] },
  { cat: 'web', test: P(/^(chrome|msedge|firefox|brave|opera|arc|vivaldi|safari)$/i), mood: 'happy', anim: 'hop', fx: ['🌐'], msg: ['Browsing the web 🌐', 'What are we looking up? 🔎'] },
];
const DISTRACT = /(youtube|netflix|instagram|reddit|twitter|x\.com|facebook|tiktok|twitch|9gag)/i;
const QUIET_WHILE_FOCUS = new Set(['code', 'work', 'meeting', 'terminal', 'github', 'so', 'ai']);
const GROUP = { code: 'build', terminal: 'build', github: 'build', so: 'build', ai: 'build', work: 'work', video: 'screen', social: 'screen', game: 'game' };
const lastReact = {};
let lastKey = '', lastAny = 0, grp = 'other', grpSince = Date.now();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function burst(list, n = 6) { for (let i = 0; i < n; i++) setTimeout(() => emit(pick(list)), i * 130); }
function react(rule) {
  say(pick(rule.msg), 4200);
  if (rule.mood && baseMood !== 'music') setMood(rule.mood, 5500);
  if (rule.anim) bodyAnim(rule.anim, 900);
  if (rule.fx) burst(rule.fx);
}
window.buddy.onForeground(({ proc, title }) => {
  if (/electron|desk-buddy/i.test(proc)) return;
  if (proc.toLowerCase() === 'explorer' && !title) return; // desktop / taskbar
  const focusing = pomo.mode === 'focus' && pomo.running;
  if (focusing && DISTRACT.test(title)) {
    if (Date.now() - (lastReact.distract || 0) > 30000) { lastReact.distract = Date.now(); alertUser('Hey! Back to focus 👀 ' + title.slice(0, 28), 'alert'); }
    return;
  }
  const rule = RULES.find((r) => r.test(proc, title));
  const g = rule ? GROUP[rule.cat] || 'other' : 'other';
  if (g !== grp) { grp = g; grpSince = Date.now(); }
  if (!rule) return;
  const key = rule.cat + ':' + proc;
  if (key === lastKey) return; lastKey = key;
  const t = Date.now();
  if (t - (lastReact[rule.cat] || 0) < 60000 || t - lastAny < 6000) return;
  if (focusing && !QUIET_WHILE_FOCUS.has(rule.cat)) return;
  lastReact[rule.cat] = lastAny = t;
  react(rule);
});
// how long have you been at it? gentle nudges
setInterval(() => {
  const mins = (Date.now() - grpSince) / 60000;
  if ((grp === 'build' || grp === 'work') && mins >= 50) { grpSince = Date.now(); say("You've been at it for ~50 min. Stretch break? 🧘", 8000, 'happy'); bodyAnim('wiggle', 800); burst(['🧘', '💧']); beep(660, 0.12, 1); }
  else if (grp === 'screen' && mins >= 30) { grpSince = Date.now(); say('30 minutes of scrolling… 👀 maybe a short walk?', 8000, 'wow'); bodyAnim('wiggle', 800); }
  else if (grp === 'game' && mins >= 60) { grpSince = Date.now(); say("1 hour of gaming! Hydrate 💧 and rest your eyes 👀", 8000, 'happy'); burst(['💧']); }
}, 60000);

/* ---------------- commands ---------------- */
function parseWhen(s) {
  let m = s.match(/\bin\s+(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)?\b/i);
  if (m) { const n = +m[1], u = (m[2] || 'm')[0].toLowerCase(); return { at: Date.now() + n * (u === 'h' ? 3600e3 : u === 's' ? 1e3 : 60e3), rest: s.replace(m[0], '').trim() }; }
  m = s.match(/\bat\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i);
  if (m) {
    let h = +m[1]; const mi = +(m[2] || 0), ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    const d = new Date(); d.setHours(h, mi, 0, 0); if (d < Date.now()) d.setDate(d.getDate() + 1);
    return { at: d.getTime(), rest: s.replace(m[0], '').trim() };
  }
  return null;
}
function runCommand(raw) {
  const c = raw.trim(); const l = c.toLowerCase(); if (!c) return;
  let m;
  if (/^(left|slide left|go left)$/.test(l)) { window.buddy.move('left'); say('Wheee ←', 1500, 'excited'); }
  else if (/^(right|slide right|go right)$/.test(l)) { window.buddy.move('right'); say('Wheee →', 1500, 'excited'); }
  else if (/^(center|middle)$/.test(l)) window.buddy.move('center');
  else if (/^(top|up)$/.test(l)) window.buddy.move('top');
  else if (/^(bottom|down)$/.test(l)) window.buddy.move('bottom');
  else if ((m = l.match(/^(?:focus|pomodoro|pomo|start)(?:\s+(\d+))?$/))) { startPomo('focus', m[1] && +m[1]); }
  else if ((m = l.match(/^break(?:\s+(\d+))?$/))) startPomo('break', m[1] && +m[1]);
  else if (/^(stop|reset)$/.test(l)) { stopPomo(); say('Timer stopped', 2000); }
  else if ((m = c.match(/^(?:todo|add|task)\s+(.+)$/i))) { addTodo(m[1]); say('Added to your list ✅', 2500, 'happy'); }
  else if ((m = c.match(/^remind(?:\s+me)?(?:\s+to)?\s+(.+)$/i))) {
    const w = parseWhen(m[1]);
    if (w) addReminder(w.rest || 'Reminder', w.at); else say('Try: remind stretch in 10m', 3500, 'wow');
  }
  else if (/^(play|pause|toggle|music)$/.test(l)) window.buddy.media('playpause');
  else if (/^(next|skip)$/.test(l)) window.buddy.media('next');
  else if (/^(prev|previous|back)$/.test(l)) window.buddy.media('prev');
  else if (/^(vol(ume)? up|louder)$/.test(l)) window.buddy.media('volup');
  else if (/^(vol(ume)? down|quieter)$/.test(l)) window.buddy.media('voldown');
  else if (/^(mute|unmute)$/.test(l)) window.buddy.media('mute');
  else if (/^(hide|bye)$/.test(l)) window.buddy.hide();
  else if (/^(quit|exit)$/.test(l)) window.buddy.quit();
  else if (/^(hi|hello|hey)/.test(l)) say('Hi there! 👋', 3000, 'love');
  else say("Hmm, I don't know that one yet 🤔", 3000, 'wow');
}
$('#cmdIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { runCommand(e.target.value); e.target.value = ''; } if (e.key === 'Escape') openPanel('cmd'); });

/* ---------------- idle life ---------------- */
const eyes = $('#eyes');
let lastActive = Date.now(), gazeLock = 0, clicks = [], dragStart = null;
const clamp = (v, a) => Math.max(-a, Math.min(a, v));
function gaze(x, y) { eyes.style.setProperty('--gx', x + 'px'); eyes.style.setProperty('--gy', y + 'px'); }
function bodyAnim(c, ms = 800) { const b = $('#body'); b.classList.remove(c); void b.offsetWidth; b.classList.add(c); setTimeout(() => b.classList.remove(c), ms); }
function wake() {
  lastActive = Date.now();
  if (baseMood === 'sleepy') { baseMood = 'neutral'; setMood('wow', 1600); bodyAnim('hop', 650); say('Oh! Hi again 👋', 2500); }
}
// eyes look around (unless following the cursor)
setInterval(() => { if (Date.now() < gazeLock) return; Math.random() < 0.55 ? gaze(+(Math.random() * 18 - 9).toFixed(0), +(Math.random() * 6 - 3).toFixed(0)) : gaze(0, 0); }, 2600);
// eyes follow the cursor
pet.addEventListener('pointermove', (e) => {
  wake(); gazeLock = Date.now() + 2500;
  const r = pet.getBoundingClientRect();
  gaze(clamp((e.clientX - (r.left + r.width / 2)) / 8, 10), clamp((e.clientY - (r.top + 55)) / 14, 5));
});
// little random antics when idle
const antics = [() => setMood('wink', 1300), () => bodyAnim('hop', 650), () => bodyAnim('wiggle', 750), () => setMood('happy', 1800),
  () => { setMood('sleepy', 1800); say('*yawn*', 1800); }, () => setMood('excited', 1500), () => bodyAnim('spin', 850), () => setMood('love', 1600), () => setMood('sad', 1400)];
setInterval(() => { if (face.className === 'neutral' && !dragStart) antics[Math.floor(Math.random() * antics.length)](); }, 8000);
// fall asleep when ignored
setInterval(() => {
  const focusing = pomo.mode === 'focus' && pomo.running;
  if (Date.now() - lastActive > 4 * 60000 && baseMood === 'neutral' && !focusing) { baseMood = 'sleepy'; setMood('sleepy'); }
}, 10000);
// poke + manual drag (so the face can react to clicks)
function poke() {
  const now = Date.now(); clicks = clicks.filter((t) => now - t < 1500); clicks.push(now); bodyAnim('squish', 350);
  if (clicks.length >= 4) { setMood('dizzy', 2500); say('x_x so dizzy…', 2500); clicks = []; return; }
  const o = [['love', 'Hehe 💕'], ['wink', 'Hi hi~ 😉'], ['wow', 'Eep! ✨'], ['excited', 'Yay! ⭐'], ['happy', '*giggles*']][Math.floor(Math.random() * 5)];
  say(o[1], 1800, o[0]);
}
pet.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button,input,li,ul')) return;
  wake(); pet.setPointerCapture(e.pointerId); dragStart = { x: e.screenX, y: e.screenY, moved: false }; window.buddy.dragStart();
});
pet.addEventListener('pointermove', (e) => {
  if (!dragStart) return;
  if (!dragStart.moved && Math.hypot(e.screenX - dragStart.x, e.screenY - dragStart.y) > 4) { dragStart.moved = true; setMood('wow'); }
  if (dragStart.moved) window.buddy.dragMove();
});
pet.addEventListener('pointerup', () => {
  if (!dragStart) return; const d = dragStart; dragStart = null;
  if (d.moved) { window.buddy.dragEnd(); setMood(baseMood); } else poke();
});
// periodic care
setInterval(() => {
  const h = new Date().getHours();
  if (h >= 1 && h < 5) say("It's really late… sleep soon? 😴", 6000, 'sleepy');
  else say('Time for a sip of water 💧', 5000, 'happy');
}, 45 * 60000);

/* ---------------- boot ---------------- */
(async function init() {
  const saved = await window.buddy.getState();
  if (saved) S = { ...S, ...saved };
  pomo.left = S.focusMin * 60; drawPomo(); setMood('neutral');
  const h = new Date().getHours();
  const greet = h < 5 ? 'Still up? 🌙' : h < 12 ? 'Good morning! ☀️' : h < 18 ? 'Good afternoon! 🌤️' : 'Good evening! 🌆';
  const pending = S.todos.filter((t) => !t.done).length;
  setTimeout(() => say(greet + (pending ? ` You have ${pending} task${pending > 1 ? 's' : ''} today.` : ''), 6000, 'wow'), 800);
})();

/* ---------------- voice ---------------- */
const NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, a: 1, an: 1 };
function numberWords(t) {
  // "twenty five" -> 25, "ten" -> 10 ("a"/"an" only count before a time unit)
  t = t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g, (_, a, b) => NUM[a] + NUM[b]);
  t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g, (w) => NUM[w]);
  return t.replace(/\b(?:in|for)\s+(?:a|an)\s+(?=(?:second|minute|hour)s?\b)/g, (m0) => m0.replace(/\b(a|an)\s+$/, '1 '));
}
function voiceNormalize(raw) {
  let t = raw.toLowerCase().replace(/[.,!?']/g, '').trim();
  t = numberWords(t)
    .replace(/^(hey |ok |okay )?(buddy|tabby|pet)[ ,]*/, '').replace(/^(please |can you |could you |would you )+/, '').replace(/ please$/, '');
  t = t.replace(/\b(go|move|slide|to|the)\s+(write|rite)\b/g, '$1 right').replace(/^(write|rite)$/, 'right').replace(/\b(go|move|slide|to|the)\s+(lift|loft|lef)\b/g, '$1 left').replace(/^(lift|loft)$/, 'left');
  let m;
  if ((m = t.match(/\b(?:move|go|slide|walk|jump|get)\b.*?\b(left|right|center|middle|top|bottom|up|down)\b/)) || (m = t.match(/^(left|right|center|middle|top|bottom)$/))) return m[1];
  if ((m = t.match(/\b(?:focus|pomodoro|work)\b.*?(\d+)/)) || (m = t.match(/\b(\d+)\s*(?:min|minute)s?\b.*\b(?:focus|pomodoro|work)\b/))) return 'focus ' + m[1];
  if (/\b(start|begin).*\b(focus|pomodoro|timer)\b|^(focus|pomodoro)( mode| time)?$/.test(t)) return 'focus';
  if ((m = t.match(/\b(?:break|rest)\b.*?(\d+)/))) return 'break ' + m[1];
  if (/\b(take|start).*\b(break|rest)\b|^break$/.test(t)) return 'break';
  if (/\b(stop|cancel|reset|end)\b.*\b(timer|pomodoro|focus|break)\b|^stop$/.test(t)) return 'stop';
  if ((m = t.match(/\b(?:add|create|new)\b.*?\b(?:todo|task|to do|to-do)\b(?: to(?: my)?(?: list)?)?[: ]+(.+)$/)) || (m = t.match(/^(?:todo|to do|task)[: ]+(.+)$/))) return 'todo ' + m[1];
  if ((m = t.match(/\bremind(?: me)?\b.*/))) return m[0];
  if (/\b(next|skip)\b/.test(t)) return 'next';
  if (/\b(previous|go back|last (song|track))\b/.test(t)) return 'prev';
  if (/\b(louder|volume up|turn (it )?up)\b/.test(t)) return 'volume up';
  if (/\b(quieter|volume down|turn (it )?down)\b/.test(t)) return 'volume down';
  if (/\bunmute|\bmute\b/.test(t)) return 'mute';
  if (/\b(play|pause|resume|music|stop the music)\b/.test(t)) return 'play';
  if (/\b(hide|go away|disappear|bye)\b/.test(t)) return 'hide';
  if (/\b(quit|exit|shut down|close)\b/.test(t)) return 'quit';
  if (/\b(hi|hello|hey)\b/.test(t)) return 'hi';
  return t;
}
let voiceGuard;
const voice = { worker: null, ready: false, loadP: null, busy: false, reqId: 0 };

function endListening() { clearTimeout(voiceGuard); if (['listen', 'think'].includes(face.className.split(' ')[0])) setMood(baseMood); }

// loads the model (downloads it once on first use) and starts the worker
function initVoice() {
  if (voice.loadP) return voice.loadP;
  voice.loadP = (async () => {
    say('Getting my ears ready… one-time download 🎧', 60000);
    const info = await window.buddy.ensureVoiceModel();
    say('Loading voice model…', 60000);
    voice.worker = new Worker('voice/worker.js', { type: 'module' });
    await new Promise((resolve, reject) => {
      voice.worker.onmessage = (ev) => { if (ev.data.type === 'ready') resolve(); else if (ev.data.type === 'error') reject(new Error(ev.data.message)); };
      voice.worker.onerror = (ev) => reject(new Error(ev.message || 'voice worker failed to start'));
      voice.worker.postMessage({ type: 'load', ...info });
    });
    voice.ready = true;
  })().catch((err) => { voice.loadP = null; if (voice.worker) { voice.worker.terminate(); voice.worker = null; } throw err; });
  return voice.loadP;
}
window.buddy.onVoiceModelProgress((pct) => say('Downloading voice model… ' + pct + '% 🎧', 8000));

function transcribe(audio) {
  return new Promise((resolve, reject) => {
    const id = ++voice.reqId;
    const onMsg = (ev) => {
      if (ev.data.id !== id) return;
      voice.worker.removeEventListener('message', onMsg);
      if (ev.data.type === 'text') resolve(ev.data.text); else reject(new Error(ev.data.message));
    };
    voice.worker.addEventListener('message', onMsg);
    voice.worker.postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
  });
}

// records from the mic (16 kHz mono) until you stop talking; resolves null if no speech was heard
async function recordUtterance() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = []; const rmsList = [];
  let spoke = false, silent = 0, thr = 0.02; const t0 = Date.now(), dur = 4096 / 16000;
  return new Promise((resolve) => {
    const finish = (heard) => {
      proc.onaudioprocess = null; try { proc.disconnect(); src.disconnect(); } catch {}
      stream.getTracks().forEach((t) => t.stop()); ctx.close();
      if (!heard) return resolve(null);
      const total = chunks.reduce((n, c) => n + c.length, 0), out = new Float32Array(total); let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      resolve(out);
    };
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d));
      let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const rms = Math.sqrt(s / d.length); rmsList.push(rms);
      if (rmsList.length === 3) thr = Math.max(0.018, Math.min(...rmsList) * 3 + 0.006); // learn the room's noise level
      if (rmsList.length > 3) { if (rms > thr) { spoke = true; silent = 0; } else if (spoke) silent += dur; }
      const el = (Date.now() - t0) / 1000;
      if (spoke && silent >= 1.0) finish(true);
      else if (!spoke && el > 6) finish(false);
      else if (el > 12) finish(spoke);
    };
    src.connect(proc); proc.connect(ctx.destination);
  });
}

const JUNK = /^(you|thank you\.?|thanks for watching\.?|bye\.?|\.+|the end\.?)$/i;
async function startVoice() {
  if (voice.busy) return; voice.busy = true; lastActive = Date.now();
  clearTimeout(voiceGuard); voiceGuard = setTimeout(endListening, 90000);
  try {
    if (!voice.ready) { setMood('think'); await initVoice(); }
    setMood('listen'); say('Listening… 🎤', 14000);
    const audio = await recordUtterance();
    if (!audio) { endListening(); say("I didn't hear anything 🙉 try again", 3000, 'sad'); return; }
    setMood('think'); say('Thinking… 💭', 20000);
    const text = await transcribe(audio);
    const clean = (text || '').replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
    endListening();
    if (!clean || JUNK.test(clean)) { say("I didn't catch that 🙉 try again", 3000, 'sad'); return; }
    const cmd = voiceNormalize(clean);
    say('🎤 “' + clean + '”', 1800, 'wow');
    setTimeout(() => runCommand(cmd), 1000);
  } catch (err) {
    endListening();
    const msg = /Permission|NotAllowed|denied/i.test(String(err.message)) ? 'Mic blocked: allow microphone access in Windows settings' : String(err.message).slice(0, 80);
    say("Voice problem: " + msg, 7000, 'sad');
  } finally { clearTimeout(voiceGuard); voice.busy = false; }
}
window.buddy.onVoiceStart(startVoice);
$('#micBtn').onclick = startVoice;
