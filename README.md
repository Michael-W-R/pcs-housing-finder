# PCS Housing Finder

BAH-smart rental search for military Service Members and Families during PCS moves.

**Phase 1 (current):** BAH calculator on a map — official DoD rates by ZIP, pay grade, and
dependency status, with a rent-budget slider (% of BAH or $ offset) and pre-filtered links
to major listing sites.

**Planned:** road-distance & commute isochrones from the installation, dual-workplace
"fair commute" midpoint search, school ratings, congestion-aware commute times, and live
in-app rental listings.

## Stack

No build step. Plain HTML/CSS/JS modules + [MapLibre GL](https://maplibre.org/) with
OpenStreetMap tiles. Python powers the data pipeline. Deploys as a static site
(GitHub Pages / Cloudflare Pages).

## Data

- **BAH rates** — official DTMO ASCII files from
  [travel.dod.mil](https://www.travel.dod.mil/Allowances/Basic-Allowance-for-Housing/BAH-Rate-Lookup/)
  (US Government work, public domain). Annual refresh:
  drop the new `BAH-ASCII-<year>.zip` contents into `data/raw/`, then run
  `py tools/build_bah_data.py <yy>`.
- **ZIP ↔ city/coordinates** — [GeoNames postal data](https://download.geonames.org/export/zip/)
  (CC BY 4.0, attribution in the site footer). Refresh: re-download `US.zip` into
  `data/raw/`, extract `US.txt`, then run `py tools/build_places_data.py`.
  Powers city autocomplete, offline map centering, and listing-site URL slugs.

## Run locally

Any static file server over `web/`, e.g.: `py -m http.server 8080 -d web`

## Disclaimer

Not affiliated with or endorsed by the Department of Defense. Verify BAH amounts with
your servicing finance office.
