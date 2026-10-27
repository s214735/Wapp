export const DEFAULT_COUNTER = {
  version: 3,
  startDate: "",
  amountPerPeriod: 0,
  periodDays: 7,
  oops: []
};

export function dayNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86400000);
}

export function todayISO() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function boundedNumber(value, min, max, label) {
  const number = Number(value);
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return number;
}

// Legacy field names are confined to this migration boundary. Never multiply
// current amounts again, even when a backup also contains legacy fields.
function legacyAmount(price, quantity) {
  // Remove binary multiplication noise without rounding to whole øre.
  return Number((price * quantity).toPrecision(15));
}

export function normalizeCounter(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("This is not Counter data.");
  if (input.version != null && ![1, 2, 3].includes(input.version)) throw new Error("Unsupported Counter data version.");
  const current = input.version === 3 || Object.hasOwn(input, "amountPerPeriod");
  const price = current ? 0 : boundedNumber(input.servingPrice ?? input.packetPrice ?? 0, 0, 1000000, "Saved price");
  const amountPerPeriod = current
    ? boundedNumber(input.amountPerPeriod, 0, 1000000000, "DKK per period")
    : legacyAmount(price, boundedNumber(input.servingsPerPeriod ?? input.packetsPerPeriod ?? 1, 0.01, 1000, "Saved quantity"));
  const startDate = String(input.startDate || "");
  if (startDate && dayNumber(startDate) === null) throw new Error("Enter a valid start date.");
  const periodDays = boundedNumber(input.periodDays ?? 7, 1, 3650, "Days per period");
  if (!Number.isInteger(periodDays)) throw new Error("Days per period must be a whole number.");
  if (input.oops != null && !Array.isArray(input.oops)) throw new Error("Oops entries must be a list.");
  const ids = new Set();
  const oops = (input.oops ?? []).map((entry, index) => {
    if (!entry || dayNumber(entry.date) === null) throw new Error(`Oops ${index + 1} needs a valid date.`);
    const amount = current
      ? boundedNumber(entry.amount, 0, 1000000000, `Oops ${index + 1} DKK`)
      : legacyAmount(price, boundedNumber(entry.servings ?? entry.packets, 0.01, 1000, `Oops ${index + 1} saved quantity`));
    let id = String(entry.id || `oops-${index + 1}`);
    while (ids.has(id)) id += `-${index + 1}`;
    ids.add(id);
    return { id, date: entry.date, amount, reason: String((current ? entry.reason : entry.note) || "").trim() || "No reason provided" };
  });
  // Keep sub-øre precision from old price × quantity; round only displayed totals.
  return { version: 3, startDate, amountPerPeriod, periodDays, oops };
}

export function calculateCounter(input, asOf = todayISO()) {
  const counter = normalizeCounter(input);
  const today = dayNumber(asOf);
  if (today === null) throw new Error("Invalid calculation date.");
  const start = dayNumber(counter.startDate);
  if (start === null) return { configured: false, days: 0, gross: 0, deductions: 0, saved: 0 };
  const days = Math.max(0, today - start);
  const gross = days / counter.periodDays * counter.amountPerPeriod;
  const deductions = counter.oops.filter((entry) => dayNumber(entry.date) >= start && dayNumber(entry.date) <= today).reduce((sum, entry) => sum + entry.amount, 0);
  const saved = Math.round((gross - deductions) * 100) / 100;
  return { configured: true, days, gross, deductions, saved };
}
