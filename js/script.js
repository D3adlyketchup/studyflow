// ── State ──────────────────────────────────────────────────────────────
let timerDuration = 0;   // seconds total
let timerLeft = 0;
let timerRunning = false;
let timerInterval = null;
let queue = [];
let currentIndex = -1;
let playerReady = false;
let ytPlayer = null;

const RING_CIRC = 2 * Math.PI * 90; // ≈565

// ── Clock ──────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clockDisplay').textContent =
    now.toTimeString().slice(0, 8);
}
setInterval(updateClock, 1000);
updateClock();

// ── Timer ──────────────────────────────────────────────────────────────
function setPreset(min) {
  document.getElementById('minuteInput').value = min;
  if (!timerRunning) {
    timerDuration = min * 60;
    timerLeft = timerDuration;
    renderTimer();
  }
}

function toggleTimer() {
  if (timerRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  const min = parseInt(document.getElementById('minuteInput').value) || 25;
  if (timerLeft === 0 || timerLeft === timerDuration) {
    timerDuration = min * 60;
    timerLeft = timerDuration;
  }
  timerRunning = true;
  document.getElementById('startBtn').textContent = 'PAUSE';
  document.getElementById('timerPanel').classList.add('running');
  document.getElementById('statusDot').className = 'status-dot active';
  setStatus('Timer active — video plays automatically');

  // Play YouTube
  playCurrentVideo();

  timerInterval = setInterval(tickTimer, 1000);
}

function pauseTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  document.getElementById('startBtn').textContent = 'RESUME';
  document.getElementById('timerPanel').classList.remove('running');
  document.getElementById('statusDot').className = 'status-dot paused';
  setStatus('Paused — video stopped');
  pauseYT();
}

function resetTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  const min = parseInt(document.getElementById('minuteInput').value) || 25;
  timerDuration = min * 60;
  timerLeft = timerDuration;
  document.getElementById('startBtn').textContent = 'START';
  document.getElementById('timerPanel').classList.remove('running');
  document.getElementById('statusDot').className = 'status-dot';
  setStatus('Timer reset');
  pauseYT();
  renderTimer();
  document.title = 'StudyFlow';
}

function tickTimer() {
  timerLeft--;
  renderTimer();
  if (timerLeft <= 0) {
    timerFinished();
  }
}

function renderTimer() {
  const m = Math.floor(timerLeft / 60).toString().padStart(2, '0');
  const s = (timerLeft % 60).toString().padStart(2, '0');
  const str = `${m}:${s}`;
  document.getElementById('timerDisplay').textContent = str;

  // Tab title
  if (timerRunning) {
    document.title = `[${str}] StudyFlow`;
  }

  // Ring
  const frac = timerDuration > 0 ? timerLeft / timerDuration : 1;
  const offset = RING_CIRC * (1 - frac);
  const ring = document.getElementById('ringProgress');
  ring.style.strokeDashoffset = offset;
  ring.classList.toggle('low', timerLeft > 0 && timerLeft <= 60);
}

function timerFinished() {
  timerRunning = false;
  clearInterval(timerInterval);
  timerLeft = 0;
  renderTimer();
  document.getElementById('startBtn').textContent = 'START';
  document.getElementById('timerPanel').classList.remove('running');
  document.getElementById('statusDot').className = 'status-dot';
  document.title = '✓ Done! — StudyFlow';

  pauseYT();
  playAlarm();
  showNotification('⏱ Timer finished! Take a break.');
  setStatus('Timer finished — take a break!');
}

// ── YouTube ────────────────────────────────────────────────────────────
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?#\s]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function addVideo() {
  const input = document.getElementById('urlInput');
  const url = input.value.trim();
  if (!url) return;

  const id = extractVideoId(url);
  if (!id) {
    showNotification('❌ Invalid YouTube link');
    return;
  }

  // Avoid duplicates
  if (queue.find(v => v.id === id)) {
    showNotification('⚠ Video already in queue');
    input.value = '';
    return;
  }

  const video = { id, title: `Video ${queue.length + 1}`, url };
  queue.push(video);
  input.value = '';

  // Fetch title async
  fetchTitle(id, queue.length - 1);

  if (currentIndex === -1) {
    currentIndex = 0;
    loadVideoInPlayer(queue[0].id, false);
  }

  renderQueue();
  setStatus(`Video added to queue (${queue.length} total)`);
}

async function fetchTitle(id, idx) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (res.ok) {
      const data = await res.json();
      queue[idx].title = data.title;
      renderQueue();
      if (idx === currentIndex) {
        document.getElementById('nowPlayingTitle').textContent = data.title;
      }
    }
  } catch(e) { /* silent */ }
}

function loadVideoInPlayer(id, autoplay) {
  const iframe = document.getElementById('ytPlayer');
  const noVid = document.getElementById('noVideo');
  const auto = autoplay ? 1 : 0;
  iframe.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=${auto}&rel=0&modestbranding=1`;
  iframe.style.display = 'block';
  noVid.style.display = 'none';

  const title = queue.find(v => v.id === id)?.title || id;
  document.getElementById('nowPlayingTitle').textContent = title;
}

function playCurrentVideo() {
  if (currentIndex >= 0 && currentIndex < queue.length) {
    const id = queue[currentIndex].id;
    const iframe = document.getElementById('ytPlayer');

    if (iframe.src.includes(id)) {
      // Already loaded — just play via postMessage
      iframe.contentWindow?.postMessage(JSON.stringify({
        event: 'command', func: 'playVideo', args: []
      }), '*');
    } else {
      loadVideoInPlayer(id, true);
    }
    renderQueue();
  }
}

function pauseYT() {
  const iframe = document.getElementById('ytPlayer');
  if (iframe.style.display !== 'none') {
    iframe.contentWindow?.postMessage(JSON.stringify({
      event: 'command', func: 'pauseVideo', args: []
    }), '*');
  }
}

function nextVideo() {
  if (queue.length === 0) return;
  currentIndex = (currentIndex + 1) % queue.length;
  loadVideoInPlayer(queue[currentIndex].id, timerRunning);
  renderQueue();
  setStatus(`Next video loaded (${currentIndex + 1}/${queue.length})`);
}

function prevVideo() {
  if (queue.length === 0) return;
  currentIndex = (currentIndex - 1 + queue.length) % queue.length;
  loadVideoInPlayer(queue[currentIndex].id, timerRunning);
  renderQueue();
}

function playVideo(idx) {
  currentIndex = idx;
  loadVideoInPlayer(queue[idx].id, timerRunning);
  renderQueue();
}

function removeVideo(idx) {
  queue.splice(idx, 1);
  if (currentIndex >= queue.length) currentIndex = queue.length - 1;
  if (queue.length === 0) {
    currentIndex = -1;
    document.getElementById('ytPlayer').style.display = 'none';
    document.getElementById('noVideo').style.display = 'flex';
    document.getElementById('nowPlayingTitle').textContent = '—';
  } else {
    renderQueue();
  }
  renderQueue();
}

// Listen for YouTube iframe messages (video ended)
window.addEventListener('message', (e) => {
  try {
    const data = JSON.parse(e.data);
    if (data.event === 'onStateChange' && data.info === 0) {
      // Video ended (state 0)
      if (timerRunning) {
        // Auto-advance
        if (currentIndex < queue.length - 1) {
          currentIndex++;
          loadVideoInPlayer(queue[currentIndex].id, true);
          renderQueue();
          setStatus(`Next video started (${currentIndex + 1}/${queue.length})`);
        } else {
          // Loop back
          currentIndex = 0;
          loadVideoInPlayer(queue[0].id, true);
          renderQueue();
          setStatus('Queue restarted from beginning');
        }
      }
    }
  } catch(e) {}
});

// ── Queue Render ───────────────────────────────────────────────────────
function renderQueue() {
  const list = document.getElementById('queueList');
  document.getElementById('queueCount').textContent =
    queue.length === 1 ? '1 video' : `${queue.length} videos`;

  if (queue.length === 0) {
    list.innerHTML = `<div class="empty-queue"><div class="empty-icon">📋</div><div>No videos in queue</div></div>`;
    return;
  }

  list.innerHTML = queue.map((v, i) => `
    <div class="queue-item ${i === currentIndex ? 'active' : ''}" onclick="playVideo(${i})">
      <div class="q-num">${i + 1}</div>
      <div class="q-thumb">
        <img src="https://img.youtube.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy"/>
      </div>
      <div class="q-info">
        <div class="q-title">${escHtml(v.title)}</div>
        <div class="q-id">${v.id}</div>
      </div>
      <button class="q-remove" onclick="event.stopPropagation();removeVideo(${i})" title="Remove">✕</button>
    </div>
  `).join('');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Alarm ──────────────────────────────────────────────────────────────
function playAlarm() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    const start = ctx.currentTime + i * 0.35;
    const end = start + 0.6;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, end);

    osc.start(start);
    osc.stop(end + 0.1);
  });
}

// ── Notification ───────────────────────────────────────────────────────
function showNotification(msg) {
  const n = document.getElementById('notification');
  n.textContent = msg;
  n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 3500);
}

// ── Status ─────────────────────────────────────────────────────────────
function setStatus(msg) {
  document.getElementById('statusMsg').textContent = msg;
}

// ── Todos ──────────────────────────────────────────────────────────────
let todos = [];

function addTodo() {
  const input = document.getElementById('todoInput');
  const text = input.value.trim();
  if (!text) return;
  todos.push({ text, done: false, id: Date.now() });
  input.value = '';
  renderTodos();
}

function toggleTodo(id) {
  const t = todos.find(t => t.id === id);
  if (t) t.done = !t.done;
  renderTodos();
}

function removeTodo(id) {
  todos = todos.filter(t => t.id !== id);
  renderTodos();
}

function clearDone() {
  todos = todos.filter(t => !t.done);
  renderTodos();
}

function renderTodos() {
  const list = document.getElementById('todoList');
  const done = todos.filter(t => t.done).length;
  const total = todos.length;

  document.getElementById('todoCount').textContent = total === 1 ? '1 task' : `${total} tasks`;
  document.getElementById('todoDoneCount').textContent = done;
  document.getElementById('todoTotalCount').textContent = total;
  document.getElementById('todoProgressBar').style.width = total > 0 ? `${(done/total)*100}%` : '0%';

  if (todos.length === 0) {
    list.innerHTML = `<div class="empty-todos"><div class="empty-icon2">✏️</div><div>No tasks added</div></div>`;
    return;
  }

  list.innerHTML = todos.map(t => `
    <div class="todo-item ${t.done ? 'done' : ''}">
      <input type="checkbox" class="todo-cb" ${t.done ? 'checked' : ''} onchange="toggleTodo(${t.id})"/>
      <span class="todo-text">${escHtml(t.text)}</span>
      <button class="todo-del" onclick="removeTodo(${t.id})" title="Remove">✕</button>
    </div>
  `).join('');
}

// Init todos
renderTodos();

// ── Init ───────────────────────────────────────────────────────────────
renderTimer();
renderQueue();

// Sync input → timerLeft when not running
document.getElementById('minuteInput').addEventListener('input', () => {
  if (!timerRunning) {
    const min = parseInt(document.getElementById('minuteInput').value) || 0;
    timerDuration = min * 60;
    timerLeft = timerDuration;
    renderTimer();
  }
});