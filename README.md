# Desk Buddy

A cute little desktop companion for Windows, built with Electron. It lives in a small rounded window that stays on top of your other apps, reacts to what you're doing, and helps you stay on track.

## Features

- **Expressive face** – glossy eyes, blush, breathing, and 20+ moods (happy, wink, love, excited, sleepy, sad, focused, cool, thinking, dizzy, ...), with floating emoji effects.
- **Reacts to your apps** – notices the active window and reacts differently to code editors, terminals, GitHub, browsers, YouTube, social media, games, meetings, design tools and more. Gives gentle nudges after long coding, scrolling or gaming sessions.
- **Pomodoro timer** – focus/break timer with a countdown chip on its face. During a focus session it nags you if you open distracting sites.
- **To-do list and reminders** – add tasks, tick them off, set reminders by clock time or "in N minutes".
- **Spotify / media control** – play/pause, next, previous and volume via Windows media keys (no login needed). Shows the current song from the Spotify window title.
- **Voice commands** – push-to-talk (`Ctrl+Alt+V` or the mic button) using OpenAI's Whisper model running fully offline on your PC (via transformers.js). The first use downloads a ~77 MB model once (needs internet that one time); after that no audio ever leaves your computer. Free, no API key.
- **Moves around** – drag it anywhere, or say/type `left`, `right`, `center`, `top`, `bottom` to slide it. The window size stays fixed.
- **Starts with Windows** – registers itself at login (toggle in the tray menu).
- **Interactive** – eyes follow your cursor, click to poke it, it falls asleep if ignored.

## Run it

Requires Node.js 18+ on Windows.

```powershell
npm install
npm start
```

## Build a Windows .exe

```powershell
npm install
npm run dist
```

This creates two files in `dist/`:

- `Desk-Buddy-Setup-<version>.exe` – one-click installer (recommended to share).
- `Desk-Buddy-Portable-<version>.exe` – single file, no install.

The app is not code-signed, so Windows SmartScreen may show "Windows protected your PC" the first time. Click **More info**, then **Run anyway**.

## Controls

| Action | How |
| --- | --- |
| Slide it | `Ctrl+Alt+←/→/↑/↓`, or type `left`/`right`/`top`/`bottom`/`center` |
| Show / hide | `Ctrl+Alt+H` or click the tray icon |
| Talk to it (type) | `Ctrl+Alt+Space` or the 💬 button |
| Talk to it (voice) | `Ctrl+Alt+V` or the 🎤 button |

### Text / voice commands

- `focus 25`, `break 5`, `stop`
- `todo buy milk`
- `remind stretch in 10m`, `remind call mom at 17:30`
- `play`, `pause`, `next`, `prev`, `volume up`, `volume down`, `mute`
- `hide`, `quit`

## Notes

- Windows only: app detection and media keys use PowerShell and built-in Windows APIs. No native Node modules are needed.
- Voice: `npm install` copies the speech runtime into `voice/vendor/` (git-ignored). To trade accuracy for speed, change `MODEL` in `main.js` from `whisper-base.en` to `whisper-tiny.en` (about twice as fast, slightly less accurate).
- Settings (to-dos, reminders, position) are saved in Electron's user data folder.
- To turn off start-with-Windows, untick it in the tray menu.

## Inspiration

Inspired by the Tabbie / Taby desktop-pet hardware projects, re-imagined as a desktop app.

## License

MIT, see [LICENSE](LICENSE).
