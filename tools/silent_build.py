#!/usr/bin/env python3
"""Build a silent, Canvas2D-friendly copy of the published VX Ace game data.

No Ruby code is run. No original audio or WASM is placed into docs/silent/.
The original release in docs/ is left intact until deployment has been checked.
"""
from __future__ import annotations
import hashlib
import io
import gzip
import json
from pathlib import Path
import re
import struct
import sys
import zipfile
from collections import Counter

from PIL import Image
from asset_audit import DataReader, decode

BASE = Path(__file__).resolve().parents[1]
DEST = BASE / "docs" / "silent"
GRAPHICS = DEST / "img"
MAPS = DEST / "maps"
GAME = next((BASE / "docs").glob("tanoshi-boken.mkxpz.*.gz"))
OUT = {"maps": {}, "db": {}, "sprites": {}, "mapNames": {}}

# Each shape is [top-left, top-right, bottom-left, bottom-right], quarter offsets.
FLOOR = [
[(2,4),(1,4),(2,3),(1,3)],[(2,0),(1,4),(2,3),(1,3)],
[(2,4),(3,0),(2,3),(1,3)],[(2,0),(3,0),(2,3),(1,3)],
[(2,4),(1,4),(2,3),(3,1)],[(2,0),(1,4),(2,3),(3,1)],
[(2,4),(3,0),(2,3),(3,1)],[(2,0),(3,0),(2,3),(3,1)],
[(2,4),(1,4),(2,1),(1,3)],[(2,0),(1,4),(2,1),(1,3)],
[(2,4),(3,0),(2,1),(1,3)],[(2,0),(3,0),(2,1),(1,3)],
[(2,4),(1,4),(2,1),(3,1)],[(2,0),(1,4),(2,1),(3,1)],
[(2,4),(3,0),(2,1),(3,1)],[(2,0),(3,0),(2,1),(3,1)],
[(0,4),(1,4),(0,3),(1,3)],[(0,4),(3,0),(0,3),(1,3)],
[(0,4),(1,4),(0,3),(3,1)],[(0,4),(3,0),(0,3),(3,1)],
[(2,2),(1,2),(2,3),(1,3)],[(2,2),(1,2),(2,3),(3,1)],
[(2,2),(1,2),(2,1),(1,3)],[(2,2),(1,2),(2,1),(3,1)],
[(2,4),(3,4),(2,3),(3,3)],[(2,4),(3,4),(2,1),(3,3)],
[(2,0),(3,4),(2,3),(3,3)],[(2,0),(3,4),(2,1),(3,3)],
[(2,4),(1,4),(2,5),(1,5)],[(2,0),(1,4),(2,5),(1,5)],
[(2,4),(3,0),(2,5),(1,5)],[(2,0),(3,0),(2,5),(1,5)],
[(0,4),(3,4),(0,3),(3,3)],[(2,2),(1,2),(2,5),(1,5)],
[(0,2),(1,2),(0,3),(1,3)],[(0,2),(1,2),(0,3),(3,1)],
[(2,2),(3,2),(2,3),(3,3)],[(2,2),(3,2),(2,1),(3,3)],
[(2,4),(3,4),(2,5),(3,5)],[(2,0),(3,4),(2,5),(3,5)],
[(0,4),(1,4),(0,5),(1,5)],[(0,4),(3,0),(0,5),(1,5)],
[(0,2),(3,2),(0,3),(3,3)],[(0,2),(1,2),(0,5),(1,5)],
[(0,4),(3,4),(0,5),(3,5)],[(2,2),(3,2),(2,5),(3,5)],
[(0,2),(3,2),(0,5),(3,5)],[(0,0),(1,0),(0,1),(1,1)]
]
WALL = [
[(2,2),(1,2),(2,1),(1,1)],[(0,2),(1,2),(0,1),(1,1)],
[(2,0),(1,0),(2,1),(1,1)],[(0,0),(1,0),(0,1),(1,1)],
[(2,2),(3,2),(2,1),(3,1)],[(0,2),(3,2),(0,1),(3,1)],
[(2,0),(3,0),(2,1),(3,1)],[(0,0),(3,0),(0,1),(3,1)],
[(2,2),(1,2),(2,3),(1,3)],[(0,2),(1,2),(0,3),(1,3)],
[(2,0),(1,0),(2,3),(1,3)],[(0,0),(1,0),(0,3),(1,3)],
[(2,2),(3,2),(2,3),(3,3)],[(0,2),(3,2),(0,3),(3,3)],
[(2,0),(3,0),(2,3),(3,3)],[(0,0),(3,0),(0,3),(3,3)]
]
WATERFALL = [
[(2,0),(1,0),(2,1),(1,1)],[(0,0),(1,0),(0,1),(1,1)],
[(2,0),(3,0),(2,1),(3,1)],[(0,0),(3,0),(0,1),(3,1)]
]

def text(x):
    if isinstance(x, bytes): return decode(x)
    return str(x)

def simpl(x, depth=0):
    if depth > 24: return None
    if isinstance(x, bytes): return text(x)
    if isinstance(x, (int, float, bool)) or x is None: return x
    if isinstance(x, list): return [simpl(a, depth+1) for a in x]
    if isinstance(x, dict):
        if x.get("__class__") == b"Table":
            b = x.get("__binary__", b"")
            if len(b) < 20: return {"dimensions":[0,0,0],"data":[]}
            dims,w,h,d,count = struct.unpack_from("<5I",b)
            assert count * 2 + 20 == len(b), (count,len(b))
            return {"dimensions":[w,h,d],"data":list(struct.unpack_from("<%dH"%count,b,20))}
        if "__binary__" in x:
            return {"type":text(x.get("__class__", b""))}
        return {text(k).removeprefix("@"):simpl(v,depth+1) for k,v in x.items() if k not in ("__class__","__binary__")}
    return None

def get(z,name):
    return DataReader(z.read("Data/"+name+".rvdata2")).read()

def sprite_key(category,name):
    return category+"|"+name

def source_to_webp(z,member,category,name):
    key = sprite_key(category,name)
    blob = z.read(member)
    fn=hashlib.sha256(key.encode()).hexdigest()[:16]+".webp"
    p=GRAPHICS/fn
    im=Image.open(io.BytesIO(blob)).convert("RGBA")
    im.save(p,"WEBP",lossless=True,method=5)
    OUT["sprites"][key]="img/"+fn
    return im

def tileset_image(z,name,cache):
    if not name: return None
    if name not in cache:
        f="Graphics/Tilesets/"+name+".png"
        if f in z.namelist():
            cache[name]=Image.open(io.BytesIO(z.read(f))).convert("RGBA")
        else:
            print("MISSING TILESET:",f)
            cache[name]=None
    return cache[name]

def compose_tile(tile_id, sheet_names, z, cache):
    tid=tile_id
    if tid == 0: return None
    bx=by=0; table=None; setid=None
    if tid < 1024: # B C D E (ordinary 512x512 atlas)
        setid=5+tid//256
        xx=((tid//128)%2)*8 + tid%8
        yy=(tid%256)//8%16
        img=tileset_image(z,sheet_names[setid] if setid<len(sheet_names) else "",cache)
        if img is None: return None
        return img.crop((xx*32, yy*32, xx*32+32, yy*32+32))
    if 1536 <= tid < 1664:
        img=tileset_image(z,sheet_names[4],cache)
        if img is None: return None
        t=tid-1536
        return img.crop(((t%8)*32,(t//8)*32,(t%8+1)*32,(t//8+1)*32))
    if tid < 2048: return None
    kind=(tid-2048)//48; shape=(tid-2048)%48
    if kind < 16: # A1 animated water, single quiet frame
        setid=0; tx=kind%8; ty=kind//8
        if kind in (0,1,2,3):
            bx=0 if kind in (0,1) else 6
            by=0 if kind in (0,2) else 3
        else:
            bx=(tx//4)*8 + (0 if kind%2==0 else 6)
            by=ty*6 + ((tx%4)//2)*3
            if kind%2: table=WATERFALL
    elif kind < 48: # A2
        setid=1; k=kind-16
        bx=(k%8)*2; by=(k//8)*3
    elif kind < 80: # A3
        setid=2; k=kind-48
        bx=(k%8)*2; by=(k//8)*2; table=WALL
    elif kind < 128: # A4
        setid=3; k=kind-80
        bx=(k%8)*2; by=(k//16)*5+(3 if (k//8)%2 else 0)
        if (k//8)%2: table=WALL
    else: return None
    img=tileset_image(z,sheet_names[setid] if setid<len(sheet_names) else "",cache)
    if img is None: return None
    if table is None: table=FLOOR
    parts=table[shape % len(table)]
    out=Image.new("RGBA",(32,32))
    for i,(ox,oy) in enumerate(parts):
        sx=(bx*2+ox)*16; sy=(by*2+oy)*16
        if sx+16 <= img.width and sy+16 <= img.height:
            out.alpha_composite(img.crop((sx,sy,sx+16,sy+16)),((i%2)*16,(i//2)*16))
    return out

def main():
    GRAPHICS.mkdir(parents=True,exist_ok=True)
    MAPS.mkdir(parents=True,exist_ok=True)
    pack=gzip.decompress(GAME.read_bytes())
    z=zipfile.ZipFile(io.BytesIO(pack))
    print("Original game package",len(pack),"bytes; total entries",len(z.namelist()))
    names=set(z.namelist())
    for a in ["Actors","Classes","Enemies","Troops","Items","Weapons","Armors","Skills","States","System","CommonEvents"]:
        OUT["db"][a]=simpl(get(z,a))
    infos=get(z,"MapInfos")
    OUT["mapNames"]={str(k):text(v.get(b"@name",b"")) for k,v in infos.items() if isinstance(v,dict)}
    tilesets=simpl(get(z,"Tilesets"))
    OUT["db"]["Tilesets"]=[{"name":ts.get("name",""),"flags":ts.get("flags",{}).get("data",[])}
                            if ts else None for ts in tilesets]
    cache={}
    used=Counter()
    for n in sorted(n for n in names if re.fullmatch(r"Data/Map\d{3}\.rvdata2",n)):
        num=int(n[-13:-8]) if False else int(Path(n).stem[3:])
        m=simpl(DataReader(z.read(n)).read())
        w,h=m["width"],m["height"]
        raw=m.get("data",{}).get("data",[])
        assert len(raw) == w*h*4, (n,w,h,len(raw))
        ts=tilesets[m["tileset_id"]]
        sheets=ts["tileset_names"]
        bg=Image.new("RGBA",(w*32,h*32),(10,15,25,255))
        fg=Image.new("RGBA",(w*32,h*32))
        flags=OUT["db"]["Tilesets"][m["tileset_id"]]["flags"]
        cuts={}
        for y in range(h):
            for x in range(w):
                for layer in range(3):
                    tid=raw[(layer*h+y)*w+x]
                    if tid==0: continue
                    used[tid]+=1
                    if tid not in cuts:
                        cuts[tid]=compose_tile(tid,sheets,z,cache)
                    tile=cuts[tid]
                    if tile is None: continue
                    top=(layer==2 and tid<len(flags) and (flags[tid]&0x10)!=0)
                    if top: fg.alpha_composite(tile,(x*32,y*32))
                    else: bg.alpha_composite(tile,(x*32,y*32))
        # Event graphics referencing tiles are not part of the static map.
        # Export them separately so event page changes render without rebuilding maps.
        for e in m.get("events",{}).values():
            for pg in e.get("pages",[]):
                tid=int(pg.get("graphic",{}).get("tile_id",0) or 0)
                if tid<=0: continue
                key="EventTile|"+str(m["tileset_id"])+"|"+str(tid)
                if key in OUT["sprites"]: continue
                tile=cuts.get(tid)
                if tile is None: tile=compose_tile(tid,sheets,z,cache)
                if tile is None: continue
                filename=hashlib.sha256(key.encode()).hexdigest()[:16]+".webp"
                tile.save(GRAPHICS/filename,"WEBP",lossless=True,method=5)
                OUT["sprites"][key]="img/"+filename
        bgname=f"Map{num:03d}.webp"
        bg.convert("RGB").save(MAPS/bgname,"WEBP",quality=89,method=5)
        upper=None
        if fg.getbbox():
            upper=f"Map{num:03d}_upper.webp"
            fg.save(MAPS/upper,"WEBP",lossless=True,method=5)
        encounters=[]
        for e in m.get("encounter_list",[]):
            encounters.append(e)
        OUT["maps"][str(num)]={
            "id":num,"name":m.get("display_name") or OUT["mapNames"].get(str(num)) or ("マップ "+str(num)),
            "w":w,"h":h,"tileset":m["tileset_id"],"tiles":raw,
            "events":m.get("events",{}),
            "bg":"maps/"+bgname,
            "upper":("maps/"+upper if upper else ""),
            "encounters":encounters,
            "encounterStep":m.get("encounter_step",30),
            "scrollType":m.get("scroll_type",0)
        }
        print("MAP",num,w,h,"events",len(m.get("events",{})),"unique tiles",len(cuts),"bg", (MAPS/bgname).stat().st_size)
    # Only sprites necessary for visual gameplay. The game never requests audio.
    for n in sorted(names):
        a=re.fullmatch(r"Graphics/(Characters|Faces|Battlers|Battlebacks1|Battlebacks2)/([^/]+)\.png",n)
        if a:
            try: source_to_webp(z,n,a.group(1),a.group(2))
            except Exception as e: print("SPRITE FAILED",n,str(e)); raise
    dest=DEST/"data.json"
    dest.write_text(json.dumps(OUT,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    total=sum(p.stat().st_size for p in DEST.rglob("*") if p.is_file())
    print("BUILD DONE maps",len(OUT["maps"]),"sprites",len(OUT["sprites"]),"total bytes",total,"data bytes",dest.stat().st_size)
    print("AUTOTILES",sum(v for k,v in used.items() if k>=2048),"OTHER",sum(v for k,v in used.items() if k<2048))
    assert len(OUT["maps"])>=13
    assert all((DEST/m["bg"]).exists() for m in OUT["maps"].values())
    assert "Characters|mekka" in OUT["sprites"]
    assert total < 95_000_000, "unexpectedly large build"
if __name__=="__main__": main()
