// -------------------- State --------------------
let shortcuts = [];
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

// -------------------- Helpers --------------------
function isOnlyModifierKey(e) {
  const k = e.key;

  // modificatori o tasti di stato che non devono essere contati come errori
  return (
    k === "Control" ||
    k === "Alt" ||
    k === "Shift" ||
    k === "Meta" ||
    k === "NumLock"
  );
}

function setStatus(msg, cls) {
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
  if (!started) return;
  elTimer.textContent = fmtTime(performance.now() - startTime);
}

function updateStats() {
  elCorrect.textContent = String(correct);
  elErrors.textContent = String(errors);
  elLoaded.textContent = String(shortcuts.length);

  const acc = totalAttempts ? Math.round((correct / totalAttempts) * 100) : 0;
  elAcc.textContent = `${acc}%`;

  elSpeed.textContent = lastDeltaMs == null ? "—" : `${Math.round(lastDeltaMs)} ms`;

  if (!deltas.length) elAvgSpeed.textContent = "avg: —";
  else {
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    elAvgSpeed.textContent = `avg: ${Math.round(avg)} ms`;
  }

  // progress display depends on run type
  if (!shortcuts.length) {
    elProgress.textContent = "0 / 0";
  } else if (runType === "ten") {
    const done = 10 - tenRemaining;
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
  return out.filter((x) => {
    const k = x.Shortcut.trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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

  if (expected.code) return e.code === expected.code;

  const actualKey = /^[A-Z]$/.test(e.key) ? e.key.toLowerCase() : e.key;
  return actualKey === expected.key;
}

function describePressed(e) {
  const mods = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  const k = e.key === " " ? "Space" : e.key;
  return mods.length ? `${mods.join("+")}+${k}` : k;
}

// -------------------- UI / flow --------------------
function renderShortcutVisibility() {
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

  elKeycode.textContent = current.KeyCode || "—";
  showShortcut = false;
  renderShortcutVisibility();

  const extra = [];
  if (current.ExecutorIndex) extra.push(`ExecutorIndex: ${current.ExecutorIndex}`);
  if (current.SpecialExec) extra.push(`SpecialExec: ${current.SpecialExec}`);
  elHint.textContent = extra.join(" • ");

  setStatus("Waiting for key press…", "");
  updateStats();
}

function pickNext() {
  if (!shortcuts.length) return;

  // 10-key run picks based on tenStyle
  if (runType === "ten") {
    if (tenStyle === "random") {
      setCurrent(randomPick(shortcuts));
    } else {
      setCurrent(shortcuts[Math.min(idx, shortcuts.length - 1)]);
    }
    return;
  }

  // full run
  if (mode === "random") setCurrent(randomPick(shortcuts));
  else setCurrent(shortcuts[Math.min(idx, shortcuts.length - 1)]);
}

function advanceIfNeededAfterCorrect() {
  // 10 keys: decrement remaining and stop when done
  if (runType === "ten") {
    tenRemaining -= 1;
    if (tenStyle === "sequential") idx += 1;

    if (tenRemaining <= 0) {
      setStatus("✅ Finished 10 keys.", "ok");
      stopGame("finished_ten");
    }
    return;
  }

  // full sequential: move forward and stop if done
  if (mode === "sequential") {
    idx += 1;
    if (idx >= shortcuts.length) {
      setStatus("✅ Finished all shortcuts (sequential).", "ok");
      stopGame("finished_all");
    }
  }
}

function hideResultsCard() {
  elResultsCard.style.display = "none";
  elResultsJson.value = "";
}

function buildResultsPayload(elapsedMs, reason) {
  const accuracy = totalAttempts ? correct / totalAttempts : 0;
  const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

  const modeLabel =
    runType === "ten" ? `10 keys (${tenStyle})` : (mode === "sequential" ? "sequential" : "random");

  return {
    runId,
    endedAt: new Date().toISOString(),
    reason,
    runType,
    mode: modeLabel,
    elapsedMs: Math.round(elapsedMs),
    elapsedHuman: fmtTime(elapsedMs),
    loadedShortcuts: shortcuts.length,
    attempts: totalAttempts,
    correct,
    errors,
    accuracyPct: Math.round(accuracy * 100),
    lastDeltaMs: lastDeltaMs == null ? null : Math.round(lastDeltaMs),
    avgDeltaMs: avgDelta == null ? null : Math.round(avgDelta)
  };
}

function showResultsEverywhere(payload) {
  // page card
  elResultsCard.style.display = "";
  elResultsTime.textContent = `time: ${payload.elapsedHuman}`;
  elResultsAttempts.textContent = String(payload.attempts);
  elResultsCorrect.textContent = String(payload.correct);
  elResultsErrors.textContent = String(payload.errors);
  elResultsAcc.textContent = `${payload.accuracyPct}%`;
  elResultsAvg.textContent = payload.avgDeltaMs == null ? "—" : `${payload.avgDeltaMs} ms`;
  elResultsLast.textContent = payload.lastDeltaMs == null ? "—" : `${payload.lastDeltaMs} ms`;
  elResultsJson.value = JSON.stringify(payload, null, 2);

  // modal
  mTime.textContent = payload.elapsedHuman;
  mAttempts.textContent = String(payload.attempts);
  mCorrect.textContent = String(payload.correct);
  mErrors.textContent = String(payload.errors);
  mAcc.textContent = `${payload.accuracyPct}%`;
  mAvg.textContent = payload.avgDeltaMs == null ? "—" : `${payload.avgDeltaMs} ms`;
  mLast.textContent = payload.lastDeltaMs == null ? "—" : `${payload.lastDeltaMs} ms`;
  mMode.textContent = payload.mode;
  mJson.value = JSON.stringify(payload, null, 2);

  openModal(resultsModal);
}

function stopGame(reason) {
  if (!started) return;

  started = false;
  if (timerId) clearInterval(timerId);
  timerId = null;

  const elapsed = performance.now() - startTime;
  elTimer.textContent = fmtTime(elapsed);

  // restart via Reset
  btnStart.disabled = false;   // allow starting again right away
  btnStop.disabled = true;
  btnNext.disabled = true;
  btnToggleShow.disabled = true;

  // mode display stays, but mode button disabled until running
  btnMode.disabled = true;

  current = null;
  elKeycode.textContent = "—";
  renderShortcutVisibility();

  setStatus("Stopped. Results shown.", "");
  const payload = buildResultsPayload(elapsed, reason || "stopped");
  showResultsEverywhere(payload);

  updateStats();
}

// -------------------- Modals --------------------
function openModal(el) {
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
}

function closeModal(el) {
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
}

// close modal on backdrop click
modeModal.addEventListener("click", (e) => {
  if (e.target === modeModal) closeModal(modeModal);
});
resultsModal.addEventListener("click", (e) => {
  if (e.target === resultsModal) closeModal(resultsModal);
});

btnCancelMode.addEventListener("click", () => closeModal(modeModal));
btnCloseResults.addEventListener("click", () => closeModal(resultsModal));

// show/hide extra options when "10 keys" selected
function syncTenExtraVisibility() {
  const v = document.querySelector('input[name="modeChoice"]:checked')?.value;
  tenModeExtra.style.display = v === "ten" ? "" : "none";
}
document.querySelectorAll('input[name="modeChoice"]').forEach((r) => {
  r.addEventListener("change", syncTenExtraVisibility);
});

// confirm mode selection
btnConfirmMode.addEventListener("click", () => {
  const chosen = document.querySelector('input[name="modeChoice"]:checked')?.value || "sequential";

  if (chosen === "ten") {
    runType = "ten";
    tenRemaining = 10;
    const t = document.querySelector('input[name="tenChoice"]:checked')?.value || "random";
    tenStyle = t;
    // set base mode label on button
    btnMode.textContent = `Mode: 10 keys (${tenStyle})`;
  } else {
    runType = "full";
    mode = chosen; // sequential/random
    btnMode.textContent = `Mode: ${mode === "sequential" ? "Sequential" : "Random"}`;
  }

  closeModal(modeModal);
  actuallyStartRun();
});

// -------------------- Events --------------------
window.addEventListener("keydown", (e) => {
  if (!started || !current) return;

  // Se stai premendo SOLO un modificatore (Ctrl/Alt/Shift/Meta),
  // non contare tentativi/errore e non fare log.
  if (isOnlyModifierKey(e)) {
    e.preventDefault(); // evita focus su menu ecc.
    return;
  }

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
    if (started) pickNext(); // might have stopped if finished
  } else {
    errors += 1;
    setStatus(`❌ Error. pressed: ${pressed}`, "bad");
    logAttempt(false, current.Shortcut, pressed);
  }

  updateStats();
});

btnStart.addEventListener("click", () => {
  if (!shortcuts.length) {
    setStatus("No shortcuts loaded (XML not ready).", "bad");
    return;
  }
  syncTenExtraVisibility();
  openModal(modeModal);
});

btnStop.addEventListener("click", () => stopGame("user_stop"));

btnNext.addEventListener("click", () => {
  if (!started) return;

  if (runType === "ten") {
    // skip one question in 10-key mode
    tenRemaining = Math.max(0, tenRemaining - 1);
    if (tenStyle === "sequential") idx = Math.min(idx + 1, shortcuts.length - 1);
    if (tenRemaining <= 0) stopGame("finished_ten");
    else pickNext();
    updateStats();
    return;
  }

  // full mode
  if (mode === "sequential") idx = Math.min(idx + 1, shortcuts.length - 1);
  pickNext();
});

btnToggleShow.addEventListener("click", () => {
  if (!started || !current) return;
  showShortcut = !showShortcut;
  renderShortcutVisibility();
});

btnReset.addEventListener("click", () => {
  started = false;
  if (timerId) clearInterval(timerId);
  timerId = null;

  startTime = 0;
  elTimer.textContent = "00:00.0";

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

  elLog.innerHTML = "";
  elKeycode.textContent = "—";
  hideResultsCard();

  btnStart.disabled = shortcuts.length === 0;
  btnStop.disabled = true;
  btnNext.disabled = true;
  btnToggleShow.disabled = true;
  btnMode.disabled = true;
  btnMode.textContent = "Mode: —";

  renderShortcutVisibility();
  setStatus("Reset. Press Start when ready.", "");
  updateStats();
});

function actuallyStartRun() {
  hideResultsCard();
  closeModal(resultsModal);

  runId = newRunId();

  // reset stats for run
  correct = 0;
  errors = 0;
  totalAttempts = 0;
  lastKeyTime = null;
  lastDeltaMs = null;
  deltas = [];
  elLog.innerHTML = "";

  started = true;
  startTime = performance.now();
  timerId = setInterval(updateTimer, 100);

  // reset index for sequential-based modes
  idx = 0;

  btnStart.disabled = true;
  btnStop.disabled = false;
  btnNext.disabled = false;
  btnToggleShow.disabled = false;
  btnMode.disabled = false; // shows current mode during run

  setStatus("Started. Waiting for key press…", "");
  pickNext();
  updateStats();
}

// -------------------- Load XML --------------------
async function loadBundledXml() {
  elLoadInfo.textContent = "Loading KeyboardShortCuts.xml…";
  const res = await fetch("./KeyboardShortCuts.xml", { cache: "no-store" });

  if (!res.ok) throw new Error(`Failed to load KeyboardShortCuts.xml (HTTP ${res.status})`);

  const text = await res.text();
  shortcuts = parseShortcutsXml(text);

  elLoadInfo.textContent = `Loaded: ${shortcuts.length} shortcuts`;
  updateStats();

  if (shortcuts.length) {
    btnStart.disabled = false;
    setStatus("Ready. Press Start.", "ok");
  } else {
    btnStart.disabled = true;
    setStatus("XML loaded but 0 shortcuts found.", "bad");
  }
}

(async function init() {
  updateStats();
  setStatus("Loading XML…", "");

  try {
    await loadBundledXml();
  } catch (err) {
    console.error(err);
    elLoadInfo.textContent = "Failed to load XML. Check server/folder/filename.";
    setStatus(
      "Could not load KeyboardShortCuts.xml. Make sure you are using http://localhost:8000 and the XML is next to index.html.",
      "bad"
    );
    btnStart.disabled = true;
  }
})();

