"""Build web/data/installations.json from the Census TIGER military areas DBF.

Source: https://www2.census.gov/geo/tiger/TIGER2025/MIL/tl_2025_us_mil.zip
(US Census Bureau TIGER/Line, public domain). Each record's internal point
(INTPTLAT/INTPTLON) is the installation anchor; state comes from the nearest
GeoNames ZIP centroid. ALAND is kept so the UI can rank big bases first.

Run:  py tools/build_installations.py
"""
import json
import math
import struct
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DBF = ROOT / "data" / "raw" / "tl_2025_us_mil.dbf"
GEONAMES = ROOT / "data" / "raw" / "US.txt"
OUT = ROOT / "web" / "data" / "installations.json"


def read_dbf(path: Path):
    buf = path.read_bytes()
    n_rec, hdr_len, rec_len = struct.unpack("<IHH", buf[4:12])
    fields, off = [], 32
    while buf[off] != 0x0D:
        fields.append((buf[off:off + 11].rstrip(b"\x00").decode(), buf[off + 16]))
        off += 32
    pos = hdr_len
    for _ in range(n_rec):
        rec, o, row = buf[pos + 1:pos + rec_len], 0, {}
        for name, ln in fields:
            row[name] = rec[o:o + ln].decode("latin1").strip()
            o += ln
        pos += rec_len
        yield row


def zip_grid():
    grid = defaultdict(list)
    for line in GEONAMES.read_text(encoding="utf-8").splitlines():
        f = line.split("\t")
        if len(f) < 11 or not f[4]:
            continue
        try:
            lat, lng = float(f[9]), float(f[10])
        except ValueError:
            continue
        grid[(int(lat), int(lng))].append((lat, lng, f[4]))
    return grid


def nearest_state(grid, lat, lng):
    best, best_d = None, math.inf
    for di in (0, 1, -1, 2, -2):
        for dj in (0, 1, -1, 2, -2):
            for zlat, zlng, st in grid.get((int(lat) + di, int(lng) + dj), ()):
                d = (zlat - lat) ** 2 + ((zlng - lng) * math.cos(math.radians(lat))) ** 2
                if d < best_d:
                    best, best_d = st, d
        if best is not None and abs(di) >= 1:
            break
    return best


def main() -> None:
    grid = zip_grid()
    seen: dict[tuple, dict] = {}
    for row in read_dbf(DBF):
        name = row["FULLNAME"]
        if not name:
            continue
        try:
            lat = float(row["INTPTLAT"])
            lng = float(row["INTPTLON"])
            aland = int(row["ALAND"] or 0)
        except ValueError:
            continue
        st = nearest_state(grid, lat, lng) or ""
        key = (name, st)
        if key not in seen or aland > seen[key]["a"]:
            seen[key] = {"n": name, "s": st, "lat": round(lat, 4), "lng": round(lng, 4), "a": aland}

    out = sorted(seen.values(), key=lambda x: -x["a"])
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"{OUT}: {len(out)} installations, {OUT.stat().st_size / 1024:.0f} KB")
    for x in out[:8]:
        print(f"  {x['n']}, {x['s']}  ({x['a'] / 2.59e6:.0f} sq mi)")


if __name__ == "__main__":
    main()
