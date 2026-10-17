"""Trace supplied artwork into 3D-ready contours. No wall-photo planes or retouching.
Photo RGB is retained only as the map's printed top surface, clipped by true geometry.
"""
import cv2,numpy as np,json,shutil
from pathlib import Path
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-src/signage';PUB=ROOT/'public/assets/signage';PUB.mkdir(parents=True,exist_ok=True)
TEMP=Path('C:/Users/kakuc/AppData/Local/Temp');RES=Path('E:/ArchViz_Resources/Signage/reference');RES.mkdir(parents=True,exist_ok=True)
IDS={'timeline':'e69ac1a0-78a4-4580-96d8-07ae2bbf4a5c','corporate':'98dd3aa0-dab4-4f21-a691-cf04cd19db27','world':'563c0b1d-ec62-4581-9020-bf00196c567f','sales':'cfa581df-5a3b-44ed-9742-3c85828d0896','ukraine':'cf962eb0-5cd7-45ce-acf3-be28caa2cb69','logo-photo':'8b242895-8183-42fe-8771-004cdd77d2d2','logo-vector':'09f326bd-8fe4-4dad-8199-3e1c78c597ba'}
for key,uid in IDS.items():shutil.copy2(TEMP/f'codex-clipboard-{uid}.png',RES/f'{key}.png')
def polygons(mask,minarea=20,epsilon=.55):
 contours,h=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE);result=[]
 if h is None:return result
 for i,c in enumerate(contours):
  if h[0][i][3]>=0 or cv2.contourArea(c)<minarea:continue
  approx=cv2.approxPolyDP(c,epsilon,True)[:,0,:].astype(float).tolist();holes=[];child=h[0][i][2]
  while child>=0:
   if cv2.contourArea(contours[child])>8:holes.append(cv2.approxPolyDP(contours[child],epsilon,True)[:,0,:].astype(float).tolist())
   child=h[0][child][0]
  result.append({'outer':approx,'holes':holes,'area':float(cv2.contourArea(c))})
 return result
data={'schemaVersion':1,'source':'Actual user photographs; geometry contours and font outlines, not flattened wall-photo signs','maps':{}}
for key,roi,minarea in [('world',None,18),('ukraine',(0,250,1250,1210),24)]:
 im=cv2.imread(str(RES/f'{key}.png'));hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
 mask=((hsv[:,:,1]>55)&(hsv[:,:,0]<36)&(hsv[:,:,2]>45)&(im[:,:,2]>im[:,:,0]*1.12)).astype(np.uint8)*255
 if roi:
  valid=np.zeros_like(mask);valid[roi[1]:roi[3],roi[0]:roi[2]]=255;mask&=valid
 mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
 # Fill tiny ink/woodgrain holes; preserve real lakes and gaps between islands.
 cs,hier=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
 if hier is not None:
  for i,c in enumerate(cs):
   if hier[0][i][3]>=0 and cv2.contourArea(c)<180:cv2.drawContours(mask,[c],-1,255,-1)
 shapes=polygons(mask,minarea,.65)
 clean=np.zeros_like(mask)
 for s in shapes:
  cv2.fillPoly(clean,[np.array(s['outer'],np.int32)],255)
  for hole in s['holes']:cv2.fillPoly(clean,[np.array(hole,np.int32)],0)
 ys,xs=np.where(clean>0);bounds=[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]
 # Country/oblast relief follows colour boundaries of the photographed wood pieces.
 smooth=cv2.bilateralFilter(im,13,38,13);lab=cv2.cvtColor(smooth,cv2.COLOR_BGR2LAB)
 samples=lab[clean>0].astype(np.float32);cv2.setRNGSeed(17)
 _,labels,centers=cv2.kmeans(samples,5,None,(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,25,.3),3,cv2.KMEANS_PP_CENTERS)
 groups=np.full(clean.shape,-1,np.int16);groups[clean>0]=labels[:,0];pieces=[]
 for ci in range(5):
  cm=((groups==ci)&(clean>0)).astype(np.uint8)*255;cm=cv2.morphologyEx(cm,cv2.MORPH_OPEN,np.ones((5,5),np.uint8));cm=cv2.morphologyEx(cm,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
  for poly in polygons(cm,1200 if key=='world' else 1800,1.1):
   poly['layer']=ci;pieces.append(poly)
 # RGB is the unchanged source photograph encoded for web; no wall is rendered,
 # because only these coast/country/oblast-shaped meshes receive its UVs.
 Image.open(RES/f'{key}.png').convert('RGB').save(PUB/f'{key}-print.jpg',quality=95,subsampling=0,optimize=True)
 cv2.imwrite(str(OUT/f'{key}-geometry-mask.png'),clean)
 data['maps'][key]={'imageSize':[im.shape[1],im.shape[0]],'bounds':bounds,'shapes':shapes,'reliefPieces':pieces,'printUri':f'assets/signage/{key}-print.jpg','physicalDepth':[.010,.026],'method':'HSV wood mask -> exact coasts/islands/holes; colour-defined raised wood regions; original print mapped only to geometric top caps'}
 print('MAP_TRACED',key,len(shapes),len(pieces),bounds,flush=True)
logo=cv2.imread(str(RES/'logo-vector.png'));mask=(np.max(logo,axis=2)<70).astype(np.uint8)*255
shapes=polygons(mask,100,.85);ys,xs=np.where(mask>0)
data['logo']={'imageSize':[logo.shape[1],logo.shape[0]],'bounds':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],'shapes':shapes,'depth':.075,'method':'Exact supplied black EDS contours, including D-plus negative space; green backdrop discarded'}
# Exact photographed QR patterns, when legible. This does not execute QR payloads.
corp=cv2.imread(str(RES/'corporate.png'));det=cv2.QRCodeDetector();qrs=[]
try:
 ok,decoded,points,straight=det.detectAndDecodeMulti(corp)
 if ok:
  for txt,points,qr in zip(decoded,points,straight):
   qrs.append({'center':np.mean(points,axis=0).astype(float).tolist(),'corners':points.astype(float).tolist(),'width':int(qr.shape[0]),'bits':[''.join('1' if c<128 else '0' for c in row) for row in qr],'decoded':txt})
except Exception:pass
data['corporateQR']=qrs
class Pen(BasePen):
 def __init__(self,glyphSet):super().__init__(glyphSet);self.out=[]
 def _moveTo(self,p):self.out.append(['M',*p])
 def _lineTo(self,p):self.out.append(['L',*p])
 def _curveToOne(self,a,b,c):self.out.append(['C',*a,*b,*c])
 def _qCurveToOne(self,a,b):self.out.append(['Q',*a,*b])
 def _closePath(self):self.out.append(['Z'])
 def _endPath(self):self.out.append(['Z'])
chars=set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯабвгґдеєжзиіїйклмнопрстуфхцчшщьюя#%+.,:;!?()–—-’«»/ &×²³\n')
data['fonts']={}
for key,file in [('bold','arialbd.ttf'),('regular','arial.ttf')]:
 font=TTFont(f'C:/Windows/Fonts/{file}');glyphset=font.getGlyphSet();cmap=font.getBestCmap();units=font['head'].unitsPerEm;glyphs={}
 for ch in chars:
  name=cmap.get(ord(ch))
  if not name:continue
  pen=Pen(glyphset);glyphset[name].draw(pen);commands=[]
  for cmd in pen.out:commands.append([cmd[0]]+[round(float(v)/units,6) for v in cmd[1:]])
  glyphs[ch]={'advance':font['hmtx'][name][0]/units,'commands':commands}
 data['fonts'][key]={'family':'Arial Bold' if key=='bold' else 'Arial','units':'em','capHeight':.716,'glyphs':glyphs,'source':'Local OS font outlines used as document geometry; no font program redistributed'}
(OUT/'signage-data.json').write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
(OUT/'source-manifest.json').write_text(json.dumps({'references':IDS,'resourcesRoot':str(RES),'rasterRetouchingUsed':False,'physicalGeometry':True,'mapPrints':'Unretouched source print on masked wooden geometry caps; wall background never receives geometry'},indent=2))
print('SIGNAGE_SOURCE_DATA_READY',len(qrs),flush=True)
