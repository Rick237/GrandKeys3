// -------------------- State --------------------
let shortcuts = [];
let mode = "sequential";
let runType = "full";
let tenStyle = "random";
let tenRemaining = 0;

let idx = 0;
let current = null;

let started = false;
let startTime = 0;
let timerId = null;

let correct = 0;
let errors = 0;
let totalAttempts = 0;

let showShortcut = false;

let lastKeyTime = null;
let lastDeltaMs = null;
let deltas = [];

let runId = null;

// -------------------- Leaderboard (Supabase) --------------------
const SUPABASE_URL = "https://mjrgmppirvmwevxyabgp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcmdtcHBpcnZtd2V2eHlhYmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDc4NTEsImV4cCI6MjA4ODMyMzg1MX0.TPXBPXQxAHSvHQFTNYzUK2TBfx3pkorFSUGJd3qEYJU";

let sb = null;
let lastResultsPayload = null;

function initSupabase() {
  try {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      if (!SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR_ANON_KEY")) {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
    }
  } catch (e) {
    console.warn("Supabase init failed", e);
    sb = null;
  }
}

function sanitizeNickname(name) {
  const clean = (name || "").trim().slice(0, 20);
  return clean || "Player";
}

async function loadLeaderboard() {
  if (!sb) {
    if (lbStatus) lbStatus.textContent = "offline";
    return;
  }

  if (lbStatus) lbStatus.textContent = "loading…";

  const { data, error } = await sb
    .from("scores")
    .select("name, score, created_at")
    .order("score", { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    if (lbStatus) lbStatus.textContent = "error";
    return;
  }

  if (lbStatus) lbStatus.textContent = "online";

  leaderboardList.innerHTML = (data || []).map((row, i) => `
    <div class="logItem" style="display:flex;justify-content:space-between">
      <div><b>${i + 1}.</b> ${escapeHtml(row.name)}</div>
      <div class="mono"><b>${row.score}</b></div>
    </div>
  `).join("");
}

async function saveScoreToLeaderboard(nickname, payload) {

  if (!sb) return { ok: false, msg: "Leaderboard not configured." };
  if (!payload) return { ok: false, msg: "No results to save." };

  const score = Number(payload.correct) || 0;
  const name = sanitizeNickname(nickname);

  const { error } = await sb.from("scores").insert([{ name, score }]);

  if (error) {
    console.error(error);
    return { ok: false, msg: "Save failed." };
  }

  try { localStorage.setItem("lb_nick", name); } catch {}

  return { ok: true, msg: "Saved!" };
}

// -------------------- Elements --------------------
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

// -------------------- Helpers --------------------

function fmtTime(ms) {

  const totalSeconds = ms / 1000;

  const m = Math.floor(totalSeconds / 60);

  const s = Math.floor(totalSeconds % 60);

  const tenths = Math.floor((ms % 1000) / 100);

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;

}

function updateTimer() {
  if (!started) return;
  elTimer.textContent = fmtTime(performance.now() - startTime);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// -------------------- Results --------------------

function showResults(payload) {

  lastResultsPayload = payload;

  if (lbName) {
    try { lbName.value = localStorage.getItem("lb_nick") || ""; } catch {}
  }

  lbSaveStatus.textContent = "";

  resultsModal.classList.add("show");
}

function stopGame(reason) {

  if (!started) return;

  started = false;

  clearInterval(timerId);

  const elapsed = performance.now() - startTime;

  const payload = {
    correct,
    errors,
    attempts: totalAttempts,
    elapsedHuman: fmtTime(elapsed)
  };

  showResults(payload);
}

// -------------------- Events --------------------

btnSaveScore.addEventListener("click", async () => {

  lbSaveStatus.textContent = "saving...";

  const nick = lbName.value;

  const res = await saveScoreToLeaderboard(nick, lastResultsPayload);

  lbSaveStatus.textContent = res.msg;

  if (res.ok) loadLeaderboard();

});

btnCloseResults.addEventListener("click", () => {

  resultsModal.classList.remove("show");

});

// -------------------- XML --------------------

async function loadBundledXml() {

  const res = await fetch("./KeyboardShortCuts.xml");

  const text = await res.text();

  shortcuts = text.split("\n");

}

// -------------------- Init --------------------

(async function init() {

  initSupabase();

  loadLeaderboard();

})();