import { buildTimeline, formatTime, normalizeRoutine, totalSeconds } from "./core.mjs";
import { DEFAULT_COUNTER, calculateCounter, dayNumber, normalizeCounter, todayISO } from "./counter.mjs";
import { COUNTER_KEY, loadCounter, normalizeBackup } from "./data.mjs";

const ROUTINE_KEY = "wapp.routine.v1";
let counterLoadError = false;
const $ = (id) => document.getElementById(id);
let routine;
let counter;
let editingIndex = null;
let editingOopsId = null;
let session = null;
let timer = null;
let toastTimer = null;
let audioContext = null;
let wakeLock = null;
let wakeLockPending = false;
let activeView = "stretch";
// A slow first fetch must not allow actions against data that is still loading.
const startupControls = [...document.querySelectorAll("button,input,select")].filter((field) => !field.disabled);
for (const field of startupControls) field.disabled = true;

function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function showView(view) {
  if (session) return;
  activeView = view;
  for (const name of ["stretch", "counter", "settings"]) $(name + "-view").hidden = name !== view;
  for (const button of document.querySelectorAll(".nav-button")) {
    const selected = button.dataset.view === view;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  }
  if (view === "counter") renderCounter();
  if (view === "settings") showSettingsPage("home");
  window.scrollTo(0, 0);
}

function showSettingsPage(page) {
  $("settings-home").hidden = page !== "home";
  $("settings-back").hidden = page === "home";
  for (const name of ["stretch", "counter", "backup"]) $(name + "-settings").hidden = name !== page;
  window.scrollTo(0, 0);
}

function openSettingsPage(page) {
  showView("settings");
  showSettingsPage(page);
}

function saveRoutine() {
  localStorage.setItem(ROUTINE_KEY, JSON.stringify(routine));
  renderStretch();
  renderStretchSettings();
}

function saveCounter() {
  if (counterLoadError) throw new Error("Saved Counter data could not be read. Import a valid backup to recover it.");
  localStorage.setItem(COUNTER_KEY, JSON.stringify(counter));
  renderCounter();
  renderCounterSettings();
}

function describe(exercise) {
  const parts = [`${formatTime(exercise.seconds)}${exercise.sides === "both" ? " / side" : ""}`];
  if (exercise.sets > 1) parts.push(`${exercise.sets} sets`);
  return parts.join(" · ");
}

function renderStretch() {
  $("routine-title").textContent = routine.name;
  $("total-duration").textContent = formatTime(totalSeconds(buildTimeline(routine)));
  $("move-count").textContent = String(routine.exercises.length).padStart(2, "0");
}

function renderStretchSettings() {
  $("routine-name").value = routine.name;
  $("side-switch").value = routine.settings.sideSwitchSeconds;
  $("between-exercises").value = routine.settings.betweenExercisesSeconds;
  $("between-sets").value = routine.settings.betweenSetsSeconds;
  const list = $("exercise-list");
  list.replaceChildren();
  routine.exercises.forEach((exercise, index) => {
    const row = document.createElement("li");
    row.className = "exercise-item";
    const number = document.createElement("span");
    number.className = "exercise-index";
    number.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("div");
    copy.className = "exercise-copy";
    const name = document.createElement("span");
    name.className = "exercise-name";
    name.textContent = exercise.name;
    const meta = document.createElement("span");
    meta.className = "exercise-meta";
    meta.textContent = describe(exercise);
    copy.append(name, meta);
    const moves = document.createElement("div");
    moves.className = "move-controls";
    for (const [direction, glyph, label] of [[-1, "↑", "Move up"], [1, "↓", "Move down"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = glyph;
      button.title = label;
      button.setAttribute("aria-label", `${label}: ${exercise.name}`);
      button.disabled = index + direction < 0 || index + direction >= routine.exercises.length;
      button.addEventListener("click", () => {
        [routine.exercises[index], routine.exercises[index + direction]] = [routine.exercises[index + direction], routine.exercises[index]];
        saveRoutine();
      });
      moves.append(button);
    }
    const edit = document.createElement("button");
    edit.className = "exercise-edit";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${exercise.name}`);
    edit.addEventListener("click", () => openEditor(index));
    row.append(number, copy, moves, edit);
    list.append(row);
  });
}

function openEditor(index = null) {
  editingIndex = index;
  const exercise = index === null ? { name: "", seconds: 60, sets: 1, sides: "none" } : routine.exercises[index];
  $("dialog-title").textContent = index === null ? "Add stretch" : "Edit stretch";
  $("exercise-name").value = exercise.name;
  $("exercise-seconds").value = exercise.seconds;
  $("exercise-sets").value = exercise.sets;
  $("exercise-sides").value = exercise.sides;
  $("delete-button").hidden = index === null || routine.exercises.length === 1;
  $("exercise-dialog").showModal();
  $("exercise-name").focus();
}

function formatMoney(value) {
  return `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} DKK`;
}

function formatCount(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function renderOopsList(id, editable) {
  const list = $(id);
  list.replaceChildren();
  if (!counter.oops.length) {
    const empty = document.createElement("li");
    empty.className = "empty-list";
    empty.textContent = "No oops entries yet.";
    list.append(empty);
    return;
  }
  const sorted = [...counter.oops].sort((a, b) => b.date.localeCompare(a.date));
  for (const entry of sorted) {
    const row = document.createElement("li");
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.reason || "Oops";
    const date = document.createElement("small");
    date.textContent = formatDate(entry.date);
    details.append(title, date);
    const amount = document.createElement("span");
    amount.className = "history-amount";
    amount.textContent = `−${formatMoney(entry.amount)}`;
    row.append(details, amount);
    if (editable) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit oops from ${formatDate(entry.date)}`);
      edit.addEventListener("click", () => openOopsEditor(entry.id));
      row.append(edit);
    }
    list.append(row);
  }
}

function renderCounter() {
  const result = calculateCounter(counter);
  const today = todayISO();
  $("counter-setup-hint").hidden = result.configured;
  $("counter-saved").textContent = result.configured ? formatMoney(result.saved) : "—";
  $("counter-days").textContent = result.configured ? formatCount(result.days) : "—";
  $("counter-since").textContent = result.configured ? `Since ${formatDate(counter.startDate)}` : "Set a start date in Settings to begin.";
  $("counter-breakdown").textContent = result.configured
    ? `${formatMoney(result.gross)} estimated − ${formatMoney(result.deductions)} oops (${formatMoney(counter.amountPerPeriod)} every ${formatCount(counter.periodDays)} days)`
    : "Enter your estimate to see savings.";
  $("oops-date").max = today;
  $("oops-date").min = counter.startDate || "";
  if (!$("oops-date").value || $("oops-date").value > today) $("oops-date").value = today;
  for (const field of $("oops-form").querySelectorAll("input,button")) field.disabled = !result.configured || counterLoadError;
  renderOopsList("counter-oops-list", false);
}

function renderCounterSettings() {
  for (const field of $("counter-settings-form").querySelectorAll("input,button")) field.disabled = counterLoadError;
  $("counter-start-date").value = counter.startDate;
  $("counter-start-date").max = todayISO();
  $("counter-rate").value = counter.amountPerPeriod;
  $("counter-period").value = counter.periodDays;
  renderOopsList("settings-oops-list", true);
}

function openOopsEditor(id) {
  const entry = counter.oops.find((item) => item.id === id);
  if (!entry) return;
  editingOopsId = id;
  $("edit-oops-date").value = entry.date;
  // Keep older entries editable even if the start date has moved.
  $("edit-oops-date").min = "";
  $("edit-oops-date").max = entry.date > todayISO() ? entry.date : todayISO();
  $("edit-oops-amount").value = entry.amount;
  $("edit-oops-reason").value = entry.reason;
  $("oops-dialog").showModal();
}

function playChime() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + .14);
    gain.gain.setValueAtTime(.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.12, audioContext.currentTime + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .3);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + .31);
  } catch { /* Audio is optional. */ }
}

async function keepScreenAwake() {
  if (!navigator.wakeLock || !session?.running || document.hidden || wakeLock || wakeLockPending) return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (!session?.running || document.hidden) {
      await lock.release();
      return;
    }
    wakeLock = lock;
    lock.addEventListener("release", () => {
      if (wakeLock === lock) wakeLock = null;
      if (session?.running) renderSession();
    });
  } catch { /* The device may refuse a wake lock, for example on low battery. */ }
  finally {
    wakeLockPending = false;
    if (session?.running) renderSession();
  }
}

function releaseWakeLock() {
  const lock = wakeLock;
  wakeLock = null;
  lock?.release().catch(() => {});
}

function startSession() {
  session = { steps: buildTimeline(routine), index: 0, remaining: 0, deadline: 0, running: false };
  for (const view of document.querySelectorAll(".app-view")) view.hidden = true;
  $("bottom-nav").hidden = true;
  $("session").hidden = false;
  document.body.style.background = "#17382e";
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); } catch {}
  selectStep(0, true);
}

function endSession() {
  clearInterval(timer);
  timer = null;
  releaseWakeLock();
  session = null;
  $("session").hidden = true;
  $("bottom-nav").hidden = false;
  document.body.style.background = "";
  showView("stretch");
}

function selectStep(index, autoplay = true) {
  if (index >= session.steps.length) {
    clearInterval(timer);
    timer = null;
    releaseWakeLock();
    session.index = session.steps.length;
    session.running = false;
    $("phase-label").textContent = "COMPLETE";
    $("step-name").textContent = "Nicely done.";
    $("step-detail").textContent = "Your routine is finished";
    $("remaining-time").textContent = "✓";
    $("timer-ring").style.setProperty("--progress", "360deg");
    $("up-next-name").textContent = "Take the rest of the day with you";
    $("pause-button").textContent = "Finish";
    $("pause-note").textContent = "";
    $("session-progress").textContent = `${session.steps.length} / ${session.steps.length}`;
    $("next-button").disabled = true;
    playChime();
    return;
  }
  session.index = Math.max(0, index);
  session.remaining = session.steps[session.index].seconds;
  session.running = false;
  $("next-button").disabled = false;
  $("previous-button").disabled = session.index === 0;
  if (autoplay) resumeSession();
  renderSession();
}

function resumeSession() {
  if (!session || session.index >= session.steps.length) return;
  session.deadline = Date.now() + session.remaining * 1000;
  session.running = true;
  clearInterval(timer);
  timer = setInterval(tick, 100);
  renderSession();
  keepScreenAwake();
}

function pauseSession(reason = "Paused") {
  if (!session || !session.running) return;
  session.remaining = Math.max(0, (session.deadline - Date.now()) / 1000);
  session.running = false;
  clearInterval(timer);
  timer = null;
  releaseWakeLock();
  renderSession(reason);
}

function tick() {
  if (!session?.running) return;
  session.remaining = Math.max(0, (session.deadline - Date.now()) / 1000);
  if (session.remaining <= 0) {
    playChime();
    selectStep(session.index + 1, true);
  } else renderSession();
}

function renderSession(reason = "") {
  if (!session || session.index >= session.steps.length) return;
  const step = session.steps[session.index];
  $("phase-label").textContent = step.kind === "rest" ? "TAKE A BREATH" : "STRETCH";
  $("step-name").textContent = step.name;
  $("step-detail").textContent = step.kind === "rest" ? "Transition" : [step.side ? `${step.side} side` : null, step.sets > 1 ? `Set ${step.set} of ${step.sets}` : null].filter(Boolean).join(" · ") || "Hold and breathe";
  $("remaining-time").textContent = formatTime(session.remaining);
  $("timer-ring").style.setProperty("--progress", `${Math.max(0, Math.min(360, 360 * session.remaining / step.seconds))}deg`);
  $("up-next-name").textContent = session.steps[session.index + 1]?.name || "Finish routine";
  $("session-progress").textContent = `${session.index + 1} / ${session.steps.length}`;
  $("pause-button").textContent = session.running ? "Pause" : "Resume";
  $("pause-note").textContent = reason || (session.running ? (wakeLock ? "Screen stays awake while the timer runs." : "Keep this screen open; your device may dim it.") : "Timer paused");
}

function makeBackup() {
  if (counterLoadError) throw new Error("Saved Counter data could not be read. Recover it before exporting.");
  return { version: 4, exportedAt: new Date().toISOString(), routine, counter };
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(makeBackup(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wapp-backup-${todayISO()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  notify("Backup downloaded");
}

async function shareBackup() {
  const data = JSON.stringify(makeBackup(), null, 2);
  const file = new File([data], `wapp-backup-${todayISO()}.json`, { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Wapp backup" });
      return;
    }
    await navigator.clipboard.writeText(data);
    notify("Backup JSON copied");
  } catch (error) {
    if (error.name !== "AbortError") notify("Could not share backup on this device");
  }
}

async function importBackup(file) {
  const input = JSON.parse(await file.text());
  const { routine: nextRoutine, counter: nextCounter } = normalizeBackup(input, counterLoadError ? null : counter);
  if (!window.confirm("Replace this device's Wapp data with the selected backup?")) return;
  routine = nextRoutine;
  counter = nextCounter;
  counterLoadError = false;
  $("counter-data-error").hidden = true;
  saveRoutine();
  saveCounter();
  notify("Backup imported");
}

async function load() {
  let initial;
  try { initial = JSON.parse(localStorage.getItem(ROUTINE_KEY)); } catch {}
  if (!initial) {
    try {
      const response = await fetch("./routine.json");
      if (!response.ok) throw new Error();
      initial = await response.json();
    } catch {
      notify("Could not load your routine. Please reload Wapp.");
      return;
    }
  }
  try { routine = normalizeRoutine(initial); }
  catch {
    routine = normalizeRoutine(await (await fetch("./routine.json")).json());
    notify("Saved routine was invalid; starter routine restored.");
  }
  try { counter = loadCounter(localStorage); }
  catch {
    counterLoadError = true;
    counter = normalizeCounter(DEFAULT_COUNTER);
    $("counter-data-error").hidden = false;
    notify("Saved Counter data was kept, but could not be read.");
  }
  for (const field of startupControls) field.disabled = false;
  renderStretch();
  renderStretchSettings();
  renderCounter();
  renderCounterSettings();
}

for (const button of document.querySelectorAll(".nav-button")) button.addEventListener("click", () => showView(button.dataset.view));
for (const name of ["stretch", "counter", "backup"]) $("settings-open-" + name).addEventListener("click", () => openSettingsPage(name));
$("settings-back").addEventListener("click", () => showSettingsPage("home"));
$("open-counter-settings").addEventListener("click", () => openSettingsPage("counter"));
$("start-button").addEventListener("click", startSession);
$("end-button").addEventListener("click", endSession);
$("pause-button").addEventListener("click", () => {
  if (session.index >= session.steps.length) return endSession();
  if (session.running) pauseSession(); else resumeSession();
});
$("next-button").addEventListener("click", () => { if (session.index < session.steps.length) selectStep(session.index + 1, session.running); });
$("previous-button").addEventListener("click", () => { if (session.index > 0) selectStep(session.index - 1, session.running); });
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseSession("Paused while Wapp was away"); else if (counter) renderCounter(); });
window.addEventListener("pageshow", () => { if (counter) renderCounter(); });

$("add-button").addEventListener("click", () => openEditor());
$("close-dialog").addEventListener("click", () => $("exercise-dialog").close());
$("exercise-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const input = { id: editingIndex === null ? `exercise-${crypto.randomUUID()}` : routine.exercises[editingIndex].id, name: $("exercise-name").value, seconds: $("exercise-seconds").value, sets: $("exercise-sets").value, sides: $("exercise-sides").value };
  const normalized = normalizeRoutine({ ...routine, exercises: [input] }).exercises[0];
  if (editingIndex === null) routine.exercises.push(normalized); else routine.exercises[editingIndex] = normalized;
  saveRoutine();
  $("exercise-dialog").close();
  notify("Stretch saved");
});
$("delete-button").addEventListener("click", () => {
  if (editingIndex === null || routine.exercises.length <= 1) return;
  routine.exercises.splice(editingIndex, 1);
  saveRoutine();
  $("exercise-dialog").close();
  notify("Stretch removed");
});
$("routine-name").addEventListener("change", (event) => { routine = normalizeRoutine({ ...routine, name: event.target.value }); saveRoutine(); });
for (const [id, key] of [["side-switch", "sideSwitchSeconds"], ["between-exercises", "betweenExercisesSeconds"], ["between-sets", "betweenSetsSeconds"]]) {
  $(id).addEventListener("change", (event) => { routine = normalizeRoutine({ ...routine, settings: { ...routine.settings, [key]: event.target.value } }); saveRoutine(); });
}

$("counter-settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  try {
    counter = normalizeCounter({ ...counter, startDate: $("counter-start-date").value, amountPerPeriod: $("counter-rate").value, periodDays: $("counter-period").value });
    saveCounter();
    notify("Counter estimate saved");
  } catch (error) { notify(error.message); }
});
$("oops-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const date = $("oops-date").value;
  if (dayNumber(date) < dayNumber(counter.startDate) || dayNumber(date) > dayNumber(todayISO())) return notify("Oops date must be within your count.");
  try {
    counter = normalizeCounter({ ...counter, oops: [...counter.oops, { id: crypto.randomUUID(), date, amount: $("oops-amount").value, reason: $("oops-reason").value }] });
    saveCounter();
    $("oops-amount").value = "";
    $("oops-reason").value = "";
    $("oops-date").value = todayISO();
    notify("Oops registered");
  } catch (error) { notify(error.message); }
});
$("close-oops-dialog").addEventListener("click", () => $("oops-dialog").close());
$("oops-edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const date = $("edit-oops-date").value;
  if (dayNumber(date) === null) return notify("Enter a valid date.");
  try {
    counter = normalizeCounter({ ...counter, oops: counter.oops.map((entry) => entry.id === editingOopsId ? { ...entry, date, amount: $("edit-oops-amount").value, reason: $("edit-oops-reason").value } : entry) });
    saveCounter();
    $("oops-dialog").close();
    notify("Oops updated");
  } catch (error) { notify(error.message); }
});
$("delete-oops-button").addEventListener("click", () => {
  if (!window.confirm("Delete this oops entry?")) return;
  counter.oops = counter.oops.filter((entry) => entry.id !== editingOopsId);
  saveCounter();
  $("oops-dialog").close();
  notify("Oops removed");
});

$("export-button").addEventListener("click", () => {
  try { downloadBackup(); } catch (error) { notify(error.message); }
});
$("share-button").addEventListener("click", () => shareBackup().catch((error) => notify(error.message)));
$("import-button").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await importBackup(file); } catch (error) { notify(error.message || "Could not import backup"); }
  event.target.value = "";
});

load();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
