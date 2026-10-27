import { normalizeRoutine } from "./core.mjs";
import { DEFAULT_COUNTER, normalizeCounter } from "./counter.mjs";

export const COUNTER_KEY = "wapp.counter.v3";
// Retain these keys and backup aliases solely for backwards compatibility.
const LEGACY_KEYS = ["wapp.candy.v2", "wapp.nico.v1"];

export function loadCounter(storage) {
  for (const key of [COUNTER_KEY, ...LEGACY_KEYS]) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    const counter = normalizeCounter(JSON.parse(raw));
    if (key !== COUNTER_KEY) storage.setItem(COUNTER_KEY, JSON.stringify(counter));
    return counter;
  }
  return normalizeCounter(DEFAULT_COUNTER);
}

export function normalizeBackup(input, existingCounter) {
  if (input?.routine && input.version != null && ![1, 2, 3, 4].includes(input.version)) throw new Error("Unsupported backup version.");
  const routine = normalizeRoutine(input?.routine ?? input);
  const savedCounter = input?.counter ?? input?.candy ?? input?.nico;
  if (savedCounter == null && existingCounter == null) throw new Error("Choose a full backup containing Counter data to recover it.");
  const counter = savedCounter == null ? existingCounter : normalizeCounter(savedCounter);
  return { routine, counter };
}
