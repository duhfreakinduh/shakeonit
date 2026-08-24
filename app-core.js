'use strict';

const STORAGE_KEY = 'shakeonit_v3';
const LEGACY_STORAGE_KEYS = ['shakeonit_v2', 'shakeonit_bets', 'shakeonit_scores'];
const BET_FILTERS = ['active', 'all', 'settled'];
const DREIDEL_SIDES = [
  { key: 'nun', letter: 'נ', name: 'Nun', plain: 'Nothing happens. Keep the same number of tokens.' },
  { key: 'gimel', letter: 'ג', name: 'Gimel', plain: 'Take every token in the pot.' },
  { key: 'hey', letter: 'ה', name: 'Hey', plain: 'Take half of the pot, rounded up.' },
  { key: 'shin', letter: 'ש', name: 'Shin', plain: 'Put one token into the pot.' }
];

const defaultState = {
  profile: { name: 'Joshua' },
  currentGroup: 'Friends',
  groups: ['Friends'],
  bets: [
    {
      id: 101,
      title: 'Example: First to make 10 free throws',
      type: 'h2h',
      stakes: 'Bragging rights',
      rules: 'The first player to make 10 free throws wins.',
      status: 'active',
      participants: ['Joshua', 'Alex'],
      deadline: 'Today',
      group: 'Friends',
      result: null,
      winner: null,
      aiJudgment: null,
      example: true,
      createdAt: Date.now() - 2000
    },
    {
      id: 102,
      title: 'Example: Longest wall sit',
      type: 'h2h',
      stakes: 'Winner picks the music',
      rules: 'The player with the longest continuous wall-sit time wins.',
      status: 'active',
      participants: ['Joshua', 'Alex'],
      deadline: 'No deadline',
      group: 'Friends',
      result: null,
      winner: null,
      aiJudgment: null,
      example: true,
      createdAt: Date.now() - 1000
    }
  ],
  scores: {
    Joshua: { wins: 0, losses: 0, points: 0 },
    Alex: { wins: 0, losses: 0, points: 0 }
  },
  dreidel: {
    setupComplete: false,
    startingTokens: 10,
    players: [],
    turn: 0,
    pot: 0,
    history: [],
    lastResult: null,
    champion: null,
    stats: {}
  }
};

let state = loadState();
let currentTab = 'home';
let betFilter = 'active';
let selectedBetType = 'overunder';
let dreidelSpinning = false;
let dreidelUndo = null;
let toastTimer = null;

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored && stored.bets && stored.scores && stored.dreidel) return mergeState(stored);

    // One-time fresh start: ignore/remove older test data and seed only two examples.
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    const fresh = deepCopy(defaultState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  } catch (error) {
    console.warn('Could not load saved game data.', error);
    return deepCopy(defaultState);
  }
}

function mergeState(saved) {
  const merged = deepCopy(defaultState);
  Object.assign(merged, saved);
  merged.profile = { ...defaultState.profile, ...(saved.profile || {}) };
  merged.groups = Array.isArray(saved.groups) && saved.groups.length ? saved.groups : defaultState.groups;
  merged.bets = Array.isArray(saved.bets) ? saved.bets : defaultState.bets;
  merged.scores = saved.scores || defaultState.scores;
  merged.dreidel = { ...defaultState.dreidel, ...(saved.dreidel || {}) };
  merged.dreidel.stats = saved.dreidel?.stats || {};
  return merged;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-view').forEach(section => section.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.getElementById('newBetHeader').classList.toggle('hidden', tab === 'bonus');
  renderCurrentTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCurrentTab() {
  if (currentTab === 'home') renderHome();
  if (currentTab === 'bets') renderBets();
  if (currentTab === 'score') renderScoreboard();
  if (currentTab === 'bonus') renderBonus();
  if (currentTab === 'me') renderProfile();
}

function activeBets() {
  return state.bets.filter(bet => bet.status === 'active');
}

function getProfileScore() {
  const name = state.profile.name;
  if (!state.scores[name]) state.scores[name] = { wins: 0, losses: 0, points: 0 };
  return state.scores[name];
}

function renderHome() {
  const profileScore = getProfileScore();
  const groupBets = activeBets().filter(bet => bet.group === state.currentGroup);
  document.getElementById('tab-home').innerHTML = `
    <div class="hero"><div class="hero-emoji">👋</div><h1>Welcome, ${escapeHtml(state.profile.name)}!</h1><p class="muted">Start with the two examples below, or delete them and make your own challenge.</p></div>
    <div class="stat-grid"><div class="stat"><strong>${activeBets().length}</strong><span>Active bets</span></div><div class="stat"><strong>${profileScore.wins}</strong><span>Wins</span></div><div class="stat"><strong>${profileScore.points}</strong><span>Points</span></div></div>
    <div class="section-head"><h2>Your groups</h2><button class="ghost-btn" onclick="addGroup()">＋ Group</button></div>
    <div class="group-row">${state.groups.map(group => `<button class="chip ${group === state.currentGroup ? 'active' : ''}" onclick="switchGroup('${encodeURIComponent(group)}')">${escapeHtml(group)}</button>`).join('')}</div>
    <div class="section-head"><h2>${escapeHtml(state.currentGroup)}</h2><button class="ghost-btn" onclick="showTab('bets')">See all</button></div>
    <div class="stack">${groupBets.length ? groupBets.slice(0, 4).map(betCard).join('') : emptyState('No active bets in this group yet.', 'Create a new bet to get started.')}</div>
    <div class="section-head"><h2>Bonus game</h2></div>
    <div class="card bonus-hero" onclick="showTab('bonus')" role="button" tabindex="0"><span class="bonus-pill">BONUS GAME</span><h2 style="font-size:1.75rem;margin-top:10px">Tap-to-Spin Dreidel</h2><p style="margin-bottom:0;color:#dbeafe">4–10 players • automatic tokens • plain-English results</p></div>`;
}

function betCard(bet) {
  const statusClass = bet.status === 'active' ? 'active' : bet.result === 'win' ? 'won' : 'lost';
  const statusText = bet.status === 'active' ? 'Active' : bet.result === 'win' ? 'Won' : bet.result === 'lose' ? 'Lost' : 'Settled';
  return `<article class="card bet-card" onclick="openBetDetail(${Number(bet.id)})"><div class="bet-top"><div><div class="bet-title">${escapeHtml(bet.title)}</div><div class="stake">${escapeHtml(bet.stakes || 'Bragging rights')}</div></div><span class="badge ${statusClass}">${statusText}</span></div><div class="meta"><span>👥 ${bet.participants.length} players</span><span>🗓 ${escapeHtml(bet.deadline || 'No deadline')}</span><span>📍 ${escapeHtml(bet.group || 'Friends')}</span></div></article>`;
}

function emptyState(title, detail) {
  return `<div class="empty"><strong style="display:block;color:#e4e4e7;margin-bottom:6px">${escapeHtml(title)}</strong>${escapeHtml(detail)}</div>`;
}

function renderBets() {
  const filtered = state.bets.filter(bet => betFilter === 'all' || (betFilter === 'active' ? bet.status === 'active' : bet.status !== 'active')).sort((a, b) => (b.createdAt || b.id) - (a.createdAt || a.id));
  document.getElementById('tab-bets').innerHTML = `<div class="section-head" style="margin-top:4px"><div><div class="eyebrow">Challenge book</div><h1 style="margin:4px 0 0">All Bets</h1></div><button class="primary-btn" onclick="openNewBet()">＋ Add</button></div><div class="filter-row">${BET_FILTERS.map(filter => `<button class="chip ${betFilter === filter ? 'active' : ''}" onclick="setBetFilter('${filter}')">${filter[0].toUpperCase() + filter.slice(1)}</button>`).join('')}</div><div class="stack" style="margin-top:8px">${filtered.length ? filtered.map(betCard).join('') : emptyState('Nothing here yet.', 'Try another filter or create a new bet.')}</div>`;
}

function setBetFilter(filter) {
  betFilter = filter;
  renderBets();
}
