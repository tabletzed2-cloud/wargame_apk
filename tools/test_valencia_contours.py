#!/usr/bin/env python3
"""Dependency-free structural and geometric tests for the offline review artifact."""
import json
import math
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]
folder=ROOT/'docs/terrain-review/valencia'
j=json.loads((folder/'contours.review.json').read_text())
w,h=j['imageSize'];checks=0

def check(condition, message):
    global checks
    assert condition, message
    checks+=1

check(j['status']=='review-only-not-used-by-game','review only')
check((w,h)==(1184,1170),'source dimensions')
check(j['backgroundAlignment']['inliers']>100,'background feature correspondence')
check(j['backgroundAlignment']['maxCornerShiftPixels']<1,'background geometry matches')
check(j['elevationStepMeters']==15 and j['hexSpanMeters']==300,'agreed scale')
check(len(j['layers'])==8,'all supplied layers present')

def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def proper_intersection(a,b,c,d):return cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0

ids=set()
for layer in j['layers']:
    for p in layer['polygons']:
        pts=p['points'];n=len(pts)
        check(p['id'] not in ids,'unique region ID');ids.add(p['id'])
        check(n>=3,'polygon has at least three vertices')
        check(all(0<=x<w and 0<=y<h for x,y in pts),'points inside source image')
        area=abs(sum(pts[i][0]*pts[(i+1)%n][1]-pts[(i+1)%n][0]*pts[i][1] for i in range(n)))/2
        check(area>=40,'non-degenerate polygon')
        check(not any(proper_intersection(pts[a],pts[(a+1)%n],pts[b],pts[(b+1)%n])
            for a in range(n) for b in range(a+1,n) if b!=a+1 and not(a==0 and b==n-1)), 'no crossing polygon edges')
check(j['validation']['height2Outsideheight1Pixels']==0,'height 2 nested in height 1')
check(j['validation']['height3Outsideheight2Pixels']==0,'height 3 nested in height 2')
t=j['gameTransform']
for c in j['centers']:
    gx=(c['col']+(c['row']%2)/2+.5)*math.sqrt(3)*t['hexSize']
    gy=c['row']*1.5*t['hexSize']+t['hexSize']
    check(abs((gx-t['drawX'])/t['drawWidth']*w-c['x'])<.001 and abs((gy-t['drawY'])/t['drawHeight']*h-c['y'])<.001,'game center transform')
    check(c['meters']==c['level']*15,'center elevation')
html=(folder/'review.html').read_text()
HTMLParser().feed(html)
check('data:image/png;base64,' in html,'self-contained background')
check(all(f'id="{l["id"]}"' in html for l in j['layers']),'toggle targets exist')
check('id="road"' in html and 'data-layer="road"' in html,'road toggle and drawing exist')
check(j['road']['kind']=='open-polylines' and len(j['road']['edges'])>0,'open road network and candidate transitions')
check(all(len(e)==2 for e in j['road']['edges']),'road edges have two endpoints')
check('id="movement-profile"' in html and 'id="movement-rays"' in html,'movement diagnostics controls')
check('id="centers"' in html,'grid centers toggle exists')
check((folder/'overlay-review.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n','PNG preview')
print(f'PASS: {checks} contour review checks ({len(ids)} polygons, {len(j["centers"])} centers)')
