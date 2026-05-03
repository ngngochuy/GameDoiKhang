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
let myGuessesList = [];

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
        2: "Chọn số từ 00 - 99",
        3: "Chọn số từ 000 - 999",
        4: "Chọn số từ 0000 - 9999"
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
          let updated = false;
          guessData.guesses.forEach(g => {
            lastGuessId = Math.max(lastGuessId, parseInt(g.id));
            if (g.player === myRole) {
              myGuessesList.push(g);
              updated = true;
            }
          });
          if (updated) renderGuessRange(myGuessesList);
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
  if (difficulty === 2 && (secret < 0 || secret > 99)) {
    showToast('Vui lòng nhập số từ 00 đến 99');
    return;
  }
  if (difficulty === 3 && (secret < 0 || secret > 999)) {
    showToast('Vui lòng nhập số từ 000 đến 999');
    return;
  }
  if (difficulty === 4 && (secret < 0 || secret > 9999)) {
    showToast('Vui lòng nhập số từ 0000 đến 9999');
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
  
  if (myGuessesList.length === 0) renderGuessRange([]);
  
  document.getElementById('guess-input-number').focus();
}

function renderSecretDisplay() {
  const display = document.getElementById('my-secret-display');
  if (mySecret === null) return;
  display.textContent = secretVisible ? mySecret.toString().padStart(difficulty, '0') : '?'.repeat(difficulty);

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
      const randMap = { 2: [0, 99], 3: [0, 999], 4: [0, 9999] };
      const range = randMap[difficulty] || [0, 99];
      const randGuess = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
      document.getElementById('guess-input-number').value = randGuess.toString().padStart(difficulty, '0');
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

function renderGuessRange(guesses) {
  let min = null;
  let max = null;
  
  guesses.forEach(g => {
    const val = parseInt(g.guess);
    if (g.result === 'higher') {
      if (min === null || val > min) min = val;
    } else if (g.result === 'lower') {
      if (max === null || val < max) max = val;
    }
  });

  const baseMin = 0;
  const baseMax = difficulty === 2 ? 99 : (difficulty === 3 ? 999 : 9999);
  
  let displayMin = min !== null ? min : baseMin;
  let displayMax = max !== null ? max : baseMax;

  displayMin = displayMin.toString().padStart(difficulty, '0');
  displayMax = displayMax.toString().padStart(difficulty, '0');

  const area = document.getElementById('history-area');
  area.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full w-full py-4">
      <p class="text-[11px] text-[var(--text-secondary)] uppercase tracking-widest font-bold mb-6">Khoảng tìm kiếm</p>
      
      <div class="flex items-center justify-center gap-3 w-full max-w-[300px] mx-auto">
        <!-- Lớn hơn -->
        <div class="flex-1 bg-[var(--bg-card)] border-2 rounded-2xl py-5 flex flex-col items-center justify-center transition-colors duration-300 ${min !== null ? 'border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)] bg-amber-500/5' : 'border-[var(--border)] text-[var(--text-secondary)]'}">
          <span class="text-3xl font-black tracking-tight">${displayMin}</span>
        </div>
        
        <div class="shrink-0 text-xl font-black text-[var(--text-muted)] opacity-50">&lt;</div>
        
        <!-- Dấu hỏi -->
        <div class="shrink-0 w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-white text-2xl font-black shadow-[0_0_20px_rgba(168,85,247,0.4)] relative">
          <div class="absolute inset-0 rounded-full border-2 border-white/20 animate-ping opacity-50"></div>
          ?
        </div>
        
        <div class="shrink-0 text-xl font-black text-[var(--text-muted)] opacity-50">&lt;</div>
        
        <!-- Nhỏ hơn -->
        <div class="flex-1 bg-[var(--bg-card)] border-2 rounded-2xl py-5 flex flex-col items-center justify-center transition-colors duration-300 ${max !== null ? 'border-sky-500/40 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.15)] bg-sky-500/5' : 'border-[var(--border)] text-[var(--text-secondary)]'}">
          <span class="text-3xl font-black tracking-tight">${displayMax}</span>
        </div>
      </div>
      
      ${guesses.length > 0 ? `<p class="mt-8 text-[11px] text-[var(--text-muted)]">Bạn đã đoán ${guesses.length} lần</p>` : ''}
    </div>
  `;
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
