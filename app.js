// ---------------- STATE ----------------
let shortcuts = [];
let allowedShortcuts = new Set();

let idx = 0;
let current = null;

let started = false;
let startTime = 0;
let timerId = null;

let correct = 0;
let errors = 0;
let totalAttempts = 0;

let lastResultsPayload = null;

let mode = "solo iniziale";
let showShortcut = false;

let lastKeyTime = null;
let lastDeltaMs = null;
let deltas = [];

// ---------------- ELEMENTS ----------------
const elTimer = document.getElementById("timer");
const elKeycode = document.getElementById("keycode");

const elShortcutHidden = document.getElementById("shortcutHidden");
const elShortcutText = document.getElementById("shortcutText");

const elStatus = document.getElementById("status");
const elHint = document.getElementById("hint");
const elLog = document.getElementById("log");

const elCorrect = document.getElementById("correct");
const elErrors = document.getElementById("errors");
const elSpeed = document.getElementById("speed");
const elAvgSpeed = document.getElementById("avgSpeed");

const elLoaded = document.getElementById("loaded");
const elAcc = document.getElementById("acc");
const elProgress = document.getElementById("progress");
const elLoadInfo = document.getElementById("loadInfo");

const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnNext = document.getElementById("btnNext");
const btnToggleShow = document.getElementById("btnToggleShow");
const btnMode = document.getElementById("btnMode");
const btnReset = document.getElementById("btnReset");

const resultsModal = document.getElementById("resultsModal");
const btnCloseResults = document.getElementById("btnCloseResults");

const leaderboardList = document.getElementById("leaderboardList");
const lbStatus = document.getElementById("lbStatus");
const lbName = document.getElementById("lbName");
const btnSaveScore = document.getElementById("btnSaveScore");
const lbSaveStatus = document.getElementById("lbSaveStatus");

const modeModal = document.getElementById("modeModal");
const btnCancelMode = document.getElementById("btnCancelMode");
const btnConfirmMode = document.getElementById("btnConfirmMode");

const mTime = document.getElementById("mTime");
const mAttempts = document.getElementById("mAttempts");
const mCorrect = document.getElementById("mCorrect");
const mErrors = document.getElementById("mErrors");
const mAcc = document.getElementById("mAcc");
const mAvg = document.getElementById("mAvg");
const mLast = document.getElementById("mLast");
const mMode = document.getElementById("mMode");
const mJson = document.getElementById("mJson");

// ---------------- SUPABASE ----------------
const SUPABASE_URL = "https://mjrgmppirvmwevxyabgp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcmdtcHBpcnZtd2V2eHlhYmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDc4NTEsImV4cCI6MjA4ODMyMzg1MX0.TPXBPXQxAHSvHQFTNYzUK2TBfx3pkorFSUGJd3qEYJU";

let sb = null;

function initSupabase() {
  try {
    if (
      window.supabase &&
      typeof window.supabase.createClient === "function" &&
      SUPABASE_URL &&
      SUPABASE_ANON_KEY
    ) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.warn("Supabase init failed", e);
    sb = null;
  }
}

// ---------------- HELPERS ----------------
function fmtTime(ms) {
  const totalSeconds = ms / 1000;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function setStatus(msg) {
  if (elStatus) elStatus.textContent = msg || "";
}

function average(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function normalizeShortcut(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/control/g, "ctrl")
    .replace(/command/g, "meta")
    .replace(/arrowleft/g, "left")
    .replace(/arrowright/g, "right")
    .replace(/arrowup/g, "up")
    .replace(/arrowdown/g, "down");
}

function normalizeShortcutForCompare(shortcut) {
  return normalizeShortcut(shortcut);
}

function keyEventToCombo(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey) parts.push("meta");

  let key = e.key;

  if (key === "Control") key = "ctrl";
  else if (key === "Alt") key = "alt";
  else if (key === "Shift") key = "shift";
  else if (key === "Meta") key = "meta";
  else if (key === "ArrowLeft") key = "left";
  else if (key === "ArrowRight") key = "right";
  else if (key === "ArrowUp") key = "up";
  else if (key === "ArrowDown") key = "down";
  else key = String(key).toLowerCase();

  if (!["ctrl", "alt", "shift", "meta"].includes(key)) {
    parts.push(key);
  }

  return parts.join("+");
}

function updateStats() {
  if (elCorrect) elCorrect.textContent = correct;
  if (elErrors) elErrors.textContent = errors;

  const acc = totalAttempts ? Math.round((correct / totalAttempts) * 100) : 0;
  if (elAcc) elAcc.textContent = `${acc}%`;

  const currentIndex = started ? Math.min(idx, shortcuts.length) : 0;
  if (elProgress) {
    elProgress.textContent = shortcuts.length ? `${currentIndex} / ${shortcuts.length}` : "0 / 0";
  }

  if (elSpeed) {
    elSpeed.textContent = lastDeltaMs != null ? `${lastDeltaMs} ms` : "—";
  }

  const avgMs = average(deltas);
  if (elAvgSpeed) {
    elAvgSpeed.textContent = `avg: ${avgMs != null ? avgMs + " ms" : "—"}`;
  }
}

function updateTimer() {
  if (!started) return;
  elTimer.textContent = fmtTime(performance.now() - startTime);
}

function updateShortcutVisibility() {
  if (!elShortcutHidden || !elShortcutText || !btnToggleShow) return;

  if (!current) {
    elShortcutHidden.style.display = "";
    elShortcutText.style.display = "none";
    elShortcutHidden.textContent = "Shortcut is hidden";
    btnToggleShow.textContent = "Show Shortcut";
    return;
  }

  if (showShortcut) {
    elShortcutHidden.style.display = "none";
    elShortcutText.style.display = "";
    elShortcutText.textContent = current.shortcut;
    btnToggleShow.textContent = "Hide Shortcut";
  } else {
    elShortcutHidden.style.display = "";
    elShortcutText.style.display = "none";
    elShortcutHidden.textContent = "Shortcut is hidden";
    btnToggleShow.textContent = "Show Shortcut";
  }
}

function openModeModal() {
  if (!modeModal) return;
  modeModal.classList.add("show");
  modeModal.style.display = "flex";
  modeModal.setAttribute("aria-hidden", "false");
}

function closeModeModal() {
  if (!modeModal) return;
  modeModal.classList.remove("show");
  modeModal.style.display = "";
  modeModal.setAttribute("aria-hidden", "true");
}

function getSelectedModeFromModal() {
  const checked = document.querySelector('input[name="modeChoice"]:checked');
  if (!checked) return "solo iniziale";

  const map = {
    sequential: "solo iniziale",
    random: "random",
    ten: "10 keys"
  };

  return map[checked.value] || "solo iniziale";
}

// ---------------- LEADERBOARD ----------------
async function loadLeaderboard() {
  if (!sb) {
    if (lbStatus) lbStatus.textContent = "offline";
    return;
  }

  if (lbStatus) lbStatus.textContent = "loading";

  const { data, error } = await sb
    .from("scores")
    .select("name, score, time_text, mode, avg_speed_ms")
    .order("score", { ascending: false })
    .order("avg_speed_ms", { ascending: true, nullsFirst: false })
    .limit(10);

  if (error) {
    console.error(error);
    if (lbStatus) lbStatus.textContent = "error";
    return;
  }

  if (lbStatus) lbStatus.textContent = "online";

  if (leaderboardList) {
    leaderboardList.innerHTML = (data || [])
      .map((r, i) => `
        <div class="logItem" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <span><b>${i + 1}.</b> ${escapeHtml(r.name || "Player")}</span>
            <span class="mono"><b>${r.score ?? 0}</b></span>
          </div>
          <div class="small mono" style="margin-top:4px;">
            time: ${escapeHtml(r.time_text || "—")} ·
            mode: ${escapeHtml(r.mode || "—")} ·
            avg: ${r.avg_speed_ms != null ? `${r.avg_speed_ms} ms` : "—"}
          </div>
        </div>
      `)
      .join("");
  }
}

async function saveScoreToLeaderboard(nickname, payload) {
  if (!sb || !payload) return;

  const name = (nickname || "").trim().slice(0, 20) || "Player";

  const row = {
    name,
    score: Number(payload.correct) || 0,
    time_text: payload.elapsedHuman || null,
    mode: payload.mode || null,
    avg_speed_ms: payload.avgMs != null ? Number(payload.avgMs) : null
  };

  const { error } = await sb.from("scores").insert([row]);

  if (error) {
    console.error(error);
    if (lbSaveStatus) lbSaveStatus.textContent = "Save failed";
    return;
  }

  try {
    localStorage.setItem("lb_nick", name);
  } catch {}

  if (lbSaveStatus) lbSaveStatus.textContent = "Saved!";
  loadLeaderboard();
}

// ---------------- XML LOADER ----------------
async function loadBundledXml() {
  const res = await fetch("./KeyboardShortCuts.xml", { cache: "no-store" });
  if (!res.ok) throw new Error(`XML fetch failed: ${res.status}`);

  const xmlText = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");

  if (xml.querySelector("parsererror")) {
    throw new Error("XML parse error");
  }

  const nodes = xml.querySelectorAll("KeyboardShortcut");

  shortcuts = Array.from(nodes)
    .map((node) => ({
      keyCode: (node.getAttribute("KeyCode") || "").trim(),
      shortcut: (node.getAttribute("Shortcut") || "").trim()
    }))
    .filter((item) => item.shortcut);

  allowedShortcuts = new Set(
    shortcuts.map((item) => normalizeShortcut(item.shortcut))
  );

  if (elLoaded) elLoaded.textContent = shortcuts.length;
  if (elLoadInfo) elLoadInfo.textContent = `Loaded ${shortcuts.length} shortcuts`;

  if (shortcuts.length > 0) {
    btnStart.disabled = false;
    setStatus("Ready");
  } else {
    btnStart.disabled = true;
    setStatus("No shortcuts found in XML");
  }

  updateStats();
}

// ---------------- GAME ----------------
function renderCurrentShortcut() {
  if (!current) {
    if (elShortcutText) elShortcutText.textContent = "—";
    if (elHint) elHint.textContent = "";
    if (elKeycode) elKeycode.textContent = "—";
    updateShortcutVisibility();
    return;
  }

  if (elShortcutText) elShortcutText.textContent = current.shortcut;
  if (elHint) elHint.textContent = current.keyCode ? `KeyCode: ${current.keyCode}` : "";
  if (elKeycode) elKeycode.textContent = current.keyCode || "—";

  updateShortcutVisibility();
}

function getNextShortcutByMode() {
  if (!shortcuts.length) return null;

  if (mode === "random") {
    const randomIndex = Math.floor(Math.random() * shortcuts.length);
    return shortcuts[randomIndex];
  }

  if (mode === "10 keys") {
    if (idx >= Math.min(10, shortcuts.length)) return null;
    return shortcuts[idx++];
  }

  if (idx >= shortcuts.length) idx = 0;
  return shortcuts[idx++];
}

function nextShortcut() {
  if (!shortcuts.length) return;

  const next = getNextShortcutByMode();

  if (!next) {
    stopGame();
    return;
  }

  current = next;
  renderCurrentShortcut();
  updateStats();
}

function reallyStartGame() {
  if (!shortcuts.length) return;

  started = true;
  startTime = performance.now();
  clearInterval(timerId);
  timerId = setInterval(updateTimer, 100);

  correct = 0;
  errors = 0;
  totalAttempts = 0;
  idx = 0;
  current = null;
  showShortcut = false;

  lastResultsPayload = null;
  lastKeyTime = null;
  lastDeltaMs = null;
  deltas = [];

  if (elTimer) elTimer.textContent = "00:00.0";
  if (elSpeed) elSpeed.textContent = "—";
  if (elAvgSpeed) elAvgSpeed.textContent = "avg: —";

  btnStart.disabled = true;
  btnStop.disabled = false;
  if (btnNext) btnNext.disabled = false;
  if (btnToggleShow) btnToggleShow.disabled = false;

  if (resultsModal) {
    resultsModal.classList.remove("show");
    resultsModal.style.display = "";
  }

  nextShortcut();
  updateStats();
  setStatus(`Game started · ${mode}`);
}

function fillResultsModal(payload) {
  const attempts = payload.attempts || 0;
  const acc = attempts ? Math.round((payload.correct / attempts) * 100) : 0;

  if (mTime) mTime.textContent = payload.elapsedHuman || "—";
  if (mAttempts) mAttempts.textContent = String(payload.attempts || 0);
  if (mCorrect) mCorrect.textContent = String(payload.correct || 0);
  if (mErrors) mErrors.textContent = String(payload.errors || 0);
  if (mAcc) mAcc.textContent = `${acc}%`;
  if (mAvg) mAvg.textContent = payload.avgMs != null ? `${payload.avgMs} ms` : "—";
  if (mLast) mLast.textContent = payload.lastMs != null ? `${payload.lastMs} ms` : "—";
  if (mMode) mMode.textContent = payload.mode || "—";

  if (mJson) {
    mJson.value = JSON.stringify(payload, null, 2);
  }
}

function stopGame() {
  if (!started) return;

  started = false;
  clearInterval(timerId);

  btnStart.disabled = shortcuts.length === 0;
  btnStop.disabled = true;
  if (btnNext) btnNext.disabled = true;
  if (btnToggleShow) btnToggleShow.disabled = true;

  const elapsed = performance.now() - startTime;

  lastResultsPayload = {
    mode,
    correct,
    errors,
    attempts: totalAttempts,
    elapsedHuman: fmtTime(elapsed),
    avgMs: average(deltas),
    lastMs: lastDeltaMs
  };

  fillResultsModal(lastResultsPayload);

  if (lbName) {
    try {
      lbName.value = localStorage.getItem("lb_nick") || "";
    } catch {}
  }

  if (lbSaveStatus) lbSaveStatus.textContent = "";

  if (resultsModal) {
    resultsModal.classList.add("show");
    resultsModal.style.display = "flex";
    resultsModal.setAttribute("aria-hidden", "false");
  }

  setStatus("Game ended");
}

// ---------------- BROWSER SHORTCUT BLOCK ----------------
document.addEventListener(
  "keydown",
  (e) => {
    if (!started) return;

    const combo = normalizeShortcut(keyEventToCombo(e));
    const key = String(e.key || "").toLowerCase();

    const isGameShortcut = allowedShortcuts.has(combo);
    const looksLikeBrowserShortcut =
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      ["f1", "f3", "f5", "f12"].includes(key);

    if (looksLikeBrowserShortcut && !isGameShortcut) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true
);

// ---------------- GAME KEY INPUT ----------------
document.addEventListener("keydown", (e) => {
  if (!started || !current) return;

  const combo = normalizeShortcut(keyEventToCombo(e));
  const expected = normalizeShortcutForCompare(current.shortcut);

  const now = performance.now();
  if (lastKeyTime != null) {
    lastDeltaMs = Math.round(now - lastKeyTime);
    deltas.push(lastDeltaMs);
  }
  lastKeyTime = now;

  totalAttempts++;

  if (combo === expected) {
    correct++;
    nextShortcut();
    setStatus("Correct");
  } else {
    errors++;
    setStatus(`Wrong: ${combo || e.key}`);
  }

  updateStats();
});

// ---------------- BUTTON EVENTS ----------------
if (btnStart) {
  btnStart.addEventListener("click", () => {
    openModeModal();
  });
}

if (btnStop) btnStop.addEventListener("click", stopGame);

if (btnNext) {
  btnNext.addEventListener("click", () => {
    if (!started) return;
    nextShortcut();
  });
}

if (btnToggleShow) {
  btnToggleShow.addEventListener("click", () => {
    if (!current) return;
    showShortcut = !showShortcut;
    updateShortcutVisibility();
  });
}

if (btnCancelMode) {
  btnCancelMode.addEventListener("click", () => {
    closeModeModal();
  });
}

if (btnConfirmMode) {
  btnConfirmMode.addEventListener("click", () => {
    mode = getSelectedModeFromModal();
    closeModeModal();
    reallyStartGame();
  });
}

if (btnReset) {
  btnReset.addEventListener("click", () => {
    location.reload();
  });
}

if (btnSaveScore) {
  btnSaveScore.addEventListener("click", async () => {
    if (lbSaveStatus) lbSaveStatus.textContent = "saving...";
    await saveScoreToLeaderboard(lbName ? lbName.value : "", lastResultsPayload);
  });
}

if (btnCloseResults) {
  btnCloseResults.addEventListener("click", () => {
    if (!resultsModal) return;
    resultsModal.classList.remove("show");
    resultsModal.style.display = "";
    resultsModal.setAttribute("aria-hidden", "true");
  });
}

// ---------------- INIT ----------------
(async function init() {
  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.disabled = true;
  if (btnNext) btnNext.disabled = true;
  if (btnToggleShow) btnToggleShow.disabled = true;
  if (btnMode) btnMode.style.display = "none";

  updateShortcutVisibility();
  updateStats();
  setStatus("Loading XML…");

  try {
    await loadBundledXml();
  } catch (err) {
    console.error(err);
    if (elLoadInfo) elLoadInfo.textContent = "Failed to load XML.";
    setStatus("Could not load KeyboardShortCuts.xml");
    if (btnStart) btnStart.disabled = true;
  }

  initSupabase();
  loadLeaderboard();
})();