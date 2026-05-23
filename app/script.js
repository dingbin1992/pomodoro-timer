// ========== Tauri API 桥接 ==========

function findTauriInvoke() {
  const intl = window.__TAURI_INTERNALS__;
  if (intl && typeof intl.invoke === "function") {
    return function (cmd, args) {
      return intl.invoke(cmd, args || {});
    };
  }
  const t = window.__TAURI__;
  if (t) {
    if (typeof t.invoke === "function") return t.invoke.bind(t);
    if (t.core && typeof t.core.invoke === "function")
      return t.core.invoke.bind(t.core);
  }
  return null;
}

async function waitForTauri(maxWait) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const fn = findTauriInvoke();
    if (fn) return fn;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

const tauriReady = waitForTauri(3000);
let invokeFn = null;
tauriReady.then((fn) => {
  invokeFn = fn;
});

const tauri = {
  async _invoke(cmd, args) {
    if (!invokeFn) invokeFn = await tauriReady;
    if (invokeFn) return invokeFn(cmd, args);
    console.warn("[Tauri] invoke not available");
    return null;
  },
  async minimizeWindow() {
    await this._invoke("minimize_window");
  },
  async closeWindow() {
    await this._invoke("close_window");
  },
  async sendNotification(data) {
    return this._invoke("send_notification", data);
  },
  async getSettings() {
    const s = await this._invoke("get_settings");
    return (
      s || { workMinutes: 60, shortBreakMinutes: 10, longBreakMinutes: 120 }
    );
  },
  async saveSettings(settings) {
    return this._invoke("save_settings", { settings });
  },
};

const api = tauri;

// 调试: 显示 Tauri 连接状态
const debugLabel = document.querySelector(
  ".stat-item:nth-child(2) .stat-label",
);
if (debugLabel) {
  setTimeout(() => {
    const fn = findTauriInvoke();
    if (fn) {
      debugLabel.textContent = "牛马已就绪";
      debugLabel.style.color = "#4caf50";
    } else {
      const keys = window.__TAURI_INTERNALS__
        ? "INTL:" + Object.keys(window.__TAURI_INTERNALS__).join(",")
        : window.__TAURI__
          ? "GBL:" + Object.keys(window.__TAURI__).join(",")
          : "NONE";
      debugLabel.textContent = keys;
      debugLabel.style.color = "#f44336";
    }
  }, 500);
}

// ========== 番茄钟核心逻辑 ==========

const CIRCUMFERENCE = 2 * Math.PI * 90;

let MODES = {
  work: { label: "专注", minutes: 60, color: "#ff9800" },
  "short-break": { label: "短休", minutes: 10, color: "#7e57c2" },
  "long-break": { label: "长休", minutes: 120, color: "#e6517e" },
};

// 状态
let currentMode = "work";
let timeLeft = MODES.work.minutes * 60;
let totalDuration = MODES.work.minutes * 60;
let timerInterval = null;
let isRunning = false;
let todaySessions = 0;
let todayTotalSeconds = 0;

// DOM 元素
const elMinutes = document.querySelector(".timer-minutes");
const elSeconds = document.querySelector(".timer-seconds");
const elProgress = document.querySelector(".progress-ring-fill");
const elTimerSection = document.querySelector(".timer-section");
const elBtnToggle = document.getElementById("btn-toggle");
const elBtnToggleIcon = elBtnToggle.querySelector(".btn-icon");
const elBtnToggleText = elBtnToggle.querySelector(".btn-text");
const elBtnReset = document.getElementById("btn-reset");
const elSessionCount = document.getElementById("session-count");
const elTotalTime = document.getElementById("total-time");
const elFruits = document.getElementById("fruits-container");
const elModeTabs = document.querySelectorAll(".mode-tab");

// 设置面板 DOM
const elSettingsOverlay = document.getElementById("settings-overlay");
const elSettingsWork = document.getElementById("settings-work");
const elSettingsShort = document.getElementById("settings-short");
const elSettingsLong = document.getElementById("settings-long");
const elBtnSaveSettings = document.getElementById("btn-save-settings");
const elBtnCancelSettings = document.getElementById("btn-cancel-settings");
const elBtnOpenSettings = document.getElementById("btn-settings");

// 初始化圆环
elProgress.style.strokeDasharray = CIRCUMFERENCE;
elProgress.style.strokeDashoffset = "0";

// 先加载设置，再加载今日数据
(async function init() {
  await loadSettings();
  loadTodayStats();
})();

// ========== 事件监听 ==========

elBtnToggle.addEventListener("click", toggleTimer);
elBtnReset.addEventListener("click", resetTimer);

elModeTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.mode));
});

// 最小化 - 带反馈
document.getElementById("btn-minimize").addEventListener("click", () => {
  document.getElementById("btn-minimize").style.background =
    "rgba(255,152,0,0.5)";
  setTimeout(() => {
    document.getElementById("btn-minimize").style.background = "";
  }, 300);
  api.minimizeWindow();
});

// 关闭 - 带反馈
document.getElementById("btn-close").addEventListener("click", () => {
  document.getElementById("btn-close").style.background = "rgba(255,82,82,0.6)";
  api.closeWindow();
});

// 设置面板事件
elBtnOpenSettings.addEventListener("click", openSettings);
elBtnCancelSettings.addEventListener("click", closeSettings);
elBtnSaveSettings.addEventListener("click", () => {
  saveSettings();
  closeSettings();
});
elSettingsOverlay.addEventListener("click", (e) => {
  if (e.target === elSettingsOverlay) closeSettings();
});

// 设置面板步进按钮
document.querySelectorAll(".settings-stepper").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    const delta = parseInt(btn.dataset.delta) || 0;
    const min = parseInt(target.min) || 1;
    const max = parseInt(target.max) || 600;
    let val = (parseInt(target.value) || 0) + delta;
    val = Math.max(min, Math.min(max, val));
    target.value = val;
  });
});

// ========== 设置管理 ==========

async function loadSettings() {
  const settings = await api.getSettings();
  if (settings) {
    MODES.work.minutes = settings.workMinutes || 60;
    MODES["short-break"].minutes = settings.shortBreakMinutes || 10;
    MODES["long-break"].minutes = settings.longBreakMinutes || 120;
  }
  timeLeft = MODES[currentMode].minutes * 60;
  totalDuration = timeLeft;
  updateDisplay();
}

function openSettings() {
  elSettingsWork.value = MODES.work.minutes;
  elSettingsShort.value = MODES["short-break"].minutes;
  elSettingsLong.value = MODES["long-break"].minutes;
  elSettingsOverlay.classList.add("visible");
}

function closeSettings() {
  elSettingsOverlay.classList.remove("visible");
}

async function saveSettings() {
  const workMin = Math.max(
    1,
    Math.min(300, parseInt(elSettingsWork.value) || 60),
  );
  const shortMin = Math.max(
    1,
    Math.min(60, parseInt(elSettingsShort.value) || 10),
  );
  const longMin = Math.max(
    1,
    Math.min(600, parseInt(elSettingsLong.value) || 120),
  );

  MODES.work.minutes = workMin;
  MODES["short-break"].minutes = shortMin;
  MODES["long-break"].minutes = longMin;

  await api.saveSettings({
    workMinutes: workMin,
    shortBreakMinutes: shortMin,
    longBreakMinutes: longMin,
  });

  if (!isRunning) {
    timeLeft = MODES[currentMode].minutes * 60;
    totalDuration = timeLeft;
    updateDisplay();
  }
}

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
  elBtnToggleIcon.textContent = "⏸";
  elBtnToggleText.textContent = "暂停";
  elTimerSection.classList.add("running");

  timerInterval = setInterval(() => {
    timeLeft--;
    updateDisplay();
    if (timeLeft <= 0) completeSession();
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  elBtnToggleIcon.textContent = "▶";
  elBtnToggleText.textContent = "继续";
  elTimerSection.classList.remove("running");
  clearInterval(timerInterval);
}

function resetTimer() {
  pauseTimer();
  timeLeft = MODES[currentMode].minutes * 60;
  totalDuration = timeLeft;
  elBtnToggleText.textContent = "开始";
  updateDisplay();
}

function switchMode(mode) {
  if (isRunning) pauseTimer();

  currentMode = mode;
  timeLeft = MODES[mode].minutes * 60;
  totalDuration = timeLeft;

  elModeTabs.forEach((t) =>
    t.classList.toggle("active", t.dataset.mode === mode),
  );
  elBtnToggleText.textContent = "开始";

  const modeColors = {
    work: { min: "#ff9800", sec: "#f57c00" },
    "short-break": { min: "#7e57c2", sec: "#512da8" },
    "long-break": { min: "#e6517e", sec: "#c62828" },
  };

  const c = modeColors[mode];
  elMinutes.style.backgroundImage =
    "linear-gradient(180deg, " + c.min + " 0%, " + c.sec + " 100%)";
  elSeconds.style.backgroundImage =
    "linear-gradient(180deg, " + c.sec + " 0%, " + c.min + " 100%)";

  updateDisplay();
}

function updateDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  elMinutes.textContent = String(mins).padStart(2, "0");
  elSeconds.textContent = String(secs).padStart(2, "0");

  const progress = 1 - timeLeft / totalDuration;
  elProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
}

function completeSession() {
  clearInterval(timerInterval);
  isRunning = false;
  elTimerSection.classList.remove("running");
  elBtnToggleIcon.textContent = "▶";
  elBtnToggleText.textContent = "开始";

  playChime();

  if (currentMode === "work") {
    todaySessions++;
    todayTotalSeconds += MODES.work.minutes * 60;
    elSessionCount.textContent = todaySessions;
    elTotalTime.textContent = formatMinutes(todayTotalSeconds);
    addFruit();
    saveTodayStats();

    api.sendNotification({
      title: "🍅 番茄钟完成！",
      body:
        "专注 " +
        MODES.work.minutes +
        " 分钟完成，今日已累计 " +
        todaySessions +
        " 个番茄。",
    });

    if (todaySessions % 4 === 0) {
      switchMode("long-break");
    } else {
      switchMode("short-break");
    }
    startTimer();
  } else {
    const breakLabel = MODES[currentMode].label;
    api.sendNotification({
      title: "⏰ 休息结束",
      body: breakLabel + "时间到，准备开始下一个番茄！",
    });
    switchMode("work");
  }
}

// ========== 辅助函数 ==========

function addFruit() {
  const fruit = document.createElement("span");
  fruit.className = "fruit";
  fruit.textContent = "🍅";
  elFruits.appendChild(fruit);
}

function playChime() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const notes = [523.25, 659.25, 783.99];

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + i * 0.15 + 0.4,
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.15);
    osc.stop(ctx.currentTime + i * 0.15 + 0.4);
  });
}

function formatMinutes(totalSeconds) {
  const mins = Math.round(totalSeconds / 60);
  return mins + " 分钟";
}

function saveTodayStats() {
  const today = new Date().toDateString();
  localStorage.setItem("pomodoro-date", today);
  localStorage.setItem("pomodoro-sessions", todaySessions);
  localStorage.setItem("pomodoro-seconds", todayTotalSeconds);
}

function loadTodayStats() {
  const today = new Date().toDateString();
  const savedDate = localStorage.getItem("pomodoro-date");

  if (savedDate === today) {
    todaySessions = parseInt(localStorage.getItem("pomodoro-sessions")) || 0;
    todayTotalSeconds = parseInt(localStorage.getItem("pomodoro-seconds")) || 0;
  } else {
    todaySessions = 0;
    todayTotalSeconds = 0;
  }

  elSessionCount.textContent = todaySessions;
  elTotalTime.textContent = formatMinutes(todayTotalSeconds);

  for (let i = 0; i < todaySessions; i++) {
    addFruit();
  }
}
