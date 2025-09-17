export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const toCents = (n) => Math.round(n * 100);
export const fromCents = (c) => (c / 100);
export const fmt = (n) => `$${fromCents(n).toFixed(2)}`;

export function feetToSqft(wFt, hFt) {
  const area = Math.max(0, wFt) * Math.max(0, hFt);
  return area;
}
export function inchesToFeet(inches) {
  return Math.max(0, Number(inches || 0)) / 12;
}
export function feetOrInToFeet(value, unit) {
  return unit === "in" ? inchesToFeet(value) : Math.max(0, Number(value || 0));
}
export function perimeterFeet(wFt, hFt) {
  return 2 * (Math.max(0, wFt) + Math.max(0, hFt));
}
export function estimateGrommets(wIn, hIn) {
  // Simple perimeter/24" estimation, min 4; labeled as "est."
  const perIn = 2 * (Math.max(0, wIn) + Math.max(0, hIn));
  return Math.max(4, Math.round(perIn / 24));
}

export function makeOrderNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `LIV-${y}${m}${dd}-${rand}`;
}

export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
