"""Build web/data/places-us.json from GeoNames US postal data in data/raw/US.txt.

Source: https://download.geonames.org/export/zip/US.zip (CC BY 4.0 — attribution
required; see README). Gives every US ZIP a city name, state, and centroid,
which powers city autocomplete, map centering, and listing-site URL slugs.

Run:  py tools/build_places_data.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "US.txt"
OUT = ROOT / "web" / "data" / "places-us.json"


def main() -> None:
    cities: list[str] = []
    city_idx: dict[str, int] = {}
    zips: dict[str, list] = {}

    for line in SRC.read_text(encoding="utf-8").splitlines():
        f = line.split("\t")
        if len(f) < 11:
            continue
        zip_code, city, st = f[1], f[2], f[4]
        if not (zip_code.isdigit() and len(zip_code) == 5 and city and st):
            continue
        try:
            lat, lng = round(float(f[9]), 3), round(float(f[10]), 3)
        except ValueError:
            continue
        key = f"{city}|{st}"
        if key not in city_idx:
            city_idx[key] = len(cities)
            cities.append(key)
        zips[zip_code] = [city_idx[key], lat, lng]

    OUT.write_text(json.dumps({"cities": cities, "zip": zips}, separators=(",", ":")))
    print(f"{OUT}: {len(zips)} ZIPs, {len(cities)} distinct city-state pairs, "
          f"{OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
