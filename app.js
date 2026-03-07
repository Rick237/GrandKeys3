// -------------------- State --------------------
let shortcuts = [];
let allowedShortcuts = new Set();

let mode = "sequential";      // "sequential" | "random"
let runType = "full";         // "full" | "ten"
let tenStyle = "random";      // "random" | "sequential" (only for runType="ten")
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
let deltas = []; // between keypresses

let runId = null;
let lastResultsPayload = null;

let tenPool = [];

// -------------------- Leaderboard (Supabase) --------------------
const SUPABASE_URL = "https://mjrgmppirvmwevxyabgp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcmdtcHBpcnZtd2V2eHlhYmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDc4NTEsImV4cCI6MjA4ODMyMzg1MX0.TPXBPXQxAHSvHQFTNYzUK2TBfx3pkorFSUGJd3qEYJU";

let sb = null;

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
const lbModeFilter = document.getElementById("lbModeFilter");

// results section on page
const elResultsCard = document.getElementById("resultsCard");
const elResultsTime = document.getElementById("resultsTime");
const elResultsAttempts = document.getElementById("resultsAttempts");
const elResultsCorrect = document.getElementById("resultsCorrect");
const elResultsErrors = document.getElementById("resultsErrors");
const elResultsAcc = document.getElementById("resultsAcc");
const elResultsAvg = document.getElementById("resultsAvg");
const elResultsLast = document.getElementById("resultsLast");
const elResultsJson = document.getElementById("resultsJson");

// mode modal
const modeModal = document.getElementById("modeModal");
const btnCancelMode = document.getElementById("btnCancelMode");
const btnConfirmMode = document.getElementById("btnConfirmMode");
const tenModeExtra = document.getElementById("tenModeExtra");

// results modal
const resultsModal = document.getElementById("resultsModal");
const btnCloseResults = document.getElementById("btnCloseResults");
const mTime = document.getElementById("mTime");
const mAttempts = document.getElementById("mAttempts");
const mCorrect = document.getElementById("mCorrect");
const mErrors = document.getElementById("mErrors");
const mAcc = document.getElementById("mAcc");
const mAvg = document.getElementById("mAvg");
const mLast = document.getElementById("mLast");
const mMode = document.getElementById("mMode");
const mJson = document.getElementById("mJson");

// leaderboard
const leaderboardList = document.getElementById("leaderboardList");
const lbStatus = document.getElementById("lbStatus");
const lbName = document.getElementById("lbName");
const btnSaveScore = document.getElementById("btnSaveScore");
const lbSaveStatus = document.getElementById("lbSaveStatus");

// -------------------- Helpers --------------------
function setStatus(msg, cls) {
  if (!elStatus) return;
  elStatus.className = "status " + (cls || "");
  elStatus.textContent = msg || "";
}

function fmtTime(ms) {
  const totalSeconds = ms / 1000;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;
}

function updateTimer() {
  if (!started || !elTimer) return;
  elTimer.textContent = fmtTime(performance.now() - startTime);
}

function avgDeltaMs() {
  if (!deltas.length) return null;
  return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
}

function updateStats() {
  if (elCorrect) elCorrect.textContent = String(correct);
  if (elErrors) elErrors.textContent = String(errors);
  if (elLoaded) elLoaded.textContent = String(shortcuts.length);

  const acc = totalAttempts ? Math.round((correct / totalAttempts) * 100) : 0;
  if (elAcc) elAcc.textContent = `${acc}%`;

  if (elSpeed) {
    elSpeed.textContent = lastDeltaMs == null ? "—" : `${Math.round(lastDeltaMs)} ms`;
  }

  if (elAvgSpeed) {
    const avg = avgDeltaMs();
    elAvgSpeed.textContent = avg == null ? "avg: —" : `avg: ${avg} ms`;
  }

  if (!elProgress) return;

  if (!shortcuts.length) {
    elProgress.textContent = "0 / 0";
  } else if (runType === "ten") {
  const done = Math.max(0, 10 - tenRemaining);
  elProgress.textContent = `${done} / 10`;
  } else {
    const shownIndex = mode === "sequential" ? Math.min(idx + 1, shortcuts.length) : "—";
    elProgress.textContent = `${shownIndex} / ${shortcuts.length}`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function logAttempt(ok, expected, pressed) {
  if (!elLog) return;
  const div = document.createElement("div");
  div.className = "logItem";
  div.innerHTML = `
    <div><b class="${ok ? "ok" : "bad"}">${ok ? "OK" : "ERR"}</b>
      <span class="mono">${escapeHtml(expected)}</span>
    </div>
    <div class="small mono">pressed: ${escapeHtml(pressed)}${lastDeltaMs != null ? ` • Δ ${Math.round(lastDeltaMs)}ms` : ""}</div>
  `;
  elLog.prepend(div);
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function newRunId() {
  return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeShortcut(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/control/g, "ctrl")
    .replace(/command/g, "meta")
    .replace(/arrowleft/g, "left")
    .replace(/arrowright/g, "right")
    .replace(/arrowup/g, "up")
    .replace(/arrowdown/g, "down");
}

function modeLabelForPayload() {
  return runType === "ten"
    ? "10 keys"
    : (mode === "sequential" ? "Sequential" : "random");
}

// -------------------- Supabase --------------------
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

async function loadLeaderboard() {
  if (!leaderboardList || !lbStatus) return;

  if (!sb) {
    lbStatus.textContent = "offline";
    return;
  }

  lbStatus.textContent = "loading";

  const selectedMode = lbModeFilter ? lbModeFilter.value : "all";

  let query = sb
    .from("scores")
    .select("name, score, accuracy, time_text, time_ms, mode, avg_speed_ms");

  if (selectedMode !== "all") {
    query = query.eq("mode", selectedMode);
  }

const { data, error } = await query
  .order("score", { ascending: false })
  .limit(10);

  if (error) {
    console.error(error);
    lbStatus.textContent = "error";
    return;
  }

  lbStatus.textContent = "online";

  if (!data || !data.length) {
    leaderboardList.innerHTML = `<div class="small mono">No entries for this mode.</div>`;
    return;
  }

leaderboardList.innerHTML = (data || []).map((row, i) => {

  let medal = `${i + 1}.`;

  if (i === 0) medal = "🥇";
  else if (i === 1) medal = "🥈";
  else if (i === 2) medal = "🥉";

  return `
    <div class="logItem" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:12px;">
        <span><b>${medal}</b> ${escapeHtml(row.name || "Player")}</span>
        <span class="mono"><b>${Math.round(row.score ?? 0)}</b></span>
      </div>

      <div class="small mono" style="margin-top:4px;">
        acc: ${row.accuracy ?? 0}% ·
        time: ${escapeHtml(row.time_text || "—")} ·
        mode: ${escapeHtml(row.mode || "—")} ·
        avg: ${row.avg_speed_ms != null ? `${row.avg_speed_ms} ms` : "—"}
      </div>
    </div>
  `;
}).join("");
}

async function saveScoreToLeaderboard(nickname, payload) {
  if (!sb || !payload) return;

  const name = (nickname || "").trim().slice(0, 20) || "Player";
  const accuracy = Number(payload.accuracyPct) || 0;
  const timeMs = Number(payload.elapsedMs) || 0;

  const computedScore = accuracy * 10000 - timeMs;

const row = {
  name,
  score: computedScore,
  accuracy: accuracy,
  time_text: payload.elapsedHuman || null,
  time_ms: payload.elapsedMs || null,
  mode: payload.mode || null,
  avg_speed_ms: payload.avgDeltaMs != null ? Number(payload.avgDeltaMs) : null
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
  
  await loadLeaderboard();
  closeModal(resultsModal)
}

// -------------------- XML parsing --------------------
function parseShortcutsXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML parse error.");

  let nodes = Array.from(doc.querySelectorAll("KeyboardShortcut"));
  if (!nodes.length) nodes = Array.from(doc.querySelectorAll("*[Shortcut]"));

  const out = nodes
    .map((n) => ({
      KeyCode: n.getAttribute("KeyCode") || "",
      Shortcut: n.getAttribute("Shortcut") || "",
      ExecutorIndex: n.getAttribute("ExecutorIndex") || "",
      SpecialExec: n.getAttribute("SpecialExec") || ""
    }))
    .filter((x) => x.Shortcut && x.Shortcut.trim().length);

  const seen = new Set();
  const deduped = out.filter((x) => {
    const k = x.Shortcut.trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  allowedShortcuts = new Set(deduped.map((x) => normalizeShortcut(x.Shortcut)));

  return deduped;
}

// -------------------- Matching --------------------
function normalizeExpected(shortcutText) {
  const raw = shortcutText.trim();
  const parts = raw.split("+").map((p) => p.trim());
  const keyPart = parts[parts.length - 1];

  return {
    raw,
    ctrl: parts.includes("Ctrl"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    meta: parts.includes("Meta") || parts.includes("Cmd") || parts.includes("Command"),
    key: normalizeKeyName(keyPart),
    code: normalizeCodeName(keyPart)
  };
}

function normalizeKeyName(name) {
  if (/^[A-Z]$/.test(name)) return name.toLowerCase();
  if (/^F\d{1,2}$/.test(name)) return name;
  if (/^\d$/.test(name)) return name;

  const map = {
    Left: "ArrowLeft",
    Right: "ArrowRight",
    Up: "ArrowUp",
    Down: "ArrowDown",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Space: " ",
    Enter: "Enter",
    Escape: "Escape",
    Backspace: "Backspace",
    Delete: "Delete",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Minus: "-",
    Equal: "=",
    LeftBracket: "[",
    RightBracket: "]",
    kpAdd: "+",
    kpSubtract: "-",
    kpDivide: "/",
    kpDecimal: "."
  };

  return map[name] ?? name;
}

function normalizeCodeName(name) {
  const codeMap = {
    kpAdd: "NumpadAdd",
    kpSubtract: "NumpadSubtract",
    kpDivide: "NumpadDivide",
    kpDecimal: "NumpadDecimal"
  };
  return codeMap[name] ?? null;
}

function matchesExpected(e, expected) {
  if (!!e.ctrlKey !== !!expected.ctrl) return false;
  if (!!e.altKey !== !!expected.alt) return false;
  if (!!e.shiftKey !== !!expected.shift) return false;
  if (!!e.metaKey !== !!expected.meta) return false;

  if (expected.code) return e.code === expected.code;

  const actualKey = /^[A-Z]$/.test(e.key) ? e.key.toLowerCase() : e.key;
  return actualKey === expected.key;
}

function describePressed(e) {
  const mods = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Meta");
  const k = e.key === " " ? "Space" : e.key;
  return mods.length ? `${mods.join("+")}+${k}` : k;
}

// -------------------- UI / flow --------------------
function renderShortcutVisibility() {
  if (!elShortcutHidden || !elShortcutText || !btnToggleShow) return;

  if (!current) {
    elShortcutHidden.style.display = "";
    elShortcutText.style.display = "none";
    elShortcutText.textContent = "—";
    btnToggleShow.textContent = "Show Shortcut";
    return;
  }

  if (showShortcut) {
    elShortcutHidden.style.display = "none";
    elShortcutText.style.display = "";
    elShortcutText.textContent = current.Shortcut;
  } else {
    elShortcutHidden.style.display = "";
    elShortcutText.style.display = "none";
    elShortcutText.textContent = current.Shortcut;
  }

  btnToggleShow.textContent = showShortcut ? "Hide Shortcut" : "Show Shortcut";
}

function setCurrent(item) {
  current = { ...item, expected: normalizeExpected(item.Shortcut) };

  if (elKeycode) elKeycode.textContent = current.KeyCode || "—";
  showShortcut = false;
  renderShortcutVisibility();

  const extra = [];
  if (current.ExecutorIndex) extra.push(`ExecutorIndex: ${current.ExecutorIndex}`);
  if (current.SpecialExec) extra.push(`SpecialExec: ${current.SpecialExec}`);
  if (elHint) elHint.textContent = extra.join(" • ");

  setStatus("Waiting for key press…", "");
  updateStats();
}

function pickNext() {
  if (!shortcuts.length) return;

  // 10 keys = random without repetition
  if (runType === "ten") {
    if (!tenPool.length) {
      setStatus("✅ Finished 10 keys.", "ok");
      stopGame("finished_ten");
      return;
    }

    const randomIndex = Math.floor(Math.random() * tenPool.length);
    const item = tenPool.splice(randomIndex, 1)[0];
    setCurrent(item);
    return;
  }

  // full run
  if (mode === "random") {
    setCurrent(randomPick(shortcuts));
  } else {
    setCurrent(shortcuts[Math.min(idx, shortcuts.length - 1)]);
  }
}

function advanceIfNeededAfterCorrect() {
  if (runType === "ten") {
    tenRemaining -= 1;

    if (tenRemaining <= 0) {
      setStatus("✅ Finished 10 keys.", "ok");
      stopGame("finished_ten");
    }
    return;
  }

  if (mode === "sequential") {
    idx += 1;
    if (idx >= shortcuts.length) {
      setStatus("✅ Finished all shortcuts (sequential).", "ok");
      stopGame("finished_all");
    }
  }
}

function hideResultsCard() {
  if (!elResultsCard || !elResultsJson) return;
  elResultsCard.style.display = "none";
  elResultsJson.value = "";
}

function buildResultsPayload(elapsedMs, reason) {
  const accuracy = totalAttempts ? correct / totalAttempts : 0;

  return {
    runId,
    endedAt: new Date().toISOString(),
    reason,
    runType,
    mode: modeLabelForPayload(),
    elapsedMs: Math.round(elapsedMs),
    elapsedHuman: fmtTime(elapsedMs),
    loadedShortcuts: shortcuts.length,
    attempts: totalAttempts,
    correct,
    errors,
    accuracyPct: Math.round(accuracy * 100),
    lastDeltaMs: lastDeltaMs == null ? null : Math.round(lastDeltaMs),
    avgDeltaMs: avgDeltaMs()
  };
}

function showResultsEverywhere(payload) {
  lastResultsPayload = payload;

  if (elResultsCard) elResultsCard.style.display = "";
  if (elResultsTime) elResultsTime.textContent = `time: ${payload.elapsedHuman}`;
  if (elResultsAttempts) elResultsAttempts.textContent = String(payload.attempts);
  if (elResultsCorrect) elResultsCorrect.textContent = String(payload.correct);
  if (elResultsErrors) elResultsErrors.textContent = String(payload.errors);
  if (elResultsAcc) elResultsAcc.textContent = `${payload.accuracyPct}%`;
  if (elResultsAvg) elResultsAvg.textContent = payload.avgDeltaMs == null ? "—" : `${payload.avgDeltaMs} ms`;
  if (elResultsLast) elResultsLast.textContent = payload.lastDeltaMs == null ? "—" : `${payload.lastDeltaMs} ms`;
  if (elResultsJson) elResultsJson.value = JSON.stringify(payload, null, 2);

  if (mTime) mTime.textContent = payload.elapsedHuman;
  if (mAttempts) mAttempts.textContent = String(payload.attempts);
  if (mCorrect) mCorrect.textContent = String(payload.correct);
  if (mErrors) mErrors.textContent = String(payload.errors);
  if (mAcc) mAcc.textContent = `${payload.accuracyPct}%`;
  if (mAvg) mAvg.textContent = payload.avgDeltaMs == null ? "—" : `${payload.avgDeltaMs} ms`;
  if (mLast) mLast.textContent = payload.lastDeltaMs == null ? "—" : `${payload.lastDeltaMs} ms`;
  if (mMode) mMode.textContent = payload.mode;
  if (mJson) mJson.value = JSON.stringify(payload, null, 2);

  if (lbName) {
    try { lbName.value = localStorage.getItem("lb_nick") || ""; } catch {}
  }
  if (lbSaveStatus) lbSaveStatus.textContent = "";

  openModal(resultsModal);
}

function stopGame(reason) {
  if (!started) return;

  started = false;
  if (timerId) clearInterval(timerId);
  timerId = null;

  const elapsed = performance.now() - startTime;
  if (elTimer) elTimer.textContent = fmtTime(elapsed);

  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.disabled = true;
  if (btnNext) btnNext.disabled = true;
  if (btnToggleShow) btnToggleShow.disabled = true;
  if (btnMode) btnMode.disabled = true;

  current = null;
  if (elKeycode) elKeycode.textContent = "—";
  renderShortcutVisibility();

  setStatus("Stopped. Results shown.", "");
  const payload = buildResultsPayload(elapsed, reason || "stopped");
  showResultsEverywhere(payload);

  updateStats();
}

// -------------------- Modals --------------------
function openModal(el) {
  if (!el) return;
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
}

function closeModal(el) {
  if (!el) return;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
}

if (lbModeFilter) {
  lbModeFilter.addEventListener("change", () => {
    loadLeaderboard();
  });
}

if (modeModal) {
  modeModal.addEventListener("click", (e) => {
    if (e.target === modeModal) closeModal(modeModal);
  });
}
if (resultsModal) {
  resultsModal.addEventListener("click", (e) => {
    if (e.target === resultsModal) closeModal(resultsModal);
  });
}

if (btnCancelMode) btnCancelMode.addEventListener("click", () => closeModal(modeModal));
if (btnCloseResults) btnCloseResults.addEventListener("click", () => closeModal(resultsModal));

function syncTenExtraVisibility() {
  const v = document.querySelector('input[name="modeChoice"]:checked')?.value;
  if (tenModeExtra) tenModeExtra.style.display = v === "ten" ? "" : "none";
}

document.querySelectorAll('input[name="modeChoice"]').forEach((r) => {
  r.addEventListener("change", syncTenExtraVisibility);
});

if (btnConfirmMode) {
  btnConfirmMode.addEventListener("click", () => {
    const chosen = document.querySelector('input[name="modeChoice"]:checked')?.value || "sequential";

    if (chosen === "ten") {
      runType = "ten";
      tenRemaining = 10;
    } else {
      runType = "full";
      mode = chosen;
    }

    closeModal(modeModal);
    actuallyStartRun();
  });
}

// -------------------- Browser shortcut block --------------------
window.addEventListener("keydown", (e) => {
  if (!started) return;

  const combo = normalizeShortcut(describePressed(e));
  const key = String(e.key || "").toLowerCase();

  const looksLikeBrowserShortcut =
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    ["f1", "f3", "f5", "f12"].includes(key);

  const isGameShortcut = allowedShortcuts.has(combo);

  if (looksLikeBrowserShortcut && !isGameShortcut) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

// -------------------- Events --------------------
window.addEventListener("keydown", (e) => {
  if (!started || !current) return;

  e.preventDefault();

  const now = performance.now();
  if (lastKeyTime != null) {
    lastDeltaMs = now - lastKeyTime;
    deltas.push(lastDeltaMs);
    if (deltas.length > 200) deltas.shift();
  }
  lastKeyTime = now;

  totalAttempts += 1;

  const ok = matchesExpected(e, current.expected);
  const pressed = describePressed(e);

  if (ok) {
    correct += 1;
    setStatus("✅ Correct!", "ok");
    logAttempt(true, current.Shortcut, pressed);

    advanceIfNeededAfterCorrect();
    if (started) pickNext();
  } else {
    errors += 1;
    setStatus(`❌ Error. pressed: ${pressed}`, "bad");
    logAttempt(false, current.Shortcut, pressed);
  }

  updateStats();
});

if (btnStart) {
  btnStart.addEventListener("click", () => {
    if (!shortcuts.length) {
      setStatus("No shortcuts loaded (XML not ready).", "bad");
      return;
    }
    syncTenExtraVisibility();
    openModal(modeModal);
  });
}

if (btnStop) btnStop.addEventListener("click", () => stopGame("user_stop"));

if (btnNext) {
  btnNext.addEventListener("click", () => {
    if (!started) return;

    if (runType === "ten") {
      tenRemaining = Math.max(0, tenRemaining - 1);
      if (tenRemaining <= 0) {
        stopGame("finished_ten");
      } else {
        pickNext();
      }
      updateStats();
      return;
    }

    if (mode === "sequential") idx = Math.min(idx + 1, shortcuts.length - 1);
    pickNext();
  });
}

if (btnToggleShow) {
  btnToggleShow.addEventListener("click", () => {
    if (!started || !current) return;
    showShortcut = !showShortcut;
    renderShortcutVisibility();
  });
}

if (btnReset) {
  btnReset.addEventListener("click", () => {
    started = false;
    if (timerId) clearInterval(timerId);
    timerId = null;

    startTime = 0;
    if (elTimer) elTimer.textContent = "00:00.0";

    idx = 0;
    current = null;
    showShortcut = false;

    correct = 0;
    errors = 0;
    totalAttempts = 0;

    lastKeyTime = null;
    lastDeltaMs = null;
    deltas = [];

    runType = "full";
    mode = "sequential";
    tenStyle = "random";
    tenRemaining = 0;

    runId = null;
    lastResultsPayload = null;

    if (elLog) elLog.innerHTML = "";
    if (elKeycode) elKeycode.textContent = "—";
    hideResultsCard();

    if (btnStart) btnStart.disabled = shortcuts.length === 0;
    if (btnStop) btnStop.disabled = true;
    if (btnNext) btnNext.disabled = true;
    if (btnToggleShow) btnToggleShow.disabled = true;
    if (btnMode) {
      btnMode.disabled = true;
      btnMode.textContent = "Mode: —";
      btnMode.style.display = "none";
    }

    renderShortcutVisibility();
    setStatus("Reset. Press Start when ready.", "");
    updateStats();
  });
}

if (btnSaveScore) {
  btnSaveScore.addEventListener("click", async () => {
    if (lbSaveStatus) lbSaveStatus.textContent = "saving...";
    await saveScoreToLeaderboard(lbName ? lbName.value : "", lastResultsPayload);
  });
}

function actuallyStartRun() {
  hideResultsCard();
  closeModal(resultsModal);

  runId = newRunId();

  correct = 0;
  errors = 0;
  totalAttempts = 0;
  lastKeyTime = null;
  lastDeltaMs = null;
  deltas = [];
  if (elLog) elLog.innerHTML = "";

  started = true;
  startTime = performance.now();
  timerId = setInterval(updateTimer, 100);

  idx = 0;
  tenPool = [];

  if (runType === "ten") {
    const shuffled = [...shortcuts].sort(() => Math.random() - 0.5);
    tenPool = shuffled.slice(0, Math.min(10, shuffled.length));
    tenRemaining = tenPool.length;
  }

  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.disabled = false;
  if (btnNext) btnNext.disabled = false;
  if (btnToggleShow) btnToggleShow.disabled = false;
  if (btnMode) {
    btnMode.disabled = true;
    btnMode.style.display = "none";
  }

  setStatus("Started. Waiting for key press…", "");
  pickNext();
  updateStats();
}

// -------------------- Load XML --------------------
async function loadBundledXml() {
  if (elLoadInfo) elLoadInfo.textContent = "Loading KeyboardShortCuts.xml…";
  const res = await fetch("./KeyboardShortCuts.xml", { cache: "no-store" });

  if (!res.ok) throw new Error(`Failed to load KeyboardShortCuts.xml (HTTP ${res.status})`);

  const text = await res.text();
  shortcuts = parseShortcutsXml(text);

  if (elLoadInfo) elLoadInfo.textContent = `Loaded: ${shortcuts.length} shortcuts`;
  updateStats();

  if (shortcuts.length) {
    if (btnStart) btnStart.disabled = false;
    setStatus("Ready. Press Start.", "ok");
  } else {
    if (btnStart) btnStart.disabled = true;
    setStatus("XML loaded but 0 shortcuts found.", "bad");
  }
}

// -------------------- Init --------------------
(async function init() {
  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.disabled = true;
  if (btnNext) btnNext.disabled = true;
  if (btnToggleShow) btnToggleShow.disabled = true;
  if (btnMode) btnMode.style.display = "none";

  updateStats();
  setStatus("Loading XML…", "");

  try {
    await loadBundledXml();
  } catch (err) {
    console.error(err);
    if (elLoadInfo) {
      elLoadInfo.textContent = "Failed to load XML. Check server/folder/filename.";
    }
    setStatus(
      "Could not load KeyboardShortCuts.xml. Make sure you are using http://localhost:8000 and the XML is next to index.html.",
      "bad"
    );
    if (btnStart) btnStart.disabled = true;
  }

  initSupabase();
  loadLeaderboard();
})();