// ============================================
// 🔐 Game Giải Mã Số — PHP/MySQL Backend
// ============================================

// ─── API URL ───
// 👉 Thay đổi URL khi deploy lên VPS
const API_URL = 'api.php';

// ─── Game State ───
let myPlayerId = localStorage.getItem('gms_player_id');
if (!myPlayerId) {
  myPlayerId = 'p_' + Math.random().toString(36).substring(2, 12);
  localStorage.setItem('gms_player_id', myPlayerId);
}

let myRole = null;       // "player1" or "player2"
let roomId = sessionStorage.getItem('gms_room_id') || null;
let isMyTurn = false;
let timerRAF = null;
let turnStartTime = null;
let pollInterval = null;
let lastGuessId = 0;
let myGuessCount = 0;
let isLiveTest = false;
let liveTestSecret = null;
let mySecret = null;
let isPaused = false;
let myPausesLeft = 5;

const TURN_DURATION = 60;
const DIGITS = 4;
const POLL_MS = 1000;

// ============================================
// SCREEN MANAGEMENT
// ============================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ============================================
// OTP INPUT SETUP
// ============================================
function setupOtpInputs(inputIds) {
  const inputs = inputIds.map(id => document.getElementById(id));
  inputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val.slice(-1);
      if (val && idx < inputs.length - 1) inputs[idx + 1].focus();
      e.target.classList.toggle('filled', !!e.target.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].value = '';
        inputs[idx - 1].classList.remove('filled');
      }
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      for (let i = 0; i < Math.min(paste.length, inputs.length); i++) {
        inputs[i].value = paste[i];
        inputs[i].classList.toggle('filled', true);
      }
      inputs[Math.min(paste.length, inputs.length - 1)].focus();
    });
    input.addEventListener('focus', () => setTimeout(() => input.select(), 10));
  });
}

setupOtpInputs(['join-d1', 'join-d2', 'join-d3']);
setupOtpInputs(['secret-d1', 'secret-d2', 'secret-d3', 'secret-d4']);
setupOtpInputs(['guess-d1', 'guess-d2', 'guess-d3', 'guess-d4']);

// ============================================
// API HELPER
// ============================================
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

// ============================================
// LIVE TEST MODE
// ============================================
function startLiveTest() {
  isLiveTest = true;
  myRole = 'player1';

  liveTestSecret = '';
  for (let i = 0; i < DIGITS; i++) liveTestSecret += Math.floor(Math.random() * 10);

  document.getElementById('mode-badge').textContent = 'LIVE TEST';
  document.getElementById('mode-badge').style.background = '#16a34a';

  document.getElementById('my-secret-container').classList.add('hidden');

  showScreen('game');
  isMyTurn = true;
  document.getElementById('btn-guess').disabled = false;
  ['guess-d1','guess-d2','guess-d3','guess-d4'].forEach(id => {
    document.getElementById(id).disabled = false;
  });

  startLocalTimer();
  focusFirstEmpty(['guess-d1','guess-d2','guess-d3','guess-d4']);
  console.log('🧪 LIVE TEST — Secret:', liveTestSecret);
}

// ============================================
// CREATE ROOM
// ============================================
async function createRoom() {
  const btn = document.getElementById('btn-create');
  btn.disabled = true;
  btn.textContent = '⏳ Đang tạo...';

  try {
    const data = await api('create_room');
    if (data.error) {
      showToast(data.error, 'error');
      btn.disabled = false;
      btn.textContent = '✨ Tạo Phòng Mới';
      return;
    }

    roomId = String(data.room_id);
    sessionStorage.setItem('gms_room_id', roomId);
    myRole = 'player1';
    isLiveTest = false;

    document.getElementById('waiting-room-code').textContent = roomId;
    console.log('Room created:', roomId);
    showScreen('waiting');
    startPolling('waitForPlayer');
  } catch (err) {
    console.error('createRoom error:', err);
    showToast('Không thể kết nối server. Hãy thử LIVE TEST.', 'error');
    btn.disabled = false;
    btn.textContent = '✨ Tạo Phòng Mới';
  }
}

// ============================================
// JOIN ROOM
// ============================================
async function joinRoom() {
  const code = ['join-d1','join-d2','join-d3'].map(id => document.getElementById(id).value).join('');
  if (code.length !== 3 || !/^\d{3}$/.test(code)) {
    showToast('Vui lòng nhập đủ 3 chữ số', 'warning');
    return;
  }

  const btn = document.getElementById('btn-join');
  btn.disabled = true;
  btn.textContent = '⏳ Đang kết nối...';

  try {
    const data = await api('join_room', { room_id: code });
    if (data.error) {
      showToast(data.error, 'error');
      btn.disabled = false;
      btn.textContent = '🚀 Vào Phòng';
      return;
    }

    roomId = data.room_id;
    sessionStorage.setItem('gms_room_id', roomId);
    myRole = 'player2';
    isLiveTest = false;
    showToast('Đã vào phòng ' + roomId + '!', 'success');

    showScreen('secret');
    focusFirstEmpty(['secret-d1','secret-d2','secret-d3','secret-d4']);
  } catch (err) {
    console.error('joinRoom error:', err);
    showToast('Không thể kết nối server.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Vào Phòng';
  }
}

// ============================================
// CANCEL ROOM
// ============================================
function cancelRoom() {
  stopPolling();
  if (roomId) api('cancel_room', { room_id: roomId });
  resetState();
  showScreen('lobby');
}

// ============================================
// SET SECRET
// ============================================
async function setSecret() {
  const digits = ['secret-d1','secret-d2','secret-d3','secret-d4'].map(id => document.getElementById(id).value);
  if (digits.some(d => d === '' || !/^\d$/.test(d))) {
    showToast('Vui lòng nhập đủ 4 chữ số');
    return;
  }

  const secret = digits.join('');
  mySecret = secret;

  const btn = document.getElementById('btn-set-secret');
  btn.disabled = true;
  btn.textContent = '⏳ Đang gửi...';

  try {
    const data = await api('set_secret', { room_id: roomId, secret: secret });
    if (data.error) { showToast(data.error); btn.disabled = false; btn.textContent = '🔒 Xác Nhận'; return; }

    document.getElementById('secret-waiting').classList.remove('hidden');
    btn.classList.add('hidden');

    // Start polling for game state
    startPolling('waitForGame');
  } catch (err) {
    showToast('Lỗi kết nối server.');
    btn.disabled = false;
    btn.textContent = '🔒 Xác Nhận';
  }
}

// ============================================
// SUBMIT GUESS
// ============================================
async function submitGuess() {
  if (!isMyTurn && !isLiveTest) return;

  const digits = [
    document.getElementById('guess-d1').value,
    document.getElementById('guess-d2').value,
    document.getElementById('guess-d3').value,
    document.getElementById('guess-d4').value,
  ];

  if (digits.some(d => d === '' || !/^\d$/.test(d))) {
    shakeInputs();
    return;
  }

  const guess = digits.join('');
  const btn = document.getElementById('btn-guess');
  btn.disabled = true;

  // ─── LIVE TEST ───
  if (isLiveTest) {
    const result = checkGuessLocal(guess, liveTestSecret);
    renderGuess({ player: 'player1', digits: guess, correct: result });
    scrollHistoryToBottom();
    clearGuessInputs();
    myGuessCount++;

    if (result === DIGITS) {
      showResultModal('🏆', 'Chính Xác!',
        `Bạn đã đoán đúng sau ${myGuessCount} lượt!`,
        `Số bí mật: <span class="text-green-600 font-bold text-xl tracking-wider">${liveTestSecret}</span>`
      );
    } else {
      startLocalTimer();
      btn.disabled = false;
    }
    return;
  }

  // ─── ONLINE ───
  try {
    const data = await api('submit_guess', { room_id: roomId, digits: guess });
    if (data.error) { showLobbyError(data.error); btn.disabled = false; return; }

    clearGuessInputs();

    if (data.won) {
      // Thắng! Polling sẽ tự detect status=finished
    }
    // Polling sẽ cập nhật giao diện
  } catch (err) {
    console.error('Submit error:', err);
    btn.disabled = false;
  }
}

// ============================================
// LOCAL CHECK (LIVE TEST)
// ============================================
function checkGuessLocal(guess, secret) {
  let correct = 0;
  const secretUsed = Array(DIGITS).fill(false);
  for (let i = 0; i < DIGITS; i++) {
    for (let j = 0; j < DIGITS; j++) {
      if (secretUsed[j]) continue;
      if (guess[i] === secret[j]) {
        correct++;
        secretUsed[j] = true;
        break;
      }
    }
  }
  return correct;
}

// ============================================
// POLLING
// ============================================
function startPolling(mode) {
  stopPolling();

  pollInterval = setInterval(async () => {
    try {
      const roomData = await api('get_room', { room_id: roomId });
      if (roomData.error) { stopPolling(); return; }
      const room = roomData.room;

      switch (mode) {
        case 'waitForPlayer':
          if (room.player2_id) {
            stopPolling();
            showScreen('secret');
            focusFirstEmpty(['secret-d1','secret-d2','secret-d3','secret-d4']);
          }
          break;

        case 'waitForGame':
          if (room.status === 'playing') {
            stopPolling();
            enterGameScreen(room);
            startPolling('gameLoop');
          }
          break;

        case 'gameLoop':
          // Update turn
          const wasMyTurn = isMyTurn;
          isMyTurn = (room.current_turn === myRole);
          
          if (room.is_paused) {
            isPaused = true;
            showPauseModal(room);
          } else {
            isPaused = false;
            document.getElementById('modal-pause').classList.add('hidden');
          }
          
          updateTurnUI(room);

          // Fetch new guesses — chỉ hiện lịch sử của mình
          const guessData = await api('get_guesses', { room_id: roomId, after_id: lastGuessId });
          if (guessData.guesses && guessData.guesses.length > 0) {
            guessData.guesses.forEach(g => {
              lastGuessId = Math.max(lastGuessId, parseInt(g.id));
              if (g.player === myRole) {
                renderGuess(g);
                scrollHistoryToBottom();
              }
            });
          }

          // Check finished
          if (room.status === 'finished') {
            stopPolling();
            handleGameFinished(room);
          }
          break;
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
// ENTER GAME SCREEN
// ============================================
function enterGameScreen(room) {
  showScreen('game');
  document.getElementById('mode-badge').textContent = 'ONLINE';
  document.getElementById('mode-badge').style.background = '#3b82f6';
  
  if (room && room.my_secret) mySecret = room.my_secret;
  if (room) {
    isPaused = room.is_paused;
    myPausesLeft = (myRole === 'player1') ? room.player1_pauses : room.player2_pauses;
  }

  const secContainer = document.getElementById('my-secret-container');
  if (isLiveTest) {
    secContainer.classList.add('hidden');
  } else if (mySecret) {
    secContainer.classList.remove('hidden');
    const display = document.getElementById('my-secret-display');
    display.innerHTML = mySecret.split('').map(d => 
      `<div class="w-[34px] h-[40px] rounded-lg bg-[#0a0e1a] border border-indigo-500/40 flex items-center justify-center text-lg font-bold text-indigo-300 shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]">${d}</div>`
    ).join('');
  }

  isMyTurn = (room.current_turn === myRole);
  updateTurnUI(room);
  focusFirstEmpty(['guess-d1','guess-d2','guess-d3','guess-d4']);
}

// ============================================
// UPDATE TURN UI
// ============================================
function updateTurnUI(room) {
  if (room.status !== 'playing') return;

  const btnGuess = document.getElementById('btn-guess');
  const inputs = ['guess-d1','guess-d2','guess-d3','guess-d4'];
  const timerContainer = document.getElementById('timer-container');

  if (isMyTurn) {
    btnGuess.disabled = false;
    inputs.forEach(id => document.getElementById(id).disabled = false);
    if (timerContainer) timerContainer.classList.remove('opacity-0');
  } else {
    btnGuess.disabled = true;
    inputs.forEach(id => document.getElementById(id).disabled = true);
    if (timerContainer) timerContainer.classList.add('opacity-0');
  }

  // Timer
  if (room.turn_start_time) {
    startTimerFromServer(room.turn_start_time, room);
  }
}

// ============================================
// TIMER
// ============================================
function startTimerFromServer(serverStart, room) {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  turnStartTime = serverStart;

  const timerBar = document.getElementById('timer-bar');
  const timerText = document.getElementById('timer-text');

  function tick() {
    let elapsed = (Date.now() - turnStartTime) / 1000;
    if (isPaused && room && room.turn_pause_time) {
       elapsed = (room.turn_pause_time - turnStartTime) / 1000;
    }

    const remaining = Math.max(0, TURN_DURATION - elapsed);
    timerBar.style.width = (remaining / TURN_DURATION) * 100 + '%';
    timerText.textContent = Math.ceil(remaining) + 's';

    timerBar.classList.remove('warning', 'danger');
    if (remaining <= 5) timerBar.classList.add('danger');
    else if (remaining <= 10) timerBar.classList.add('warning');

    if (remaining <= 0 && isMyTurn && !isPaused && !isLiveTest) {
      skipTurn();
      return;
    }
    
    // Continue running if not paused
    if (!isPaused) {
      timerRAF = requestAnimationFrame(tick);
    }
  }
  tick(); // draw immediately
}

function startLocalTimer() {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  turnStartTime = Date.now();

  const timerBar = document.getElementById('timer-bar');
  const timerText = document.getElementById('timer-text');

  function tick() {
    const elapsed = (Date.now() - turnStartTime) / 1000;
    const remaining = Math.max(0, TURN_DURATION - elapsed);
    timerBar.style.width = (remaining / TURN_DURATION) * 100 + '%';
    timerText.textContent = Math.ceil(remaining) + 's';

    timerBar.classList.remove('warning', 'danger');
    if (remaining <= 5) timerBar.classList.add('danger');
    else if (remaining <= 10) timerBar.classList.add('warning');

    if (remaining <= 0) { autoSubmitRandomGuess(); return; }
    timerRAF = requestAnimationFrame(tick);
  }
  timerRAF = requestAnimationFrame(tick);
}

// ============================================
// AUTO-SUBMIT
// ============================================
function autoSubmitRandomGuess() {
  ['guess-d1','guess-d2','guess-d3','guess-d4'].forEach(id => {
    document.getElementById(id).value = Math.floor(Math.random() * 10);
  });
  submitGuess();
}

// ============================================
// RENDER GUESS
// ============================================
function renderGuess(guess) {
  const emptyEl = document.getElementById('history-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  const historyArea = document.getElementById('history-area');
  const correct = parseInt(guess.correct) || 0;

  const item = document.createElement('div');
  item.className = 'guess-item bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100';

  const digitsArr = guess.digits.split('');
  let digitsHTML = '';
  for (let i = 0; i < DIGITS; i++) {
    digitsHTML += `<span class="digit-box">${digitsArr[i]}</span>`;
  }

  let numColor = '#ef4444';
  if (correct === DIGITS) numColor = '#16a34a';
  else if (correct >= 3) numColor = '#2563eb';
  else if (correct >= 1) numColor = '#f59e0b';

  item.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        ${digitsHTML}
      </div>
      <div class="result-badge">
        <span class="number" style="color: ${numColor}">${correct}</span>
        <span class="label" style="color: ${numColor}">ĐÚNG</span>
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
// GAME FINISHED
// ============================================
function handleGameFinished(room) {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  const iWon = room.winner === myRole;

  if (iWon) {
    showResultModal('🏆', 'Chiến Thắng!', 'Bạn đã giải mã thành công!', '');
  } else {
    showResultModal('😞', 'Thua Cuộc!', 'Đối thủ giải mã trước!', '');
  }
}

// ============================================
// MODAL & HELPERS
// ============================================
function showResultModal(emoji, title, desc, secretHTML) {
  document.getElementById('result-emoji').textContent = emoji;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-desc').textContent = desc;
  document.getElementById('result-secret').innerHTML = secretHTML;
  document.getElementById('modal-result').classList.remove('hidden');
}

function backToLobby() {
  document.getElementById('modal-result').classList.add('hidden');
  stopPolling();
  resetState();
  showScreen('lobby');
}

// ============================================
// AUTO RECONNECT (ON PAGE LOAD)
// ============================================
window.addEventListener('DOMContentLoaded', async () => {
  if (roomId) {
    const data = await api('get_room', { room_id: roomId });
    if (data.ok && data.room) {
      if (data.room.status === 'finished') {
        resetState();
        showScreen('lobby');
        return;
      }
      myRole = (data.room.player1_id === myPlayerId) ? 'player1' : 'player2';
      
      if (data.room.status === 'waiting') {
        if (!data.room.player2_id) {
          showScreen('waiting');
          document.getElementById('waiting-room-code').textContent = roomId;
          startPolling('waitForPlayer');
        } else {
          if (data.room.my_secret) {
            mySecret = data.room.my_secret;
            showScreen('secret');
            document.getElementById('secret-waiting').classList.remove('hidden');
            document.getElementById('btn-set-secret').classList.add('hidden');
            startPolling('checkSecret');
          } else {
            showScreen('secret');
            document.getElementById('secret-waiting').classList.add('hidden');
            document.getElementById('btn-set-secret').classList.remove('hidden');
            document.getElementById('btn-set-secret').disabled = false;
            document.getElementById('btn-set-secret').textContent = '🔒 Xác Nhận';
            startPolling('checkSecret');
          }
        }
      } else if (data.room.status === 'playing') {
        enterGameScreen(data.room);
        startPolling('poll');
      }
    } else {
      resetState();
      showScreen('lobby');
    }
  }
});

// ============================================
// TOAST NOTIFICATION SYSTEM
// ============================================
function showToast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');

  const icons = { error: '\u2716', warning: '\u26a0', success: '\u2714', info: 'i' };
  const colors = {
    error:   'bg-red-500/10 border-red-500/20 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    info:    'bg-blue-500/10 border-blue-500/20 text-blue-400',
  };

  toast.className = `pointer-events-auto w-full max-w-sm flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium backdrop-blur-sm ${colors[type] || colors.info}`;
  toast.style.animation = 'toastIn 0.3s ease';
  toast.innerHTML = `<span class="text-sm font-bold shrink-0">${icons[type] || icons.info}</span><span class="flex-1">${msg}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================
// PAUSE LOGIC
// ============================================
async function pauseGame() {
  if (myPausesLeft <= 0) {
    showToast('Bạn đã hết lượt tạm dừng', 'warning');
    return;
  }
  document.getElementById('btn-pause').classList.add('opacity-50', 'pointer-events-none');
  const data = await api('pause_game', { room_id: roomId, player_id: myPlayerId });
  document.getElementById('btn-pause').classList.remove('opacity-50', 'pointer-events-none');
  if (data.error) showToast(data.error, 'error');
}

async function resumeGame() {
  const btn = document.getElementById('btn-resume');
  btn.disabled = true;
  btn.classList.add('opacity-50');
  const data = await api('resume_game', { room_id: roomId });
  if (data.error) {
    showToast(data.error, 'error');
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }
}

async function skipTurn() {
  if (!isMyTurn) return;
  isMyTurn = false;
  document.getElementById('btn-guess').disabled = true;
  ['guess-d1','guess-d2','guess-d3','guess-d4'].forEach(id => {
    document.getElementById(id).disabled = true;
  });
  showToast('Đã hết thời gian, bạn mất lượt!', 'warning');
  await api('skip_turn', { room_id: roomId });
}

function showPauseModal(room) {
  document.getElementById('modal-pause').classList.remove('hidden');
  
  myPausesLeft = (myRole === 'player1') ? room.player1_pauses : room.player2_pauses;
  document.getElementById('pause-count').textContent = myPausesLeft;

  const btnResume = document.getElementById('btn-resume');
  const btnText = document.getElementById('btn-resume-text');
  const progress = document.getElementById('resume-progress');
  const statusText = document.getElementById('pause-status-text');

  const myReq = (myRole === 'player1') ? room.resume_request_p1 : room.resume_request_p2;
  const otherReq = (myRole === 'player1') ? room.resume_request_p2 : room.resume_request_p1;

  if (myReq) {
     btnResume.disabled = true;
     btnResume.classList.add('opacity-50');
     const timeLeftMs = 10000 - (Date.now() - myReq);
     if (timeLeftMs > 0) {
       btnText.textContent = `Chờ đối thủ (${Math.floor(timeLeftMs/1000)}s)...`;
       progress.style.width = `${(timeLeftMs/10000)*100}%`;
       statusText.textContent = 'Bạn đã yêu cầu tiếp tục. Đang chờ đối thủ...';
     } else {
       btnText.textContent = 'Hết giờ yêu cầu';
       progress.style.width = '0%';
     }
  } else if (otherReq) {
     btnResume.disabled = false;
     btnResume.classList.remove('opacity-50');
     const timeLeftMs = 10000 - (Date.now() - otherReq);
     if (timeLeftMs > 0) {
       btnText.textContent = `Đồng ý tiếp tục (${Math.floor(timeLeftMs/1000)}s)`;
       progress.style.width = '0%';
       statusText.textContent = 'Đối thủ muốn tiếp tục trò chơi!';
     } else {
       btnText.textContent = 'Tiếp tục chơi';
       progress.style.width = '0%';
       statusText.textContent = 'Hai bên cùng nhấn tiếp tục để chơi tiếp.';
     }
  } else {
     btnResume.disabled = false;
     btnResume.classList.remove('opacity-50');
     btnText.textContent = 'Tiếp tục chơi';
     progress.style.width = '0%';
     statusText.textContent = 'Cả hai cùng nhấn Tiếp tục để chơi tiếp.';
  }
}

function clearGuessInputs() {
  ['guess-d1','guess-d2','guess-d3','guess-d4'].forEach(id => {
    document.getElementById(id).value = '';
    document.getElementById(id).classList.remove('filled');
  });
  document.getElementById('guess-d1').focus();
}

function focusFirstEmpty(ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el.value) { setTimeout(() => el.focus(), 100); return; }
  }
}

function shakeInputs() {
  const c = document.querySelector('#screen-game .shrink-0:last-child');
  c.style.animation = 'none';
  c.offsetHeight;
  c.style.animation = 'shake 0.4s ease';
}

function resetState() {
  myRole = null;
  roomId = null;
  sessionStorage.removeItem('gms_room_id');
  isMyTurn = false;
  turnStartTime = null;
  lastGuessId = 0;
  myGuessCount = 0;
  isLiveTest = false;
  liveTestSecret = null;
  mySecret = null;
  isPaused = false;
  myPausesLeft = 5;
  if (timerRAF) cancelAnimationFrame(timerRAF);
  stopPolling();

  ['join-d1','join-d2','join-d3'].forEach(id => { document.getElementById(id).value = ''; });
  ['secret-d1','secret-d2','secret-d3','secret-d4'].forEach(id => { document.getElementById(id).value = ''; });
  clearGuessInputs();

  document.getElementById('secret-waiting').classList.add('hidden');
  const btnS = document.getElementById('btn-set-secret');
  btnS.classList.remove('hidden'); btnS.disabled = false; btnS.textContent = '🔒 Xác Nhận';

  const hist = document.getElementById('history-area');
  hist.querySelectorAll('.guess-item').forEach(el => el.remove());
  const empty = document.getElementById('history-empty');
  if (empty) empty.style.display = '';

  const tb = document.getElementById('timer-bar');
  if (tb) { tb.style.width = '100%'; tb.classList.remove('warning','danger'); }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const gs = document.getElementById('screen-game');
    const ss = document.getElementById('screen-secret');
    if (gs.classList.contains('active') && (isMyTurn || isLiveTest)) submitGuess();
    else if (ss.classList.contains('active')) setSecret();
  }
});

// Prevent zoom on double tap
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  if (Date.now() - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = Date.now();
}, false);

// ============================================
// CLEAR CACHE 
// ============================================
function clearCache() {
  localStorage.clear();
  sessionStorage.clear();

  // Unregister service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister());
    });
  }

  // Clear caches API
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }

  // Re-generate player ID
  myPlayerId = 'p_' + Math.random().toString(36).substring(2, 12);
  localStorage.setItem('gms_player_id', myPlayerId);

  showToast('Đã xoá cache! Trang sẽ reload...', 'success');
  setTimeout(() => location.reload(true), 1000);
}

console.log('🎮 Game Giải Mã Số loaded! Player:', myPlayerId);
