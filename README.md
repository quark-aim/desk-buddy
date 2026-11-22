# Desk Buddy

A cute little desktop companion for Windows, built with Electron. It lives in a small rounded window that stays on top of your other apps, reacts to what you're doing, and helps you stay on track.

## Features

- **Expressive face** – glossy eyes, blush, breathing, and 20+ moods (happy, wink, love, excited, sleepy, sad, focused, cool, thinking, dizzy, ...), with floating emoji effects.
- **Reacts to your apps** – notices the active window and reacts differently to code editors, terminals, GitHub, browsers, YouTube, social media, games, meetings, design tools and more. Gives gentle nudges after long coding, scrolling or gaming sessions.
- **Pomodoro timer** – focus/break timer with a countdown chip on its face. During a focus session it nags you if you open distracting sites.
- **To-do list and reminders** – add tasks, tick them off, set reminders by clock time or "in N minutes".
- **Spotify / media control** – play/pause, next, previous and volume via Windows media keys (no login needed). Shows the current song from the Spotify window title.
- **Voice commands** – push-to-talk (`Ctrl+Alt+V` or the mic button) using OpenAI's Whisper model running fully offline on your PC (via transformers.js). The first use downloads a ~77 MB model once (needs internet that one time); after that no audio ever leaves your computer. Free, no API key.
- **Ask AI** – ask any question by typing in the 🤖 panel or by voice ("what is the capital of France?", "ask ChatGPT to explain ..."). Anything that isn't a command goes to the AI and the answer appears in the speech bubble (long answers open in the panel) and is read aloud. Works with any OpenAI-compatible chat API: Google Gemini and Groq have free keys, OpenRouter has free models, Ollama runs locally with no key, or use the paid OpenAI API. Pick the provider and paste your key in 🤖 ⚙. The key is stored encrypted on your PC (Windows DPAPI). Note: a ChatGPT account (free or Plus) does not include API access, so it can't be used directly.
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
- `play`, `pause`, `next`, `prev`, `mute`, `unmute`
- `volume 30` or `volume to 30` (exact system volume), `volume up 10`, `volume down 10` (or say "set the volume to thirty percent")
- `play <song or artist>` (voice or typed) opens a Spotify search
- `hide`, `quit`

## Notes

- Windows only: app detection and media keys use PowerShell and built-in Windows APIs. No native Node modules are needed.
- Voice: `npm install` copies the speech runtime into `voice/vendor/` (git-ignored). The default model is the fast one (`whisper-tiny.en`, ~43 MB, about 1.3 s per command); switch to the more accurate `whisper-base.en` (~77 MB, about 2.2 s) in 🤖 ⚙ → Voice model.
- Questions you ask the AI are sent to the provider you choose. Commands and voice recognition stay on your PC.
- Settings (to-dos, reminders, position) are saved in Electron's user data folder.
- To turn off start-with-Windows, untick it in the tray menu.

## Inspiration

Inspired by the Tabbie / Taby desktop-pet hardware projects, re-imagined as a desktop app.

## License

MIT, see [LICENSE](LICENSE).
