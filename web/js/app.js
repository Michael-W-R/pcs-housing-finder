import { loadBahData, lookupBah } from "./bah.js";

const $ = (id) => document.getElementById(id);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const state = { bah: null, zip: null, mode: "pct", pct: 100, offset: 0 };

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

function setMode(mode) {
  state.mode = mode;
  $("mode-pct").classList.toggle("active", mode === "pct");
  $("mode-usd").classList.toggle("active", mode === "usd");
  const s = $("budget-slider");
  if (mode === "pct") {
    s.min = 70; s.max = 130; s.step = 1; s.value = state.pct;
    $("scale-lo").textContent = "70%";
    $("scale-mid").textContent = "100% = BAH";
    $("scale-hi").textContent = "130%";
  } else {
    s.min = -600; s.max = 600; s.step = 25; s.value = state.offset;
    $("scale-lo").textContent = "-$600";
    $("scale-mid").textContent = "$0 = BAH";
    $("scale-hi").textContent = "+$600";
  }
  render();
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

loadBahData(2026)
  .then((y) => { $("data-year").textContent = y; recalc(); })
  .catch((e) => { $("bah-card").insertAdjacentHTML("beforeend", `<p class="hint">Failed to load BAH data: ${e.message}</p>`); });
