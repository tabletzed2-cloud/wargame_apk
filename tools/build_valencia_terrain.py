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
import heapq
import json
import math
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



# ═══════════════════════════════════════════════════════════════════════════
# ⚡ v13.183: ДОРОГА ИДЁТ ПО ГЕКСАМ, А НЕ «ПРЫГАЕТ» ЧЕРЕЗ РЯД.
#
#    Прежний метод брал ближайший центр гекса к точке дороги. Дорога вдоль
#    побережья идёт почти по границе рядов 8 и 9, поэтому ближайший центр
#    перескакивал через ряд, и связь получалась зигзагом:
#        9,8 → 9,9 → 10,8 → 10,9 → 11,8 …
#    Хотя на карте дорога тянется ровно через 9,8 → 10,8 → 11,8 → 12,8.
#
#    Теперь это поиск пути по сетке гексов: цена шага — насколько гекс далёк от
#    русла дороги (расстояние от центра гекса до линии дороги) плюс единица за
#    сам переход. Дорога выбирает ряд гексов, которые она реально пересекает,
#    а не прыгает по ближайшим центрам.
# ═══════════════════════════════════════════════════════════════════════════
ROAD_STEP_COST = 1.0        # цена перехода между гексами (в пикселях картинки)


def _hex_neighbors(key, centers_map):
    col, row = (int(v) for v in key.split(','))
    odd = row % 2
    cands = [(col + 1, row), (col - 1, row), (col, row + 1), (col, row - 1)]
    cands += ([(col + 1, row + 1), (col + 1, row - 1)] if odd
              else [(col - 1, row + 1), (col - 1, row - 1)])
    return [f'{c},{r}' for c, r in cands if f'{c},{r}' in centers_map]


def _point_segment_distance(p, a, b):
    (px, py), (ax, ay), (bx, by) = p, a, b
    vx, vy = bx - ax, by - ay
    length2 = vx * vx + vy * vy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / length2))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def _polyline_distance(point, path):
    return min(_point_segment_distance(point, path[i], path[i + 1])
               for i in range(len(path) - 1))


def road_chains(paths, centers, game_transform, image_size):
    """Полилинии дороги на картинке → цепочки гексов по сетке."""
    centers_map = {f"{c['col']},{c['row']}": (c['x'], c['y']) for c in centers}
    # «тепловая карта»: насколько центр каждого гекса далёк от русла дороги
    off_road = {k: min(_polyline_distance(pt, path) for path in paths)
                for k, pt in centers_map.items()}
    chains = []
    for path in paths:
        start = min(centers_map, key=lambda k: (centers_map[k][0] - path[0][0]) ** 2
                                                 + (centers_map[k][1] - path[0][1]) ** 2)
        goal = min(centers_map, key=lambda k: (centers_map[k][0] - path[-1][0]) ** 2
                                                + (centers_map[k][1] - path[-1][1]) ** 2)
        best = {start: 0.0}
        previous = {}
        queue = [(0.0, start)]
        while queue:
            cost, current = heapq.heappop(queue)
            if cost > best.get(current, float('inf')):
                continue
            if current == goal:
                break
            for neighbour in _hex_neighbors(current, centers_map):
                new_cost = cost + off_road[neighbour] + ROAD_STEP_COST
                if new_cost < best.get(neighbour, float('inf')):
                    best[neighbour] = new_cost
                    previous[neighbour] = current
                    heapq.heappush(queue, (new_cost, neighbour))
        if goal != start and goal not in previous:
            continue
        chain = [goal]
        while chain[-1] != start:
            chain.append(previous[chain[-1]])
        chains.append(chain[::-1])
    edges = set()
    for chain in chains:
        for a, b in zip(chain, chain[1:]):
            edges.add(tuple(sorted([a, b])))
    return chains, [list(e) for e in sorted(edges)]


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
    # ⚡ v13.183: дорога — цепочкой гексов по геометрии (без зигзага через ряд).
    chains, road_edges = road_chains(j['road']['paths'], j['centers'],
                                     j['gameTransform'], j['imageSize'])
    road_hexes = set()
    for a, b in road_edges:
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
            'chains': chains,
            'edges': road_edges
        },
    }
    OUT_LAYERS.write_text(json.dumps(payload, ensure_ascii=False,
                                    separators=(',', ':')), encoding='utf-8')
    OUT_ROADS.write_text(json.dumps({'edges': road_edges, 'chains': chains},
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
