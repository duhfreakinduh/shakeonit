# ShakeOnIt

A mobile-friendly, offline-capable app for friendly challenges, points, pushups, chores, and bragging rights only — no real-money gambling.

## Main game

- Create friendly handshake bets
- Add players, groups, deadlines, and fun stakes
- Write an exact winning rule so disputes are easier to judge
- Let an on-device AI Judge review the rule plus player-supplied facts/evidence
- AI Judge can name a winner, call a draw, or refuse to rule when proof is insufficient
- Keep manual settlement as a fallback
- Record wins and losses and track a local leaderboard
- Save everything on the device

## AI Judge

ShakeOnIt uses **Hugging Face Transformers.js** with `onnx-community/Qwen2.5-0.5B-Instruct`.

- The model runs in the browser; there is no Hugging Face API key embedded in the app.
- WebGPU is used when the browser supports it, with a browser/WASM fallback otherwise.
- The first AI use requires an internet connection to download the model files.
- The judge only interprets the challenge rule and the facts/evidence typed into the app. It does **not** browse the web or independently verify a real-world claim.
- The AI is instructed to return `winner`, `draw`, or `insufficient` and may only name one of the actual participants as winner.
- The app validates the returned winner before allowing the ruling to be accepted.
- An AI ruling does not affect the leaderboard until a player taps **Accept AI Ruling**.

This is meant for friendly, non-money challenges. Do not use AI output as a legal, financial, gambling, medical, employment, disciplinary, or other high-stakes decision.

## Offline Bonus Arcade

- **Dreidel:** 4–10 players with automatic turns, tokens, pot rules, undo, history, and win/loss stats
- **Mega Tic-Tac-Toe:** Classic 3×3 or nine-board Mega mode; free or directed play; custom names; untimed or 10/20/30/60-second turns
- **Dots & Boxes:** 2 players, three board sizes, automatic square detection, extra turns, scoring, and undo
- **Memory Match:** Match eight pairs with move, time, and best-score tracking
- **Quick Tap:** Reaction-time game with false-start detection and a saved personal best

## Offline use

The app uses a service worker and web-app manifest. After the files are loaded once from a secure website such as GitHub Pages, the app shell and games are cached for offline play. Game progress is stored with browser `localStorage`.

The AI model is a separate download from Hugging Face. The normal app and bonus games remain usable if the AI model is unavailable.

## Run locally

Serve the folder with any simple local web server. Service workers do not run from a plain `file://` URL.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
