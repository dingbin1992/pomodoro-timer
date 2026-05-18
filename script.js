// ========== 番茄钟核心逻辑 ==========

const CIRCUMFERENCE = 2 * Math.PI * 90; // 565.48

const MODES = {
  work: { label: '专注', minutes: 60, color: '#ff9800' },
  'short-break': { label: '短休', minutes: 10, color: '#7e57c2' },
  'long-break': { label: '长休', minutes: 120, color: '#e6517e' }
};

// 状态
let currentMode = 'work';
let timeLeft = MODES.work.minutes * 60;
let totalDuration = MODES.work.minutes * 60;
let timerInterval = null;
let isRunning = false;
let todaySessions = 0;
let todayTotalSeconds = 0;

// DOM 元素
const elMinutes = document.querySelector('.timer-minutes');
const elSeconds = document.querySelector('.timer-seconds');
const elProgress = document.querySelector('.progress-ring-fill');
const elTimerSection = document.querySelector('.timer-section');
const elBtnToggle = document.getElementById('btn-toggle');
const elBtnToggleIcon = elBtnToggle.querySelector('.btn-icon');
const elBtnToggleText = elBtnToggle.querySelector('.btn-text');
const elBtnReset = document.getElementById('btn-reset');
const elSessionCount = document.getElementById('session-count');
const elTotalTime = document.getElementById('total-time');
const elFruits = document.getElementById('fruits-container');
const elModeTabs = document.querySelectorAll('.mode-tab');

// 初始化圆环
elProgress.style.strokeDasharray = CIRCUMFERENCE;
elProgress.style.strokeDashoffset = '0';

// 加载今日数据
loadTodayStats();

// ========== 事件监听 ==========

elBtnToggle.addEventListener('click', toggleTimer);
elBtnReset.addEventListener('click', resetTimer);

elModeTabs.forEach(tab => {
  tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

document.getElementById('btn-minimize').addEventListener('click', () => {
  window.electronAPI.minimizeWindow();
});

document.getElementById('btn-close').addEventListener('click', () => {
  window.electronAPI.closeWindow();
});

// ========== 核心函数 ==========

function toggleTimer() {
  if (isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  isRunning = true;
  elBtnToggleIcon.textContent = '⏸';
  elBtnToggleText.textContent = '暂停';
  elTimerSection.classList.add('running');

  timerInterval = setInterval(() => {
    timeLeft--;
    updateDisplay();

    if (timeLeft <= 0) {
      completeSession();
    }
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  elBtnToggleIcon.textContent = '▶';
  elBtnToggleText.textContent = '继续';
  elTimerSection.classList.remove('running');
  clearInterval(timerInterval);
}

function resetTimer() {
  pauseTimer();
  timeLeft = MODES[currentMode].minutes * 60;
  totalDuration = timeLeft;
  elBtnToggleText.textContent = '开始';
  updateDisplay();
}

function switchMode(mode) {
  if (isRunning) pauseTimer();

  currentMode = mode;
  timeLeft = MODES[mode].minutes * 60;
  totalDuration = timeLeft;

  elModeTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  elBtnToggleText.textContent = '开始';

  // 更新渐变色调
  const modeColors = {
    work: { min: '#ff9800', sec: '#f57c00' },
    'short-break': { min: '#7e57c2', sec: '#512da8' },
    'long-break': { min: '#e6517e', sec: '#c62828' }
  };

  const c = modeColors[mode];
  elMinutes.style.backgroundImage = `linear-gradient(180deg, ${c.min} 0%, ${c.sec} 100%)`;
  elSeconds.style.backgroundImage = `linear-gradient(180deg, ${c.sec} 0%, ${c.min} 100%)`;

  updateDisplay();
}

function updateDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  elMinutes.textContent = String(mins).padStart(2, '0');
  elSeconds.textContent = String(secs).padStart(2, '0');

  const progress = 1 - timeLeft / totalDuration;
  elProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
}

function completeSession() {
  clearInterval(timerInterval);
  isRunning = false;
  elTimerSection.classList.remove('running');
  elBtnToggleIcon.textContent = '▶';
  elBtnToggleText.textContent = '开始';

  // 播放提示音
  playChime();

  if (currentMode === 'work') {
    todaySessions++;
    todayTotalSeconds += MODES.work.minutes * 60;
    elSessionCount.textContent = todaySessions;
    elTotalTime.textContent = formatMinutes(todayTotalSeconds);
    addFruit();
    saveTodayStats();

    // 发送通知
    window.electronAPI.sendNotification({
      title: '🍅 番茄钟完成！',
      body: `专注 ${MODES.work.minutes} 分钟完成，今日已累计 ${todaySessions} 个番茄。`
    });

    // 自动切换到短休
    if (todaySessions % 4 === 0) {
      switchMode('long-break');
    } else {
      switchMode('short-break');
    }
    startTimer();
  } else {
    const breakLabel = MODES[currentMode].label;
    window.electronAPI.sendNotification({
      title: '⏰ 休息结束',
      body: `${breakLabel}时间到，准备开始下一个番茄！`
    });
    switchMode('work');
  }
}

// ========== 辅助函数 ==========

function addFruit() {
  const fruit = document.createElement('span');
  fruit.className = 'fruit';
  fruit.textContent = '🍅';
  elFruits.appendChild(fruit);
}

function playChime() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const notes = [523.25, 659.25, 783.99];

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.15);
    osc.stop(ctx.currentTime + i * 0.15 + 0.4);
  });
}

function formatMinutes(totalSeconds) {
  const mins = Math.round(totalSeconds / 60);
  return `${mins} 分钟`;
}

function saveTodayStats() {
  const today = new Date().toDateString();
  localStorage.setItem('pomodoro-date', today);
  localStorage.setItem('pomodoro-sessions', todaySessions);
  localStorage.setItem('pomodoro-seconds', todayTotalSeconds);
}

function loadTodayStats() {
  const today = new Date().toDateString();
  const savedDate = localStorage.getItem('pomodoro-date');

  if (savedDate === today) {
    todaySessions = parseInt(localStorage.getItem('pomodoro-sessions')) || 0;
    todayTotalSeconds = parseInt(localStorage.getItem('pomodoro-seconds')) || 0;
  } else {
    todaySessions = 0;
    todayTotalSeconds = 0;
  }

  elSessionCount.textContent = todaySessions;
  elTotalTime.textContent = formatMinutes(todayTotalSeconds);

  // 恢复番茄果实
  for (let i = 0; i < todaySessions; i++) {
    addFruit();
  }
}
