# PCS Scout — Project Overview (ASWF Portfolio Summary)

PCS Scout is a public-facing tool I built to help Service Members and Families quickly identify rental options during PCS moves. I created this project end-to-end -- from concept, design, and data modeling to front-end development and deployment -- to demonstrate my ability to build intuitive, mission-focused digital products that solve real problems for Service Members and Families.

## Why I Built It
PCS moves are stressful, and Families often struggle to find reliable rental information near their gaining duty station. Existing tools are fragmented across multiple commercial sites. PCS Scout consolidates key information into a single, clean interface that is easy to use on both desktop and mobile.

## What It Does
PCS Scout delivers a comprehensive, BAH‑smart rental search experience tailored specifically for military Service Members and Families navigating PCS moves. Core capabilities include:

-Location‑based rental search using ZIP code, installation, or city
-Interactive BAH visualization showing official DoD rates by ZIP, pay grade, and dependency status
--Pin‑drop commute estimation for a Service Member’s workplace
-Dual‑commute mapping for spouse or Family member employment locations
-School proximity insights, displaying the two closest elementary, middle, and high schools with direct links to GreatSchools reviews
-Pre‑filtered rental listings from major housing platforms
-BAH‑based budget filtering, allowing users to adjust by percentage or dollar amount to refine affordability
-Realistic housing expectation tools that help Families understand commute times, school options, and rental affordability before arrival

## My Role
I designed, developed, and deployed the entire project:
- UI/UX design and workflow mapping  
- Front-end development (HTML/CSS/JS)  
- Data pipeline creation (Python)  
- Hosting and domain configuration  
- Continuous iteration based on user feedback  

## Why This Matters for ASWF
PCS Scout demonstrates:
- My ability to identify a real Soldier problem  
- My initiative in building a complete solution independently  
- My product design and user experience skills  
- My technical curiosity and willingness to learn new tools  
- My commitment to building solutions that scale beyond a single unit  

----------------------------------------------------------------------------------------
# PCS Scout — [pcsscout.com](https://pcsscout.com)

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

## Docs

- [docs/STYLING.md](docs/STYLING.md) — where every color, label, font, and
  layout value lives, with a cookbook for common changes.
- [docs/GITHUB-PRIMER.md](docs/GITHUB-PRIMER.md) — plain-English guide to how
  this repo, commits, and the auto-deploy pipeline work.

## Run locally

Any static file server over `web/`, e.g.: `py -m http.server 8080 -d web`

## Disclaimer

Not affiliated with or endorsed by the Department of Defense. Verify BAH amounts with
your servicing finance office.
