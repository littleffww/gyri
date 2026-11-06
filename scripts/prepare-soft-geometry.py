"""Derive a tessellated display mesh from the saved source render meshes.
Original model.json is preserved. Geometry #720 is the detached cylindrical base.
"""
import json, math, struct, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
parts=json.loads((root/'dist/model.json').read_text())
body=[p for p in parts if p['id']!=720]
lo=[min(p['center'][k]+min(p['vertices'][k::3]) for p in body) for k in range(3)]
hi=[max(p['center'][k]+max(p['vertices'][k::3]) for p in body) for k in range(3)]
center=[(a+b)*.5 for a,b in zip(lo,hi)];unit=3.6/(hi[1]-lo[1])
positions=[];centers=[];indices=[];sections=[]
for group in [body,[p for p in parts if p['id']==720]]:
 startv=len(positions)//3;starti=len(indices)
 for p in group:
  home=[(p['center'][k]-center[k])*unit for k in range(3)]
  verts=[[p['vertices'][i+k]*unit+home[k] for k in range(3)] for i in range(0,len(p['vertices']),3)]
  mids={};out=[]
  def split(a,b,c,depth=0):
   pairs=[(a,b,c),(b,c,a),(c,a,b)]
   a,b,c=max(pairs,key=lambda t:sum((verts[t[0]][k]-verts[t[1]][k])**2 for k in range(3)))
   length=sum((verts[a][k]-verts[b][k])**2 for k in range(3))
   if length<.11**2 or depth>=8:
    out.extend((a,b,c));return
   edge=tuple(sorted((a,b)))
   if edge not in mids:
    mids[edge]=len(verts);verts.append([(verts[a][k]+verts[b][k])*.5 for k in range(3)])
   mid=mids[edge];split(a,mid,c,depth+1);split(mid,b,c,depth+1)
  for j in range(0,len(p['indices']),3):split(*p['indices'][j:j+3])
  offset=len(positions)//3
  for v in verts:positions.extend(v);centers.extend(home)
  indices.extend(i+offset for i in out)
 sections.append({'vertexStart':startv,'vertexCount':len(positions)//3-startv,'indexStart':starti,'indexCount':len(indices)-starti})
n=len(positions)//3
with (root/'dist/soft-geometry.bin').open('wb') as f:
 for values,fmt in [(positions,'f'),(centers,'f'),(indices,'I')]:f.write(struct.pack('<'+fmt*len(values),*values))
meta={'vertexCount':n,'indexCount':len(indices),'positionBytes':n*12,'centerBytes':n*12,'sections':sections,'sourceParts':720,'bodyParts':719,'baseId':720,'normalization':{'center':center,'unit':unit}}
(root/'dist/soft-geometry.json').write_text(json.dumps(meta,separators=(',',':')))
print(json.dumps(meta))
