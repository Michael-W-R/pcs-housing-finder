import { loadBahData, lookupBah, lookupMha } from "./bah.js";
import {
  loadPlaces, placeForZip, searchCities, zipsForCity,
  nearestZip, loadInstallations, searchInstallations,
} from "./places.js";
import { schoolsForState, nearestSchools, prettySchoolName } from "./schools.js";

const $ = (id) => document.getElementById(id);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const state = {
  bah: null, zip: null, mode: "pct", pct: 100, offset: 0,
  range: { pct: [70, 130], usd: [-600, 600] },
  resolved: null, // { label, zip, inst? } when set via city or installation pick
  anchor: null,   // { lng, lat, label } — commute origin (duty marker position)
  anchor2: null,  // { lng, lat, label } — optional second workplace
  placing2: false, // next map click places anchor2 instead of a candidate
  candidate: null, // { lng, lat } — clicked point being commute-checked
  candidateZip: null, // nearest ZIP to the candidate; listing links target it
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

function schoolsPlaceholder() {
  $("schools-list").innerHTML =
    '<p class="hint" style="margin:0">Tap the map on a neighborhood you\'re considering — its closest public schools will list here.</p>';
}

function clearCandidate() {
  state.candidate = null;
  state.candidateZip = null;
  if (candMarker) { candMarker.remove(); candMarker = null; }
  if (map.getSource("route")) drawRoute(EMPTY_ROUTE);
  $("commute-result").hidden = true;
  $("schools-card").hidden = !state.anchor;
  if (state.anchor) schoolsPlaceholder();
  drawSchoolDots([]);
}

const LEVEL_NAMES = { E: "Elementary", M: "Middle", H: "High", C: "K-12" };

function drawSchoolDots(schools) {
  const data = {
    type: "FeatureCollection",
    features: schools.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: { lv: s.lv },
    })),
  };
  const src = map.getSource("schools");
  if (src) {
    src.setData(data);
  } else if (schools.length) {
    map.addSource("schools", { type: "geojson", data });
    map.addLayer({
      id: "schools-dots", type: "circle", source: "schools",
      paint: {
        "circle-radius": 5,
        "circle-color": ["match", ["get", "lv"], "E", "#2e7d32", "M", "#b4530a", "H", "#6d28d9", "#607d8b"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });
  }
}

async function updateSchools(c, st) {
  const all = await schoolsForState(st);
  if (!state.candidate || state.candidate.lng !== c.lng || state.candidate.lat !== c.lat) return;
  const near = nearestSchools(all, c.lat, c.lng);
  $("schools-card").hidden = near.length === 0;
  const list = $("schools-list");
  list.innerHTML = "";
  for (const s of near) {
    const row = document.createElement("div");
    row.className = "school-row";
    const left = document.createElement("span");
    const dot = document.createElement("span");
    dot.className = `lv-dot lv-${s.lv}`;
    const disp = prettySchoolName(s.n);
    const a = document.createElement("a");
    a.href = `https://www.greatschools.org/search/search.page?q=${encodeURIComponent(`${disp} ${s.c}`)}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = disp;
    left.append(dot, a);
    const meta = document.createElement("span");
    meta.className = "school-meta";
    meta.textContent = `${LEVEL_NAMES[s.lv]} · ${s.mi.toFixed(1)} mi`;
    row.append(left, meta);
    list.appendChild(row);
  }
  drawSchoolDots(near);
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

async function fetchRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const resp = await fetch(url);
  const j = await resp.json();
  const route = j.routes?.[0];
  if (!route) throw new Error("no route");
  return route;
}

async function routeToCandidate() {
  if (!state.anchor || !state.candidate) return;
  const a = state.anchor;
  const c = state.candidate;
  const nearZip = nearestZip(c.lat, c.lng);
  const nearPlace = nearZip ? placeForZip(nearZip) : null;
  const fromTxt = nearPlace ? `near ${nearPlace.city}, ${nearPlace.st} ${nearZip}` : "the selected point";
  if (nearPlace) updateSchools(c, nearPlace.st);
  $("commute-result").hidden = false;
  // On phones the panel sits under the map — bring the result into view.
  if (window.matchMedia("(max-width: 800px)").matches) {
    $("commute-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("commute-main").textContent = "…";
  $("commute-sub").textContent = `Checking drive from ${fromTxt}`;
  try {
    const jobs = [fetchRoute(c, a)];
    if (state.anchor2) jobs.push(fetchRoute(c, state.anchor2));
    const [r1, r2] = await Promise.all(jobs);
    drawRoute({ type: "Feature", geometry: r1.geometry });
    if (r2) {
      $("commute-main").textContent =
        `${Math.round(r1.duration / 60)} min / ${Math.round(r2.duration / 60)} min`;
      $("commute-sub").textContent =
        `${fromTxt}: ${milesText(r1.distance)} to ${a.label} · ${milesText(r2.distance)} to ${state.anchor2.label} · no rush-hour traffic yet`;
    } else {
      $("commute-main").textContent = `${milesText(r1.distance)} · ${Math.round(r1.duration / 60)} min drive`;
      $("commute-sub").textContent = `${fromTxt} to ${a.label} · typical roads, no rush-hour traffic yet`;
    }
  } catch {
    const d = haversineMeters(a, c);
    drawRoute({ type: "Feature", geometry: { type: "LineString", coordinates: [[c.lng, c.lat], [a.lng, a.lat]] } });
    $("commute-main").textContent = `${milesText(d)} straight-line`;
    $("commute-sub").textContent = `Routing service unavailable — showing direct distance from ${fromTxt} to ${a.label}`;
  }
}

// --- Fair-commute zone (isochrone shading) ------------------------------

const EMPTY_ZONE = { type: "FeatureCollection", features: [] };

function drawFairZone(feature) {
  const src = map.getSource("fairzone");
  const data = feature ?? EMPTY_ZONE;
  if (src) {
    src.setData(data);
  } else {
    map.addSource("fairzone", { type: "geojson", data });
    map.addLayer({
      id: "fairzone-fill", type: "fill", source: "fairzone",
      paint: { "fill-color": "#c9a227", "fill-opacity": 0.18 },
    }, map.getLayer("route") ? "route" : undefined);
    map.addLayer({
      id: "fairzone-line", type: "line", source: "fairzone",
      paint: { "line-color": "#c9a227", "line-width": 2, "line-opacity": 0.7 },
    }, map.getLayer("route") ? "route" : undefined);
  }
}

async function fetchIsochrone(pt, minutes) {
  const json = {
    locations: [{ lat: pt.lat, lon: pt.lng }],
    costing: "auto",
    contours: [{ time: minutes }],
    polygons: true,
  };
  const resp = await fetch(`https://valhalla1.openstreetmap.de/isochrone?json=${encodeURIComponent(JSON.stringify(json))}`);
  const j = await resp.json();
  const f = j.features?.[0];
  if (!f) throw new Error("no isochrone");
  return f;
}

let isoTimer = null;
let isoRun = 0;

function scheduleFairZone() {
  clearTimeout(isoTimer);
  isoTimer = setTimeout(updateFairZone, 400);
}

async function updateFairZone() {
  const run = ++isoRun;
  if (!state.anchor) {
    drawFairZone(null);
    $("fairzone-status").textContent = "";
    return;
  }
  const min = parseInt($("iso-min").value, 10);
  $("fairzone-status").textContent = "Computing drive-time zone…";
  try {
    const jobs = [fetchIsochrone(state.anchor, min)];
    if (state.anchor2) jobs.push(fetchIsochrone(state.anchor2, min));
    const [iso1, iso2] = await Promise.all(jobs);
    if (run !== isoRun) return; // superseded by a newer request
    if (iso2) {
      const overlap = turf.intersect(iso1, iso2);
      if (!overlap) {
        drawFairZone(null);
        $("fairzone-status").textContent =
          `No area is within ${min} min of both workplaces — try a longer drive time.`;
        return;
      }
      drawFairZone(overlap);
      $("fairzone-status").textContent =
        `Shaded: within ${min} min drive of BOTH workplaces. Hunt for housing there.`;
    } else {
      drawFairZone(iso1);
      $("fairzone-status").textContent = `Shaded: within ${min} min drive of ${state.anchor.label}.`;
    }
  } catch {
    if (run !== isoRun) return;
    drawFairZone(null);
    $("fairzone-status").textContent = "Drive-time zones are unavailable right now — commute clicks still work.";
  }
}

function setCandidate(lngLat) {
  state.candidate = { lng: lngLat.lng, lat: lngLat.lat };
  state.candidateZip = nearestZip(lngLat.lat, lngLat.lng);
  if (candMarker) candMarker.remove();
  candMarker = new maplibregl.Marker({ color: "#1b2a41" }).setLngLat(lngLat).addTo(map);
  render(); // retarget listing links to the selected spot
  routeToCandidate();
}

let anchor2Marker = null;

function removeAnchor2() {
  state.anchor2 = null;
  state.placing2 = false;
  if (anchor2Marker) { anchor2Marker.remove(); anchor2Marker = null; }
  $("add-anchor2").textContent = "+ Add second workplace (spouse)";
  scheduleFairZone();
  if (state.candidate) routeToCandidate();
}

function placeAnchor2(lngLat) {
  state.placing2 = false;
  state.anchor2 = { lng: lngLat.lng, lat: lngLat.lat, label: "second workplace" };
  if (anchor2Marker) anchor2Marker.remove();
  anchor2Marker = new maplibregl.Marker({ color: "#556b2f", draggable: true })
    .setLngLat(lngLat)
    .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML("<strong>Second workplace</strong><br>Drag to adjust"))
    .addTo(map);
  anchor2Marker.on("dragend", () => {
    const p = anchor2Marker.getLngLat();
    state.anchor2 = { ...state.anchor2, lng: p.lng, lat: p.lat };
    scheduleFairZone();
    if (state.candidate) routeToCandidate();
  });
  $("add-anchor2").textContent = "× Remove second workplace";
  scheduleFairZone();
  if (state.candidate) routeToCandidate();
}

map.on("click", (e) => {
  if (state.placing2) placeAnchor2(e.lngLat);
  else if (state.anchor) setCandidate(e.lngLat);
});

function placeDutyMarker(lngLat, label, popupHtml, zoom) {
  clearCandidate();
  if (state.anchor2 || state.placing2) removeAnchor2();
  state.anchor = { lng: lngLat[0], lat: lngLat[1], label };
  if (dutyMarker) dutyMarker.remove();
  dutyMarker = new maplibregl.Marker({ color: "#c9a227", draggable: true })
    .setLngLat(lngLat)
    .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(popupHtml))
    .addTo(map);
  dutyMarker.on("dragend", () => {
    const p = dutyMarker.getLngLat();
    state.anchor = { lng: p.lng, lat: p.lat, label };
    scheduleFairZone();
    if (state.candidate) routeToCandidate();
  });
  $("commute-card").hidden = false;
  $("schools-card").hidden = false;
  schoolsPlaceholder();
  map.flyTo({ center: lngLat, zoom });
  dutyMarker.togglePopup();
  scheduleFairZone();
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

  // Listing links target the commute-checked spot when one is selected,
  // otherwise the duty station area.
  const searchZip = state.candidateZip ?? state.zip;
  const p = placeForZip(searchZip);
  $("search-area-note").textContent = state.candidateZip
    ? `Searching around ${p ? `${p.city}, ${p.st} ` : ""}${searchZip} — your selected spot on the map.`
    : `Searching around your duty area (${searchZip}). Tap the map on a neighborhood to search there instead.`;

  let zillow = `https://www.zillow.com/homes/for_rent/${searchZip}_rb/`;
  if (beds !== "0") zillow += `${beds}-_beds/`;
  if (baths !== "0") zillow += `${baths}-_baths/`;
  if (budget > 0) zillow += `0-${budget}_mp/`;
  $("link-zillow").href = zillow;

  // Apartments.com needs a city-state-zip slug (bare ZIP paths 404).
  const aptParts = [];
  if (beds !== "0") aptParts.push(`min-${beds}-bedrooms`);
  if (budget > 0) aptParts.push(`under-${budget}`);
  $("link-apartments").href = p
    ? `https://www.apartments.com/${p.city.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${p.st.toLowerCase()}-${searchZip}/${aptParts.length ? aptParts.join("-") + "/" : ""}`
    : "https://www.apartments.com/";

  // MilitaryByOwner's real search URLs are /{state}/homes-in-{zip}/?LsType=R
  // (found via their GetAutoURL endpoint; the /homes?location= guess showed
  // an empty page).
  $("link-mbo").href = p
    ? `https://www.militarybyowner.com/${p.st.toLowerCase()}/homes-in-${searchZip}/?LsType=R`
    : "https://www.militarybyowner.com/";
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
$("iso-min").addEventListener("input", () => {
  $("iso-min-label").textContent = $("iso-min").value;
  scheduleFairZone();
});
$("add-anchor2").addEventListener("click", () => {
  if (state.anchor2) {
    removeAnchor2();
  } else {
    state.placing2 = !state.placing2;
    $("add-anchor2").textContent = state.placing2
      ? "Now click the map at the second workplace…"
      : "+ Add second workplace (spouse)";
  }
});

Promise.all([loadBahData(2026), loadPlaces(), loadInstallations()])
  .then(([y]) => { $("data-year").textContent = y; recalc(); })
  .catch((e) => { $("bah-card").insertAdjacentHTML("beforeend", `<p class="hint">Failed to load data: ${e.message}</p>`); });
