// Nearest-school lookup backed by per-state files in web/data/schools/
// (NCES EDGE + CCD 2023-24, public domain). Levels: E, M, H, C (combined).

const cache = new Map();

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
