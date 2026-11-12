#!/usr/bin/env python3
"""Сборка слоёв местности Валенсии для игры из контрольных контуров.

⚠️ v13.183: слои больше НЕ сводятся к «гекс такой-то». Они остаются зонами
   (полигонами) в координатах картинки:

     maps/valencia_layers.json — зоны высот 15/30/45 м, лес, кусты, болота,
                                  вода и полилинии дороги;
     maps/valencia_terrain.json — стартовая местность гексов (для подложки,
                                  редактора и совместимости); поле level больше
                                  не пишется — высоты берутся из зон.

   Зоны применяются к переходу с запасом: гекс не помечается «ур. 2» целиком,
   правило действует, только когда зона действительно накрывает переход (плюс
   допуск на неточность контуров). Поэтому границы высот и болот в игре ведут
   себя как на исходной карте, а не как ступеньки по гексам.

Запуск: python3 tools/build_valencia_terrain.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTOURS = ROOT / 'docs/terrain-review/valencia/contours.review.json'
TERRAIN = ROOT / 'maps/valencia_terrain.json'
BACKUP = ROOT / 'maps/valencia_terrain.old.json'
OUT_LAYERS = ROOT / 'maps/valencia_layers.json'
OUT_ROADS = ROOT / 'maps/valencia_roads.json'

REMOVED = {'12,1', '12,3', '12,5', '12,7', '12,9', '12,11', '12,13'} | {
    f'{c},14' for c in range(13)
}

# ⚡ допуск применения зоны к переходу: переход (середина ребра между центрами
#    гексов) должен попасть в зону с запасом 10 px картинки (~±6 px — точность
#    контуров). Без запаса зона «дышит» на границе и правила скачут.
TRANSFER_TOLERANCE = 10.0


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
    if not BACKUP.exists():
        BACKUP.write_text(TERRAIN.read_text(encoding='utf-8'), encoding='utf-8')
        print(f'backup -> {BACKUP.name}')

    layers = {l['id']: l['polygons'] for l in j['layers']}
    centers = {f"{c['col']},{c['row']}": c for c in j['centers']}
    road_hexes = set()
    for a, b in j['road']['edges']:
        road_hexes.add(a)
        road_hexes.add(b)

    # ── 1. Стартовая местность гексов: только базовая подложка ───────────────
    #    Высоты, лес и болота больше не «зашиты» в гекс — они приходят из зон.
    out = {}
    for row in range(15):
        for col in range(20):
            key = f'{col},{row}'
            if key in REMOVED:
                continue
            c = centers.get(key)
            if c is None:
                # Область за картинкой (столбцы 13-19): зон там нет — открытая
                # местность. Прежние типы не тащим: они были ступеньками гексов.
                out[key] = {'types': ['grass'], 'markers': []}
                continue
            x, y = c['x'], c['y']
            types = []
            if key in road_hexes:
                types.append('road')
            types.append('grass')
            out[key] = {'types': types, 'markers': []}

    # ── 2. Зоны в координатах картинки ───────────────────────────────────────
    zones = {}
    for lid in ['height1', 'height2', 'height3', 'forest', 'bushes',
                'swamp_passable', 'swamp_impassable', 'water']:
        polys = []
        for p in layers[lid]:
            pts = [[round(float(px), 2), round(float(py), 2)]
                   for px, py in p['points']]
            if len(pts) >= 3:
                polys.append({'id': p.get('id'), 'points': pts})
        zones[lid] = polys

    payload = {
        'version': 1,
        'status': 'used-by-game-rules-not-drawn',
        'note': 'Зоны местности Валенсии в координатах maps/Валенсия.png. '
                'Отображать игроку не нужно: слои видны на самой подложке, '
                'а данные применяются только в правилах.',
        'imageSize': j['imageSize'],
        'coordinateSystem': j['coordinateSystem'],
        'hexSpanMeters': j['hexSpanMeters'],
        'elevationStepMeters': j['elevationStepMeters'],
        'gameTransform': j['gameTransform'],
        'transferTolerancePixels': TRANSFER_TOLERANCE,
        'layers': zones,
        'road': {
            'kind': j['road'].get('kind'),
            'paths': j['road']['paths'],
            'edges': [list(e) for e in j['road']['edges']]
        },
    }
    OUT_LAYERS.write_text(json.dumps(payload, ensure_ascii=False,
                                    separators=(',', ':')), encoding='utf-8')
    OUT_ROADS.write_text(json.dumps({'edges': [list(e) for e in j['road']['edges']]},
                                    ensure_ascii=False, indent=1), encoding='utf-8')
    TERRAIN.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')

    from collections import Counter
    print(f'layers: {sum(len(v) for v in zones.values())} polygons -> '
          f'{OUT_LAYERS.name} ({OUT_LAYERS.stat().st_size // 1024} KB)')
    for lid, polys in zones.items():
        print(f'  {lid:18s} {len(polys):2d} зон')
    print(f'terrain: {len(out)} гексов -> {TERRAIN.name}')
    print('types:', dict(Counter(t for v in out.values() for t in v['types'])))
    print(f'roads: {len(payload["road"]["edges"])} edges -> {OUT_ROADS.name}')


if __name__ == '__main__':
    main()
