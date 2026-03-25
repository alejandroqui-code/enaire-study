// ═══════════════════════════════════════════════════════════
//  APP.JS — Main application logic (ES Module)
// ═══════════════════════════════════════════════════════════

import {
  signInWithGoogle,
  signOut as fbSignOut,
  onAuthChange,
  loadCards,
  loadBlockStatus,
  loadMeta,
  saveCards as fbSaveCards,
  updateCard,
  saveMeta
} from './firebase.js';

const BLOCKS = [
  "English Precision",
  "English Speaking",
  "Psychotechnics",
  "Syllabus",
  "FEAST",
  "Profile"
];

const state = {
  user: null,
  cards: [],
  blockStatus: {},
  meta: {},
  study: {
    queue: [],
    currentIdx: 0,
    isFlipped: false,
    reviewed: 0,
    activeBlock: 'all'
  },
  generatedCards: []
};

// ── AUTH ─────────────────────────────────────────────────────
onAuthChange(async (user) => {
  if (user) {
    state.user = user;
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('userAvatar').src = user.photoURL || '';
    await ensureUserDocument(user);
    await loadUserData();
    renderDashboard();
    initStudySession();
    updateStats();
    updateDashDate();
  } else {
    state.user = null;
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  try {
    await signInWithGoogle();
  } catch (e) {
    console.error('Login error:', e);
  }
});

window.signOut = async function() {
  await fbSignOut();
  hideUserMenu();
};

// ── ENSURE USER DOCUMENT ─────────────────────────────────────
async function ensureUserDocument(user) {
  try {
    await import('./firebase.js').then(async (fb) => {
      const { db } = fb;
      const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName,
        createdAt: new Date().toISOString()
      }, { merge: true });
    });
  } catch(e) {
    console.error('Error creating user document:', e);
  }
}

// ── DATA LOADING ──────────────────────────────────────────────
async function loadUserData() {
  const uid = state.user.uid;
  try {
    const [cards, blockStatus, meta] = await Promise.all([
      loadCards(uid),
      loadBlockStatus(uid),
      loadMeta(uid)
    ]);
    state.cards = cards;
    state.blockStatus = blockStatus;
    state.meta = meta;
    const today = getToday();
    if (state.meta.lastDate !== today) {
      state.meta.todayCount = 0;
      if (state.meta.lastDate !== getYesterday()) state.meta.streak = 0;
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
}

// ── NAVIGATION ────────────────────────────────────────────────
document.querySelectorAll('.nav-btn, .bnav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(name) {
  document.querySelectorAll('.nav-btn, .bnav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (name === 'study')     initStudySession();
  if (name === 'dashboard') renderDashboard();
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDashboard() {
  const grid = document.getElementById('blocksGrid');
  if (state.cards.length === 0 && Object.keys(state.blockStatus).length === 0) {
    grid.innerHTML = `
      <div class="dashboard-empty" style="grid-column:1/-1">
        <div class="empty-icon">◈</div>
        <p>Aún no tienes tarjetas.<br>Ve a "Generar" para crear tus primeras flashcards.</p>
      </div>`;
    updateScoreRing(0);
    return;
  }
  let totalMastery = 0;
  grid.innerHTML = BLOCKS.map(blockName => {
    const blockCards = state.cards.filter(c => c.block === blockName);
    const status = state.blockStatus[blockName] || {};
    const dueCount = blockCards.filter(c => SRS.isDue(c)).length;
    const mastery = SRS.masteryPercent(blockCards);
    totalMastery += mastery;
    const dueLabel = dueCount > 0
      ? `<span class="block-due">${dueCount} pendientes</span>`
      : `<span class="block-due none">Al día ✓</span>`;
    const strengths = (status.strengths || []).slice(0, 2)
      .map(s => `<span class="meta-tag strength">${s}</span>`).join('');
    const weaknesses = (status.weaknesses || []).slice(0, 2)
      .map(w => `<span class="meta-tag weakness">${w}</span>`).join('');
    const lastSession = status.lastSession
      ? `Última sesión: ${status.lastSession}`
      : 'Sin sesiones registradas';
    return `
      <div class="block-card" onclick="studyBlock('${blockName}')">
        <div class="block-card-top">
          <div class="block-name">${blockName}</div>
          ${dueLabel}
        </div>
        <div class="block-progress-bar">
          <div class="block-progress-fill" style="width:${mastery}%"></div>
        </div>
        <div class="block-meta">
          ${strengths ? `<div class="block-meta-row">${strengths}</div>` : ''}
          ${weaknesses ? `<div class="block-meta-row">${weaknesses}</div>` : ''}
          <div class="block-last-session">${lastSession}</div>
        </div>
        <div class="block-card-footer">
          <span class="block-total mono">${blockCards.length} tarjetas · ${mastery}% dominado</span>
          <button class="block-study-btn" onclick="event.stopPropagation(); studyBlock('${blockName}')">Estudiar →</button>
        </div>
      </div>`;
  }).join('');
  updateScoreRing(Math.round(totalMastery / BLOCKS.length));
}

function updateScoreRing(percent) {
  const circumference = 150.8;
  document.getElementById('scoreCircle').style.strokeDashoffset =
    circumference - (percent / 100) * circumference;
  document.getElementById('scoreNum').textContent = percent + '%';
}

function updateDashDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('dashDate').textContent =
    new Date().toLocaleDateString('es-ES', options).toUpperCase();
}

window.studyBlock = function(blockName) {
  state.study.activeBlock = blockName;
  switchView('study');
  setTimeout(() => {
    document.querySelectorAll('.filter-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.block === blockName);
    });
  }, 50);
};

// ── STUDY SESSION ─────────────────────────────────────────────
function initStudySession() {
  buildFilterChips();
  buildStudyQueue();
  state.study.currentIdx = 0;
  state.study.reviewed = 0;
  state.study.isFlipped = false;
  showCurrentCard();
}

function buildFilterChips() {
  const container = document.getElementById('studyFilters');
  const activeBlock = state.study.activeBlock;
  container.innerHTML = `<button class="filter-chip ${activeBlock === 'all' ? 'active' : ''}" data-block="all">Todos</button>`;
  BLOCKS.forEach(b => {
    const count = state.cards.filter(c => c.block === b && SRS.isDue(c)).length;
    if (state.cards.some(c => c.block === b)) {
      container.innerHTML += `<button class="filter-chip ${activeBlock === b ? 'active' : ''}" data-block="${b}">${b}${count > 0 ? ` <span style="color:var(--accent)">(${count})</span>` : ''}</button>`;
    }
  });
  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.study.activeBlock = chip.dataset.block;
      container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      buildStudyQueue();
      state.study.currentIdx = 0;
      state.study.reviewed = 0;
      showCurrentCard();
    });
  });
}

function buildStudyQueue() {
  let cards = state.cards.filter(c => SRS.isDue(c));
  if (state.study.activeBlock !== 'all') cards = cards.filter(c => c.block === state.study.activeBlock);
  state.study.queue = cards.sort(() => Math.random() - 0.5);
}

function showCurrentCard() {
  const { queue, currentIdx, reviewed } = state.study;
  const total = queue.length + reviewed;
  document.getElementById('studyProgress').style.width = total > 0 ? (reviewed / total) * 100 + '%' : '0%';
  document.getElementById('progressLabel').textContent = `${reviewed} / ${total}`;
  document.getElementById('flashcard').classList.remove('flipped');
  state.study.isFlipped = false;
  document.getElementById('ratingRow').classList.add('hidden');

  const flashWrap = document.getElementById('flashcardWrap');
  const doneState = document.getElementById('doneState');
  const tapHint   = document.getElementById('tapHintOutside');

  if (currentIdx >= queue.length) {
    flashWrap.classList.add('hidden');
    tapHint.classList.add('hidden');
    doneState.classList.remove('hidden');
    document.getElementById('doneStats').textContent = `${reviewed} tarjetas repasadas`;
    return;
  }

  flashWrap.classList.remove('hidden');
  doneState.classList.add('hidden');
  tapHint.classList.remove('hidden');

  const card = queue[currentIdx];
  document.getElementById('cardQuestion').textContent     = card.question;
  document.getElementById('cardAnswer').textContent       = card.answer;
  document.getElementById('cardBlockTag').textContent     = card.block;
  document.getElementById('cardBlockTagBack').textContent = card.block;
}

window.flipCard = function() {
  if (state.study.currentIdx >= state.study.queue.length) return;
  state.study.isFlipped = !state.study.isFlipped;
  document.getElementById('flashcard').classList.toggle('flipped', state.study.isFlipped);
  document.getElementById('ratingRow').classList.toggle('hidden', !state.study.isFlipped);
  document.getElementById('tapHintOutside').classList.toggle('hidden', state.study.isFlipped);
};

window.rateCard = async function(rating) {
  const { queue, currentIdx } = state.study;
  if (currentIdx >= queue.length) return;
  const card = queue[currentIdx];
  const updated = SRS.nextInterval(card, rating);
  const idx = state.cards.findIndex(c => c.id === card.id);
  if (idx !== -1) state.cards[idx] = { ...state.cards[idx], ...updated };
  if (state.user) {
    try { await updateCard(state.user.uid, card.id, updated); }
    catch (e) { console.error('Error saving card:', e); }
  }
  state.study.currentIdx++;
  state.study.reviewed++;
  state.meta.todayCount = (state.meta.todayCount || 0) + 1;
  const today = getToday();
  if (state.meta.lastDate === getYesterday()) state.meta.streak = (state.meta.streak || 0) + 1;
  else if (state.meta.lastDate !== today) state.meta.streak = 1;
  state.meta.lastDate = today;
  updateStats();
  showCurrentCard();
  if (state.user && state.study.reviewed % 5 === 0) saveMeta(state.user.uid, state.meta);
};

window.resetStudySession = function() {
  buildStudyQueue();
  state.study.currentIdx = 0;
  state.study.reviewed = 0;
  showCurrentCard();
};

// ── GENERATE ──────────────────────────────────────────────────
window.generateCards = async function() {
  const notes   = document.getElementById('genNotes').value.trim();
  const count   = parseInt(document.getElementById('genCount').value) || 10;
  const block   = document.getElementById('genBlock').value;
  const btn     = document.getElementById('genBtn');
  const btnText = document.getElementById('genBtnText');
  const statusEl = document.getElementById('genStatus');

  if (!notes) { showStatus(statusEl, '✗ Pega tus apuntes antes de generar.', 'error'); return; }

  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Generando…';
  showStatus(statusEl, '⏳ La IA está analizando tus apuntes…', 'loading');
  document.getElementById('genPreview').classList.add('hidden');

  const isEnglish = block.toLowerCase().includes('english');
  const langNote = isEnglish
    ? 'Cards must be in English (both question and answer).'
    : 'Las tarjetas deben estar en español.';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are an expert flashcard creator for ENAIRE air traffic control competitive exams in Spain. ${langNote} Respond ONLY with valid JSON, no markdown: {"cards":[{"q":"question","a":"answer"},...]}`,
        messages: [{ role: 'user', content: `Create exactly ${count} flashcards for the "${block}" block from these notes:\n\n${notes}` }]
      })
    });
    const data = await response.json();
    const text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    state.generatedCards = parsed.cards.map((c, i) => ({
      id: 'card_' + Date.now() + '_' + i,
      question: c.q, answer: c.a, block,
      ...SRS.defaults()
    }));
    renderPreview(state.generatedCards);
    showStatus(statusEl, `✓ ${state.generatedCards.length} tarjetas generadas.`, 'success');
  } catch (e) {
    showStatus(statusEl, '✗ Error al generar. Inténtalo de nuevo.', 'error');
    console.error(e);
  }

  btn.disabled = false;
  btnText.textContent = '✦ Generar tarjetas';
};

function renderPreview(cards) {
  document.getElementById('previewCount').textContent = cards.length + ' tarjetas';
  document.getElementById('previewList').innerHTML = cards.map((c, i) => `
    <div class="preview-item">
      <div><div class="preview-item-label">Pregunta</div><div class="preview-item-q">${c.question}</div></div>
      <div><div class="preview-item-label">Respuesta</div><div class="preview-item-a">${c.answer}</div></div>
      <button class="preview-delete" onclick="removePreviewCard(${i})">×</button>
    </div>`).join('');
  document.getElementById('genPreview').classList.remove('hidden');
}

window.removePreviewCard = function(i) {
  state.generatedCards.splice(i, 1);
  if (state.generatedCards.length === 0) window.discardGenerated();
  else renderPreview(state.generatedCards);
};

window.saveGeneratedCards = async function() {
  if (!state.user || state.generatedCards.length === 0) return;
  try {
    await fbSaveCards(state.user.uid, state.generatedCards);
    state.cards.push(...state.generatedCards);
    showToast(`✓ ${state.generatedCards.length} tarjetas guardadas`);
    window.discardGenerated();
    document.getElementById('genNotes').value = '';
    document.getElementById('genStatus').classList.add('hidden');
    renderDashboard();
    initStudySession();
  } catch (e) {
    showToast('✗ Error al guardar.');
    console.error(e);
  }
};

window.discardGenerated = function() {
  state.generatedCards = [];
  document.getElementById('genPreview').classList.add('hidden');
};

// ── USER MENU ─────────────────────────────────────────────────
document.getElementById('userBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('userMenu');
  if (menu.classList.contains('hidden')) {
    document.getElementById('userMenuName').textContent  = state.user?.displayName || '—';
    document.getElementById('userMenuEmail').textContent = state.user?.email || '—';
    menu.classList.remove('hidden');
  } else {
    menu.classList.add('hidden');
  }
});

document.addEventListener('click', () => document.getElementById('userMenu').classList.add('hidden'));

function hideUserMenu() {
  document.getElementById('userMenu').classList.add('hidden');
}

// ── STATS ─────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('statToday').textContent  = state.meta.todayCount || 0;
  document.getElementById('statStreak').textContent = state.meta.streak || 0;
}

// ── HELPERS ───────────────────────────────────────────────────
function getToday()     { return new Date().toISOString().slice(0, 10); }
function getYesterday() { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }

function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'gen-status ' + type;
  el.classList.remove('hidden');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}