// ---------------- STATE ----------------

let shortcuts = [];
let idx = 0;
let current = null;

let started = false;
let startTime = 0;
let timerId = null;

let correct = 0;
let errors = 0;
let totalAttempts = 0;

let lastKeyTime = null;
let lastDeltaMs = null;
let deltas = [];

let lastResultsPayload = null;


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


// -------------------- Leaderboard (Supabase) --------------------
const SUPABASE_URL = "https://mjrgmppirvmwevxyabgp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcmdtcHBpcnZtd2V2eHlhYmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDc4NTEsImV4cCI6MjA4ODMyMzg1MX0.TPXBPXQxAHSvHQFTNYzUK2TBfx3pkorFSUGJd3qEYJU";


let sb = null;

function initSupabase() {

  try {

    if (window.supabase && typeof window.supabase.createClient === "function") {

      if (!SUPABASE_URL.includes("YOUR-PROJECT")) {

        sb = window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_ANON_KEY
        );

      }

    }

  } catch (e) {

    console.warn("Supabase init failed", e);

  }

}


// ---------------- LEADERBOARD ----------------

async function loadLeaderboard() {

  if (!sb) {
    lbStatus.textContent = "offline";
    return;
  }

  lbStatus.textContent = "loading";

  const { data, error } = await sb
    .from("scores")
    .select("name, score")
    .order("score", { ascending: false })
    .limit(10);

  if (error) {

    console.error(error);

    lbStatus.textContent = "error";

    return;

  }

  lbStatus.textContent = "online";

  leaderboardList.innerHTML = data.map((r, i) =>

    `<div class="logItem">
      <b>${i + 1}.</b> ${escapeHtml(r.name)}
      <span class="mono">${r.score}</span>
    </div>`

  ).join("");

}


async function saveScoreToLeaderboard(nickname, payload) {

  if (!sb) return;

  const score = payload.correct;

  const name = nickname.trim().slice(0, 20) || "Player";

  const { error } = await sb.from("scores").insert([
    { name, score }
  ]);

  if (error) {

    console.error(error);

    lbSaveStatus.textContent = "Save failed";

    return;

  }

  lbSaveStatus.textContent = "Saved!";

  loadLeaderboard();

}


// ---------------- XML LOADER ----------------

async function loadBundledXml() {
  const res = await fetch("./KeyboardShortCuts.xml", { cache: "no-store" });
  if (!res.ok) throw new Error(`XML fetch failed: ${res.status}`);

  const xmlText = await res.text();

  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");

  // Se l'XML è malformato, molti browser mettono <parsererror>
  if (xml.querySelector("parsererror")) {
    throw new Error("XML parse error");
  }

  // 1) raccogli TUTTI i testi + attributi
  const collected = [];

  // attributi (Keys / Shortcut / value / ecc.)
  xml.querySelectorAll("*").forEach((el) => {
    for (const attr of el.attributes) {
      const v = (attr.value || "").trim();
      if (v) collected.push(v);
    }
  });

  // testo interno (solo nodi foglia per evitare duplicati enormi)
  xml.querySelectorAll("*").forEach((el) => {
    if (el.children.length === 0) {
      const t = (el.textContent || "").trim();
      if (t) collected.push(t);
    }
  });

  // 2) filtra cose che sembrano shortcut
  // (contiene Ctrl/Alt/Shift/Cmd oppure + oppure F1..F12 o combinazioni simili)
  const looksLikeShortcut = (s) => {
    const x = s.trim();
    if (x.length < 2 || x.length > 80) return false;

    const hasMod =
      /ctrl|control|alt|shift|cmd|command|meta|option/i.test(x);
    const hasPlus = /[+]/.test(x);
    const hasFx = /\bF([1-9]|1[0-2])\b/i.test(x);

    // evita frasi lunghissime
    const tooManyWords = x.split(/\s+/).length > 12;
    if (tooManyWords) return false;

    return hasMod || hasPlus || hasFx;
  };

  // normalizza e deduplica
  const normalized = collected
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(looksLikeShortcut);

  shortcuts = Array.from(new Set(normalized));

  // Aggiorna UI
  elLoaded.textContent = shortcuts.length;
  elLoadInfo.textContent = shortcuts.length
    ? `Loaded ${shortcuts.length} shortcuts`
    : `Loaded 0 shortcuts (XML parsed, but no shortcut strings found)`;

  if (shortcuts.length > 0) {
    btnStart.disabled = false;
    btnMode.disabled = false;
  } else {
    btnStart.disabled = true;
    btnMode.disabled = true;
  }
}


// ---------------- GAME ----------------

function nextShortcut() {

  if (shortcuts.length === 0) return;

  current = shortcuts[idx];

  elShortcutText.textContent = current;

  idx++;

  if (idx >= shortcuts.length) idx = 0;

}


function startGame() {

  started = true;

  startTime = performance.now();

  timerId = setInterval(updateTimer, 100);

  correct = 0;
  errors = 0;
  totalAttempts = 0;

  deltas = [];

  btnStart.disabled = true;
  btnStop.disabled = false;

  nextShortcut();

}


function stopGame() {

  if (!started) return;

  started = false;

  clearInterval(timerId);

  const elapsed = performance.now() - startTime;

  const payload = {
    correct,
    errors,
    attempts: totalAttempts,
    elapsed
  };

  lastResultsPayload = payload;

  resultsModal.classList.add("show");

}


function updateTimer() {

  const ms = performance.now() - startTime;

  elTimer.textContent = fmtTime(ms);

}


// ---------------- EVENTS ----------------

document.addEventListener("keydown", (e) => {

  if (!started) return;

  elKeycode.textContent = e.code;

  totalAttempts++;

  if (current && current.includes(e.key)) {

    correct++;

    nextShortcut();

  } else {

    errors++;

  }

  updateStats();

});


btnStart.addEventListener("click", startGame);

btnStop.addEventListener("click", stopGame);

btnReset.addEventListener("click", () => location.reload());


btnSaveScore.addEventListener("click", () => {

  saveScoreToLeaderboard(
    lbName.value,
    lastResultsPayload
  );

});


btnCloseResults.addEventListener("click", () => {

  resultsModal.classList.remove("show");

});


// ---------------- STATS ----------------

function updateStats() {

  elCorrect.textContent = correct;

  elErrors.textContent = errors;

  const acc = totalAttempts
    ? Math.round((correct / totalAttempts) * 100)
    : 0;

  elAcc.textContent = acc + "%";

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

  return String(str).replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));

}


// ---------------- INIT ----------------

(async function init() {
  setStatus("Loading XML…", "");

  try {
    await loadBundledXml();
    setStatus("Ready ✅", "");
  } catch (err) {
    console.error(err);
    elLoadInfo.textContent = "Failed to load/parse XML. Check filename/path.";
    setStatus("Could not load/parse KeyboardShortCuts.xml", "bad");
    btnStart.disabled = true;
  }

  initSupabase();
  loadLeaderboard();
})();


// ---------------- STATUS ----------------

function setStatus(msg) {

  elStatus.textContent = msg;

}