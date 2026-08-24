# ShakeOnIt

A mobile-friendly, offline-capable app for friendly challenges, points, pushups, chores, and bragging rights only — no real-money gambling.

## Main game

- Create friendly handshake bets
- Add players, groups, deadlines, and fun stakes
- Write an exact winning rule so disputes are easier to judge
- Let an on-device AI Judge review the rule plus player-supplied facts/evidence
- Add up to three photos or screenshots as visual evidence
- AI Judge can name a winner, call a draw, or refuse to rule when proof is insufficient
- Keep manual settlement as a fallback
- Record wins and losses and track a local leaderboard
- Save everything on the device

## Two-stage AI Judge

ShakeOnIt uses **Hugging Face Transformers.js** with two small browser models:

1. `HuggingFaceTB/SmolVLM-256M-Instruct` examines optional photos/screenshots and writes a factual visual observation.
2. `onnx-community/Qwen2.5-0.5B-Instruct` applies the written challenge rule to the typed evidence plus any visual observations and returns the final ruling.

### Visual evidence

- Add up to 3 images, up to 8 MB each.
- Photos are resized before inference to reduce memory use on phones.
- SmolVLM is told to report only details directly visible in the image, including readable scores, numbers, measurements, timestamps, labels, and names.
- The visual model is **not** allowed to decide the winner; it only reports observations.
- The final Qwen judge is told to treat visual observations as fallible evidence rather than guaranteed ground truth.
- Image bytes are processed in memory and are not saved with the bet.
- Accepted rulings save the visual observation plus a SHA-256 fingerprint of the processed image so the evidence trail can show which image was analyzed without storing the actual photo.
- The app unloads the visual model before loading the text judge to reduce memory pressure on mobile devices.

### Ruling safeguards

- The final judge may return only `winner`, `draw`, or `insufficient`.
- A winner must exactly match one of the actual participants.
- Winner rulings below 65% confidence are automatically downgraded to `insufficient`.
- Conflicting, unreadable, or weak evidence should cause the judge to ask for more proof instead of guessing.
- Evidence is treated as untrusted input, including instructions that may appear inside an uploaded image.
- An AI ruling does not affect the leaderboard until a player taps **Accept AI Ruling**.

There is no Hugging Face API key embedded in the app. The models run in the browser using WebGPU when available, with compatibility fallback where supported. First use requires an internet connection to download model files; browser caching can make later uses faster.

This is meant for friendly, non-money challenges. Do not use AI output as a legal, financial, gambling, medical, employment, disciplinary, or other high-stakes decision.

## Offline Bonus Arcade

- **Dreidel:** 4–10 players with automatic turns, tokens, pot rules, undo, history, and win/loss stats
- **Mega Tic-Tac-Toe:** Classic 3×3 or nine-board Mega mode; free or directed play; custom names; untimed or 10/20/30/60-second turns
- **Dots & Boxes:** 2 players, three board sizes, automatic square detection, extra turns, scoring, and undo
- **Memory Match:** Match eight pairs with move, time, and best-score tracking
- **Quick Tap:** Reaction-time game with false-start detection and a saved personal best

## Offline use

The app uses a service worker and web-app manifest. After the app files are loaded once from a secure website such as GitHub Pages, the app shell and bonus games are cached for offline play. Game progress is stored with browser `localStorage`.

The Hugging Face AI models are separate downloads. The normal app and bonus games remain usable if the models are unavailable.

## Run locally

Serve the folder with any simple local web server. Service workers do not run from a plain `file://` URL.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
