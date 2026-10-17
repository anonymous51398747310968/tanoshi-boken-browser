#!/usr/bin/env python3
"""Diagnostic only: summarize RPG Maker VX Ace data before the Canvas port."""
import gzip, io, zipfile, collections, struct
from pathlib import Path
from asset_audit import DataReader, decode

root = Path(__file__).resolve().parent.parent
p = next((root/'docs').glob('tanoshi-boken.mkxpz.*.gz'))
data = gzip.decompress(p.read_bytes())
zf = zipfile.ZipFile(io.BytesIO(data))
files = zf.namelist()
print('ZIP FILE COUNT',len(files),'GAME BYTES',len(data))
print('GRAPHICS',*[n for n in files if n.startswith('Graphics/') and not n.startswith('Graphics/Animations/')][:95],sep='\n')
def get(name):
    return DataReader(zf.read('Data/'+name+'.rvdata2')).read()
def v(obj,key,default=None): return obj.get(key.encode(),default) if isinstance(obj,dict) else default
def s(x):
    if isinstance(x,bytes): return decode(x)
    if isinstance(x,dict): return '{'+','.join(s(k)+':'+s(q) for k,q in list(x.items())[:3])+'}'
    if isinstance(x,list): return '['+','.join(s(a) for a in x[:4])+']'
    return str(x)
infos=get('MapInfos')
print('MAP INFOS:',[(i,s(v(o,'@name')),v(o,'@parent_id')) for i,o in enumerate(infos) if o] if isinstance(infos,list) else [(k,s(v(o,'@name'))) for k,o in infos.items() if k!='__default__'])
tiles=get('Tilesets')
print('TILESETS:',[(i,s(v(o,'@name')),s(v(o,'@tileset_names')),s(v(o,'@flags'))[:50]) for i,o in enumerate(tiles) if o])
for a in ['System','Actors','Classes','Enemies','Troops','Items','Weapons','Armors','Skills','States']:
  obj=get(a)
  if a=='System':
    for key in ('@start_map_id','@start_x','@start_y','@party_members','@variables','@switches','@terms'):
       print('SYSTEM',key,s(v(obj,key))[:650])
  else:
    ls=[(i,s(v(e,'@name'))) for i,e in enumerate(obj) if e] if isinstance(obj,list) else []
    print(a,'COUNT',len(ls),'NAMES',ls[:45])
    if a in ('Actors','Troops','Skills','Classes'):
       print(a,'SAMPLE',str(obj[1])[:2400])
for n in [n for n in files if n.startswith('Data/Map') and n.endswith('.rvdata2') and n!='Data/MapInfos.rvdata2']:
 m=DataReader(zf.read(n)).read()
 print('\n===== MAP',n,'name',s(v(m,'@display_name')),'size',v(m,'@width'),v(m,'@height'),'tileset',v(m,'@tileset_id'), 'encounters',str(v(m,'@encounter_list'))[:380])
 table=v(m,'@data')
 if isinstance(table,dict):
    binv=table.get('__binary__')
    print('table',len(binv) if isinstance(binv,bytes) else type(binv), (binv[:32].hex() if isinstance(binv,bytes) else ''), 'class',s(table.get('__class__')))
 events=v(m,'@events')
 print('events',len(events) if isinstance(events,dict) else type(events))
 if isinstance(events,dict):
  for k,e in list(events.items())[:110]:
    if not isinstance(e,dict): continue
    pages=v(e,'@pages',[])
    print('EVENT',k,'name',s(v(e,'@name')),'xy',v(e,'@x'),v(e,'@y'),'pages',len(pages))
    for ip,page in enumerate(pages):
       commands=v(page,'@list',[])
       cond=v(page,'@condition',{})
       g=v(page,'@graphic',{})
       summary=[(v(cmd,'@code'),v(cmd,'@indent'),s(v(cmd,'@parameters'))[:130]) for cmd in commands]
       print(' PAGE',ip,'trigger',v(page,'@trigger'),'priority',v(page,'@priority_type'),'direction',v(g,'@direction'),'graphic',s(v(g,'@character_name')),'tileid',v(g,'@tile_id'),'cond',str(cond)[:350], 'commands',len(commands))
       print('  LIST',summary[:36])
