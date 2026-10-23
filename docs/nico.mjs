export const DEFAULT_NICO = {
  version: 1,
  startDate: "",
  packetPrice: 0,
  packetsPerPeriod: 1,
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

export function normalizeNico(input) {
  if (!input || typeof input !== "object") throw new Error("This is not NicoCounter data.");
  const startDate = String(input.startDate || "");
  if (startDate && dayNumber(startDate) === null) throw new Error("Enter a valid start date.");
  const oops = Array.isArray(input.oops) ? input.oops.map((entry, index) => {
    if (!entry || dayNumber(entry.date) === null) throw new Error(`Oops ${index + 1} needs a valid date.`);
    return {
      id: String(entry.id || `oops-${index + 1}`),
      date: entry.date,
      packets: boundedNumber(entry.packets, 0.01, 1000, `Oops ${index + 1} packets`),
      note: String(entry.note || "").trim().slice(0, 100)
    };
  }) : [];
  const periodDays = boundedNumber(input.periodDays ?? 7, 1, 3650, "Days per period");
  if (!Number.isInteger(periodDays)) throw new Error("Days per period must be a whole number.");
  return {
    version: 1,
    startDate,
    packetPrice: boundedNumber(input.packetPrice ?? 0, 0, 1000000, "Price per packet"),
    packetsPerPeriod: boundedNumber(input.packetsPerPeriod ?? 1, 0.01, 1000, "Packets per period"),
    periodDays,
    currency: String(input.currency || "kr").trim().slice(0, 8) || "kr",
    oops
  };
}

export function calculateNico(input, asOf = todayISO()) {
  const nico = normalizeNico(input);
  const today = dayNumber(asOf);
  if (today === null) throw new Error("Invalid calculation date.");
  const start = dayNumber(nico.startDate);
  if (start === null) return { configured: false, days: 0, grossPackets: 0, oopsPackets: 0, netPackets: 0, saved: 0 };
  const days = Math.max(0, today - start);
  const grossPackets = days / nico.periodDays * nico.packetsPerPeriod;
  const oopsPackets = nico.oops.filter((entry) => dayNumber(entry.date) >= start && dayNumber(entry.date) <= today).reduce((sum, entry) => sum + entry.packets, 0);
  const netPackets = grossPackets - oopsPackets;
  const saved = Math.round(netPackets * nico.packetPrice * 100) / 100;
  return { configured: true, days, grossPackets, oopsPackets, netPackets, saved };
}
