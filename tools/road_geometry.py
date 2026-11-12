"""Thin coloured/white road strokes to a connected open-line pixel graph."""
import cv2
import numpy as np
from PIL import Image

def extract_road(path, expected_size):
    image=Image.open(path).convert('RGBA');assert image.size==expected_size
    a=np.array(image)
    mask=((a[:,:,3]>=96)&(a[:,:,:3].max(axis=2)>40)).astype(np.uint8)
    # Zhang-Suen thinning; pad so routes terminating on the edge stay open.
    img=np.pad(mask,1)
    while True:
        removed=0
        for phase in (0,1):
            p=img[1:-1,1:-1]
            n=[img[:-2,1:-1],img[:-2,2:],img[1:-1,2:],img[2:,2:],img[2:,1:-1],img[2:,:-2],img[1:-1,:-2],img[:-2,:-2]]
            count=sum(n);transitions=sum(((n[i]==0)&(n[(i+1)%8]==1)).astype(np.uint8) for i in range(8))
            if phase==0: c=(n[0]*n[2]*n[4]==0)&(n[2]*n[4]*n[6]==0)
            else:c=(n[0]*n[2]*n[6]==0)&(n[0]*n[4]*n[6]==0)
            remove=(p==1)&(count>=2)&(count<=6)&(transitions==1)&c
            removed+=int(remove.sum());p[remove]=0
        if removed==0: break
    ys,xs=np.nonzero(img[1:-1,1:-1]);pixels=set(zip(xs.tolist(),ys.tolist()))
    def neighbours(v):
        x,y=v;result=[]
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                q=(x+dx,y+dy)
                if (dx==dy==0) or q not in pixels:continue
                # Avoid artificial diagonal triangles at orthogonal junctions.
                if dx and dy and ((x+dx,y) in pixels or (x,y+dy) in pixels):continue
                result.append(q)
        return sorted(result)
    graph={p:neighbours(p) for p in sorted(pixels)}
    visited=set();paths=[]
    def edge(a,b):return tuple(sorted([a,b]))
    starts=[p for p in graph if len(graph[p])!=2]+[p for p in graph if len(graph[p])==2]
    for start in starts:
        for nxt in graph[start]:
            if edge(start,nxt) in visited:continue
            line=[start,nxt];visited.add(edge(start,nxt));prev,cur=start,nxt
            while len(graph[cur])==2:
                nxt=next(p for p in graph[cur] if p!=prev)
                if edge(cur,nxt) in visited:break
                line.append(nxt);visited.add(edge(cur,nxt));prev,cur=cur,nxt
            points=cv2.approxPolyDP(np.array(line,np.int32),1.25,False)[:,0,:].tolist()
            if len(points)>=2:paths.append(points)
    return dict(source='дорога.png',kind='open-polylines',paths=paths,
        skeletonPixels=len(pixels),endpointCount=sum(len(n)==1 for n in graph.values()),
        junctionPixelCount=sum(len(n)>2 for n in graph.values()),
        note='Review geometry only. Road transitions are candidates; no bridges are inferred.')
