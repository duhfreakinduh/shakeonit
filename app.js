'use strict';

/* ShakeOnIt bonus arcade and remaining main-app behavior.
   This file intentionally uses only browser APIs so the app can run offline. */

const BONUS_STORAGE = {
  mega: 'shakeonit_mega_ttt_v1',
  dots: 'shakeonit_dots_boxes_v1',
  memoryBest: 'shakeonit_memory_best_v1',
  reactionBest: 'shakeonit_reaction_best_v1'
};

let bonusGame = 'hub';
let megaTimerId = null;
let memoryTimerId = null;
let reactionTimerId = null;
let reactionReadyAt = 0;
let reactionPhase = 'idle';
let memoryLock = false;

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureScore(name) {
  const clean = String(name || '').trim() || 'Player';
  if (!state.scores[clean]) state.scores[clean] = { wins: 0, losses: 0, points: 0 };
  return state.scores[clean];
}

/* ---------------- Main ShakeOnIt game ---------------- */

function renderHome() {
  const profileScore = getProfileScore();
  const groupBets = activeBets().filter(bet => bet.group === state.currentGroup);
  document.getElementById('tab-home').innerHTML = `
    <div class="hero">
      <div class="hero-emoji">👋</div>
      <h1>Welcome back, ${escapeHtml(state.profile.name)}!</h1>
      <p class="muted">Make friendly challenges, settle the result, and keep the bragging rights honest.</p>
    </div>
    <div class="stat-grid">
      <div class="stat"><strong>${activeBets().length}</strong><span>Active bets</span></div>
      <div class="stat"><strong>${profileScore.wins}</strong><span>Wins</span></div>
      <div class="stat"><strong>${profileScore.points}</strong><span>Points</span></div>
    </div>
    <div class="section-head"><h2>Your groups</h2><button class="ghost-btn" onclick="addGroup()">＋ Group</button></div>
    <div class="group-row">${state.groups.map(group => `<button class="chip ${group === state.currentGroup ? 'active' : ''}" onclick="switchGroup('${encodeURIComponent(group)}')">${escapeHtml(group)}</button>`).join('')}</div>
    <div class="section-head"><h2>${escapeHtml(state.currentGroup)}</h2><button class="ghost-btn" onclick="showTab('bets')">See all</button></div>
    <div class="stack">${groupBets.length ? groupBets.slice(0, 4).map(betCard).join('') : emptyState('No active bets in this group yet.', 'Create a new bet to get the crew started.')}</div>
    <div class="section-head"><h2>Offline Bonus Arcade</h2><button class="ghost-btn" onclick="showTab('bonus')">Open arcade</button></div>
    <div class="arcade-preview" onclick="showTab('bonus')" role="button" tabindex="0">
      <div class="arcade-preview-icons">🌀 ✕ ◻️ 🧠 ⚡</div>
      <div><strong>Five games built in</strong><span>Dreidel, Mega Tic-Tac-Toe, Dots &amp; Boxes, Memory Match, and Quick Tap.</span></div>
    </div>`;
}

function openNewBet() {
  const groupSelect = document.getElementById('betGroupInput');
  groupSelect.innerHTML = state.groups.map(group => `<option ${group === state.currentGroup ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('');
  document.getElementById('betPlayersInput').value = `${state.profile.name}, `;
  document.getElementById('newBetModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('betTitleInput').focus(), 40);
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function backdropClose(event, id) {
  if (event.target.id === id) closeModal(id);
}

function selectBetType(button) {
  document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  selectedBetType = button.dataset.type;
}

function createBet(event) {
  event.preventDefault();
  const title = document.getElementById('betTitleInput').value.trim();
  const stakes = document.getElementById('betStakesInput').value.trim() || 'Bragging rights';
  const group = document.getElementById('betGroupInput').value;
  const deadline = document.getElementById('betDeadlineInput').value;
  const rawPlayers = document.getElementById('betPlayersInput').value
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  const participants = [...new Set(rawPlayers.length ? rawPlayers : [state.profile.name, 'Friend'])];

  participants.forEach(ensureScore);
  state.bets.unshift({
    id: Date.now(),
    title,
    type: selectedBetType,
    stakes,
    status: 'active',
    participants,
    deadline,
    group,
    result: null,
    createdAt: Date.now()
  });
  state.currentGroup = group;
  saveState();
  closeModal('newBetModal');
  event.target.reset();
  document.getElementById('betStakesInput').value = 'Bragging rights + 10 pushups';
  toast('Bet added. Shake on it!');
  showTab('bets');
}

function openBetDetail(id) {
  const bet = state.bets.find(item => Number(item.id) === Number(id));
  if (!bet) return;
  const settled = bet.status !== 'active';
  document.getElementById('detailSheet').innerHTML = `
    <div class="modal-head">
      <div><div class="eyebrow">${escapeHtml(bet.group)}</div><h2 style="margin:3px 0 0">${escapeHtml(bet.title)}</h2></div>
      <button class="icon-btn" onclick="closeModal('detailModal')" aria-label="Close">✕</button>
    </div>
    <div class="modal-body">
      <div class="card">
        <div class="detail-row"><span>Stakes</span><strong>${escapeHtml(bet.stakes)}</strong></div>
        <div class="divider"></div>
        <div class="detail-row"><span>Players</span><strong>${bet.participants.map(escapeHtml).join(', ')}</strong></div>
        <div class="divider"></div>
        <div class="detail-row"><span>Deadline</span><strong>${escapeHtml(bet.deadline)}</strong></div>
      </div>
      ${settled ? `
        <div class="result-box" style="margin-top:14px">
          <strong>${bet.result === 'win' ? '🏆 You marked this as a win.' : 'Good game — this one is settled.'}</strong>
          <span class="muted small">The result is saved on this device.</span>
        </div>` : `
        <div class="section-head"><h2>Settle the bet</h2></div>
        <div class="action-grid">
          <button class="primary-btn" onclick="settleBet(${Number(bet.id)}, 'win')">I won ＋50</button>
          <button class="secondary-btn" onclick="settleBet(${Number(bet.id)}, 'lose')">I lost</button>
        </div>`}
      <button class="danger-btn full" style="margin-top:12px" onclick="deleteBet(${Number(bet.id)})">Delete bet</button>
    </div>`;
  document.getElementById('detailModal').classList.remove('hidden');
}

function settleBet(id, outcome) {
  const bet = state.bets.find(item => Number(item.id) === Number(id));
  if (!bet || bet.status !== 'active') return;
  const score = ensureScore(state.profile.name);
  if (outcome === 'win') {
    score.wins += 1;
    score.points += 50;
  } else {
    score.losses += 1;
  }
  bet.status = 'settled';
  bet.result = outcome;
  saveState();
  closeModal('detailModal');
  toast(outcome === 'win' ? 'Win recorded: +50 points.' : 'Loss recorded. Next challenge!');
  renderCurrentTab();
}

function deleteBet(id) {
  state.bets = state.bets.filter(item => Number(item.id) !== Number(id));
  saveState();
  closeModal('detailModal');
  toast('Bet deleted.');
  renderCurrentTab();
}

function addGroup() {
  const name = prompt('Name the new group:');
  if (!name) return;
  const clean = name.trim().slice(0, 40);
  if (!clean) return;
  if (!state.groups.includes(clean)) state.groups.push(clean);
  state.currentGroup = clean;
  saveState();
  renderHome();
}

function switchGroup(encodedName) {
  state.currentGroup = decodeURIComponent(encodedName);
  saveState();
  renderHome();
}

function renderScoreboard() {
  const rows = Object.entries(state.scores)
    .sort(([, a], [, b]) => b.points - a.points || b.wins - a.wins);
  document.getElementById('tab-score').innerHTML = `
    <div class="section-head" style="margin-top:4px">
      <div><div class="eyebrow">Bragging rights</div><h1 style="margin:4px 0 0">Leaderboard</h1></div>
    </div>
    <div class="stack">${rows.map(([name, score], index) => `
      <div class="card score-row">
        <div class="score-person"><div class="rank">${index < 3 ? ['🥇','🥈','🥉'][index] : index + 1}</div><div><div class="score-name">${escapeHtml(name)}</div><div class="muted small">${score.wins} wins • ${score.losses} losses</div></div></div>
        <div><div class="points">${score.points}</div><div class="muted small" style="text-align:right">points</div></div>
      </div>`).join('')}</div>`;
}

function renderProfile() {
  const score = getProfileScore();
  document.getElementById('tab-me').innerHTML = `
    <div class="hero">
      <div class="profile-avatar">🧔</div>
      <h1>${escapeHtml(state.profile.name)}</h1>
      <p class="muted">${score.wins} wins • ${score.losses} losses • ${score.points} points</p>
    </div>
    <div class="card form-grid">
      <label>Your display name
        <input id="profileNameInput" maxlength="30" value="${escapeHtml(state.profile.name)}">
      </label>
      <button class="primary-btn full" onclick="saveProfileName()">Save name</button>
    </div>
    <div class="card" style="margin-top:14px">
      <h2>Offline data</h2>
      <p class="muted">Bets, scores, and game progress stay on this device. No account or internet connection is required after the app files are cached.</p>
      <button class="danger-btn full" onclick="resetAllLocalData()">Reset all saved data</button>
    </div>`;
}

function saveProfileName() {
  const oldName = state.profile.name;
  const newName = document.getElementById('profileNameInput').value.trim().slice(0, 30);
  if (!newName) return toast('Enter a name first.');
  if (oldName !== newName) {
    const oldScore = state.scores[oldName] || { wins: 0, losses: 0, points: 0 };
    const newScore = state.scores[newName] || { wins: 0, losses: 0, points: 0 };
    state.scores[newName] = {
      wins: oldScore.wins + newScore.wins,
      losses: oldScore.losses + newScore.losses,
      points: oldScore.points + newScore.points
    };
    if (oldName !== newName) delete state.scores[oldName];
    state.bets.forEach(bet => {
      bet.participants = bet.participants.map(name => name === oldName ? newName : name);
    });
    state.profile.name = newName;
  }
  saveState();
  toast('Name saved.');
  renderProfile();
}

function resetAllLocalData() {
  if (!confirm('Erase all ShakeOnIt bets, scores, and bonus-game progress on this device?')) return;
  Object.values(BONUS_STORAGE).forEach(key => localStorage.removeItem(key));
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('shakeonit_bets');
  localStorage.removeItem('shakeonit_scores');
  location.reload();
}

/* ---------------- Bonus arcade hub ---------------- */

function renderBonus() {
  const root = document.getElementById('tab-bonus');
  if (bonusGame === 'hub') return renderBonusHub(root);
  if (bonusGame === 'dreidel') return renderDreidel(root);
  if (bonusGame === 'mega') return renderMega(root);
  if (bonusGame === 'dots') return renderDots(root);
  if (bonusGame === 'memory') return renderMemory(root);
  if (bonusGame === 'reaction') return renderReaction(root);
}

function renderBonusHub(root) {
  clearMegaTimer();
  clearReactionTimer();
  root.innerHTML = `
    <div class="arcade-head">
      <div class="eyebrow">Works offline</div>
      <h1>Bonus Arcade</h1>
      <p class="muted">Quick games for family, friends, road trips, waiting rooms, or passing time.</p>
    </div>
    <div class="game-grid">
      ${gameCard('dreidel','🌀','Dreidel','4–10 players','Automatic tokens and plain-English results.')}
      ${gameCard('mega','✕','Mega Tic-Tac-Toe','2 players','Classic 3×3 or nine-board Mega mode.')}
      ${gameCard('dots','◻️','Dots & Boxes','2 players','Draw lines, close squares, and keep the turn.')}
      ${gameCard('memory','🧠','Memory Match','1 player','Flip cards and match all eight pairs.')}
      ${gameCard('reaction','⚡','Quick Tap','1 player','Wait for GO, then test your reaction time.')}
    </div>`;
}

function gameCard(key, icon, title, players, description) {
  return `<button class="game-card" onclick="showBonusGame('${key}')">
    <span class="game-icon">${icon}</span>
    <span class="game-copy"><strong>${title}</strong><small>${players}</small><span>${description}</span></span>
    <span class="game-arrow">›</span>
  </button>`;
}

function showBonusGame(game) {
  bonusGame = game;
  renderBonus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function arcadeBack() {
  bonusGame = 'hub';
  renderBonus();
}

function bonusHeader(title, subtitle, icon) {
  return `<div class="game-title-row">
    <button class="icon-btn" onclick="arcadeBack()" aria-label="Back to bonus games">←</button>
    <div><div class="eyebrow">Bonus game</div><h1>${icon} ${title}</h1><p class="muted">${subtitle}</p></div>
  </div>`;
}

/* ---------------- Dreidel ---------------- */

function normalizeDreidel() {
  if (!state.dreidel) state.dreidel = deepCopy(defaultState.dreidel);
  state.dreidel.players = Array.isArray(state.dreidel.players) ? state.dreidel.players : [];
  state.dreidel.history = Array.isArray(state.dreidel.history) ? state.dreidel.history : [];
  state.dreidel.stats = state.dreidel.stats || {};
}

function renderDreidel(root) {
  normalizeDreidel();
  const game = state.dreidel;
  if (!game.setupComplete) {
    root.innerHTML = `${bonusHeader('Dreidel','Tap to spin. The app handles the pot and turns.','🌀')}
      <div class="card form-grid">
        <label>Number of players
          <select id="dreidelCount" onchange="renderDreidelNameInputs()">
            ${Array.from({length:7},(_,i)=>i+4).map(n=>`<option ${n===4?'selected':''}>${n}</option>`).join('')}
          </select>
        </label>
        <label>Starting tokens per player
          <select id="dreidelTokens">${[5,10,15,20].map(n=>`<option ${n===10?'selected':''}>${n}</option>`).join('')}</select>
        </label>
        <div id="dreidelNames" class="player-inputs"></div>
        <button class="primary-btn full" onclick="startDreidel()">Start game</button>
      </div>
      <div class="card" style="margin-top:14px">${dreidelRules()}</div>`;
    renderDreidelNameInputs();
    return;
  }

  const current = game.players[game.turn] || game.players[0];
  const last = game.lastResult;
  root.innerHTML = `${bonusHeader('Dreidel','Last player with tokens wins.','🌀')}
    ${game.champion ? `
      <div class="card winner"><div class="trophy">🏆</div><h1>${escapeHtml(game.champion)} wins!</h1><p>Champion of this Dreidel round.</p><button class="primary-btn full" onclick="resetDreidel()">Play again</button></div>` : `
      <div class="dreidel-board">
        <div class="card turn-card"><div class="eyebrow">Current turn</div><h2>${escapeHtml(current?.name || 'Player')}</h2><div class="pot-pill">🪙 Pot: ${game.pot}</div></div>
        <button class="dreidel-button ${dreidelSpinning ? 'spinning' : ''}" onclick="spinDreidel()" ${dreidelSpinning ? 'disabled' : ''} aria-label="Spin the dreidel">
          <span class="dreidel-handle"></span><span class="dreidel-shape"><span class="dreidel-letter">${last?.letter || 'ש'}</span></span>
        </button>
        <div class="tap-label">Tap the dreidel to spin</div>
        <div class="result-box" aria-live="polite">
          ${last ? `<strong>${last.letter} ${last.name}</strong><span>${escapeHtml(last.message)}</span>` : `<strong>Ready to spin</strong><span>${escapeHtml(current?.name || 'Player')}, tap the dreidel.</span>`}
        </div>
        <div class="player-board">${game.players.map((player,index)=>`
          <div class="player-tile ${index===game.turn?'current':''} ${player.tokens<=0?'out':''}">
            <div class="name">${escapeHtml(player.name)}</div>
            <div class="token-count">🪙 ${player.tokens}</div>
            ${player.tokens<=0?'<div class="out-label">Out</div>':''}
          </div>`).join('')}</div>
        <div class="action-grid">
          <button class="secondary-btn" onclick="undoDreidel()" ${dreidelUndo ? '' : 'disabled'}>↶ Undo spin</button>
          <button class="danger-btn" onclick="resetDreidel()">New game</button>
        </div>
        <details class="card"><summary>Rules in plain English</summary>${dreidelRules()}</details>
        <details class="card"><summary>Spin history (${game.history.length})</summary><div class="history">${game.history.slice().reverse().map(item=>`<div class="history-item">${escapeHtml(item)}</div>`).join('') || '<div class="muted small">No spins yet.</div>'}</div></details>
      </div>`}`;
}

function renderDreidelNameInputs() {
  const count = Number(document.getElementById('dreidelCount')?.value || 4);
  const wrap = document.getElementById('dreidelNames');
  if (!wrap) return;
  wrap.innerHTML = Array.from({length: count}, (_, index) => `
    <label>Player ${index + 1}<input class="dreidel-name" maxlength="24" value="${index===0?escapeHtml(state.profile.name):`Player ${index + 1}`}"></label>`).join('');
}

function startDreidel() {
  const names = [...document.querySelectorAll('.dreidel-name')].map((input,index)=>input.value.trim() || `Player ${index+1}`);
  const unique = names.map((name,index) => names.indexOf(name) === index ? name : `${name} ${index + 1}`);
  const tokens = Number(document.getElementById('dreidelTokens').value);
  const players = unique.map(name => ({ name, tokens: Math.max(0, tokens - 1) }));
  state.dreidel = {
    setupComplete: true,
    startingTokens: tokens,
    players,
    turn: 0,
    pot: players.length,
    history: [`Everyone puts 1 token in the pot. Pot starts at ${players.length}.`],
    lastResult: null,
    champion: null,
    stats: state.dreidel.stats || {}
  };
  unique.forEach(name => {
    if (!state.dreidel.stats[name]) state.dreidel.stats[name] = { wins: 0, losses: 0, spins: 0 };
  });
  saveState();
  renderBonus();
}

function dreidelRules() {
  return `<ul class="rules-list">
    <li><strong>Nun (נ):</strong> Nothing happens.</li>
    <li><strong>Gimel (ג):</strong> Take every token in the pot. Then each player still in the game puts 1 token back in.</li>
    <li><strong>Hey (ה):</strong> Take half the pot, rounded up.</li>
    <li><strong>Shin (ש):</strong> Put 1 token into the pot.</li>
    <li>A player with no tokens is out. The last player with tokens wins.</li>
  </ul>`;
}

function spinDreidel() {
  const game = state.dreidel;
  if (dreidelSpinning || game.champion) return;
  const current = game.players[game.turn];
  if (!current || current.tokens <= 0) {
    advanceDreidelTurn();
    renderBonus();
    return;
  }
  dreidelUndo = deepCopy(game);
  dreidelSpinning = true;
  renderBonus();
  setTimeout(() => {
    const side = DREIDEL_SIDES[Math.floor(Math.random() * DREIDEL_SIDES.length)];
    let message = '';
    if (side.key === 'nun') {
      message = `${current.name} keeps the same number of tokens.`;
    } else if (side.key === 'gimel') {
      const taken = game.pot;
      current.tokens += taken;
      game.pot = 0;
      message = `${current.name} takes all ${taken} token${taken === 1 ? '' : 's'} from the pot.`;
      game.players.forEach(player => {
        if (player.tokens > 0) {
          player.tokens -= 1;
          game.pot += 1;
        }
      });
      message += ` Everyone still in puts 1 token back in.`;
    } else if (side.key === 'hey') {
      const taken = Math.ceil(game.pot / 2);
      current.tokens += taken;
      game.pot -= taken;
      message = `${current.name} takes half the pot: ${taken} token${taken === 1 ? '' : 's'}.`;
    } else {
      if (current.tokens > 0) {
        current.tokens -= 1;
        game.pot += 1;
        message = `${current.name} puts 1 token into the pot.`;
      } else {
        message = `${current.name} has no token to add and is out.`;
      }
    }
    game.stats[current.name] = game.stats[current.name] || { wins: 0, losses: 0, spins: 0 };
    game.stats[current.name].spins += 1;
    game.lastResult = { ...side, message };
    game.history.push(`${current.name}: ${side.name} — ${message}`);
    checkDreidelWinner();
    if (!game.champion) advanceDreidelTurn();
    dreidelSpinning = false;
    saveState();
    renderBonus();
  }, 760);
}

function advanceDreidelTurn() {
  const game = state.dreidel;
  if (!game.players.length) return;
  for (let tries = 0; tries < game.players.length; tries += 1) {
    game.turn = (game.turn + 1) % game.players.length;
    if (game.players[game.turn].tokens > 0) return;
  }
}

function checkDreidelWinner() {
  const game = state.dreidel;
  const active = game.players.filter(player => player.tokens > 0);
  if (active.length === 1) {
    game.champion = active[0].name;
    game.stats[active[0].name] = game.stats[active[0].name] || { wins: 0, losses: 0, spins: 0 };
    game.stats[active[0].name].wins += 1;
    game.players.filter(player => player.name !== active[0].name).forEach(player => {
      game.stats[player.name] = game.stats[player.name] || { wins: 0, losses: 0, spins: 0 };
      game.stats[player.name].losses += 1;
    });
  }
}

function undoDreidel() {
  if (!dreidelUndo) return;
  state.dreidel = dreidelUndo;
  dreidelUndo = null;
  saveState();
  renderBonus();
}

function resetDreidel() {
  if (state.dreidel.setupComplete && !confirm('Start a new Dreidel game?')) return;
  state.dreidel = { ...deepCopy(defaultState.dreidel), stats: state.dreidel.stats || {} };
  dreidelUndo = null;
  saveState();
  renderBonus();
}

/* ---------------- Mega Tic-Tac-Toe ---------------- */

function defaultMegaState() {
  return {
    setupComplete: false,
    mode: 'mega',
    routing: 'free',
    timer: 0,
    playerNames: ['Player X', 'Player O'],
    turn: 'X',
    board: Array(81).fill(''),
    smallStatus: Array(9).fill(''),
    directedBoard: null,
    winner: '',
    draw: false,
    scores: { X: 0, O: 0, draws: 0 },
    history: []
  };
}

let megaState = readJson(BONUS_STORAGE.mega, defaultMegaState());
let megaSeconds = megaState.timer || 0;

function saveMega() {
  writeJson(BONUS_STORAGE.mega, megaState);
}

function renderMega(root) {
  if (!megaState.setupComplete) return renderMegaSetup(root);
  root.innerHTML = `${bonusHeader('Mega Tic-Tac-Toe','Classic 3×3 or nine boards inside one big board.','✕')}
    <div class="sketch-panel">
      <div class="mega-topline">
        <div><span class="marker ${megaState.turn === 'X' ? 'xmark' : 'omark'}">${megaState.turn}</span> <strong>${escapeHtml(megaPlayerName(megaState.turn))}'s turn</strong></div>
        <div class="mega-score">${escapeHtml(megaState.playerNames[0])} ${megaState.scores.X} — ${megaState.scores.O} ${escapeHtml(megaState.playerNames[1])}</div>
      </div>
      ${megaState.timer ? `<div class="timer-strip"><span>Turn timer</span><strong id="megaTimerReadout">${megaSeconds}s</strong></div>` : ''}
      ${megaState.winner || megaState.draw ? `<div class="sketch-result">${megaState.draw ? 'It is a draw!' : `🏆 ${escapeHtml(megaPlayerName(megaState.winner))} wins the round!`}</div>` : ''}
      ${megaState.mode === 'classic' ? renderClassicBoard() : renderMegaBoard()}
      <div class="mega-help">${megaInstruction()}</div>
      <div class="action-grid">
        <button class="secondary-btn" onclick="undoMega()" ${megaState.history.length ? '' : 'disabled'}>↶ Undo</button>
        <button class="primary-btn" onclick="newMegaRound()">New round</button>
      </div>
      <button class="ghost-btn full" style="margin-top:10px" onclick="changeMegaSettings()">Settings</button>
    </div>`;
  startMegaTimer();
}

function renderMegaSetup(root) {
  clearMegaTimer();
  root.innerHTML = `${bonusHeader('Mega Tic-Tac-Toe','Two players. Customize the board and turn rules.','✕')}
    <div class="sketch-panel form-grid">
      <div class="doodle-title">Choose your game</div>
      <label>Board style
        <select id="megaMode" onchange="updateMegaSetupVisibility()">
          <option value="classic">Classic 3×3</option>
          <option value="mega" selected>Mega nine-board</option>
        </select>
      </label>
      <div id="megaRoutingWrap">
        <label>Move rule
          <select id="megaRouting">
            <option value="free" selected>Free play — choose any open square</option>
            <option value="directed">Directed play — your square sends the other player</option>
          </select>
        </label>
      </div>
      <div class="two-col">
        <label>Player X<input id="megaPlayerX" maxlength="20" value="${escapeHtml(megaState.playerNames?.[0] || 'Player X')}"></label>
        <label>Player O<input id="megaPlayerO" maxlength="20" value="${escapeHtml(megaState.playerNames?.[1] || 'Player O')}"></label>
      </div>
      <label>Turn timing
        <select id="megaTimer">
          <option value="0">Untimed</option>
          <option value="10">Speed Mode — 10 seconds</option>
          <option value="20">Speed Mode — 20 seconds</option>
          <option value="30">Speed Mode — 30 seconds</option>
          <option value="60">Speed Mode — 60 seconds</option>
        </select>
      </label>
      <button class="primary-btn full" onclick="startMegaGame()">Start game</button>
      <details><summary>How Mega mode works</summary><p class="muted small">Win three small boards in a row to win the big board. In Directed Play, the square you choose sends your opponent to the matching small board. If that board is already finished, they may play anywhere.</p></details>
    </div>`;
  updateMegaSetupVisibility();
}

function updateMegaSetupVisibility() {
  const mode = document.getElementById('megaMode')?.value;
  document.getElementById('megaRoutingWrap')?.classList.toggle('hidden', mode !== 'mega');
}

function startMegaGame() {
  const mode = document.getElementById('megaMode').value;
  const timer = Number(document.getElementById('megaTimer').value);
  const existingScores = megaState.scores || { X: 0, O: 0, draws: 0 };
  megaState = {
    ...defaultMegaState(),
    setupComplete: true,
    mode,
    routing: mode === 'mega' ? document.getElementById('megaRouting').value : 'free',
    timer,
    playerNames: [
      document.getElementById('megaPlayerX').value.trim() || 'Player X',
      document.getElementById('megaPlayerO').value.trim() || 'Player O'
    ],
    board: Array(mode === 'classic' ? 9 : 81).fill(''),
    scores: existingScores
  };
  megaSeconds = timer;
  saveMega();
  renderBonus();
}

function renderClassicBoard() {
  return `<div class="classic-board">${megaState.board.map((mark,index)=>`
    <button class="classic-cell ${mark ? `owned-${mark.toLowerCase()}` : ''}" onclick="playMegaCell(${index})" ${mark || megaState.winner || megaState.draw ? 'disabled' : ''}>${mark}</button>`).join('')}</div>`;
}

function renderMegaBoard() {
  return `<div class="mega-board">${Array.from({length:9},(_,boardIndex)=>{
    const status = megaState.smallStatus[boardIndex];
    const allowed = megaBoardAllowed(boardIndex);
    return `<div class="small-board ${allowed ? 'allowed' : ''} ${status ? 'finished' : ''}">
      ${status ? `<div class="small-winner ${status === 'D' ? 'drawn' : ''}">${status === 'D' ? '—' : status}</div>` : ''}
      ${Array.from({length:9},(_,cellIndex)=>{
        const globalIndex = boardIndex * 9 + cellIndex;
        const mark = megaState.board[globalIndex];
        return `<button class="mega-cell ${mark ? `owned-${mark.toLowerCase()}` : ''}" onclick="playMegaCell(${globalIndex})" ${mark || status || !allowed || megaState.winner || megaState.draw ? 'disabled' : ''}>${mark}</button>`;
      }).join('')}
    </div>`;
  }).join('')}</div>`;
}

function megaBoardAllowed(boardIndex) {
  if (megaState.mode !== 'mega') return true;
  if (megaState.routing === 'free') return !megaState.smallStatus[boardIndex];
  if (megaState.directedBoard === null || megaState.smallStatus[megaState.directedBoard]) return !megaState.smallStatus[boardIndex];
  return boardIndex === megaState.directedBoard;
}

function playMegaCell(index) {
  if (megaState.winner || megaState.draw || megaState.board[index]) return;
  if (megaState.mode === 'mega' && !megaBoardAllowed(Math.floor(index / 9))) return;
  megaState.history.push({
    board: [...megaState.board],
    smallStatus: [...megaState.smallStatus],
    turn: megaState.turn,
    directedBoard: megaState.directedBoard,
    winner: megaState.winner,
    draw: megaState.draw,
    scores: { ...megaState.scores }
  });
  megaState.board[index] = megaState.turn;

  if (megaState.mode === 'classic') {
    const result = boardResult(megaState.board);
    if (result === 'X' || result === 'O') finishMegaRound(result);
    else if (result === 'D') finishMegaRound('D');
    else switchMegaTurn();
  } else {
    const smallIndex = Math.floor(index / 9);
    const localBoard = megaState.board.slice(smallIndex * 9, smallIndex * 9 + 9);
    const smallResult = boardResult(localBoard);
    if (smallResult) megaState.smallStatus[smallIndex] = smallResult;

    const bigResult = boardResult(megaState.smallStatus.map(value => value === 'D' ? '' : value));
    const allFinished = megaState.smallStatus.every(Boolean);
    if (bigResult === 'X' || bigResult === 'O') finishMegaRound(bigResult);
    else if (allFinished) finishMegaRound('D');
    else {
      megaState.directedBoard = megaState.routing === 'directed' ? index % 9 : null;
      switchMegaTurn();
    }
  }
  saveMega();
  renderBonus();
}

function boardResult(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'D' : '';
}

function switchMegaTurn() {
  megaState.turn = megaState.turn === 'X' ? 'O' : 'X';
  megaSeconds = megaState.timer;
}

function finishMegaRound(result) {
  if (result === 'D') {
    megaState.draw = true;
    megaState.scores.draws += 1;
  } else {
    megaState.winner = result;
    megaState.scores[result] += 1;
  }
  clearMegaTimer();
}

function megaPlayerName(mark) {
  return mark === 'X' ? megaState.playerNames[0] : megaState.playerNames[1];
}

function megaInstruction() {
  if (megaState.winner || megaState.draw) return 'Start a new round when you are ready.';
  if (megaState.mode === 'classic') return 'Get three marks in a row.';
  if (megaState.routing === 'free') return 'Free play: choose any open square in any unfinished small board.';
  if (megaState.directedBoard === null || megaState.smallStatus[megaState.directedBoard]) return 'The target board is finished, so choose any open square.';
  return `Directed play: choose a square inside small board ${megaState.directedBoard + 1}.`;
}

function undoMega() {
  const previous = megaState.history.pop();
  if (!previous) return;
  const currentScores = megaState.scores;
  Object.assign(megaState, previous);
  megaState.scores = previous.scores || currentScores;
  megaSeconds = megaState.timer;
  saveMega();
  renderBonus();
}

function newMegaRound() {
  const scores = megaState.scores;
  const settings = {
    setupComplete: true,
    mode: megaState.mode,
    routing: megaState.routing,
    timer: megaState.timer,
    playerNames: [...megaState.playerNames]
  };
  megaState = { ...defaultMegaState(), ...settings, board: Array(settings.mode === 'classic' ? 9 : 81).fill(''), scores };
  megaSeconds = megaState.timer;
  saveMega();
  renderBonus();
}

function changeMegaSettings() {
  clearMegaTimer();
  megaState.setupComplete = false;
  saveMega();
  renderBonus();
}

function startMegaTimer() {
  clearMegaTimer();
  if (!megaState.timer || megaState.winner || megaState.draw) return;
  if (!megaSeconds || megaSeconds > megaState.timer) megaSeconds = megaState.timer;
  const readout = document.getElementById('megaTimerReadout');
  if (readout) readout.textContent = `${megaSeconds}s`;
  megaTimerId = setInterval(() => {
    megaSeconds -= 1;
    const el = document.getElementById('megaTimerReadout');
    if (el) el.textContent = `${Math.max(megaSeconds, 0)}s`;
    if (megaSeconds <= 0) {
      clearMegaTimer();
      megaState.history.push({
        board: [...megaState.board],
        smallStatus: [...megaState.smallStatus],
        turn: megaState.turn,
        directedBoard: megaState.directedBoard,
        winner: megaState.winner,
        draw: megaState.draw,
        scores: { ...megaState.scores }
      });
      switchMegaTurn();
      saveMega();
      toast('Time ran out. Turn passed automatically.');
      renderBonus();
    }
  }, 1000);
}

function clearMegaTimer() {
  clearInterval(megaTimerId);
  megaTimerId = null;
}

/* ---------------- Dots & Boxes ---------------- */

function defaultDotsState(size = 4) {
  return {
    setupComplete: false,
    size,
    players: ['Player 1', 'Player 2'],
    turn: 0,
    h: Array(size * (size - 1)).fill(-1),
    v: Array((size - 1) * size).fill(-1),
    boxes: Array((size - 1) * (size - 1)).fill(-1),
    scores: [0, 0],
    gameOver: false,
    history: []
  };
}

let dotsState = readJson(BONUS_STORAGE.dots, defaultDotsState());

function saveDots() {
  writeJson(BONUS_STORAGE.dots, dotsState);
}

function renderDots(root) {
  if (!dotsState.setupComplete) {
    root.innerHTML = `${bonusHeader('Dots & Boxes','Draw one line. Complete a square to score and go again.','◻️')}
      <div class="card form-grid">
        <div class="two-col">
          <label>Player 1<input id="dotsP1" maxlength="20" value="${escapeHtml(dotsState.players?.[0] || 'Player 1')}"></label>
          <label>Player 2<input id="dotsP2" maxlength="20" value="${escapeHtml(dotsState.players?.[1] || 'Player 2')}"></label>
        </div>
        <label>Board size
          <select id="dotsSize"><option value="4">4×4 dots — quick</option><option value="5">5×5 dots — longer</option><option value="6">6×6 dots — big game</option></select>
        </label>
        <button class="primary-btn full" onclick="startDots()">Start game</button>
      </div>
      <div class="card" style="margin-top:14px"><h2>How to play</h2><p class="muted">Players take turns drawing one line between neighboring dots. Close the fourth side of a box to claim it and take another turn. Most boxes wins.</p></div>`;
    return;
  }

  root.innerHTML = `${bonusHeader('Dots & Boxes','Close more squares than your opponent.','◻️')}
    <div class="dots-status">
      <div class="dot-player ${dotsState.turn===0?'active':''}"><span class="puck p0"></span><strong>${escapeHtml(dotsState.players[0])}</strong><b>${dotsState.scores[0]}</b></div>
      <div class="dot-player ${dotsState.turn===1?'active':''}"><span class="puck p1"></span><strong>${escapeHtml(dotsState.players[1])}</strong><b>${dotsState.scores[1]}</b></div>
    </div>
    ${dotsState.gameOver ? `<div class="sketch-result">${dotsWinnerText()}</div>` : `<p class="muted small" style="text-align:center">${escapeHtml(dotsState.players[dotsState.turn])}, draw a line.</p>`}
    ${renderDotsBoard()}
    <div class="action-grid">
      <button class="secondary-btn" onclick="undoDots()" ${dotsState.history.length?'':'disabled'}>↶ Undo</button>
      <button class="primary-btn" onclick="newDotsRound()">New round</button>
    </div>
    <button class="ghost-btn full" style="margin-top:10px" onclick="changeDotsSettings()">Settings</button>`;
}

function startDots() {
  const size = Number(document.getElementById('dotsSize').value);
  dotsState = defaultDotsState(size);
  dotsState.setupComplete = true;
  dotsState.players = [
    document.getElementById('dotsP1').value.trim() || 'Player 1',
    document.getElementById('dotsP2').value.trim() || 'Player 2'
  ];
  saveDots();
  renderBonus();
}

function renderDotsBoard() {
  const n = dotsState.size;
  const parts = [`<div class="dots-board" style="--dots:${n}">`];

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      parts.push(`<span class="board-dot" style="left:${(col/(n-1))*100}%;top:${(row/(n-1))*100}%"></span>`);
    }
  }

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n - 1; col += 1) {
      const index = row * (n - 1) + col;
      const owner = dotsState.h[index];
      parts.push(`<button class="edge h-edge ${owner>=0?`p${owner}`:''}" style="left:${(col/(n-1))*100}%;top:${(row/(n-1))*100}%;width:${100/(n-1)}%" onclick="drawDotsEdge('h',${index})" ${owner>=0||dotsState.gameOver?'disabled':''} aria-label="Draw horizontal line"></button>`);
    }
  }

  for (let row = 0; row < n - 1; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const index = row * n + col;
      const owner = dotsState.v[index];
      parts.push(`<button class="edge v-edge ${owner>=0?`p${owner}`:''}" style="left:${(col/(n-1))*100}%;top:${(row/(n-1))*100}%;height:${100/(n-1)}%" onclick="drawDotsEdge('v',${index})" ${owner>=0||dotsState.gameOver?'disabled':''} aria-label="Draw vertical line"></button>`);
    }
  }

  for (let row = 0; row < n - 1; row += 1) {
    for (let col = 0; col < n - 1; col += 1) {
      const index = row * (n - 1) + col;
      const owner = dotsState.boxes[index];
      if (owner >= 0) {
        parts.push(`<span class="claimed-box p${owner}" style="left:${(col/(n-1))*100}%;top:${(row/(n-1))*100}%;width:${100/(n-1)}%;height:${100/(n-1)}%">${escapeHtml(dotsState.players[owner].slice(0,1).toUpperCase())}</span>`);
      }
    }
  }

  parts.push('</div>');
  return parts.join('');
}

function drawDotsEdge(type, index) {
  if (dotsState.gameOver) return;
  const list = type === 'h' ? dotsState.h : dotsState.v;
  if (list[index] >= 0) return;
  dotsState.history.push(deepCopy({
    turn: dotsState.turn,
    h: dotsState.h,
    v: dotsState.v,
    boxes: dotsState.boxes,
    scores: dotsState.scores,
    gameOver: dotsState.gameOver
  }));
  list[index] = dotsState.turn;
  const completed = claimCompletedBoxes();
  if (!completed) dotsState.turn = dotsState.turn === 0 ? 1 : 0;
  if (dotsState.boxes.every(owner => owner >= 0)) dotsState.gameOver = true;
  saveDots();
  renderBonus();
}

function claimCompletedBoxes() {
  const n = dotsState.size;
  let count = 0;
  for (let row = 0; row < n - 1; row += 1) {
    for (let col = 0; col < n - 1; col += 1) {
      const boxIndex = row * (n - 1) + col;
      if (dotsState.boxes[boxIndex] >= 0) continue;
      const top = dotsState.h[row * (n - 1) + col];
      const bottom = dotsState.h[(row + 1) * (n - 1) + col];
      const left = dotsState.v[row * n + col];
      const right = dotsState.v[row * n + col + 1];
      if ([top,bottom,left,right].every(value => value >= 0)) {
        dotsState.boxes[boxIndex] = dotsState.turn;
        dotsState.scores[dotsState.turn] += 1;
        count += 1;
      }
    }
  }
  return count;
}

function undoDots() {
  const previous = dotsState.history.pop();
  if (!previous) return;
  Object.assign(dotsState, previous);
  saveDots();
  renderBonus();
}

function newDotsRound() {
  const players = [...dotsState.players];
  const size = dotsState.size;
  dotsState = defaultDotsState(size);
  dotsState.setupComplete = true;
  dotsState.players = players;
  saveDots();
  renderBonus();
}

function changeDotsSettings() {
  dotsState.setupComplete = false;
  saveDots();
  renderBonus();
}

function dotsWinnerText() {
  if (dotsState.scores[0] === dotsState.scores[1]) return `It is a tie: ${dotsState.scores[0]} boxes each.`;
  const winner = dotsState.scores[0] > dotsState.scores[1] ? 0 : 1;
  return `🏆 ${escapeHtml(dotsState.players[winner])} wins ${dotsState.scores[winner]}–${dotsState.scores[winner===0?1:0]}!`;
}

/* ---------------- Memory Match ---------------- */

const MEMORY_ICONS = ['🐶','🍕','🚀','🎸','⚽','🦖','🌮','🎯'];
let memoryState = makeMemoryGame();

function makeMemoryGame() {
  const deck = [...MEMORY_ICONS, ...MEMORY_ICONS]
    .map((icon, index) => ({ id: index, icon, matched: false }))
    .sort(() => Math.random() - 0.5);
  return { deck, open: [], moves: 0, startedAt: 0, elapsed: 0, won: false };
}

function renderMemory(root) {
  const best = readJson(BONUS_STORAGE.memoryBest, null);
  root.innerHTML = `${bonusHeader('Memory Match','Match all eight pairs in the fewest moves.','🧠')}
    <div class="memory-stats">
      <span>Moves <strong>${memoryState.moves}</strong></span>
      <span>Time <strong id="memoryTime">${formatSeconds(memoryElapsed())}</strong></span>
      <span>Best <strong>${best ? `${best.moves} moves` : '—'}</strong></span>
    </div>
    ${memoryState.won ? `<div class="sketch-result">🎉 You matched every pair in ${memoryState.moves} moves!</div>` : ''}
    <div class="memory-grid">${memoryState.deck.map((card,index)=>{
      const visible = card.matched || memoryState.open.includes(index);
      return `<button class="memory-card ${visible?'open':''} ${card.matched?'matched':''}" onclick="flipMemory(${index})" ${card.matched||memoryLock?'disabled':''}><span>${visible?card.icon:'?'}</span></button>`;
    }).join('')}</div>
    <button class="primary-btn full" onclick="resetMemory()">Shuffle &amp; restart</button>`;
  startMemoryClock();
}

function flipMemory(index) {
  if (memoryLock || memoryState.won || memoryState.open.includes(index) || memoryState.deck[index].matched) return;
  if (!memoryState.startedAt) memoryState.startedAt = Date.now();
  memoryState.open.push(index);
  if (memoryState.open.length < 2) return renderBonus();
  memoryState.moves += 1;
  const [a,b] = memoryState.open;
  if (memoryState.deck[a].icon === memoryState.deck[b].icon) {
    memoryState.deck[a].matched = true;
    memoryState.deck[b].matched = true;
    memoryState.open = [];
    if (memoryState.deck.every(card => card.matched)) {
      memoryState.won = true;
      memoryState.elapsed = memoryElapsed();
      saveMemoryBest();
    }
    renderBonus();
  } else {
    memoryLock = true;
    renderBonus();
    setTimeout(() => {
      memoryState.open = [];
      memoryLock = false;
      renderBonus();
    }, 700);
  }
}

function memoryElapsed() {
  if (!memoryState.startedAt) return memoryState.elapsed || 0;
  if (memoryState.won) return memoryState.elapsed;
  return Math.floor((Date.now() - memoryState.startedAt) / 1000);
}

function startMemoryClock() {
  clearInterval(memoryTimerId);
  if (!memoryState.startedAt || memoryState.won || bonusGame !== 'memory') return;
  memoryTimerId = setInterval(() => {
    const el = document.getElementById('memoryTime');
    if (el) el.textContent = formatSeconds(memoryElapsed());
  }, 1000);
}

function saveMemoryBest() {
  const previous = readJson(BONUS_STORAGE.memoryBest, null);
  const result = { moves: memoryState.moves, seconds: memoryState.elapsed };
  if (!previous || result.moves < previous.moves || (result.moves === previous.moves && result.seconds < previous.seconds)) {
    writeJson(BONUS_STORAGE.memoryBest, result);
    toast('New Memory Match best!');
  }
}

function resetMemory() {
  clearInterval(memoryTimerId);
  memoryState = makeMemoryGame();
  renderBonus();
}

function formatSeconds(total) {
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2,'0')}`;
}

/* ---------------- Quick Tap reaction game ---------------- */

function renderReaction(root) {
  const best = Number(localStorage.getItem(BONUS_STORAGE.reactionBest) || 0);
  const message = reactionPhase === 'waiting' ? 'Wait for GO…' :
    reactionPhase === 'ready' ? 'GO! TAP NOW!' :
    reactionPhase === 'result' ? `Your time: ${Math.round(reactionReadyAt)} ms` :
    reactionPhase === 'early' ? 'Too early! Try again.' :
    'Press Start, then wait for GO.';
  root.innerHTML = `${bonusHeader('Quick Tap','Test how fast you react without tapping early.','⚡')}
    <div class="reaction-panel ${reactionPhase}" onclick="reactionTap()" role="button" aria-live="polite">
      <div class="reaction-icon">${reactionPhase === 'ready' ? '⚡' : reactionPhase === 'waiting' ? '⏳' : '👆'}</div>
      <strong>${message}</strong>
      <span>${best ? `Best: ${best} ms` : 'No best time yet'}</span>
    </div>
    <button class="primary-btn full" onclick="startReaction()">Start round</button>
    <div class="card" style="margin-top:14px"><p class="muted" style="margin:0">The screen waits a random amount of time. Tapping before “GO” counts as a false start.</p></div>`;
}

function startReaction() {
  clearReactionTimer();
  reactionPhase = 'waiting';
  reactionReadyAt = 0;
  renderBonus();
  const delay = 1500 + Math.random() * 3000;
  reactionTimerId = setTimeout(() => {
    reactionPhase = 'ready';
    reactionReadyAt = performance.now();
    renderBonus();
  }, delay);
}

function reactionTap() {
  if (reactionPhase === 'waiting') {
    clearReactionTimer();
    reactionPhase = 'early';
    renderBonus();
  } else if (reactionPhase === 'ready') {
    const ms = Math.round(performance.now() - reactionReadyAt);
    reactionReadyAt = ms;
    reactionPhase = 'result';
    const best = Number(localStorage.getItem(BONUS_STORAGE.reactionBest) || 0);
    if (!best || ms < best) {
      localStorage.setItem(BONUS_STORAGE.reactionBest, String(ms));
      toast('New reaction-time best!');
    }
    renderBonus();
  }
}

function clearReactionTimer() {
  clearTimeout(reactionTimerId);
  reactionTimerId = null;
}

/* ---------------- Navigation and offline support ---------------- */

const originalShowTab = window.showTab;
window.showTab = function(tab) {
  if (currentTab === 'bonus' && tab !== 'bonus') {
    clearMegaTimer();
    clearReactionTimer();
    clearInterval(memoryTimerId);
  }
  originalShowTab(tab);
};

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeModal('newBetModal');
    closeModal('detailModal');
  }
});

window.addEventListener('load', () => {
  renderCurrentTab();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline cache registration failed.', error));
  }
});
