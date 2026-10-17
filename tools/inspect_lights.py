import bpy
result={'lights':[{'name':o.name,'loc':list(o.location),'type':o.data.type,'energy':o.data.energy,'size':getattr(o.data,'size',0),'color':list(o.data.color)} for o in bpy.data.objects if o.type=='LIGHT'],'materials':[{'name':m.name,'nodes':[(n.type,n.name) for n in m.node_tree.nodes] if m.use_nodes else []} for m in bpy.data.materials]}
