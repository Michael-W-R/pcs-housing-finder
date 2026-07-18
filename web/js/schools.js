// Nearest-school lookup backed by per-state files in web/data/schools/
// (NCES EDGE + CCD 2023-24, public domain). Levels: E, M, H, C (combined).

const cache = new Map();

// Districts report names to NCES with heavy abbreviation ("STAHL EL",
// "MADISON H S") which breaks GreatSchools searches and reads poorly.
// Expand the standard trailing abbreviations and fix ALL-CAPS names.
const END_EXPANSIONS = [
  [/\s+H\s?S$/i, " High School"],
  [/\s+M\s?S$/i, " Middle School"],
  [/\s+J\s?H\s?S?$/i, " Junior High School"],
  [/\s+(EL|ELEM|ES)$/i, " Elementary School"],
  [/\s+INT$/i, " Intermediate School"],
];

const KEEP_CAPS = new Set(["IDEA", "KIPP", "STEM", "STEAM", "IB", "II", "III", "IV", "ROTC", "JROTC", "JBSA", "AFB"]);

function capWord(w) {
  return w.split("-").map((p) =>
    KEEP_CAPS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
  ).join("-");
}

export function prettySchoolName(raw) {
  const wasAllCaps = /[A-Z]/.test(raw) && raw === raw.toUpperCase();
  let name = raw.trim();
  for (const [re, sub] of END_EXPANSIONS) name = name.replace(re, sub);
  if (wasAllCaps) {
    name = name.split(/\s+/).map((w) => (KEEP_CAPS.has(w) ? w : capWord(w))).join(" ");
  }
  return name;
}

export async function schoolsForState(st) {
  if (cache.has(st)) return cache.get(st);
  let schools = [];
  try {
    const resp = await fetch(`data/schools/${st}.json`);
    if (resp.ok) schools = await resp.json();
  } catch { /* treated as no data */ }
  cache.set(st, schools);
  return schools;
}

// Nearest `perLevel` schools of each level to a point, flat-earth metric.
export function nearestSchools(schools, lat, lng, perLevel = 2) {
  const cos = Math.cos((lat * Math.PI) / 180);
  const scored = schools.map((s) => {
    const dLat = s.lat - lat;
    const dLng = (s.lng - lng) * cos;
    return { ...s, mi: Math.sqrt(dLat * dLat + dLng * dLng) * 69.09 };
  });
  scored.sort((a, b) => a.mi - b.mi);
  const out = [];
  const counts = {};
  for (const s of scored) {
    const max = s.lv === "C" ? 1 : perLevel;
    counts[s.lv] = counts[s.lv] ?? 0;
    if (counts[s.lv] < max) {
      counts[s.lv]++;
      out.push(s);
    }
    if (out.length >= perLevel * 3 + 1) break;
  }
  const order = { E: 0, M: 1, H: 2, C: 3 };
  return out.sort((a, b) => order[a.lv] - order[b.lv] || a.mi - b.mi);
}
