"""Recover photographed QR ink outlines without inventing payloads or links."""
import cv2, json, numpy as np
from pathlib import Path
root=Path(__file__).resolve().parents[2]
target=root/'assets-src/signage/signage-data.json'
data=json.loads(target.read_text(encoding='utf8'))
im=cv2.imread('E:/ArchViz_Resources/Signage/reference/corporate.png')
gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
traces=[]
for name,box in [('Engineering',[561,637,613,688]),('EDS',[1435,912,1489,965]),('Development',[2244,604,2303,660]),('Power',[2057,1224,2112,1277])]:
    x0,y0,x1,y1=box; crop=gray[y0:y1,x0:x1]
    threshold,_=cv2.threshold(crop,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
    mask=(crop<threshold).astype(np.uint8)*255
    contours,h=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE); shapes=[]
    if h is not None:
        for i,c in enumerate(contours):
            if h[0][i][3]>=0 or cv2.contourArea(c)<.8:continue
            outer=(cv2.approxPolyDP(c,.25,True)[:,0,:]+[x0,y0]).astype(float).tolist(); holes=[];child=h[0][i][2]
            while child>=0:
                holes.append((cv2.approxPolyDP(contours[child],.25,True)[:,0,:]+[x0,y0]).astype(float).tolist());child=h[0][child][0]
            if len(outer)>=3:shapes.append({'outer':outer,'holes':[hole for hole in holes if len(hole)>=3],'area':float(cv2.contourArea(c))})
    traces.append({'node':name,'bounds':box,'shapes':shapes,'decoded':None,'source':'Photographed QR ink contours. No payload inferred.'})
data['corporateQRTrace']=traces
target.write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
print('QR_TRACE_READY',[(q['node'],len(q['shapes'])) for q in traces])
