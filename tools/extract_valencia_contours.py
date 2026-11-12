#!/usr/bin/env python3
"""Offline review only. pip install pillow numpy opencv-python-headless.
Input drawings are user-provided; no campaign rules or runtime files are changed.
"""
import argparse
import base64
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LAYERS = [
    ('height1', 'ур.1 горы.png', 'Уровень 1 · 15 м', '#d7b84c', 1),
    ('height2', 'ур.2 горы.png', 'Уровень 2 · 30 м', '#e58137', 2),
    ('height3', 'ур.3 горы.png', 'Уровень 3 · 45 м', '#e34672', 3),
    ('forest', 'лес.png', 'Лес', '#168a47', None),
    ('bushes', 'кусты.png', 'Кусты', '#48c7cc', None),
    ('swamp_passable', 'болото проходимое.png', 'Проходимое болото', '#4aa98f', None),
    ('swamp_impassable', 'болото не проходимое.png', 'Непроходимое болото', '#36aaff', None),
    ('water', 'вода.png', 'Вода', '#5252e8', None),
]


def extract(path):
    rgba = np.array(Image.open(path).convert('RGBA'))
    # Only opaque coloured strokes, not transparent RGB values.
    stroke = ((rgba[:, :, 3] >= 96) & (rgba[:, :, :3].max(axis=2) > 40)).astype('uint8')
    stroke = cv2.morphologyEx(stroke, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    h, w = stroke.shape
    # Snap strokes within 2 pixels of the edge to that edge. Never close an
    # open contour with an interior chord: the image perimeter closes it.
    for y, x in np.argwhere(stroke):
        if x < 2: stroke[y, :x+1] = 1
        if x >= w-2: stroke[y, x:] = 1
        if y < 2: stroke[:y+1, x] = 1
        if y >= h-2: stroke[y:, x] = 1
    barrier = stroke.copy()
    barrier[0, :] = barrier[-1, :] = 1
    barrier[:, 0] = barrier[:, -1] = 1
    n, labels, stats, _ = cv2.connectedComponentsWithStats(1-barrier, 4)
    outside = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    interior = np.zeros_like(stroke)
    for i in range(1, n):
        if i != outside and stats[i, cv2.CC_STAT_AREA] >= 30:
            interior[labels == i] = 1
    # Reattach stroke width only to enclosed interiors (exclude any stray marks).
    filled = interior | (cv2.dilate(interior, np.ones((11, 11), np.uint8)) & stroke)
    # Complete the tiny perimeter strip at regions reaching the image edge.
    for edge, neighbour in [(0, 1), (-1, -2)]:
        filled[edge, :] |= filled[neighbour, :]
        filled[:, edge] |= filled[:, neighbour]
    contours, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polygons = []
    for contour in contours:
        if cv2.contourArea(contour) < 40: continue
        points = cv2.approxPolyDP(contour, 1.5, True)[:, 0, :].tolist()
        polygons.append(points)
    polygons.sort(key=lambda pts: (min(p[1] for p in pts), min(p[0] for p in pts)))
    return polygons, stroke


def road_edges(paths,centers,transform=None,image_size=None):
    """Дорога → цепочки гексов. Логика одна на весь проект (см. build_valencia_terrain)."""
    from build_valencia_terrain import road_chains
    if transform is None:
        transform = {'hexSize': 55,'columns':20,'rows':15,'drawWidth':1191.26,'drawHeight':1196.47}
    if image_size is None:
        image_size = [1184,1170]
    return road_chains(paths, centers, transform, image_size)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('inputs', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT/'docs/terrain-review/valencia')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    base_path = args.inputs/'Валенсия карта для ии.png'
    base = Image.open(base_path).convert('RGB')
    w, h = base.size
    same = np.array_equal(np.array(base), np.array(Image.open(ROOT/'maps/Валенсия.png').convert('RGB')))
    a = cv2.imread(str(base_path), cv2.IMREAD_GRAYSCALE)
    b = cv2.imread(str(ROOT/'maps/Валенсия.png'), cv2.IMREAD_GRAYSCALE)
    orb = cv2.ORB_create(nfeatures=4000)
    ka, da = orb.detectAndCompute(a, None); kb, db = orb.detectAndCompute(b, None)
    matches = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da, db, k=2)
    good = [x for x,y in matches if x.distance < .7*y.distance]
    pa=np.float32([ka[m.queryIdx].pt for m in good]);pb=np.float32([kb[m.trainIdx].pt for m in good])
    homography,inliers=cv2.findHomography(pa,pb,cv2.RANSAC,2)
    corners=np.float32([[[0,0],[w-1,0],[w-1,h-1],[0,h-1]]])
    max_corner_shift=float(np.max(np.linalg.norm(cv2.perspectiveTransform(corners,homography)-corners,axis=2)))
    alignment=dict(method='ORB correspondences + RANSAC homography',matches=len(good),
        inliers=int(inliers.sum()),maxCornerShiftPixels=max_corner_shift,
        meanAbsoluteColorDifference=float(np.abs(np.array(base).astype(float)-np.array(Image.open(ROOT/'maps/Валенсия.png').convert('RGB')).astype(float)).mean()),
        note='Images are not pixel-identical; feature alignment is checked, not assumed.')
    assert alignment['inliers'] > 100 and max_corner_shift < 1, alignment
    # Replicate redrawOperationalMap at zoom=1 (index.html) and data.js settings.
    size, cols, rows = 55, 20, 15
    bw, bh = (cols+.5)*math.sqrt(3)*size, (rows+.5)*1.5*size
    dw, dh = (bh*w/h, bh) if w/h > bw/bh else (bw, bw*h/w)
    fw, fh = dw*.61, dh*.62
    dx, dy = (bw-fw)/2-380, (bh-fh)/2-45
    metadata = dict(status='review-only-not-used-by-game', imageSize=[w,h],
        sourceImageSha256=hashlib.sha256(base_path.read_bytes()).hexdigest(),
        repositoryBackgroundPixelIdentical=same, backgroundAlignment=alignment, hexSpanMeters=300, elevationStepMeters=15,
        coordinateSystem='source-image pixels; origin top-left; closed polygons',
        extraction=dict(alphaThreshold=96, simplifyPixels=1.5, edgeSnapPixels=2,
            estimatedBoundaryUncertaintyPixels=6, outsideRule='largest unfilled component per layer',
            note='Validate manually: stroke widths, edge closures, nested height containment.'),
        gameTransform=dict(hexSize=size, columns=cols, rows=rows, scaleX=.61,scaleY=.62,
            offsetX=-380,offsetY=-45,drawX=dx,drawY=dy,drawWidth=fw,drawHeight=fh,
            note='Current repository scenario defaults, not settings of an individual saved campaign.'), layers=[], centers=[])
    fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    mapfont=ImageFont.truetype(fontpath,16)
    svg_layers=[]
    overlay = base.convert('RGBA')
    extracted={key:extract(args.inputs/filename) for key,filename,*_ in LAYERS}
    for key, filename, title, color, level in LAYERS:
        assert Image.open(args.inputs/filename).size == (w,h), filename
        polygons, stroke = extracted[key]
        record=dict(id=key,title=title,source=filename,color=color,polygons=[])
        if level: record.update(level=level,meters=level*15)
        canvas=Image.new('RGBA',(w,h)); draw=ImageDraw.Draw(canvas)
        elements=[]
        for i, points in enumerate(polygons,1):
            ident=f'{key}-{i:02}'
            rec=dict(id=ident,points=points)
            # Use a distance-transform maximum for an interior label anchor.
            mask=np.zeros((h,w),np.uint8);cv2.fillPoly(mask,[np.array(points,np.int32)],1)
            effective=mask.copy()
            if level:
                for other_key,_,_,_,other_level in LAYERS:
                    if other_level and other_level>level:
                        for higher in extracted[other_key][0]:
                            cv2.fillPoly(effective,[np.array(higher,np.int32)],0)
            _,_,_,anchor=cv2.minMaxLoc(cv2.distanceTransform(effective if effective.any() else mask,cv2.DIST_L2,3))
            rec['labelPoint']=list(anchor)
            record['polygons'].append(rec)
            rgb=tuple(int(color[j:j+2],16) for j in (1,3,5))
            draw.polygon([tuple(p) for p in points],fill=(*rgb,48))
            draw.line([tuple(p) for p in points]+[tuple(points[0])],fill=(*rgb,245),width=3)
            coords=' '.join(f'{x},{y}' for x,y in points)
            if level:
                draw.text(anchor,f'{level*15} м',font=mapfont,fill='white',stroke_width=2,stroke_fill='#17212c',anchor='mm')
            label=f'{level*15}м' if level else {'forest':'Л','bushes':'К','swamp_passable':'БП','swamp_impassable':'БН','water':'В'}.get(key,'')
            elements.append(f'<polygon points="{coords}"><title>{ident}: {title}</title></polygon>')
            elements.append(f'<text class="region-label" x="{anchor[0]}" y="{anchor[1]}">{label}</text>')
        overlay=Image.alpha_composite(overlay,canvas)
        svg_layers.append(f'<g id="{key}" fill="{color}" fill-opacity=".20" stroke="{color}" stroke-width="2.5">'+''.join(elements)+'</g>')
        metadata['layers'].append(record)
    # A road is an open network, never a filled polygon.
    from road_geometry import extract_road
    roads=extract_road(args.inputs/'дорога.png', (w,h))
    metadata['road']=roads
    road_draw=ImageDraw.Draw(overlay)
    paths=[]
    for path in roads['paths']:
        pts=[tuple(p) for p in path]
        if len(pts)<2: continue
        road_draw.line(pts,fill='#20202c',width=8)
        road_draw.line(pts,fill='#ff54cb',width=4)
        paths.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in path)+'"/>')
    svg_layers.append('<g id="road" fill="none" stroke="#ff54cb" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">'+''.join(paths)+'</g>')
    # Non-playable grid cells are deliberately not invented beyond image bounds.
    center_svg=[]
    draw=ImageDraw.Draw(overlay)
    for row in range(rows):
        for col in range(cols):
            gx=(col+(row%2)/2+.5)*math.sqrt(3)*size
            gy=row*1.5*size+size
            x,y=(gx-dx)/fw*w,(gy-dy)/fh*h
            if not(0<=x<w and 0<=y<h): continue
            center=dict(col=col,row=row,x=round(x,3),y=round(y,3))
            elevation=0;vegetation=[]
            for layer in metadata['layers']:
                inside=any(cv2.pointPolygonTest(np.array(p['points'],np.float32),(x,y),False)>=0 for p in layer['polygons'])
                if inside:
                    if 'level' in layer: elevation=max(elevation,layer['level'])
                    elif layer['id'] in ['forest','bushes']: vegetation.append(layer['id'])
            center.update(level=elevation,meters=elevation*15,vegetation=vegetation,effectiveVegetation='forest' if 'forest' in vegetation else ('bushes' if 'bushes' in vegetation else None))
            metadata['centers'].append(center)
            center_svg.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="3"><title>Гекс {col},{row}: {elevation*15} м; {", ".join(vegetation) or "открыто"}</title></circle>')
            draw.ellipse((x-2,y-2,x+2,y+2),fill='white',outline='black',width=1)
    _chains,_edges=road_edges(roads['paths'],metadata['centers'],
        metadata['gameTransform'],metadata['imageSize'])
    metadata['road']['chains']=_chains
    metadata['road']['edges']=_edges
    # Keep the actual game centers separate from the hex grid printed in the artwork.
    metadata['validation']=dict(layerRegionCounts={l['id']:len(l['polygons']) for l in metadata['layers']},
        centersOnImage=len(metadata['centers']),vegetationOverlapCenters=[c for c in metadata['centers'] if len(c['vegetation'])>1])
    for high,low in [('height2','height1'),('height3','height2')]:
        def raster(key):
            result=np.zeros((h,w),np.uint8)
            for p in next(l for l in metadata['layers'] if l['id']==key)['polygons']:
                cv2.fillPoly(result,[np.array(p['points'],np.int32)],1)
            return result
        a,b=raster(high),raster(low)
        # A few pixels of mismatch are expected from separately hand-drawn strokes.
        metadata['validation'][high+'Outside'+low+'Pixels']=int((a & (1-b)).sum())
    (args.output/'contours.review.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    font=ImageFont.truetype(fontpath,18)
    preview=Image.new('RGB',(w+350,h),'#17212c');preview.paste(overlay.convert('RGB'),(0,0))
    d=ImageDraw.Draw(preview);y=28
    lines=['ВАЛЕНСИЯ — ПРОВЕРКА','Контуры, не игровые правила','','Высоты: 1 уровень = 15 м']
    for line in lines:d.text((w+18,y),line,font=font,fill='white');y+=30
    for key,_,title,color,_ in LAYERS:
        count=metadata['validation']['layerRegionCounts'][key]
        d.text((w+18,y),f'{title}: {count} обл.',font=font,fill=color);y+=34
    d.text((w+18,y),'Дорога — розовая линия',font=font,fill='#ff54cb');y+=34
    for line in ['', 'Белые точки — центры', 'гексов по настройкам игры.', '', 'Границы замкнуты по краю.', 'Высоты берутся по максимуму.', '', 'Точность линии: около ±6 px.', 'Проверьте вложенность высот.', '', 'Расчёт видимости не включён.']:
        d.text((w+18,y),line,font=font,fill='#dce5ed');y+=29
    preview.save(args.output/'overlay-review.png')
    encoded=base64.b64encode(base_path.read_bytes()).decode()
    controls=''.join(f'<label><input type="checkbox" checked data-layer="{key}">{title}</label>' for key,_,title,_,_ in LAYERS)
    controls+='<label><input type="checkbox" checked data-layer="road">Дорога</label>'
    html='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Валенсия — контроль контуров</title>
<style>body{margin:0;background:#17212c;color:#e8eef6;font:16px system-ui}header{padding:16px;position:sticky;top:0;background:#17212cf5;z-index:2}label{display:inline-block;margin:6px 12px 6px 0}input{width:20px;height:20px;vertical-align:middle}svg{width:100%;height:auto;max-width:1600px}.region-label{fill:white;fill-opacity:1;stroke:#17212c;stroke-width:3;paint-order:stroke;font:bold 16px sans-serif;text-anchor:middle}button{padding:8px}p{margin:8px 0;font-size:14px}</style>
<header><b>Валенсия: контрольное наложение — не подключено к игре</b><p>Слои можно отключать. Наведите курсор на точку для координат и высоты. Уровни абсолютные: 15 / 30 / 45 м.</p>'''+controls+'''<label><input type="checkbox" checked data-layer="centers">Центры гексов игры</label><label><input type="checkbox" checked id="labels">Подписи высот и растительности</label><p>Границы на краю замкнуты по периметру; точность около ±6 пикселей. Числа 45/79/81 на исходной карте не переинтерпретированы как игровые уровни.</p></header>'''+f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg"><image width="{w}" height="{h}" href="data:image/png;base64,{encoded}"/>'+''.join(svg_layers)+'<g id="centers" fill="white" stroke="black" stroke-width="1">'+''.join(center_svg)+'''</g></svg><script>document.querySelectorAll('[data-layer]').forEach(e=>e.onchange=()=>document.getElementById(e.dataset.layer).style.display=e.checked?'':'none');document.getElementById('labels').onchange=e=>document.querySelectorAll('.region-label').forEach(t=>t.style.display=e.target.checked?'':'none');</script>'''
    from terrain_diagnostics import enhance
    html=enhance(html,metadata)
    (args.output/'review.html').write_text(html)
    print(json.dumps(dict(identicalBackground=same,alignment=alignment,transform=metadata['gameTransform'],validation=metadata['validation']),ensure_ascii=False,indent=2))

if __name__=='__main__':main()
