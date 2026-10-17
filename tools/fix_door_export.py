"""Repair parent-relative vertex coordinates in existing cropped export only."""
import bpy
from pathlib import Path
from mathutils import Matrix
ROOT=Path(__file__).resolve().parents[1];door=bpy.data.objects['Interactive_Door_03']
hinge=door.location.copy()
for o in list(door.children):
 if o.type=='MESH':
  # Old export had world-positioned vertices and an additional hinge parent.
  # Detect by leaf-local min x; the correct local leaf starts at zero.
  if min(v.co.x for v in o.data.vertices)>.8:
   o.data.transform(Matrix.Translation(-hinge));o.data.update()
  o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-src/room_archviz.blend'))
for o in bpy.data.objects:o.select_set(o.type in ('MESH','EMPTY'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/architecture/room.glb'),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False,export_extras=True,export_yup=True)
print('HINGE_COORDINATES_FIXED')
