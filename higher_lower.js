// ============================================
// 🔐 Game Đoán Trúng Số (Higher/Lower)
// ============================================

const API_URL = 'api.php';
let myPlayerId = localStorage.getItem('gms_player_id');
if (!myPlayerId) {
  myPlayerId = 'p_' + Math.random().toString(36).substring(2, 12);
  localStorage.setItem('gms_player_id', myPlayerId);
}

let myRole = null;
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');
let isMyTurn = false;
let timerRAF = null;
let turnStartTime = null;
let pollInterval = null;
let lastGuessId = 0;
let mySecret = null;
let secretVisible = false;
let difficulty = 2; // Default 2 digits

const TURN_DURATION = 60;
const POLL_MS = 1000;

if (!roomId) {
  window.location.href = 'index.html';
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

async function api(action, params = {}) {
  params.action = action;
  params.player_id = myPlayerId;
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return await resp.json();
}

function showToast(msg, type = 'default') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'px-4 py-2.5 rounded-full text-xs font-semibold shadow-lg backdrop-blur-md transform transition-all duration-300 translate-y-4 opacity-0 flex items-center gap-2';
  
  if (type === 'error') t.classList.add('bg-red-500/90', 'text-white', 'shadow-red-500/20');
  else if (type === 'success') t.classList.add('bg-green-500/90', 'text-white', 'shadow-green-500/20');
  else if (type === 'warning') t.classList.add('bg-amber-500/90', 'text-white', 'shadow-amber-500/20');
  else t.classList.add('bg-slate-800/90', 'text-slate-100', 'shadow-slate-800/20');

  t.innerHTML = `<span>${msg}</span>`;
  c.appendChild(t);

  requestAnimationFrame(() => {
    t.classList.remove('translate-y-4', 'opacity-0');
  });

  setTimeout(() => {
    t.classList.add('opacity-0', '-translate-y-4');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ============================================
// AUTO RECONNECT / INIT
// ============================================
(async function init() {
  document.getElementById('waiting-room-code').textContent = roomId;
  startPolling('init');
})();

function startPolling(mode) {
  stopPolling();
  pollInterval = setInterval(async () => {
    try {
      const data = await api('hl_get_room', { room_id: roomId });
      if (data.error) {
        stopPolling();
        showToast('Lỗi: ' + data.error, 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
      }
      
      const room = data.room;
      myRole = room.my_role;
      difficulty = room.difficulty;
      
      // Update hint text based on difficulty
      const hintTexts = {
        2: "Chọn số từ 10 - 99",
        3: "Chọn số từ 100 - 999",
        4: "Chọn số từ 1000 - 9999"
      };
      const hint = hintTexts[difficulty] || "Chọn số";
      document.getElementById('secret-hint').textContent = hint;
      
      if (room.status === 'finished') {
        stopPolling();
        handleGameFinished(room);
        return;
      }

      if (room.status === 'waiting') {
        showScreen('waiting');
      } 
      else if (room.status === 'setSecret') {
        if (room.my_secret) {
          mySecret = room.my_secret;
          showScreen('secret');
          document.getElementById('secret-waiting').classList.remove('hidden');
          document.getElementById('btn-set-secret').classList.add('hidden');
          document.getElementById('secret-input-number').disabled = true;
        } else {
          showScreen('secret');
          document.getElementById('secret-waiting').classList.add('hidden');
          document.getElementById('btn-set-secret').classList.remove('hidden');
          document.getElementById('secret-input-number').disabled = false;
        }
      } 
      else if (room.status === 'playing') {
        if (!document.getElementById('screen-game').classList.contains('active')) {
          enterGameScreen(room);
        }
        
        isMyTurn = (room.current_turn === myRole);
        updateTurnUI(room);

        // Fetch guesses
        const guessData = await api('hl_get_guesses', { room_id: roomId, after_id: lastGuessId });
        if (guessData.guesses && guessData.guesses.length > 0) {
          guessData.guesses.forEach(g => {
            lastGuessId = Math.max(lastGuessId, parseInt(g.id));
            if (g.player === myRole) {
              renderGuess(g);
              scrollHistoryToBottom();
            }
          });
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, POLL_MS);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ============================================
// SET SECRET
// ============================================
async function hlSetSecret() {
  const secretInput = document.getElementById('secret-input-number');
  const secretVal = secretInput.value;
  if (!secretVal) {
    showToast('Vui lòng nhập số');
    return;
  }

  const secret = parseInt(secretVal);
  if (difficulty === 2 && (secret < 10 || secret > 99)) {
    showToast('Vui lòng nhập số từ 10 đến 99');
    return;
  }
  if (difficulty === 3 && (secret < 100 || secret > 999)) {
    showToast('Vui lòng nhập số từ 100 đến 999');
    return;
  }
  if (difficulty === 4 && (secret < 1000 || secret > 9999)) {
    showToast('Vui lòng nhập số từ 1000 đến 9999');
    return;
  }

  const btn = document.getElementById('btn-set-secret');
  btn.disabled = true;
  btn.textContent = '⏳ Đang gửi...';

  try {
    const data = await api('hl_set_secret', { room_id: roomId, secret: secret });
    if (data.error) {
      showToast(data.error, 'error');
      btn.disabled = false;
      btn.textContent = 'Xác nhận';
      return;
    }
    
    mySecret = secret;
    document.getElementById('secret-waiting').classList.remove('hidden');
    btn.classList.add('hidden');
    secretInput.disabled = true;
  } catch (err) {
    showToast('Lỗi kết nối server', 'error');
    btn.disabled = false;
    btn.textContent = 'Xác nhận';
  }
}

// ============================================
// GAME SCREEN
// ============================================
function enterGameScreen(room) {
  showScreen('game');
  mySecret = room.my_secret;

  const secContainer = document.getElementById('my-secret-container');
  if (mySecret !== null) {
    secContainer.classList.remove('hidden');
    secretVisible = false;
    renderSecretDisplay();
  }
  
  document.getElementById('guess-input-number').focus();
}

function renderSecretDisplay() {
  const display = document.getElementById('my-secret-display');
  if (mySecret === null) return;
  display.textContent = secretVisible ? mySecret : '???';

  const iconOff = document.getElementById('icon-eye-off');
  const iconOn = document.getElementById('icon-eye-on');
  iconOff.classList.toggle('hidden', secretVisible);
  iconOn.classList.toggle('hidden', !secretVisible);
}

function toggleSecretVisibility() {
  secretVisible = !secretVisible;
  renderSecretDisplay();
}

function updateTurnUI(room) {
  const btnGuess = document.getElementById('btn-guess');
  const inputGuess = document.getElementById('guess-input-number');
  const timerContainer = document.getElementById('timer-container');

  if (isMyTurn) {
    btnGuess.disabled = false;
    inputGuess.disabled = false;
    timerContainer.style.visibility = 'visible';
    timerContainer.style.opacity = '1';
  } else {
    btnGuess.disabled = true;
    inputGuess.disabled = true;
    timerContainer.style.opacity = '0';
  }

  if (room.turn_start_time) {
    startTimer(room.turn_start_time);
  }
}

function startTimer(serverStart) {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  turnStartTime = serverStart;

  const timerBar = document.getElementById('timer-bar');
  const timerText = document.getElementById('timer-text');

  function tick() {
    let elapsed = (Date.now() - turnStartTime) / 1000;
    const remaining = Math.max(0, TURN_DURATION - elapsed);
    timerBar.style.width = (remaining / TURN_DURATION) * 100 + '%';
    timerText.textContent = Math.ceil(remaining) + 's';

    if (remaining <= 0 && isMyTurn) {
      // Auto submit random guess or skip
      const randMap = { 2: [10, 99], 3: [100, 999], 4: [1000, 9999] };
      const range = randMap[difficulty] || [10, 99];
      const randGuess = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
      document.getElementById('guess-input-number').value = randGuess;
      hlSubmitGuess();
      return;
    }
    
    timerRAF = requestAnimationFrame(tick);
  }
  tick();
}

// ============================================
// SUBMIT GUESS
// ============================================
async function hlSubmitGuess() {
  if (!isMyTurn) return;

  const inputEl = document.getElementById('guess-input-number');
  const guessVal = inputEl.value;

  if (!guessVal) {
    inputEl.classList.add('animate-shake');
    setTimeout(() => inputEl.classList.remove('animate-shake'), 400);
    return;
  }

  const guess = parseInt(guessVal);
  const btn = document.getElementById('btn-guess');
  btn.disabled = true;

  try {
    const data = await api('hl_submit_guess', { room_id: roomId, guess: guess });
    if (data.error) { 
      showToast(data.error, 'error'); 
      btn.disabled = false; 
      return; 
    }
    inputEl.value = '';
    // Polling will fetch the guess and render it
  } catch (err) {
    console.error(err);
    btn.disabled = false;
  }
}

function renderGuess(guessObj) {
  const emptyEl = document.getElementById('history-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  const historyArea = document.getElementById('history-area');
  const item = document.createElement('div');
  item.className = 'bg-[var(--bg-card)] rounded-xl p-3.5 border border-[var(--border)] shadow-sm';

  let resHtml = '';
  let colorClass = '';
  
  if (guessObj.result === 'higher') {
    colorClass = 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    resHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg> Cao hơn`;
  } else if (guessObj.result === 'lower') {
    colorClass = 'text-sky-500 bg-sky-500/10 border-sky-500/20';
    resHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg> Thấp hơn`;
  } else {
    colorClass = 'text-green-500 bg-green-500/10 border-green-500/20';
    resHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Chính xác!`;
  }

  item.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="text-xl font-bold text-[var(--text-primary)] pl-2">
        ${guessObj.guess}
      </div>
      <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold tracking-wide ${colorClass}">
        ${resHtml}
      </div>
    </div>
  `;

  historyArea.appendChild(item);
}

function scrollHistoryToBottom() {
  const area = document.getElementById('history-area');
  requestAnimationFrame(() => area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' }));
}

// ============================================
// GAME OVER & SURRENDER
// ============================================
function handleGameFinished(room) {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  const iWon = room.winner === myRole;
  
  if (iWon) {
    showResultModal('win', 'Chiến Thắng!', 'Bạn đã đoán trúng số của đối thủ!');
  } else {
    showResultModal('lose', 'Thua Cuộc!', 'Đối thủ đã đoán được số của bạn trước!');
  }
}

function showResultModal(type, title, desc) {
  const overlay = document.getElementById('modal-result');
  const content = document.getElementById('modal-content');
  const emojiBg = document.getElementById('result-emoji-bg');
  const titleEl = document.getElementById('result-title');
  
  if (overlay) overlay.className = 'modal-overlay fixed inset-0 z-50 flex items-center justify-center px-6';
  if (content) content.className = 'modal-content bg-[var(--bg-card)] rounded-3xl p-8 w-full max-w-sm text-center border border-[var(--border)] relative overflow-hidden';
  if (emojiBg) emojiBg.className = 'result-icon-bg';
  if (titleEl) titleEl.className = 'text-2xl font-bold mb-2';

  let emoji = '🎮';
  if (type === 'win') {
    if (overlay) overlay.classList.add('win-modal');
    if (content) content.classList.add('win-content');
    if (emojiBg) emojiBg.classList.add('win-icon-bg');
    if (titleEl) titleEl.classList.add('win-title');
    emoji = '🏆';
  } else if (type === 'lose') {
    if (overlay) overlay.classList.add('lose-modal');
    if (content) content.classList.add('lose-content');
    if (emojiBg) emojiBg.classList.add('lose-icon-bg');
    if (titleEl) titleEl.classList.add('lose-title');
    emoji = '💀';
  }

  document.getElementById('result-emoji').textContent = emoji;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-desc').textContent = desc;
  document.getElementById('modal-result').classList.remove('hidden');
}

async function hlSurrender() {
  if (!confirm('Bạn có chắc muốn đầu hàng? Đối thủ sẽ thắng trận này.')) return;
  const btn = document.getElementById('btn-hl-surrender');
  btn.disabled = true;
  try {
    const data = await api('hl_surrender', { room_id: roomId });
    if (data.error) { showToast(data.error, 'error'); btn.disabled = false; return; }
  } catch (err) {
    console.error(err);
    btn.disabled = false;
  }
}

function cancelRoom() {
  window.location.href = 'index.html';
}

function backToLobby() {
  window.location.href = 'index.html';
}
