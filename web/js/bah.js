// BAH lookup engine backed by web/data/bah-<year>.json (built from DTMO ASCII files).

let data = null;

// UI labels -> data grade keys. "O-7 and above" uses O7 (O7–O10 rates are identical).
const GRADE_KEYS = {
  "E-1": "E1", "E-2": "E2", "E-3": "E3", "E-4": "E4", "E-5": "E5",
  "E-6": "E6", "E-7": "E7", "E-8": "E8", "E-9": "E9",
  "W-1": "W1", "W-2": "W2", "W-3": "W3", "W-4": "W4", "W-5": "W5",
  "O-1E": "O1E", "O-2E": "O2E", "O-3E": "O3E",
  "O-1": "O1", "O-2": "O2", "O-3": "O3", "O-4": "O4",
  "O-5": "O5", "O-6": "O6", "O-7 and above": "O7",
};

export async function loadBahData(year = 2026) {
  const resp = await fetch(`data/bah-${year}.json`);
  if (!resp.ok) throw new Error(`BAH data load failed: ${resp.status}`);
  data = await resp.json();
  return data.year;
}

export function lookupMha(zip) {
  if (!data || !/^\d{5}$/.test(zip)) return null;
  const mha = data.zip[zip];
  if (!mha || !data.mha[mha]) return null;
  return { code: mha, name: data.mha[mha].name };
}

export function lookupBah(zip, gradeLabel, withDependents) {
  const mha = lookupMha(zip);
  if (!mha) return null;
  const key = GRADE_KEYS[gradeLabel];
  const idx = data.grades.indexOf(key);
  if (idx < 0) return null;
  const rates = data.mha[mha.code][withDependents ? "w" : "wo"];
  if (!rates || rates.length <= idx) return null;
  return { mha, rate: rates[idx] };
}
