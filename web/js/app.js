import { loadBahData, lookupBah, lookupMha } from "./bah.js";
import {
  loadPlaces, placeForZip, searchCities, zipsForCity,
  nearestZip, loadInstallations, searchInstallations,
} from "./places.js";

const $ = (id) => document.getElementById(id);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const state = {
  bah: null, zip: null, mode: "pct", pct: 100, offset: 0,
  range: { pct: [70, 130], usd: [-600, 600] },
  resolved: null, // { label, zip, inst? } when set via city or installation pick
  anchor: null,   // { lng, lat, label } — commute origin (duty marker position)
  candidate: null, // { lng, lat } — clicked point being commute-checked
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
let dutyMarker = null;
let candMarker = null;

const EMPTY_ROUTE = { type: "Feature", geometry: { type: "LineString", coordinates: [] } };

function drawRoute(feature) {
  const src = map.getSource("route");
  if (src) {
    src.setData(feature);
  } else {
    map.addSource("route", { type: "geojson", data: feature });
    map.addLayer({
      id: "route", type: "line", source: "route",
      paint: { "line-color": "#1b2a41", "line-width": 4, "line-opacity": 0.75 },
    });
  }
}

function clearCandidate() {
  state.candidate = null;
  if (candMarker) { candMarker.remove(); candMarker = null; }
  if (map.getSource("route")) drawRoute(EMPTY_ROUTE);
  $("commute-result").hidden = true;
}

function milesText(meters) { return `${(meters / 1609.34).toFixed(1)} mi`; }

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function routeToCandidate() {
  if (!state.anchor || !state.candidate) return;
  const a = state.anchor;
  const c = state.candidate;
  const nearZip = nearestZip(c.lat, c.lng);
  const nearPlace = nearZip ? placeForZip(nearZip) : null;
  const fromTxt = nearPlace ? `near ${nearPlace.city}, ${nearPlace.st} ${nearZip}` : "the selected point";
  $("commute-result").hidden = false;
  $("commute-main").textContent = "…";
  $("commute-sub").textContent = `Checking drive from ${fromTxt} to ${a.label}`;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${c.lng},${c.lat};${a.lng},${a.lat}?overview=full&geometries=geojson`;
    const resp = await fetch(url);
    const j = await resp.json();
    const route = j.routes?.[0];
    if (!route) throw new Error("no route");
    drawRoute({ type: "Feature", geometry: route.geometry });
    $("commute-main").textContent = `${milesText(route.distance)} · ${Math.round(route.duration / 60)} min drive`;
    $("commute-sub").textContent = `${fromTxt} to ${a.label} · typical roads, no rush-hour traffic yet`;
  } catch {
    const d = haversineMeters(a, c);
    drawRoute({ type: "Feature", geometry: { type: "LineString", coordinates: [[c.lng, c.lat], [a.lng, a.lat]] } });
    $("commute-main").textContent = `${milesText(d)} straight-line`;
    $("commute-sub").textContent = `Routing service unavailable — showing direct distance from ${fromTxt} to ${a.label}`;
  }
}

function setCandidate(lngLat) {
  state.candidate = { lng: lngLat.lng, lat: lngLat.lat };
  if (candMarker) candMarker.remove();
  candMarker = new maplibregl.Marker({ color: "#1b2a41" }).setLngLat(lngLat).addTo(map);
  routeToCandidate();
}

map.on("click", (e) => {
  if (state.anchor) setCandidate(e.lngLat);
});

function placeDutyMarker(lngLat, label, popupHtml, zoom) {
  clearCandidate();
  state.anchor = { lng: lngLat[0], lat: lngLat[1], label };
  if (dutyMarker) dutyMarker.remove();
  dutyMarker = new maplibregl.Marker({ color: "#c9a227", draggable: true })
    .setLngLat(lngLat)
    .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(popupHtml))
    .addTo(map);
  dutyMarker.on("dragend", () => {
    const p = dutyMarker.getLngLat();
    state.anchor = { lng: p.lng, lat: p.lat, label };
    if (state.candidate) routeToCandidate();
  });
  $("commute-card").hidden = false;
  map.flyTo({ center: lngLat, zoom });
  dutyMarker.togglePopup();
}

function centerOnZip(zip, label) {
  const inst = state.resolved?.inst;
  if (inst && state.resolved.zip === zip) {
    placeDutyMarker([inst.lng, inst.lat], inst.name,
      `<strong>${inst.name}</strong><br>BAH area: ${label}`, 10);
    return;
  }
  const place = placeForZip(zip);
  if (!place) return;
  placeDutyMarker([place.lng, place.lat], `${place.city}, ${place.st}`,
    `<strong>${place.city}, ${place.st} ${zip}</strong><br>${label}`, 10);
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

  const viaPick = !!(state.resolved && zip === state.resolved.zip);
  $("city-note").hidden = !(viaPick && result);
  if (viaPick && result) {
    $("city-note").textContent = state.resolved.inst
      ? `BAH from ZIP ${zip}, the closest rated area to this installation.`
      : `Using central ZIP ${zip}. BAH can differ across a large metro — enter a specific ZIP to refine.`;
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

function pickInstallation(it) {
  hideSuggest();
  const zip = nearestZip(it.lat, it.lng, (z) => !!lookupMha(z));
  if (!zip) return;
  const label = `${it.n}, ${it.s}`;
  state.resolved = { label, zip, inst: { name: label, lat: it.lat, lng: it.lng } };
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
  const instMatches = searchInstallations(raw, 5);
  const cityMatches = searchCities(raw, 8 - instMatches.length);
  if (!instMatches.length && !cityMatches.length) {
    hideSuggest();
    return;
  }
  $("suggest").innerHTML = "";
  for (const it of instMatches) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${it.n}, ${it.s}`;
    const tag = document.createElement("span");
    tag.className = "badge";
    tag.textContent = "BASE";
    b.appendChild(tag);
    b.addEventListener("click", () => pickInstallation(it));
    $("suggest").appendChild(b);
  }
  for (const label of cityMatches) {
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
    if (first) first.click();
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

Promise.all([loadBahData(2026), loadPlaces(), loadInstallations()])
  .then(([y]) => { $("data-year").textContent = y; recalc(); })
  .catch((e) => { $("bah-card").insertAdjacentHTML("beforeend", `<p class="hint">Failed to load data: ${e.message}</p>`); });
