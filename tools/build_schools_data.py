"""Build per-state school files web/data/schools/<ST>.json from NCES data.

Sources (US Dept. of Education, public domain):
- data/raw/edge_schools.txt  — EDGE geocoded public schools (coordinates)
  https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_2324.zip
- data/raw/ccd_directory.csv — CCD school directory (level, status)
  https://nces.ed.gov/ccd/data/zip/ccd_sch_029_2324_w_1a_073124.zip

Keeps open Elementary/Middle/High/Combined schools. Levels: E, M, H, C.

Run:  py tools/build_schools_data.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDGE = ROOT / "data" / "raw" / "edge_schools.txt"
CCD = ROOT / "data" / "raw" / "ccd_directory.csv"
OUT_DIR = ROOT / "web" / "data" / "schools"

LEVEL_MAP = {"Elementary": "E", "Middle": "M", "High": "H", "Secondary": "H", "Combined": "C"}


def load_ccd():
    info = {}
    with open(CCD, encoding="latin1", newline="") as f:
        for row in csv.DictReader(f):
            if row["SY_STATUS_TEXT"].strip() != "Open":
                continue
            lv = LEVEL_MAP.get(row["LEVEL"].strip())
            if lv:
                info[row["NCESSCH"].strip()] = lv
    return info


def main() -> None:
    levels = load_ccd()
    states = defaultdict(list)
    kept = 0
    for line in EDGE.read_text(encoding="latin1").splitlines():
        f = line.split("|")
        if len(f) < 14:
            continue
        ncessch, name, city, st = f[0], f[2], f[5], f[6]
        lv = levels.get(ncessch)
        if not lv:
            continue
        try:
            lat, lng = round(float(f[12]), 4), round(float(f[13]), 4)
        except ValueError:
            continue
        states[st].append({"n": name, "c": city, "lv": lv, "lat": lat, "lng": lng})
        kept += 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for st, schools in states.items():
        (OUT_DIR / f"{st}.json").write_text(json.dumps(schools, separators=(",", ":")))
    total_kb = sum(p.stat().st_size for p in OUT_DIR.glob("*.json")) / 1024
    print(f"{kept} schools across {len(states)} state files, {total_kb:.0f} KB total")


if __name__ == "__main__":
    main()
