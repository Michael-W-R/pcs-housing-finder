# Styling & Formatting Reference Guide

How and where to change the look, text, and layout of PCS Housing Finder.

There is **no build step**: edit a file, refresh the browser, and the change is
live. Push to `main` and the public site updates itself about 20 seconds later.

---

## The three files that control appearance

| File | Controls |
|------|----------|
| `web/css/style.css` | Nearly all colors, fonts, spacing, sizes, layout |
| `web/index.html` | Text labels, card titles/order, hints, footer, page title |
| `web/js/app.js` | Map-drawn colors only (markers, route line, shaded zone, school dots) |

> ⚠️ **Safe vs. risky edits:** changing *values* (a color, a size, a label) is
> always safe. Renaming an `id="..."` or `class="..."` in the HTML is risky —
> the JavaScript finds elements by those names (`$("bah-amount")` etc.), so a
> rename breaks features unless the JS is updated to match.

---

## 1. Colors — start here

Almost every color on the page comes from the design tokens at the **top of
`web/css/style.css`**. Change a token once and it updates everywhere:

```css
:root {
  --navy: #1b2a41;      /* header bar, headings, buttons, big numbers */
  --navy-deep: #12203a; /* text on gold (the "PCS" brand chip) */
  --gold: #c9a227;      /* brand chip, focus rings, slider accents */
  --gold-soft: #e8d48b; /* BASE badge background in search suggestions */
  --paper: #f7f6f2;     /* page background */
  --ink: #22252a;       /* body text */
  --muted: #6b7280;     /* hint text, captions, secondary labels */
  --line: #e2e0d8;      /* card borders, dividers */
  --good: #2e7d32;      /* green "money left over" message */
  --warn: #b4530a;      /* orange "out of pocket" message */
}
```

**Exception — colors drawn on the map** live in `web/js/app.js` because the map
engine doesn't read CSS. Search the file for these hex values:

| Element | Where in `app.js` | Current value |
|---------|-------------------|---------------|
| Duty-station marker (gold pin) | `placeDutyMarker` → `color:` | `#c9a227` |
| Candidate-spot marker (dark pin) | `setCandidate` → `color:` | `#1b2a41` |
| Second-workplace marker (olive pin) | `placeAnchor2` → `color:` | `#556b2f` |
| Commute route line | `drawRoute` → `line-color` | `#1b2a41` |
| Fair-commute shaded zone | `drawFairZone` → `fill-color` / `fill-opacity` | `#c9a227` at `0.18` |
| School dots (E/M/H/other) | `drawSchoolDots` → the `match` list | `#2e7d32` `#b4530a` `#6d28d9` `#607d8b` |

The school-dot colors also appear in `style.css` as `.lv-E` / `.lv-M` / `.lv-H`
/ `.lv-C` (the colored bullets in the schools list) — **change both places** to
keep dots and list in sync.

---

## 2. Text and labels

All user-facing words are in `web/index.html`. Nothing is generated — search
for the text you see on screen and edit it.

| What | Where in `index.html` |
|------|----------------------|
| Browser-tab title & search-engine description | `<title>` and `<meta name="description">` |
| Site name ("PCS" chip + "Housing Finder") | `.brand-mark` and `.brand-name` in the `<header>` |
| Tagline | `.tagline` (hidden on phones) |
| Card titles ("1 · Your BAH" …) | Each `<h2>` inside a `<section class="card">` |
| Gray helper sentences | `<p class="hint">` elements |
| Pay-grade list | The `<select id="grade">` options |
| Bedrooms/bathrooms options | `<select id="beds">` / `<select id="baths">` |
| Footer/disclaimer | `<footer class="panel-footer">` |

Messages that change with app state (e.g. *"$187/mo of BAH left…"*, *"Shaded:
within 30 min drive of BOTH workplaces"*, the search-area note) are built in
`web/js/app.js` — search for a distinctive word from the message.

**Renaming the whole site** (when you pick a domain): edit the `<title>`, brand
chip, and tagline in `index.html`, plus the first line of `README.md`.

---

## 3. Fonts and text sizes

- **Font family:** the `body` rule in `style.css` —
  `font-family: "Public Sans", "Segoe UI", system-ui, sans-serif;`
  To use a Google Font, add its `<link>` tag to `index.html`'s `<head>` and put
  the font's name first in that list.
- **Sizes:** set per element in `style.css` in `rem` (1rem = 16px). Notable ones:
  `.bah-amount` (2.1rem — the big BAH number), `.budget-amount` (1.9rem),
  `.commute-main` (1.35rem), `.card h2` (1rem), `.hint` (0.8rem).
- Keep form inputs at `1rem`/16px or larger — smaller makes iPhones auto-zoom
  on focus.

---

## 4. Layout and spacing

All in `web/css/style.css`:

| What | Rule | Current |
|------|------|---------|
| Sidebar width (desktop) | `.panel` → `width` | `380px` |
| Card look (corners, border, shadow) | `.card` | `border-radius: 10px` etc. |
| Gap between cards | `.panel` → `gap` | `1rem` |
| Card internal padding | `.card` → `padding` | `1rem 1.1rem` |
| Map height on phones | `#map` inside the `@media` block | `42dvh` |
| Phone/desktop breakpoint | `@media (max-width: 800px)` | `800px` |

The `@media (max-width: 800px)` block at the bottom of the file is the entire
mobile layout — map pinned on top, cards scrolling beneath. Larger touch
targets and phone-only sizes live there too.

Card **order** on the page = the order of `<section class="card">` blocks in
`index.html`. Reorder the blocks to reorder the page (update the `1 ·` `2 ·`
numbers in the titles by hand).

---

## 5. Behavior defaults (not styling, but next to it)

In `web/js/app.js` unless noted:

| Default | Where |
|---------|-------|
| Budget slider starting ranges (70–130%, ±$600) | `state.range` at the top |
| Drive-time slider default (30 min) and bounds (10–60) | the `<input id="iso-min">` in `index.html` |
| Map starting view (center of US, zoom 4) | the `new maplibregl.Map` call |
| Zoom level after picking a location (10) | `centerOnZip` calls |
| Default pay grade (E-5) | the `selected` attribute in `index.html` |
| BAH data year | `loadBahData(2026)` at the bottom |

---

## 6. Map basemap (the map's whole look)

The map uses free OpenStreetMap raster tiles, set in the `style:` block of the
`new maplibregl.Map(...)` call in `app.js`. To change the basemap, replace the
`tiles:` URL with another provider (e.g. a free key from MapTiler or Stadia
gives cleaner, more modern basemaps) and update `attribution` to match the
provider's requirement. Everything drawn on top (markers, zones, routes) is
unaffected.

---

## 7. Workflow

1. Edit files under `web/`.
2. Preview locally: `py -m http.server 8321 -d web` → http://localhost:8321
   (hard-refresh with **Ctrl+F5** if a change doesn't appear).
3. Publish:
   ```
   git add -A
   git commit -m "describe the change"
   git push
   ```
   GitHub Actions redeploys the live site automatically (~20 s). The public
   site caches for up to 10 minutes — refresh again if you don't see it.

Or simply describe the change to Claude in a session — every tweak above is a
one-line request.
