// ============================================
// 🔐 Game Giải Mã Số — Firebase Real-time
// ============================================

// ─── Firebase Config ───
// 👉 THAY THẾ config bên dưới bằng config Firebase của bạn
const firebaseConfig = {
  apiKey: "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxx"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ─── Game State ───
let myPlayerId = null;    // "player1" or "player2"
let mySecret = null;
let roomId = null;
let roomRef = null;
let guessesRef = null;
let timerInterval = null;
let timerRAF = null;
let turnStartTime = null;
let isMyTurn = false;
let guessListenerAttached = false;
let myGuessCount = 0;
let opponentGuessCount = 0;

const TURN_DURATION = 30; // seconds
const DIGITS = 4;

// ─── Generate unique player session ID ───
const sessionId = 'p_' + Math.random().toString(36).substring(2, 10);

// ============================================
// SCREEN MANAGEMENT
// ============================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ============================================
// AUTO-FOCUS OTP INPUTS (generic)
// ============================================
function setupOtpInputs(inputIds, onComplete) {
  const inputs = inputIds.map(id => document.getElementById(id));

  inputs.forEach((input, idx) => {
    // Input event
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val.slice(-1);

      if (val && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }

      // Toggle filled class
      e.target.classList.toggle('filled', !!e.target.value);

      // Check if all filled
      if (onComplete && inputs.every(i => i.value !== '')) {
        onComplete();
      }
    });

    // Keydown for backspace
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].value = '';
        inputs[idx - 1].classList.remove('filled');
      }
    });

    // Paste support
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      for (let i = 0; i < Math.min(paste.length, inputs.length); i++) {
        inputs[i].value = paste[i];
        inputs[i].classList.toggle('filled', true);
      }
      const focusIdx = Math.min(paste.length, inputs.length - 1);
      inputs[focusIdx].focus();
    });

    // Select all on focus
    input.addEventListener('focus', () => {
      setTimeout(() => input.select(), 10);
    });
  });
}

// Setup all OTP groups
setupOtpInputs(['join-d1', 'join-d2', 'join-d3']);
setupOtpInputs(['secret-d1', 'secret-d2', 'secret-d3', 'secret-d4']);
setupOtpInputs(['guess-d1', 'guess-d2', 'guess-d3', 'guess-d4']);

// ============================================
// ROOM: CREATE
// ============================================
async function createRoom() {
  const btn = document.getElementById('btn-create');
  btn.disabled = true;
  btn.textContent = '⏳ Đang tạo...';

  try {
    // Generate 3-digit room ID (100-999)
    roomId = String(Math.floor(100 + Math.random() * 900));

    // Check if room exists
    const snap = await db.ref('rooms/' + roomId).once('value');
    if (snap.exists() && snap.val().status !== 'finished') {
      // Re-generate
      roomId = String(Math.floor(100 + Math.random() * 900));
    }

    myPlayerId = 'player1';

    roomRef = db.ref('rooms/' + roomId);
    await roomRef.set({
      player1: sessionId,
      player2: null,
      player1Secret: null,
      player2Secret: null,
      status: 'waiting',
      currentTurn: 'player1',
      turnStartTime: null,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Remove room on disconnect
    roomRef.onDisconnect().remove();

    document.getElementById('waiting-room-code').textContent = roomId;
    showScreen('waiting');

    // Listen for player2 join
    roomRef.child('player2').on('value', (snap) => {
      if (snap.val()) {
        showScreen('secret');
        focusFirstEmpty(['secret-d1', 'secret-d2', 'secret-d3', 'secret-d4']);
        listenForGameState();
      }
    });

  } catch (err) {
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
  const d1 = document.getElementById('join-d1').value;
  const d2 = document.getElementById('join-d2').value;
  const d3 = document.getElementById('join-d3').value;
  const code = d1 + d2 + d3;

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
    if (!snap.exists()) {
      showLobbyError('Không tìm thấy phòng ' + code);
      return;
    }

    const room = snap.val();
    if (room.status !== 'waiting') {
      showLobbyError('Phòng đã đầy hoặc đang chơi');
      return;
    }

    myPlayerId = 'player2';
    await roomRef.update({ player2: sessionId, status: 'setSecret' });

    showScreen('secret');
    focusFirstEmpty(['secret-d1', 'secret-d2', 'secret-d3', 'secret-d4']);
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
  if (roomRef) {
    roomRef.off();
    roomRef.remove();
  }
  resetState();
  showScreen('lobby');
}

// ============================================
// SET SECRET
// ============================================
async function setSecret() {
  const digits = [
    document.getElementById('secret-d1').value,
    document.getElementById('secret-d2').value,
    document.getElementById('secret-d3').value,
    document.getElementById('secret-d4').value,
  ];

  if (digits.some(d => d === '' || !/^\d$/.test(d))) {
    showSecretError('Vui lòng nhập đủ 4 chữ số');
    return;
  }

  mySecret = digits.join('');
  const btn = document.getElementById('btn-set-secret');
  btn.disabled = true;
  btn.textContent = '⏳ Đang gửi...';

  try {
    await roomRef.update({
      [myPlayerId + 'Secret']: mySecret
    });

    // Show waiting text
    document.getElementById('secret-waiting').classList.remove('hidden');
    document.getElementById('btn-set-secret').classList.add('hidden');

  } catch (err) {
    showSecretError('Lỗi: ' + err.message);
    btn.disabled = false;
    btn.textContent = '🔒 Xác Nhận';
  }
}

// ============================================
// LISTEN FOR GAME STATE
// ============================================
function listenForGameState() {
  roomRef.on('value', (snap) => {
    if (!snap.exists()) {
      // Room deleted
      showResultModal('😕', 'Phòng đã bị huỷ', 'Đối thủ đã rời phòng', '');
      return;
    }

    const room = snap.val();

    // Both secrets set → start game
    if (room.player1Secret && room.player2Secret && room.status === 'setSecret') {
      roomRef.update({
        status: 'playing',
        currentTurn: 'player1',
        turnStartTime: firebase.database.ServerValue.TIMESTAMP
      });
      return;
    }

    // Game started
    if (room.status === 'playing') {
      if (document.getElementById('screen-game').classList.contains('active') === false) {
        enterGameScreen(room);
      }
      updateTurnUI(room);
    }

    // Game finished
    if (room.status === 'finished') {
      handleGameFinished(room);
    }
  });
}

// ============================================
// ENTER GAME SCREEN
// ============================================
function enterGameScreen(room) {
  showScreen('game');
  document.getElementById('game-room-code').textContent = '🔑 ' + roomId;

  // Player labels
  if (myPlayerId === 'player1') {
    document.getElementById('p1-label').textContent = 'Bạn';
    document.getElementById('p2-label').textContent = 'Đối thủ';
  } else {
    document.getElementById('p1-label').textContent = 'Đối thủ';
    document.getElementById('p2-label').textContent = 'Bạn';
  }

  // Attach guess listener (once)
  if (!guessListenerAttached) {
    guessListenerAttached = true;
    guessesRef = roomRef.child('guesses');
    guessesRef.on('child_added', (snap) => {
      const guess = snap.val();
      renderGuess(guess);
      scrollHistoryToBottom();

      // Update counts
      if (guess.player === myPlayerId) {
        myGuessCount++;
      } else {
        opponentGuessCount++;
      }
      updateScoreLabels();
    });
  }

  focusFirstEmpty(['guess-d1', 'guess-d2', 'guess-d3', 'guess-d4']);
}

// ============================================
// UPDATE TURN UI
// ============================================
function updateTurnUI(room) {
  const currentTurn = room.currentTurn;
  isMyTurn = (currentTurn === myPlayerId);

  const turnLabel = document.getElementById('turn-label');
  const btnGuess = document.getElementById('btn-guess');
  const inputs = ['guess-d1', 'guess-d2', 'guess-d3', 'guess-d4'];

  if (isMyTurn) {
    turnLabel.textContent = '🟢 Lượt của bạn';
    turnLabel.className = 'text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 turn-indicator';
    btnGuess.disabled = false;
    inputs.forEach(id => {
      document.getElementById(id).disabled = false;
    });
    focusFirstEmpty(inputs);
  } else {
    turnLabel.textContent = '🔴 Lượt đối thủ';
    turnLabel.className = 'text-xs font-semibold px-3 py-1 rounded-full bg-rose-500/15 text-rose-300';
    btnGuess.disabled = true;
    inputs.forEach(id => {
      document.getElementById(id).disabled = true;
    });
  }

  // Start timer
  startTimer(room.turnStartTime);
}

// ============================================
// TIMER
// ============================================
function startTimer(serverStartTime) {
  // Clear previous
  if (timerRAF) cancelAnimationFrame(timerRAF);
  if (timerInterval) clearInterval(timerInterval);

  const timerBar = document.getElementById('timer-bar');
  const timerText = document.getElementById('timer-text');
  turnStartTime = serverStartTime;

  function tick() {
    if (!turnStartTime) return;

    const elapsed = (Date.now() - turnStartTime) / 1000;
    const remaining = Math.max(0, TURN_DURATION - elapsed);
    const pct = (remaining / TURN_DURATION) * 100;

    timerBar.style.width = pct + '%';
    timerText.textContent = Math.ceil(remaining) + 's';

    // Color transition
    timerBar.classList.remove('warning', 'danger');
    if (remaining <= 5) {
      timerBar.classList.add('danger');
    } else if (remaining <= 10) {
      timerBar.classList.add('warning');
    }

    // Auto-submit on timeout
    if (remaining <= 0 && isMyTurn) {
      autoSubmitRandomGuess();
      return;
    }

    timerRAF = requestAnimationFrame(tick);
  }

  // Small delay to let Firebase timestamp resolve
  setTimeout(() => {
    timerRAF = requestAnimationFrame(tick);
  }, 100);
}

// ============================================
// AUTO-SUBMIT RANDOM GUESS
// ============================================
function autoSubmitRandomGuess() {
  const inputs = ['guess-d1', 'guess-d2', 'guess-d3', 'guess-d4'];
  inputs.forEach(id => {
    document.getElementById(id).value = Math.floor(Math.random() * 10);
  });
  submitGuess();
}

// ============================================
// SUBMIT GUESS
// ============================================
async function submitGuess() {
  if (!isMyTurn) return;

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

  try {
    // Get opponent's secret
    const secretKey = (myPlayerId === 'player1') ? 'player2Secret' : 'player1Secret';
    const secretSnap = await roomRef.child(secretKey).once('value');
    const opponentSecret = secretSnap.val();

    // Calculate result
    const result = checkGuess(guess, opponentSecret);

    // Push guess to Firebase
    await guessesRef.push({
      player: myPlayerId,
      digits: guess,
      green: result.green,
      yellow: result.yellow,
      detailColors: result.detailColors,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    // Clear inputs
    clearGuessInputs();

    // Check win
    if (result.green === DIGITS) {
      await roomRef.update({
        status: 'finished',
        winner: myPlayerId,
        turnStartTime: null
      });
    } else {
      // Switch turn
      const nextTurn = (myPlayerId === 'player1') ? 'player2' : 'player1';
      await roomRef.update({
        currentTurn: nextTurn,
        turnStartTime: firebase.database.ServerValue.TIMESTAMP
      });
    }

  } catch (err) {
    console.error('Submit error:', err);
    btn.disabled = false;
  }
}

// ============================================
// MASTERMIND CHECK LOGIC
// ============================================
function checkGuess(guess, secret) {
  let green = 0;
  let yellow = 0;
  const guessArr = guess.split('');
  const secretArr = secret.split('');
  const guessUsed = Array(DIGITS).fill(false);
  const secretUsed = Array(DIGITS).fill(false);
  const detailColors = Array(DIGITS).fill('wrong');

  // Pass 1: exact matches (green)
  for (let i = 0; i < DIGITS; i++) {
    if (guessArr[i] === secretArr[i]) {
      green++;
      guessUsed[i] = true;
      secretUsed[i] = true;
      detailColors[i] = 'exact';
    }
  }

  // Pass 2: misplaced (yellow)
  for (let i = 0; i < DIGITS; i++) {
    if (guessUsed[i]) continue;
    for (let j = 0; j < DIGITS; j++) {
      if (secretUsed[j]) continue;
      if (guessArr[i] === secretArr[j]) {
        yellow++;
        guessUsed[i] = true;
        secretUsed[j] = true;
        detailColors[i] = 'misplaced';
        break;
      }
    }
  }

  return { green, yellow, detailColors };
}

// ============================================
// RENDER GUESS ITEM
// ============================================
function renderGuess(guess) {
  // Hide empty state
  const emptyEl = document.getElementById('history-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  const historyArea = document.getElementById('history-area');
  const isMe = guess.player === myPlayerId;
  const playerClass = guess.player === 'player1' ? 'player1' : 'player2';
  const playerName = isMe ? 'Bạn' : 'Đối thủ';
  const playerColor = guess.player === 'player1' ? 'text-blue-400' : 'text-rose-400';

  const item = document.createElement('div');
  item.className = `guess-item ${playerClass} glass-card p-3 rounded-xl`;

  // Build digit boxes HTML
  const digitsArr = guess.digits.split('');
  const colors = guess.detailColors || Array(DIGITS).fill('wrong');
  let digitsHTML = '';
  for (let i = 0; i < DIGITS; i++) {
    digitsHTML += `<span class="digit-box ${colors[i]}">${digitsArr[i]}</span>`;
  }

  item.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-semibold ${playerColor}">${playerName}</span>
        <div class="flex items-center gap-1">
          ${digitsHTML}
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="badge-green" title="Đúng vị trí">${guess.green}</span>
        <span class="badge-yellow" title="Đúng số, sai vị trí">${guess.yellow}</span>
      </div>
    </div>
  `;

  historyArea.appendChild(item);
}

// ============================================
// SCROLL TO BOTTOM
// ============================================
function scrollHistoryToBottom() {
  const area = document.getElementById('history-area');
  requestAnimationFrame(() => {
    area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
  });
}

// ============================================
// UPDATE SCORE LABELS
// ============================================
function updateScoreLabels() {
  const s1 = myPlayerId === 'player1' ? myGuessCount : opponentGuessCount;
  const s2 = myPlayerId === 'player1' ? opponentGuessCount : myGuessCount;
  document.getElementById('p1-score').textContent = `(${s1} lượt)`;
  document.getElementById('p2-score').textContent = `(${s2} lượt)`;
}

// ============================================
// GAME FINISHED
// ============================================
function handleGameFinished(room) {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  if (timerInterval) clearInterval(timerInterval);

  const iWon = room.winner === myPlayerId;
  const opponentSecretKey = (myPlayerId === 'player1') ? 'player2Secret' : 'player1Secret';
  const mySecretKey = (myPlayerId === 'player1') ? 'player1Secret' : 'player2Secret';

  if (iWon) {
    showResultModal(
      '🏆',
      'Chiến Thắng!',
      'Bạn đã giải mã thành công số bí mật!',
      `Số bí mật đối thủ: <span class="text-emerald-400 font-bold tracking-wider">${room[opponentSecretKey]}</span>
       <br>Số bí mật của bạn: <span class="text-violet-400 font-bold tracking-wider">${room[mySecretKey]}</span>`
    );
  } else {
    showResultModal(
      '😞',
      'Thua Cuộc!',
      'Đối thủ đã giải mã số bí mật của bạn trước!',
      `Số bí mật của bạn: <span class="text-rose-400 font-bold tracking-wider">${room[mySecretKey]}</span>
       <br>Số bí mật đối thủ: <span class="text-violet-400 font-bold tracking-wider">${room[opponentSecretKey]}</span>`
    );
  }
}

// ============================================
// RESULT MODAL
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

// ============================================
// HELPERS
// ============================================
function showLobbyError(msg) {
  const el = document.getElementById('lobby-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function showSecretError(msg) {
  const el = document.getElementById('secret-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function clearGuessInputs() {
  ['guess-d1', 'guess-d2', 'guess-d3', 'guess-d4'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.classList.remove('filled');
  });
  document.getElementById('guess-d1').focus();
}

function focusFirstEmpty(ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el.value) {
      setTimeout(() => el.focus(), 100);
      return;
    }
  }
}

function shakeInputs() {
  const container = document.querySelector('#screen-game .shrink-0:last-child');
  container.style.animation = 'none';
  container.offsetHeight; // reflow
  container.style.animation = 'shake 0.4s ease';
}

function resetState() {
  myPlayerId = null;
  mySecret = null;
  roomId = null;
  roomRef = null;
  guessesRef = null;
  guessListenerAttached = false;
  myGuessCount = 0;
  opponentGuessCount = 0;
  isMyTurn = false;
  turnStartTime = null;

  if (timerRAF) cancelAnimationFrame(timerRAF);
  if (timerInterval) clearInterval(timerInterval);

  // Clear inputs
  ['join-d1', 'join-d2', 'join-d3'].forEach(id => {
    document.getElementById(id).value = '';
    document.getElementById(id).classList.remove('filled');
  });
  ['secret-d1', 'secret-d2', 'secret-d3', 'secret-d4'].forEach(id => {
    document.getElementById(id).value = '';
    document.getElementById(id).classList.remove('filled');
  });
  clearGuessInputs();

  // Reset secret screen
  document.getElementById('secret-waiting').classList.add('hidden');
  const btnSecret = document.getElementById('btn-set-secret');
  btnSecret.classList.remove('hidden');
  btnSecret.disabled = false;
  btnSecret.textContent = '🔒 Xác Nhận';

  // Clear history
  const historyArea = document.getElementById('history-area');
  historyArea.querySelectorAll('.guess-item').forEach(el => el.remove());
  const emptyEl = document.getElementById('history-empty');
  if (emptyEl) emptyEl.style.display = '';

  // Reset timer bar
  const timerBar = document.getElementById('timer-bar');
  if (timerBar) {
    timerBar.style.width = '100%';
    timerBar.classList.remove('warning', 'danger');
  }
}

// CSS shake animation (injected)
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
`;
document.head.appendChild(shakeStyle);

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  // Enter key submits guess on game screen
  if (e.key === 'Enter') {
    const gameScreen = document.getElementById('screen-game');
    const secretScreen = document.getElementById('screen-secret');
    const lobbyScreen = document.getElementById('screen-lobby');

    if (gameScreen.classList.contains('active') && isMyTurn) {
      submitGuess();
    } else if (secretScreen.classList.contains('active')) {
      setSecret();
    } else if (lobbyScreen.classList.contains('active')) {
      // Check if join inputs are focused
      const focused = document.activeElement;
      if (focused && focused.id && focused.id.startsWith('join-')) {
        joinRoom();
      }
    }
  }
});

// ============================================
// PREVENT ZOOM ON DOUBLE TAP (mobile)
// ============================================
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, false);

console.log('🎮 Game Giải Mã Số loaded! Session:', sessionId);
