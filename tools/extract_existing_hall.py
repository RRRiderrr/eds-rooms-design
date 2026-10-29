"""One command: inspect live scene, derive layout, snapshot to E:, export copies.

python tools/extract_existing_hall.py [--blender F:/.../blender.exe]
No edit, rename, transform or save of the original live scene is performed.
"""
import argparse,datetime,json,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent))
from blender_rpc import execute
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--blender',type=Path,default=Path('F:/SteamLibrary/steamapps/common/Blender/blender.exe'));args=parser.parse_args()
 work=Path('E:/ArchViz_Resources/main-hall');work.mkdir(parents=True,exist_ok=True)
 lock=work/'export.lock';handle=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
 try:
  os.write(handle,str(os.getpid()).encode());os.close(handle)
  subprocess.run([sys.executable,str(ROOT/'tools/inspect_existing_hall.py')],check=True,cwd=ROOT)
  before=json.loads((ROOT/'assets-src/main-hall/live-inventory.json').read_text(encoding='utf8'))
  subprocess.run([sys.executable,str(ROOT/'tools/build_hall_layout.py')],check=True,cwd=ROOT)
  snapshot=work/f'source-{datetime.datetime.now():%Y%m%d-%H%M%S}.blend'
  response=execute('import bpy\nbpy.ops.wm.save_as_mainfile(filepath='+repr(str(snapshot))+',copy=True)\nresult={"file":bpy.data.filepath,"copy":'+repr(str(snapshot))+'}',timeout=90)
  if response.get('status')!='ok':raise RuntimeError(response)
  assert response['result']['file']==before['file'],'The live Blender file must remain unchanged'
  log=work/'export-latest.log'
  with log.open('w',encoding='utf8') as stream:
   subprocess.run([str(args.blender),'--background',str(snapshot),'--threads','4','--python-exit-code','1','--python',str(ROOT/'tools/export_existing_hall.py')],cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT,check=True)
  after_path=ROOT/'assets-src/main-hall/post-export-live-inventory.json'
  subprocess.run([sys.executable,str(ROOT/'tools/inspect_existing_hall.py'),'--output',str(after_path)],check=True,cwd=ROOT)
  after=json.loads(after_path.read_text(encoding='utf8'))
  report={'sourceFile':before['file'],'snapshot':str(snapshot),'log':str(log),'objectsBefore':before['objectCount'],'objectsAfter':after['objectCount'],
   'allMeshAndMatrixHashesUnchanged':before['geometryFingerprints']==after['geometryFingerprints'],'selectionUnchanged':before['selected']==after['selected'],'liveFileUnchanged':before['file']==after['file']}
  (ROOT/'assets-src/main-hall/source-preservation.json').write_text(json.dumps(report,indent=2),encoding='utf8')
  assert report['allMeshAndMatrixHashesUnchanged'] and report['selectionUnchanged'] and report['liveFileUnchanged'],report
  subprocess.run(['node',str(ROOT/'tools/sync-hall-manifest.mjs')],check=True,cwd=ROOT)
  subprocess.run(['node',str(ROOT/'tools/verify_existing_hall.mjs')],check=True,cwd=ROOT)
  print(json.dumps(report,ensure_ascii=False),flush=True)
 finally:
  if lock.exists():lock.unlink()
if __name__=='__main__':main()
