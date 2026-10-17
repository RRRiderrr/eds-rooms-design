"""One-command non-destructive refresh of the currently open MCP Blender room.

python tools/reexport_room.py [--skip-bake] [--concepts]
No external server is required by the built website; this is authoring only.
"""
import argparse,json,os,socket,subprocess,time,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DEFAULT_BLENDER=Path(r'F:/SteamLibrary/steamapps/common/Blender/blender.exe')
def request(code):
 with socket.create_connection(('127.0.0.1',9876),timeout=5) as s:
  s.settimeout(120);s.sendall(json.dumps({'type':'execute','strict_json':True,'code':code}).encode()+b'\0');data=bytearray()
  while b'\0' not in data:
   part=s.recv(65536)
   if not part:raise RuntimeError('Blender MCP connection closed before response')
   data.extend(part)
 result=json.loads(data.split(b'\0',1)[0])
 if result.get('status')!='ok':raise RuntimeError(result)
 return result['result']
def main():
 p=argparse.ArgumentParser();p.add_argument('--blender',type=Path,default=Path(os.environ.get('BLENDER_EXECUTABLE',DEFAULT_BLENDER)))
 p.add_argument('--skip-bake',action='store_true');p.add_argument('--concepts',action='store_true');p.add_argument('--source',type=Path)
 args=p.parse_args()
 if not args.blender.is_file():raise SystemExit('Blender executable not found. Use --blender PATH or BLENDER_EXECUTABLE.')
 inp=ROOT/'assets-src/exports/live_source.blend';inp.parent.mkdir(parents=True,exist_ok=True)
 if args.source:
  import shutil;shutil.copy2(args.source,inp)
 else:
  result=request('import bpy\nbpy.ops.wm.save_as_mainfile(filepath='+repr(str(inp))+', copy=True)\nresult={"file":bpy.data.filepath,"copy":'+repr(str(inp))+'}')
  print('Non-destructive MCP snapshot:',result,flush=True)
 def run(script,source):
  subprocess.run([str(args.blender),'--background',str(source),'--python-exit-code','1','--python',str(ROOT/'tools'/script)],cwd=ROOT,check=True)
 import shutil
 full=Path('E:/ArchViz_Resources/exports/full-space-source.blend');full.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(inp,full)
 run('export_runtime_lights.py',inp)
 run('export_room.py',inp)
 cropped=ROOT/'assets-src/room_archviz.blend'
 run('fix_door_export.py',cropped)
 if not args.skip_bake:run('repair_room_lighting.py',cropped)
 run('export_editor.py',cropped)
 run('export_space.py',full)
 if not args.skip_bake:
  run('bake_space.py',full.parent/'space-export.blend')
  run('denoise_lightmaps.py',cropped)
  run('build_lightmap_lods.py',full.parent/'space-baked.blend')
 run('append_navigation_colliders.py',full)
 if (ROOT/'node_modules/@gltf-transform/core').exists():
  subprocess.run(['node',str(ROOT/'tools/optimize_architecture.mjs'),'room','room-editor','space','space-editor'],cwd=ROOT,check=True)
 if args.concepts:
  subprocess.run(['node',str(ROOT/'tools/prepare-blender-catalog.mjs')],cwd=ROOT,check=True)
  run('build_concepts.py',cropped)
  subprocess.run([sys.executable,str(ROOT/'tools/build_preset_thumbnails.py')],cwd=ROOT,check=True)
 print('Room export complete. Static production assets: public/assets/architecture',flush=True)
if __name__=='__main__':main()
