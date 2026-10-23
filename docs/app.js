import { buildTimeline, formatTime, normalizeRoutine, totalSeconds } from "./core.mjs";

const STORAGE_KEY = "wapp.routine.v1";
const $ = (id) => document.getElementById(id);
let routine;
let editingIndex = null;
let session = null;
let timer = null;
let toastTimer = null;
let audioContext = null;

function saveRoutine() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routine));
  renderOverview();
}

function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function describe(exercise) {
  const parts = [`${formatTime(exercise.seconds)}${exercise.sides === "both" ? " / side" : ""}`];
  if (exercise.sets > 1) parts.push(`${exercise.sets} sets`);
  return parts.join(" · ");
}

function renderOverview() {
  const timeline = buildTimeline(routine);
  $("routine-title").innerHTML = "";
  $("routine-title").append(document.createTextNode(routine.name));
  const period = document.createElement("span");
  period.className = "period";
  period.textContent = ".";
  $("routine-title").append(period);
  $("total-duration").textContent = formatTime(totalSeconds(timeline));
  $("move-count").textContent = String(routine.exercises.length).padStart(2, "0");
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
    edit.textContent = "↗";
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

function startSession() {
  session = { steps: buildTimeline(routine), index: 0, remaining: 0, deadline: 0, running: false };
  $("overview").hidden = true;
  $("session").hidden = false;
  document.body.style.background = "#17382e";
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); } catch {}
  selectStep(0, true);
}

function endSession() {
  clearInterval(timer);
  timer = null;
  session = null;
  $("session").hidden = true;
  $("overview").hidden = false;
  document.body.style.background = "";
}

function selectStep(index, autoplay = true) {
  if (index >= session.steps.length) {
    clearInterval(timer);
    timer = null;
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
    playChime();
    return;
  }
  session.index = Math.max(0, index);
  session.remaining = session.steps[session.index].seconds;
  session.running = false;
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
}

function pauseSession(reason = "Paused") {
  if (!session || !session.running) return;
  session.remaining = Math.max(0, (session.deadline - Date.now()) / 1000);
  session.running = false;
  clearInterval(timer);
  timer = null;
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
  $("pause-note").textContent = reason || (session.running ? "Keep this screen open for audible transitions." : "Timer paused");
}

async function load() {
  let initial;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) initial = JSON.parse(saved);
  } catch {}
  if (!initial) {
    try {
      const response = await fetch("./routine.json");
      if (!response.ok) throw new Error("Could not load routine.");
      initial = await response.json();
    } catch (error) {
      $("exercise-list").textContent = "Could not load your routine. Please reload Wapp.";
      return;
    }
  }
  try { routine = normalizeRoutine(initial); }
  catch {
    localStorage.removeItem(STORAGE_KEY);
    routine = normalizeRoutine(await (await fetch("./routine.json")).json());
    notify("Saved data was invalid; starter routine restored.");
  }
  renderOverview();
}

$("start-button").addEventListener("click", startSession);
$("end-button").addEventListener("click", endSession);
$("pause-button").addEventListener("click", () => {
  if (session.index >= session.steps.length) return endSession();
  if (session.running) pauseSession(); else resumeSession();
});
$("next-button").addEventListener("click", () => { if (session.index < session.steps.length) selectStep(session.index + 1, session.running); });
$("previous-button").addEventListener("click", () => { if (session.index > 0) selectStep(session.index - 1, session.running); });
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseSession("Paused while Wapp was away"); });
$("add-button").addEventListener("click", () => openEditor());
$("close-dialog").addEventListener("click", () => $("exercise-dialog").close());
$("exercise-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const input = {
    id: editingIndex === null ? `exercise-${crypto.randomUUID()}` : routine.exercises[editingIndex].id,
    name: $("exercise-name").value,
    seconds: $("exercise-seconds").value,
    sets: $("exercise-sets").value,
    sides: $("exercise-sides").value
  };
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
for (const [id, key] of [["side-switch", "sideSwitchSeconds"], ["between-exercises", "betweenExercisesSeconds"], ["between-sets", "betweenSetsSeconds"]]) {
  $(id).addEventListener("change", (event) => {
    routine.settings[key] = event.target.value;
    routine = normalizeRoutine(routine);
    saveRoutine();
  });
}
$("export-button").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(routine, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "wapp-routine.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("JSON backup downloaded");
});
$("import-button").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    routine = normalizeRoutine(JSON.parse(await file.text()));
    saveRoutine();
    notify("Routine imported");
  } catch (error) { notify(error.message || "Could not import JSON"); }
  event.target.value = "";
});
load();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
