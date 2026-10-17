import bpy,json,hashlib
from pathlib import Path
p=Path(r'E:/ArchViz_Resources/exports/full-space-source.blend')
if not p.exists():bpy.ops.wm.save_as_mainfile(filepath=str(p),copy=True)
result={'source':bpy.data.filepath,'backup':str(p),'objects':len(bpy.data.objects)}
