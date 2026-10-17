"""Resume panorama/probe stage from completed irradiance-atlas blend."""
import bpy,json,math,time
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/architecture'
scene=bpy.context.scene;start=time.time()
code=(ROOT/'tools/bake_room.py').read_text(encoding='utf-8-sig')
exec(code[code.index('def targets('):code.index('scene.render.bake.use_pass_direct')])
exec(code[code.index('def camera('):])
