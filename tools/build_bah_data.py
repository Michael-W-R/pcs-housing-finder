"""Build web/data/bah-<year>.json from the DTMO BAH ASCII files in data/raw.

Source: https://www.travel.dod.mil/Allowances/Basic-Allowance-for-Housing/BAH-Rate-Lookup/
("All BAH Rates" download, ASCII file type). Files are US-government works (public domain).

Run:  py tools/build_bah_data.py 26
"""
import json
import sys
from pathlib import Path

GRADES = [
    "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9",
    "W1", "W2", "W3", "W4", "W5",
    "O1E", "O2E", "O3E",
    "O1", "O2", "O3", "O4", "O5", "O6", "O7", "O8", "O9", "O10",
]

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "data"


def parse_rates(path: Path) -> dict:
    rates = {}
    for line in path.read_text().splitlines():
        parts = line.strip().split(",")
        if len(parts) != len(GRADES) + 1:
            continue
        rates[parts[0]] = [float(x) for x in parts[1:]]
    return rates


def main(yy: str) -> None:
    with_dep = parse_rates(RAW / f"bahw{yy}.txt")
    without_dep = parse_rates(RAW / f"bahwo{yy}.txt")

    names = {}
    for line in (RAW / f"mhanames{yy}.txt").read_text().splitlines():
        if ";" in line:
            mha, name = line.strip().split(";", 1)
            names[mha] = name.strip().title()

    zip_to_mha = {}
    for line in (RAW / f"sorted_zipmha{yy}.txt").read_text().splitlines():
        parts = line.split()
        if len(parts) == 2:
            zip_to_mha[parts[0]] = parts[1]

    out = {
        "year": 2000 + int(yy),
        "source": "DTMO BAH ASCII files (travel.dod.mil)",
        "grades": GRADES,
        "mha": {
            m: {"name": names.get(m, m), "w": with_dep[m], "wo": without_dep.get(m, [])}
            for m in sorted(with_dep)
        },
        "zip": zip_to_mha,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"bah-{out['year']}.json"
    dest.write_text(json.dumps(out, separators=(",", ":")))
    print(f"{dest}: {len(with_dep)} MHAs, {len(zip_to_mha)} ZIPs, {dest.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "26")
