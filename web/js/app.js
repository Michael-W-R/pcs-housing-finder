import { loadBahData, lookupBah, lookupMha } from "./bah.js";
import { loadPlaces, placeForZip, searchCities, zipsForCity } from "./places.js";

const $ = (id) => document.getElementById(id);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const state = {
  bah: null, zip: null, mode: "pct", pct: 100, offset: 0,
  range: { pct: [70, 130], usd: [-600, 600] },
  resolved: null, // { label: "San Antonio, TX", zip } when set via city pick
};

// --- Map ---------------------------------------------------------------
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  },
  center: [-98.5, 39.8],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "top-right");
let marker = null;

function centerOnZip(zip, label) {
  const place = placeForZip(zip);
  if (!place) return;
  const lngLat = [place.lng, place.lat];
  if (marker) marker.remove();
  marker = new maplibregl.Marker({ color: "#c9a227" })
    .setLngLat(lngLat)
    .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(
      `<strong>${place.city}, ${place.st} ${zip}</strong><br>${label}`))
    .addTo(map);
  map.flyTo({ center: lngLat, zoom: 10 });
  marker.togglePopup();
}

// Resolve a picked city to a representative ZIP: group the city's ZIPs by MHA,
// take the dominant MHA, and use the ZIP nearest that group's centroid.
function repZipForCity(label) {
  const groups = new Map();
  for (const z of zipsForCity(label)) {
    const mha = lookupMha(z);
    if (!mha) continue;
    let g = groups.get(mha.code);
    if (!g) groups.set(mha.code, g = []);
    g.push(z);
  }
  let best = null;
  for (const g of groups.values()) if (!best || g.length > best.length) best = g;
  if (!best) return null;
  const pts = best.map((z) => ({ z, p: placeForZip(z) })).filter((x) => x.p);
  if (!pts.length) return best[0];
  const cLat = pts.reduce((s, x) => s + x.p.lat, 0) / pts.length;
  const cLng = pts.reduce((s, x) => s + x.p.lng, 0) / pts.length;
  pts.sort((a, b) =>
    (a.p.lat - cLat) ** 2 + (a.p.lng - cLng) ** 2 -
    ((b.p.lat - cLat) ** 2 + (b.p.lng - cLng) ** 2));
  return pts[0].z;
}

// --- Calculator --------------------------------------------------------

// DoD anchors each grade's BAH to a housing profile (source: DTMO BAH Primer).
// E1-E4 differ by dependency status; W and O-E grades are interpolated by DoD
// and have no published anchor, so we show nothing for them.
function anchorProfile(gradeLabel, withDep) {
  if (/^E-[1-4]$/.test(gradeLabel)) return withDep ? "2-bedroom apartment" : "1-bedroom apartment";
  if (["E-5", "O-1", "O-2"].includes(gradeLabel)) return "2-bedroom townhouse or duplex";
  if (["E-6", "E-7", "E-8", "O-3"].includes(gradeLabel)) return "3-bedroom townhouse or duplex";
  if (["E-9", "O-4"].includes(gradeLabel)) return "3-bedroom single-family house";
  if (["O-5", "O-6", "O-7 and above"].includes(gradeLabel)) return "4-bedroom single-family house";
  return null;
}
function currentBudget() {
  if (!state.bah) return 0;
  return state.mode === "pct"
    ? Math.round(state.bah * state.pct / 100)
    : Math.round(state.bah + state.offset);
}

function render() {
  const hasResult = state.bah !== null;
  $("bah-result").hidden = !hasResult;
  $("budget-card").hidden = !hasResult;
  $("search-card").hidden = !hasResult;
  if (!hasResult) return;

  $("bah-amount").textContent = usd(state.bah);
  const budget = currentBudget();
  $("budget-amount").textContent = usd(budget);
  $("slider-value").textContent = sliderText();

  const delta = budget - state.bah;
  const el = $("budget-delta");
  if (delta < 0) {
    el.textContent = `${usd(-delta)}/mo of BAH left for utilities or savings`;
    el.className = "budget-delta keep";
  } else if (delta > 0) {
    el.textContent = `${usd(delta)}/mo out of pocket above BAH`;
    el.className = "budget-delta pay";
  } else {
    el.textContent = "Budget equals your full BAH";
    el.className = "budget-delta";
  }

  const grade = $("grade").value;
  const withDep = document.querySelector('input[name="dep"]:checked').value === "w";
  const profile = anchorProfile(grade, withDep);
  $("anchor-note").hidden = !profile;
  if (profile) $("anchor-note").textContent = `DoD benchmarks this rate to a ${profile} in your area`;

  const beds = $("beds").value;
  const baths = $("baths").value;

  let zillow = `https://www.zillow.com/homes/for_rent/${state.zip}_rb/`;
  if (beds !== "0") zillow += `${beds}-_beds/`;
  if (baths !== "0") zillow += `${baths}-_baths/`;
  if (budget > 0) zillow += `0-${budget}_mp/`;
  $("link-zillow").href = zillow;

  // Apartments.com needs a city-state-zip slug (bare ZIP paths 404), which we
  // have once the geocoder responds; until then fall back to their search page.
  const aptParts = [];
  if (beds !== "0") aptParts.push(`min-${beds}-bedrooms`);
  if (budget > 0) aptParts.push(`under-${budget}`);
  const p = placeForZip(state.zip);
  $("link-apartments").href = p
    ? `https://www.apartments.com/${p.city.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${p.st.toLowerCase()}-${state.zip}/${aptParts.length ? aptParts.join("-") + "/" : ""}`
    : "https://www.apartments.com/";

  $("link-mbo").href = `https://www.militarybyowner.com/homes?type=rent&location=${state.zip}`;
}

// The location box accepts a 5-digit ZIP directly, or holds a picked city
// label whose ZIP we resolved in state.resolved.
function activeZip() {
  const raw = $("zip").value.trim();
  if (/^\d{5}$/.test(raw)) return raw;
  if (state.resolved && raw === state.resolved.label) return state.resolved.zip;
  return null;
}

function recalc() {
  const zip = activeZip();
  const grade = $("grade").value;
  const withDep = document.querySelector('input[name="dep"]:checked').value === "w";
  const result = zip ? lookupBah(zip, grade, withDep) : null;

  const viaCity = !!(state.resolved && zip === state.resolved.zip);
  $("city-note").hidden = !(viaCity && result);
  if (viaCity && result) {
    $("city-note").textContent =
      `Using central ZIP ${zip}. BAH can differ across a large metro — enter a specific ZIP to refine.`;
  }

  if (!result) {
    state.bah = null;
    $("mha-line").hidden = true;
    render();
    return;
  }

  const zipChanged = state.zip !== zip;
  state.bah = result.rate;
  state.zip = zip;
  const place = placeForZip(zip);
  $("mha-line").hidden = false;
  $("mha-name").textContent = place
    ? `${place.city}, ${place.st} ${zip} · ${result.mha.name}`
    : result.mha.name;
  $("mha-code").textContent = `(${result.mha.code})`;
  render();
  if (zipChanged) centerOnZip(zip, result.mha.name);
}

// --- City autocomplete -------------------------------------------------
function hideSuggest() {
  $("suggest").hidden = true;
  $("suggest").innerHTML = "";
}

function pickCity(label) {
  const zip = repZipForCity(label);
  hideSuggest();
  if (!zip) return;
  state.resolved = { label, zip };
  $("zip").value = label;
  recalc();
}

function updateSuggest() {
  const raw = $("zip").value.trim();
  if (state.resolved && raw !== state.resolved.label) state.resolved = null;
  if (/^\d/.test(raw) || raw.length < 2 || state.resolved) {
    hideSuggest();
    return;
  }
  const matches = searchCities(raw);
  if (!matches.length) {
    hideSuggest();
    return;
  }
  $("suggest").innerHTML = "";
  for (const label of matches) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => pickCity(label));
    $("suggest").appendChild(b);
  }
  $("suggest").hidden = false;
}

function sliderText() {
  if (state.mode === "pct") return `${state.pct}% of BAH`;
  if (state.offset === 0) return "Exactly BAH ($0 offset)";
  return state.offset > 0 ? `BAH + $${state.offset}` : `BAH − $${-state.offset}`;
}

// Sync slider bounds, range fields, and mode buttons to state, clamping the
// current value into the active range.
function applyMode() {
  const [lo, hi] = state.range[state.mode];
  const s = $("budget-slider");
  const cur = state.mode === "pct" ? state.pct : state.offset;
  const clamped = Math.min(hi, Math.max(lo, cur));
  if (state.mode === "pct") { state.pct = clamped; s.step = 1; }
  else { state.offset = clamped; s.step = 25; }
  s.min = lo; s.max = hi; s.value = clamped;
  $("range-min").value = lo;
  $("range-max").value = hi;
  $("scale-mid").textContent = state.mode === "pct" ? "100% = BAH" : "$0 = BAH";
  $("mode-pct").classList.toggle("active", state.mode === "pct");
  $("mode-usd").classList.toggle("active", state.mode === "usd");
  render();
}

function setMode(mode) {
  state.mode = mode;
  applyMode();
}

function updateRange() {
  const lo = parseInt($("range-min").value, 10);
  const hi = parseInt($("range-max").value, 10);
  if (Number.isNaN(lo) || Number.isNaN(hi) || hi <= lo) return;
  state.range[state.mode] = state.mode === "pct"
    ? [Math.max(0, lo), Math.min(500, hi)]
    : [lo, hi];
  applyMode();
}

// --- Wiring ------------------------------------------------------------
$("zip").addEventListener("input", () => { updateSuggest(); recalc(); });
$("zip").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("suggest").hidden) {
    const first = $("suggest").querySelector("button");
    if (first) pickCity(first.textContent);
  } else if (e.key === "Escape") {
    hideSuggest();
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete")) hideSuggest();
});
$("grade").addEventListener("change", recalc);
document.querySelectorAll('input[name="dep"]').forEach((r) => r.addEventListener("change", recalc));
$("budget-slider").addEventListener("input", (e) => {
  const v = parseInt(e.target.value, 10);
  if (state.mode === "pct") state.pct = v; else state.offset = v;
  render();
});
$("mode-pct").addEventListener("click", () => setMode("pct"));
$("mode-usd").addEventListener("click", () => setMode("usd"));
$("range-min").addEventListener("change", updateRange);
$("range-max").addEventListener("change", updateRange);
$("beds").addEventListener("change", render);
$("baths").addEventListener("change", render);

Promise.all([loadBahData(2026), loadPlaces()])
  .then(([y]) => { $("data-year").textContent = y; recalc(); })
  .catch((e) => { $("bah-card").insertAdjacentHTML("beforeend", `<p class="hint">Failed to load data: ${e.message}</p>`); });
