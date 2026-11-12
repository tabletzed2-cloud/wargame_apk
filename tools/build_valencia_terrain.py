#!/usr/bin/env python3
"""Build game terrain data for Valencia from review contours.

Reads docs/terrain-review/valencia/contours.review.json and writes:
  maps/valencia_terrain.json  — per-hex {types, markers, level} (280 keys,
                                removed hexes omitted like the old file)
  maps/valencia_roads.json    — road edge list (27 connections)

For hexes without a contour center (off-image area, cols 13-19) the old
valencia_terrain.json entry is kept. Old file is backed up to
maps/valencia_terrain.old.json (only if backup does not exist yet).

Run: python3 tools/build_valencia_terrain.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTOURS = ROOT / 'docs/terrain-review/valencia/contours.review.json'
OLD = ROOT / 'maps/valencia_terrain.json'
BACKUP = ROOT / 'maps/valencia_terrain.old.json'
OUT_TERRAIN = ROOT / 'maps/valencia_terrain.json'
OUT_ROADS = ROOT / 'maps/valencia_roads.json'

REMOVED = {'12,1', '12,3', '12,5', '12,7', '12,9', '12,11', '12,13'} | {
    f'{c},14' for c in range(13)
}


def pip(x, y, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1) + x1):
            inside = not inside
    return inside


def in_any(x, y, polys):
    return any(pip(x, y, p['points']) for p in polys)


def main():
    j = json.loads(CONTOURS.read_text(encoding='utf-8'))
    old = json.loads(OLD.read_text(encoding='utf-8'))
    if not BACKUP.exists():
        BACKUP.write_text(OLD.read_text(encoding='utf-8'), encoding='utf-8')
        print(f'backup -> {BACKUP.name}')
    else:
        print(f'backup exists, kept: {BACKUP.name}')

    layers = {l['id']: l['polygons'] for l in j['layers']}
    centers = {f"{c['col']},{c['row']}": c for c in j['centers']}
    road_hexes = set()
    for a, b in j['road']['edges']:
        road_hexes.add(a)
        road_hexes.add(b)

    out = {}
    for row in range(15):
        for col in range(20):
            key = f'{col},{row}'
            if key in REMOVED:
                continue
            c = centers.get(key)
            if c is None:
                # Off-image area: keep old entry (or grass).
                if key in old:
                    out[key] = old[key]
                else:
                    out[key] = {'types': ['grass'], 'markers': [], 'level': 0}
                continue
            x, y = c['x'], c['y']
            level = int(c.get('level', 0))
            types = []
            if in_any(x, y, layers['water']):
                types.append('water')
            if in_any(x, y, layers['swamp_impassable']):
                types.append('swamp_impassable')
            if in_any(x, y, layers['swamp_passable']):
                types.append('swamp_passable')
            if level > 0:
                types.append('hill')
            veg = c.get('vegetation', [])
            if 'forest' in veg:
                types.append('forest')
            if 'bushes' in veg:
                types.append('bushes')
            if key in road_hexes:
                types.append('road')
            types.append('grass')
            out[key] = {'types': types, 'markers': [], 'level': level}

    OUT_TERRAIN.write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    roads = {'edges': [list(e) for e in j['road']['edges']]}
    OUT_ROADS.write_text(
        json.dumps(roads, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'terrain: {len(out)} hexes -> {OUT_TERRAIN.name}')
    print(f'roads: {len(roads["edges"])} edges -> {OUT_ROADS.name}')
    from collections import Counter
    print('levels:', dict(Counter(v.get('level', 0) for v in out.values()
                                  if isinstance(v, dict))))
    print('types:', dict(Counter(t for v in out.values()
                                 if isinstance(v, dict) for t in v['types'])))


if __name__ == '__main__':
    main()
