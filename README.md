# ShakeOnIt

A mobile-friendly, offline-capable app for friendly challenges, points, pushups, chores, and bragging rights only — no real-money gambling.

## Main game

- Create friendly handshake bets
- Add players, groups, deadlines, and fun stakes
- Record wins and losses automatically
- Track a local leaderboard
- Save everything on the device

## Offline Bonus Arcade

- **Dreidel:** 4–10 players with automatic turns, tokens, pot rules, undo, history, and win/loss stats
- **Mega Tic-Tac-Toe:** Classic 3×3 or nine-board Mega mode; free or directed play; custom names; untimed or 10/20/30/60-second turns
- **Dots & Boxes:** 2 players, three board sizes, automatic square detection, extra turns, scoring, and undo
- **Memory Match:** Match eight pairs with move, time, and best-score tracking
- **Quick Tap:** Reaction-time game with false-start detection and a saved personal best

## Offline use

The app uses a service worker and web-app manifest. After the files are loaded once from a secure website such as GitHub Pages, the app shell and games are cached for offline play. Game progress is stored with browser `localStorage`.

## Run locally

Serve the folder with any simple local web server. Service workers do not run from a plain `file://` URL.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
