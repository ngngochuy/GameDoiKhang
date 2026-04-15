// ============================================
// 🔐 Game Giải Mã Số — Firebase Real-time + LIVE TEST
// ============================================

// ─── Firebase Config ───
// 👉 THAY THẾ bằng config Firebase thật của bạn
const firebaseConfig = {
  apiKey: "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxx"
};

let firebaseReady = false;
try {
  firebase.initializeApp(firebaseConfig);
  firebaseReady = true;
} catch (e) {
  console.warn('Firebase init error:', e);
}
const db = firebaseReady ? firebase.database() : null;

// ─── Game State ───
let myPlayerId = null;
let mySecret = null;
let roomId = null;
let roomRef = null;
let guessesRef = null;
let timerRAF = null;
let timerInterval = null;
let turnStartTime = null;
let isMyTurn = false;
let guessListenerAttached = false;
let myGuessCount = 0;
let opponentGuessCount = 0;
let isLiveTest = false;
let liveTestSecret = null;

const TURN_DURATION = 30;
const DIGITS = 4;
const sessionId = 'p_' + Math.random().toString(36).substring(2, 10);

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
// LIVE TEST MODE (chơi 1 mình, không cần Firebase)
// ============================================
function startLiveTest() {
  isLiveTest = true;
  myPlayerId = 'player1';

  // Random 4-digit secret
  liveTestSecret = '';
  for (let i = 0; i < DIGITS; i++) liveTestSecret += Math.floor(Math.random() * 10);

  document.getElementById('mode-badge').textContent = 'LIVE TEST';
  document.getElementById('mode-badge').style.background = '#16a34a';

  showScreen('game');
  isMyTurn = true;
  document.getElementById('btn-guess').disabled = false;
  ['guess-d1','guess-d2','guess-d3','guess-d4'].forEach(id => {
    document.getElementById(id).disabled = false;
  });

  startLiveTestTimer();
  focusFirstEmpty(['guess-d1','guess-d2','guess-d3','guess-d4']);

  console.log('🧪 LIVE TEST — Secret:', liveTestSecret);
}

function startLiveTestTimer() {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  turnStartTime = Date.now();

  const timerBar = document.getElementById('timer-bar');
  const timerText = document.getElementById('timer-text');

  function tick() {
    const elapsed = (Date.now() - turnStartTime) / 1000;
    const remaining = Math.max(0, TURN_DURATION - elapsed);
    const pct = (remaining / TURN_DURATION) * 100;

    timerBar.style.width = pct + '%';
    timerText.textContent = Math.ceil(remaining) + 's';

    timerBar.classList.remove('warning', 'danger');
    if (remaining <= 5) timerBar.classList.add('danger');
    else if (remaining <= 10) timerBar.classList.add('warning');

    if (remaining <= 0) {
      autoSubmitRandomGuess();
      return;
    }
    timerRAF = requestAnimationFrame(tick);
  }
  timerRAF = requestAnimationFrame(tick);
}

// ============================================
// SUBMIT GUESS (works for both modes)
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

  if (isLiveTest) {
    // LIVE TEST mode — local check
    const result = checkGuess(guess, liveTestSecret);
    renderGuess({ player: 'player1', digits: guess, correct: result.correct });
    scrollHistoryToBottom();
    clearGuessInputs();
    myGuessCount++;

    if (result.correct === DIGITS) {
      showResultModal('🏆', 'Chính Xác!',
        `Bạn đã đoán đúng sau ${myGuessCount} lượt!`,
        `Số bí mật: <span class="text-green-600 font-bold text-xl tracking-wider">${liveTestSecret}</span>`
      );
    } else {
      // Reset timer for next guess
      startLiveTestTimer();
      btn.disabled = false;
    }
    return;
  }

  // ─── ONLINE MODE ───
  try {
    const secretKey = (myPlayerId === 'player1') ? 'player2Secret' : 'player1Secret';
    const secretSnap = await roomRef.child(secretKey).once('value');
    const opponentSecret = secretSnap.val();
    const result = checkGuess(guess, opponentSecret);

    await guessesRef.push({
      player: myPlayerId,
      digits: guess,
      correct: result.correct,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    clearGuessInputs();

    if (result.correct === DIGITS) {
      await roomRef.update({ status: 'finished', winner: myPlayerId, turnStartTime: null });
    } else {
      const nextTurn = (myPlayerId === 'player1') ? 'player2' : 'player1';
      await roomRef.update({ currentTurn: nextTurn, turnStartTime: firebase.database.ServerValue.TIMESTAMP });
    }
  } catch (err) {
    console.error('Submit error:', err);
    btn.disabled = false;
  }
}

// ============================================
// CHECK LOGIC — Chỉ trả về tổng số chữ số đúng
// ============================================
function checkGuess(guess, secret) {
  let correct = 0;
  const guessArr = guess.split('');
  const secretArr = secret.split('');
  const secretUsed = Array(DIGITS).fill(false);

  for (let i = 0; i < DIGITS; i++) {
    for (let j = 0; j < DIGITS; j++) {
      if (secretUsed[j]) continue;
      if (guessArr[i] === secretArr[j]) {
        correct++;
        secretUsed[j] = true;
        break;
      }
    }
  }
  return { correct };
}

// ============================================
// RENDER GUESS — Clean style like reference
// ============================================
function renderGuess(guess) {
  const emptyEl = document.getElementById('history-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  const historyArea = document.getElementById('history-area');
  const isMe = guess.player === myPlayerId;
  const correct = guess.correct || 0;

  const item = document.createElement('div');
  item.className = 'guess-item bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100';

  const digitsArr = guess.digits.split('');
  let digitsHTML = '';
  for (let i = 0; i < DIGITS; i++) {
    digitsHTML += `<span class="digit-box">${digitsArr[i]}</span>`;
  }

  // Result color
  let numColor = '#ef4444'; // red for 0
  if (correct === DIGITS) numColor = '#16a34a'; // green for all
  else if (correct >= 3) numColor = '#2563eb'; // blue
  else if (correct >= 1) numColor = '#f59e0b'; // yellow/orange

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
  requestAnimationFrame(() => {
    area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
  });
}

// ============================================
// AUTO-SUBMIT RANDOM
// ============================================
function autoSubmitRandomGuess() {
  ['guess-d1','guess-d2','guess-d3','guess-d4'].forEach(id => {
    document.getElementById(id).value = Math.floor(Math.random() * 10);
  });
  submitGuess();
}

// ============================================
// ROOM: CREATE (with timeout)
// ============================================
async function createRoom() {
  if (!db) {
    showLobbyError('Firebase chưa được cấu hình. Hãy dùng LIVE TEST hoặc cập nhật firebaseConfig trong game.js');
    return;
  }

  const btn = document.getElementById('btn-create');
  btn.disabled = true;
  btn.textContent = '⏳ Đang tạo...';

  // Timeout 5s
  const timeout = setTimeout(() => {
    btn.disabled = false;
    btn.textContent = '✨ Tạo Phòng Mới';
    showLobbyError('Không thể kết nối Firebase. Kiểm tra firebaseConfig hoặc dùng LIVE TEST.');
  }, 5000);

  try {
    roomId = String(Math.floor(100 + Math.random() * 900));
    const snap = await db.ref('rooms/' + roomId).once('value');
    clearTimeout(timeout);

    if (snap.exists() && snap.val().status !== 'finished') {
      roomId = String(Math.floor(100 + Math.random() * 900));
    }

    myPlayerId = 'player1';
    isLiveTest = false;
    roomRef = db.ref('rooms/' + roomId);

    await roomRef.set({
      player1: sessionId, player2: null,
      player1Secret: null, player2Secret: null,
      status: 'waiting', currentTurn: 'player1',
      turnStartTime: null,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    roomRef.onDisconnect().remove();
    document.getElementById('waiting-room-code').textContent = roomId;
    showScreen('waiting');

    roomRef.child('player2').on('value', (snap) => {
      if (snap.val()) {
        showScreen('secret');
        focusFirstEmpty(['secret-d1','secret-d2','secret-d3','secret-d4']);
        listenForGameState();
      }
    });

  } catch (err) {
    clearTimeout(timeout);
    showLobbyError('Lỗi tạo phòng: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Tạo Phòng Mới';
  }
}

// ============================================
// ROOM: JOIN
// ============================================
async function joinRoom() {
  if (!db) {
    showLobbyError('Firebase chưa được cấu hình. Hãy cập nhật firebaseConfig trong game.js');
    return;
  }

  const code = ['join-d1','join-d2','join-d3'].map(id => document.getElementById(id).value).join('');
  if (code.length !== 3 || !/^\d{3}$/.test(code)) {
    showLobbyError('Vui lòng nhập đủ 3 chữ số');
    return;
  }

  const btn = document.getElementById('btn-join');
  btn.disabled = true;
  btn.textContent = '⏳ Đang kết nối...';

  try {
    roomId = code;
    roomRef = db.ref('rooms/' + roomId);
    const snap = await roomRef.once('value');

    if (!snap.exists()) { showLobbyError('Không tìm thấy phòng ' + code); return; }
    const room = snap.val();
    if (room.status !== 'waiting') { showLobbyError('Phòng đã đầy hoặc đang chơi'); return; }

    myPlayerId = 'player2';
    isLiveTest = false;
    await roomRef.update({ player2: sessionId, status: 'setSecret' });

    showScreen('secret');
    focusFirstEmpty(['secret-d1','secret-d2','secret-d3','secret-d4']);
    listenForGameState();
  } catch (err) {
    showLobbyError('Lỗi vào phòng: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Vào Phòng';
  }
}

// ============================================
// ROOM: CANCEL
// ============================================
function cancelRoom() {
  if (roomRef) { roomRef.off(); roomRef.remove(); }
  resetState();
  showScreen('lobby');
}

// ============================================
// SET SECRET
// ============================================
async function setSecret() {
  const digits = ['secret-d1','secret-d2','secret-d3','secret-d4'].map(id => document.getElementById(id).value);
  if (digits.some(d => d === '' || !/^\d$/.test(d))) { showSecretError('Vui lòng nhập đủ 4 chữ số'); return; }

  mySecret = digits.join('');
  const btn = document.getElementById('btn-set-secret');
  btn.disabled = true;
  btn.textContent = '⏳ Đang gửi...';

  try {
    await roomRef.update({ [myPlayerId + 'Secret']: mySecret });
    document.getElementById('secret-waiting').classList.remove('hidden');
    btn.classList.add('hidden');
  } catch (err) {
    showSecretError('Lỗi: ' + err.message);
    btn.disabled = false;
    btn.textContent = '🔒 Xác Nhận';
  }
}

// ============================================
// LISTEN FOR GAME STATE (ONLINE)
// ============================================
function listenForGameState() {
  roomRef.on('value', (snap) => {
    if (!snap.exists()) { showResultModal('😕', 'Phòng đã bị huỷ', 'Đối thủ đã rời phòng', ''); return; }
    const room = snap.val();

    if (room.player1Secret && room.player2Secret && room.status === 'setSecret') {
      roomRef.update({ status: 'playing', currentTurn: 'player1', turnStartTime: firebase.database.ServerValue.TIMESTAMP });
      return;
    }

    if (room.status === 'playing') {
      if (!document.getElementById('screen-game').classList.contains('active')) enterGameScreen(room);
      updateTurnUI(room);
    }

    if (room.status === 'finished') handleGameFinished(room);
  });
}

function enterGameScreen(room) {
  showScreen('game');
  document.getElementById('mode-badge').textContent = 'ONLINE';

  if (!guessListenerAttached) {
    guessListenerAttached = true;
    guessesRef = roomRef.child('guesses');
    guessesRef.on('child_added', (snap) => {
      const guess = snap.val();
      renderGuess(guess);
      scrollHistoryToBottom();
      if (guess.player === myPlayerId) myGuessCount++;
      else opponentGuessCount++;
    });
  }
  focusFirstEmpty(['guess-d1','guess-d2','guess-d3','guess-d4']);
}

function updateTurnUI(room) {
  isMyTurn = (room.currentTurn === myPlayerId);
  const btnGuess = document.getElementById('btn-guess');
  const inputs = ['guess-d1','guess-d2','guess-d3','guess-d4'];

  if (isMyTurn) {
    btnGuess.disabled = false;
    inputs.forEach(id => document.getElementById(id).disabled = false);
    focusFirstEmpty(inputs);
  } else {
    btnGuess.disabled = true;
    inputs.forEach(id => document.getElementById(id).disabled = true);
  }
  startTimer(room.turnStartTime);
}

function startTimer(serverStartTime) {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  turnStartTime = serverStartTime;
  const timerBar = document.getElementById('timer-bar');
  const timerText = document.getElementById('timer-text');

  function tick() {
    if (!turnStartTime) return;
    const elapsed = (Date.now() - turnStartTime) / 1000;
    const remaining = Math.max(0, TURN_DURATION - elapsed);
    timerBar.style.width = (remaining / TURN_DURATION) * 100 + '%';
    timerText.textContent = Math.ceil(remaining) + 's';

    timerBar.classList.remove('warning', 'danger');
    if (remaining <= 5) timerBar.classList.add('danger');
    else if (remaining <= 10) timerBar.classList.add('warning');

    if (remaining <= 0 && isMyTurn) { autoSubmitRandomGuess(); return; }
    timerRAF = requestAnimationFrame(tick);
  }
  setTimeout(() => { timerRAF = requestAnimationFrame(tick); }, 100);
}

function handleGameFinished(room) {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  const iWon = room.winner === myPlayerId;
  const opSecretKey = (myPlayerId === 'player1') ? 'player2Secret' : 'player1Secret';
  const mySecretKey = (myPlayerId === 'player1') ? 'player1Secret' : 'player2Secret';

  if (iWon) {
    showResultModal('🏆', 'Chiến Thắng!', 'Bạn đã giải mã thành công!',
      `Số đối thủ: <span class="text-green-600 font-bold tracking-wider">${room[opSecretKey]}</span>`);
  } else {
    showResultModal('😞', 'Thua Cuộc!', 'Đối thủ giải mã trước!',
      `Số của bạn: <span class="text-red-500 font-bold tracking-wider">${room[mySecretKey]}</span>`);
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
  if (roomRef) roomRef.off();
  resetState();
  showScreen('lobby');
}

function showLobbyError(msg) {
  const el = document.getElementById('lobby-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

function showSecretError(msg) {
  const el = document.getElementById('secret-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function clearGuessInputs() {
  ['guess-d1','guess-d2','guess-d3','guess-d4'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.classList.remove('filled');
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
  myPlayerId = null; mySecret = null; roomId = null;
  roomRef = null; guessesRef = null;
  guessListenerAttached = false;
  myGuessCount = 0; opponentGuessCount = 0;
  isMyTurn = false; turnStartTime = null;
  isLiveTest = false; liveTestSecret = null;
  if (timerRAF) cancelAnimationFrame(timerRAF);

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
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, false);

console.log('🎮 Game Giải Mã Số loaded! Session:', sessionId);
