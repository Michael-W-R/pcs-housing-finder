import { loadBahData, lookupBah } from "./bah.js";

const $ = (id) => document.getElementById(id);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const state = {
  bah: null, zip: null, mode: "pct", pct: 100, offset: 0,
  range: { pct: [70, 130], usd: [-600, 600] },
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

async function centerOnZip(zip, label) {
  try {
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!r.ok) return;
    const j = await r.json();
    const place = j.places?.[0];
    if (!place) return;
    const lngLat = [parseFloat(place.longitude), parseFloat(place.latitude)];
    if (marker) marker.remove();
    marker = new maplibregl.Marker({ color: "#c9a227" })
      .setLngLat(lngLat)
      .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(
        `<strong>${place["place name"]}, ${place["state abbreviation"]} ${zip}</strong><br>${label}`))
      .addTo(map);
    map.flyTo({ center: lngLat, zoom: 10 });
    marker.togglePopup();
  } catch { /* map centering is best-effort */ }
}

// --- Calculator --------------------------------------------------------
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

  $("link-zillow").href = `https://www.zillow.com/homes/for_rent/${state.zip}_rb/`;
  $("link-apartments").href = `https://www.apartments.com/${state.zip}/`;
  $("link-mbo").href = `https://www.militarybyowner.com/homes?type=rent&location=${state.zip}`;
}

function recalc() {
  const zip = $("zip").value.trim();
  const grade = $("grade").value;
  const withDep = document.querySelector('input[name="dep"]:checked').value === "w";
  const result = /^\d{5}$/.test(zip) ? lookupBah(zip, grade, withDep) : null;

  if (!result) {
    state.bah = null;
    $("mha-line").hidden = true;
    render();
    return;
  }

  const zipChanged = state.zip !== zip;
  state.bah = result.rate;
  state.zip = zip;
  $("mha-line").hidden = false;
  $("mha-name").textContent = result.mha.name;
  $("mha-code").textContent = `(${result.mha.code})`;
  render();
  if (zipChanged) centerOnZip(zip, result.mha.name);
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
$("zip").addEventListener("input", recalc);
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

loadBahData(2026)
  .then((y) => { $("data-year").textContent = y; recalc(); })
  .catch((e) => { $("bah-card").insertAdjacentHTML("beforeend", `<p class="hint">Failed to load BAH data: ${e.message}</p>`); });
