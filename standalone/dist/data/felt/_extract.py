#!/usr/bin/env python3
"""Download a public Felt map and emit one GeoJSON file per Group (layer)."""
import json, re, html, sys, os, urllib.request, unicodedata

URL = sys.argv[1] if len(sys.argv) > 1 else \
    "https://felt.com/map/Bucht-der-Traumer-Lageplan-3Y9BfZ03mRm9BPJ1Z6mdkabB"
OUT = sys.argv[2] if len(sys.argv) > 2 else "./felt_layers"
os.makedirs(OUT, exist_ok=True)

req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
page = urllib.request.urlopen(req).read().decode("utf-8")
m = re.search(r'<div id="felt-data"[^>]*>\s*(.+?)\s*</div>', page, re.S)
data = json.loads(html.unescape(m.group(1)))
elements = data["karta"]["elements"]

# lat,lng -> lng,lat (GeoJSON convention)
def swap(pt):
    return [pt[1], pt[0]]

def ring(r):
    return [swap(p) for p in r]

def to_feature(e):
    t = e.get("type")
    props = {k: e.get(k) for k in
             ("id", "text", "symbol", "description", "color", "type",
              "parentId", "radius", "rotation")}
    geom = None
    coords = e.get("coordinates")
    pos = e.get("position")

    if t == "Rectangle" and coords:
        # coords: [ [ [lat,lng], ... ] ] — one ring
        geom = {"type": "Polygon", "coordinates": [ring(r) for r in coords]}
    elif t == "Polygon" and coords:
        # coords: [ [ [ [lat,lng], ... ] ] ] — polygons > rings > points
        geom = {"type": "MultiPolygon",
                "coordinates": [[ring(r) for r in poly] for poly in coords]}
    elif t == "Path" and coords:
        # coords: [ [ [lat,lng], ... ] ] — one or more lines
        if len(coords) == 1:
            geom = {"type": "LineString", "coordinates": ring(coords[0])}
        else:
            geom = {"type": "MultiLineString",
                    "coordinates": [ring(r) for r in coords]}
    elif t == "Circle" and coords and len(coords) == 2:
        # coords: [lat, lng]; radius in meters
        geom = {"type": "Point", "coordinates": swap(coords)}
        props["_shape"] = "circle"
    elif t in ("Marker", "Text", "Note") and pos:
        geom = {"type": "Point", "coordinates": swap(pos)}
    elif t == "Marker" and coords:
        # coords is [[[lat,lng] * n]] with all points equal
        first = coords[0][0]
        geom = {"type": "Point", "coordinates": swap(first)}
    elif t == "Place" and pos:
        geom = {"type": "Point", "coordinates": swap(pos)}

    if geom is None:
        return None
    return {"type": "Feature", "geometry": geom, "properties": props}

groups = {e["id"]: e for e in elements if e["type"] == "Group"}
buckets = {gid: [] for gid in groups}
buckets["_ungrouped"] = []

skipped = 0
for e in elements:
    if e["type"] == "Group":
        continue
    f = to_feature(e)
    if not f:
        skipped += 1
        continue
    pid = e.get("parentId")
    buckets.setdefault(pid or "_ungrouped", []).append(f)

def slug(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower() or "layer"

written = []
for gid, feats in buckets.items():
    if not feats:
        continue
    name = groups[gid]["text"] if gid in groups else "ungrouped"
    fname = f"{slug(name)}.geojson"
    fc = {"type": "FeatureCollection", "name": name, "features": feats}
    path = os.path.join(OUT, fname)
    with open(path, "w") as f:
        json.dump(fc, f, ensure_ascii=False)
    written.append((name, len(feats), path))

print(f"skipped {skipped} elements without renderable geometry")
for name, n, p in written:
    print(f"{n:4d} features  {name!r:40s} -> {p}")
