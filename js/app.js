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
  deleteCard as fbDeleteCard,
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
  if (name === 'today')     renderTodayView();
  if (name === 'study')     initStudySession();
  if (name === 'dashboard') renderDashboard();
  if (name === 'manage')    renderManageView();
  if (name === 'status')    renderStatusView();
}

// ── HOY ───────────────────────────────────────────────────────
// 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const SCHEDULE = {
  0: { blocks: [],                                      rest: true,  label: 'Descanso' },
  1: { blocks: ['English Speaking', 'Psychotechnics'],  rest: false, label: 'Lunes' },
  2: { blocks: ['English Precision', 'FEAST'],          rest: false, label: 'Martes' },
  3: { blocks: [],                                      rest: true,  label: 'Miércoles' },
  4: { blocks: ['English Speaking', 'Psychotechnics'],  rest: false, label: 'Jueves' },
  5: { blocks: ['English Precision', 'FEAST'],          rest: false, label: 'Viernes' },
  6: { blocks: ['English Speaking', 'Syllabus'],        rest: false, label: 'Sábado' }
};

function getTodaySchedule() {
  const now = new Date();
  const dow = now.getDay();
  const entry = SCHEDULE[dow];

  // Sunday: once a month (first Sunday) → Profile
  if (dow === 0) {
    const isFirstSunday = now.getDate() <= 7;
    if (isFirstSunday) {
      return { blocks: ['Profile'], rest: false, label: 'Domingo', profileSunday: true };
    }
  }
  return { ...entry, profileSunday: false };
}

function renderTodayView() {
  const today = getTodaySchedule();
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const headerEl  = document.getElementById('todayHeader');
  const contentEl = document.getElementById('todayContent');

  // Header
  headerEl.innerHTML = `
    <div class="today-date mono">${dateStr.toUpperCase()}</div>
    ${today.rest
      ? `<div class="today-day-label today-rest">DESCANSO</div>`
      : `<div class="today-day-label">${today.label.toUpperCase()}</div>`
    }`;

  // Rest day
  if (today.rest) {
    contentEl.innerHTML = `
      <div class="today-rest-card">
        <div class="today-rest-icon">◎</div>
        <div class="today-rest-title">Día de descanso</div>
        <div class="today-rest-sub">El descanso forma parte del entrenamiento.<br>Vuelve mañana con energía.</div>
      </div>`;
    return;
  }

  // Study day — build block cards
  const totalDue = today.blocks.reduce((acc, b) =>
    acc + state.cards.filter(c => c.block === b && SRS.isDue(c)).length, 0);

  contentEl.innerHTML = `
    <div class="today-summary mono">
      ${totalDue > 0
        ? `<span class="today-due-count">${totalDue}</span> tarjetas pendientes hoy`
        : `<span class="today-all-done">✓ Al día</span> — sin pendientes para hoy`
      }
    </div>
    <div class="today-blocks">
      ${today.blocks.map(blockName => {
        const due  = state.cards.filter(c => c.block === blockName && SRS.isDue(c)).length;
        const total = state.cards.filter(c => c.block === blockName).length;
        const status = state.blockStatus[blockName] || {};
        const pct  = SRS.masteryPercent(state.cards.filter(c => c.block === blockName));

        return `
          <div class="today-block-card">
            <div class="today-block-top">
              <span class="today-block-name">${blockName}</span>
              ${due > 0
                ? `<span class="today-block-due">${due} pendientes</span>`
                : `<span class="today-block-done">Al día ✓</span>`
              }
            </div>

            <div class="block-progress-bar" style="margin: .5rem 0">
              <div class="block-progress-fill" style="width:${pct}%"></div>
            </div>

            ${status.profileSummary
              ? `<div class="today-block-profile mono">${status.profileSummary}</div>`
              : ''
            }

            ${status.nextFocus
              ? `<div class="today-block-focus">→ ${status.nextFocus}</div>`
              : ''
            }

            <div class="today-block-meta mono">${total} tarjetas · ${pct}% dominado</div>

            <button class="today-study-btn" onclick="studyBlock('${blockName}')">
              Estudiar ${blockName} →
            </button>
          </div>`;
      }).join('')}
    </div>
    ${today.profileSunday ? `<div class="today-profile-note mono">◎ Primer domingo del mes — bloque Profile activo</div>` : ''}`;
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
  const cardActions = document.getElementById('cardActions');

  if (currentIdx >= queue.length) {
    flashWrap.classList.add('hidden');
    tapHint.classList.add('hidden');
    if (cardActions) cardActions.classList.add('hidden');
    doneState.classList.remove('hidden');
    document.getElementById('doneStats').textContent = `${reviewed} tarjetas repasadas`;
    return;
  }

  flashWrap.classList.remove('hidden');
  doneState.classList.add('hidden');
  tapHint.classList.remove('hidden');
  if (cardActions) cardActions.classList.remove('hidden');

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
  t.classList.remove('hidden');
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); t.classList.add('hidden'); }, 3000);
}

// ── CONFIRM MODAL ─────────────────────────────────────────────
let confirmCallback = null;

function showConfirm(message, onConfirm) {
  confirmCallback = onConfirm;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmModal').classList.remove('hidden');
}

window.confirmYes = function() {
  document.getElementById('confirmModal').classList.add('hidden');
  if (confirmCallback) { confirmCallback(); confirmCallback = null; }
};

window.confirmNo = function() {
  document.getElementById('confirmModal').classList.add('hidden');
  confirmCallback = null;
};

// ── EDIT MODAL ────────────────────────────────────────────────
let editingCardId = null;

function openEditModal(card) {
  editingCardId = card.id;
  document.getElementById('editQuestion').value = card.question;
  document.getElementById('editAnswer').value   = card.answer;
  document.getElementById('editModal').classList.remove('hidden');
}

window.closeEditModal = function() {
  document.getElementById('editModal').classList.add('hidden');
  editingCardId = null;
};

window.saveCardEdit = async function() {
  if (!editingCardId) return;
  const question = document.getElementById('editQuestion').value.trim();
  const answer   = document.getElementById('editAnswer').value.trim();
  if (!question || !answer) {
    showToast('✗ Pregunta y respuesta no pueden estar vacías');
    return;
  }

  // Update in state
  const idx = state.cards.findIndex(c => c.id === editingCardId);
  if (idx !== -1) { state.cards[idx].question = question; state.cards[idx].answer = answer; }

  // Update in study queue if active
  const qi = state.study.queue.findIndex(c => c.id === editingCardId);
  if (qi !== -1) { state.study.queue[qi].question = question; state.study.queue[qi].answer = answer; }

  try {
    await updateCard(state.user.uid, editingCardId, { question, answer });
    showToast('✓ Tarjeta actualizada');
  } catch(e) {
    showToast('✗ Error al guardar');
    console.error(e);
  }

  closeEditModal();
  showCurrentCard();
  if (document.getElementById('view-manage').classList.contains('active')) renderManageView();
};

// ── STUDY — edit / delete current card ───────────────────────
document.getElementById('btnEditCard').addEventListener('click', () => {
  const card = state.study.queue[state.study.currentIdx];
  if (card) openEditModal(card);
});

document.getElementById('btnDeleteCard').addEventListener('click', () => {
  const card = state.study.queue[state.study.currentIdx];
  if (!card) return;
  showConfirm('¿Eliminar esta tarjeta? Esta acción no se puede deshacer.', async () => {
    state.study.queue.splice(state.study.currentIdx, 1);
    await removeCard(card.id);
    showCurrentCard();
  });
});

// ── STATUS VIEW ───────────────────────────────────────────────
function renderStatusView() {
  const grid = document.getElementById('statusGrid');

  if (Object.keys(state.blockStatus).length === 0) {
    grid.innerHTML = `
      <div class="status-empty">
        <div class="empty-icon">◎</div>
        <p>No hay datos de estado todavía.<br>Ejecuta el script de sync para cargar los state reports.</p>
      </div>`;
    return;
  }

  grid.innerHTML = BLOCKS.map(blockName => {
    const s = state.blockStatus[blockName];
    if (!s) return `
      <div class="status-card status-card--empty">
        <div class="status-card-name">${blockName}</div>
        <div class="status-no-data mono">Sin datos</div>
      </div>`;

    const strengths = (s.strengths || []).map(x =>
      `<span class="status-tag status-tag--strength">${x}</span>`).join('');
    const weaknesses = (s.weaknesses || []).map(x =>
      `<span class="status-tag status-tag--weakness">${x}</span>`).join('');

    const levelClass = { beginner: 'lvl-beginner', intermediate: 'lvl-intermediate', advanced: 'lvl-advanced' }[s.level] || '';
    const levelLabel = { beginner: 'Inicial', intermediate: 'Intermedio', advanced: 'Avanzado' }[s.level] || s.level || '—';

    return `
      <div class="status-card">
        <div class="status-card-header">
          <span class="status-card-name">${blockName}</span>
          <span class="status-level ${levelClass}">${levelLabel}</span>
        </div>

        ${s.profileSummary ? `<div class="status-profile-summary mono">${s.profileSummary}</div>` : ''}

        ${(s.strengths?.length || s.weaknesses?.length) ? `
        <div class="status-tags-section">
          ${strengths ? `<div class="status-tags-row">${strengths}</div>` : ''}
          ${weaknesses ? `<div class="status-tags-row">${weaknesses}</div>` : ''}
        </div>` : ''}

        <div class="status-card-footer">
          ${s.nextFocus ? `<div class="status-next-focus">→ ${s.nextFocus}</div>` : ''}
          <div class="status-meta mono">
            ${s.lastSession ? `Última sesión: ${s.lastSession}` : ''}
            ${s.totalSessions ? ` · ${s.totalSessions} sesiones` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── MANAGE VIEW ───────────────────────────────────────────────
let manageActiveBlock = 'all';

function renderManageView() {
  let cards = state.cards;
  if (manageActiveBlock !== 'all') cards = cards.filter(c => c.block === manageActiveBlock);

  document.getElementById('manageCount').textContent = `${cards.length} tarjeta${cards.length !== 1 ? 's' : ''}`;

  // Filters
  const filtersEl = document.getElementById('manageFilters');
  filtersEl.innerHTML = `<button class="filter-chip ${manageActiveBlock === 'all' ? 'active' : ''}" data-block="all">Todos (${state.cards.length})</button>`;
  BLOCKS.forEach(b => {
    const n = state.cards.filter(c => c.block === b).length;
    if (n > 0) {
      filtersEl.innerHTML += `<button class="filter-chip ${manageActiveBlock === b ? 'active' : ''}" data-block="${b}">${b} <span class="mono" style="opacity:.5;font-size:.8em">(${n})</span></button>`;
    }
  });
  filtersEl.querySelectorAll('.filter-chip').forEach(chip =>
    chip.addEventListener('click', () => {
      manageActiveBlock = chip.dataset.block;
      renderManageView();
    })
  );

  // List
  const listEl = document.getElementById('manageList');
  if (cards.length === 0) {
    listEl.innerHTML = `<div class="manage-empty">No hay tarjetas en este bloque.</div>`;
    return;
  }
  listEl.innerHTML = cards.map(c => `
    <div class="manage-item" data-id="${c.id}">
      <div class="manage-item-content">
        <div class="manage-item-block mono">${c.block}</div>
        <div class="manage-item-q">${c.question}</div>
        <div class="manage-item-a">${c.answer}</div>
      </div>
      <div class="manage-item-actions">
        <button class="manage-btn manage-btn-edit" data-id="${c.id}" title="Editar">✎ Editar</button>
        <button class="manage-btn manage-btn-delete" data-id="${c.id}" title="Eliminar">✕ Eliminar</button>
      </div>
    </div>`).join('');

  // Attach events after render
  listEl.querySelectorAll('.manage-btn-edit').forEach(btn =>
    btn.addEventListener('click', () => {
      const card = state.cards.find(c => c.id === btn.dataset.id);
      if (card) openEditModal(card);
    })
  );
  listEl.querySelectorAll('.manage-btn-delete').forEach(btn =>
    btn.addEventListener('click', () => {
      const cardId = btn.dataset.id;
      const card = state.cards.find(c => c.id === cardId);
      const preview = card ? `"${card.question.slice(0, 60)}${card.question.length > 60 ? '…' : ''}"` : 'esta tarjeta';
      showConfirm(`¿Eliminar ${preview}?`, async () => {
        await removeCard(cardId);
        renderManageView();
      });
    })
  );
}

window.editCardById = function(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (card) openEditModal(card);
};

// ── REMOVE CARD (shared) ──────────────────────────────────────
async function removeCard(cardId) {
  state.cards = state.cards.filter(c => c.id !== cardId);
  try {
    await fbDeleteCard(state.user.uid, cardId);
    showToast('✓ Tarjeta eliminada');
  } catch(e) {
    showToast('✗ Error al eliminar');
    console.error(e);
  }
  renderDashboard();
}