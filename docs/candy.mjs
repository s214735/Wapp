export const DEFAULT_CANDY = {
  version: 2,
  startDate: "",
  servingPrice: 0,
  servingsPerPeriod: 1,
  periodDays: 7,
  currency: "kr",
  oops: []
};

export function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
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
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return number;
}

export function normalizeCandy(input) {
  if (!input || typeof input !== "object") throw new Error("This is not CandyCounter data.");
  const startDate = String(input.startDate || "");
  if (startDate && dayNumber(startDate) === null) throw new Error("Enter a valid start date.");
  const oops = Array.isArray(input.oops) ? input.oops.map((entry, index) => {
    if (!entry || dayNumber(entry.date) === null) throw new Error(`Oops ${index + 1} needs a valid date.`);
    return {
      id: String(entry.id || `oops-${index + 1}`),
      date: entry.date,
      servings: boundedNumber(entry.servings ?? entry.packets, 0.01, 1000, `Oops ${index + 1} servings`),
      note: String(entry.note || "").trim().slice(0, 100)
    };
  }) : [];
  const periodDays = boundedNumber(input.periodDays ?? 7, 1, 3650, "Days per period");
  if (!Number.isInteger(periodDays)) throw new Error("Days per period must be a whole number.");
  return {
    version: 2,
    startDate,
    servingPrice: boundedNumber(input.servingPrice ?? input.packetPrice ?? 0, 0, 1000000, "Price per serving"),
    servingsPerPeriod: boundedNumber(input.servingsPerPeriod ?? input.packetsPerPeriod ?? 1, 0.01, 1000, "Servings per period"),
    periodDays,
    currency: String(input.currency || "kr").trim().slice(0, 8) || "kr",
    oops
  };
}

export function calculateCandy(input, asOf = todayISO()) {
  const candy = normalizeCandy(input);
  const today = dayNumber(asOf);
  if (today === null) throw new Error("Invalid calculation date.");
  const start = dayNumber(candy.startDate);
  if (start === null) return { configured: false, days: 0, grossServings: 0, oopsServings: 0, netServings: 0, saved: 0 };
  const days = Math.max(0, today - start);
  const grossServings = days / candy.periodDays * candy.servingsPerPeriod;
  const oopsServings = candy.oops.filter((entry) => dayNumber(entry.date) >= start && dayNumber(entry.date) <= today).reduce((sum, entry) => sum + entry.servings, 0);
  const netServings = grossServings - oopsServings;
  const saved = Math.round(netServings * candy.servingPrice * 100) / 100;
  return { configured: true, days, grossServings, oopsServings, netServings, saved };
}
