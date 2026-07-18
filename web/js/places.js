// Offline ZIP <-> city lookup backed by web/data/places-us.json
// (GeoNames postal data, CC BY 4.0 — attribution in the page footer).

let data = null;
let cityIndex = null; // "City|ST" -> [zips]

export async function loadPlaces() {
  const resp = await fetch("data/places-us.json");
  if (!resp.ok) throw new Error(`places data load failed: ${resp.status}`);
  data = await resp.json();
}

export function placeForZip(zip) {
  const rec = data?.zip[zip];
  if (!rec) return null;
  const [city, st] = data.cities[rec[0]].split("|");
  return { city, st, lat: rec[1], lng: rec[2] };
}

function buildCityIndex() {
  cityIndex = new Map();
  for (const [zip, rec] of Object.entries(data.zip)) {
    const key = data.cities[rec[0]];
    let arr = cityIndex.get(key);
    if (!arr) cityIndex.set(key, arr = []);
    arr.push(zip);
  }
}

export function searchCities(query, limit = 8) {
  if (!data) return [];
  if (!cityIndex) buildCityIndex();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts = [];
  const contains = [];
  for (const [key, zips] of cityIndex.entries()) {
    const label = key.replace("|", ", ");
    const lower = label.toLowerCase();
    if (lower.startsWith(q)) starts.push([label, zips.length]);
    else if (lower.includes(q)) contains.push([label, zips.length]);
  }
  // Bigger cities (more ZIPs) first — "san antonio" should mean TX, not FL.
  const bySize = (a, b) => b[1] - a[1];
  return [...starts.sort(bySize), ...contains.sort(bySize)]
    .slice(0, limit).map((x) => x[0]);
}

export function zipsForCity(label) {
  if (!data) return [];
  if (!cityIndex) buildCityIndex();
  return cityIndex.get(label.replace(", ", "|")) ?? [];
}
