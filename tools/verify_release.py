"""Verify release integrity, reachable typed references, and static links."""
from pathlib import Path
import gzip, hashlib, io, json, re, zipfile
from urllib.parse import unquote
from asset_audit import DataReader, walk, decode

ROOT=Path(__file__).resolve().parent.parent
DOCS=ROOT/'docs'
manifest=json.loads((DOCS/'asset-manifest.json').read_text())
player=(DOCS/'assets/player.js').read_text(encoding='utf-8')
engine_hash=re.search(r'Tn=`([a-f0-9]{64})`',player)[1]
assert hashlib.sha256((DOCS/'mkxp-z_libretro.js').read_bytes()).hexdigest()==engine_hash
for name,asset in manifest.items():
    raw=gzip.decompress((DOCS/asset['file']).read_bytes())
    assert len(raw)==asset['size'],name
    assert hashlib.sha256(raw).hexdigest()==asset['sha256'],name
    if name.endswith('.mkxpz'): game=raw
for path in DOCS.rglob('*'):
    if path.is_file(): assert path.stat().st_size<100*1024*1024,path
with zipfile.ZipFile(io.BytesIO(game)) as z:
    assert z.testzip() is None
    assert all(n.compress_type==zipfile.ZIP_STORED for n in z.infolist())
    names={Path(n).with_suffix('').as_posix() for n in z.namelist()}
    assert not any(re.search(r'(?i)(?:\.exe|\.dll|\.rvdata2\.bak|Save\d+\.rvdata2)$',n) for n in z.namelist())
    data={}
    for name in z.namelist():
        if name.startswith('Data/') and not name.endswith('Scripts.rvdata2'):
            reader=DataReader(z.read(name));data[name]=reader.read()
            assert reader.pos==len(reader.data),name
    tilesets={v[b'@tileset_id'] for k,v in data.items() if re.match(r'Data/Map\d+\.rvdata2',k)}
    for root in data.values():
        for node in walk(root):
            if isinstance(node,dict) and node.get('__class__')==b'RPG::EventCommand' and node.get(b'@code')==282:
                tilesets.add(node[b'@parameters'][0])
    refs=set()
    fields={'character_name':'Characters','face_name':'Faces','battler_name':'Battlers','battleback1_name':'Battlebacks1','battleback2_name':'Battlebacks2','title1_name':'Titles1','title2_name':'Titles2','parallax_name':'Parallaxes','animation1_name':'Animations','animation2_name':'Animations'}
    for filename,root in data.items():
        if filename=='Data/Tilesets.rvdata2': root=[root[i] for i in tilesets]
        for obj in walk(root):
            if not isinstance(obj,dict): continue
            for key,folder in fields.items():
                v=obj.get(('@'+key).encode())
                if isinstance(v,bytes) and v:refs.add('Graphics/'+folder+'/'+decode(v))
            for v in obj.get(b'@tileset_names',[]):
                if v:refs.add('Graphics/Tilesets/'+decode(v))
            cls=obj.get('__class__')
            if cls in (b'RPG::BGM',b'RPG::BGS',b'RPG::ME',b'RPG::SE') and obj.get(b'@name'):
                refs.add('Audio/'+decode(cls).split('::')[-1]+'/'+decode(obj[b'@name']))
            if cls==b'RPG::EventCommand':
                p=obj.get(b'@parameters',[]);c=obj.get(b'@code')
                if c==231 and p[1]:refs.add('Graphics/Pictures/'+decode(p[1]))
                if c==322:
                    if p[1]:refs.add('Graphics/Characters/'+decode(p[1]))
                    if p[3]:refs.add('Graphics/Faces/'+decode(p[3]))
                if c==323 and p[1]:refs.add('Graphics/Characters/'+decode(p[1]))
                if c==283:
                    for folder,v in zip(['Battlebacks1','Battlebacks2'],p):
                        if v:refs.add('Graphics/'+folder+'/'+decode(v))
                if c==284 and p[0]:refs.add('Graphics/Parallaxes/'+decode(p[0]))
            if cls==b'RPG::MoveCommand' and obj.get(b'@code')==41:
                v=obj[b'@parameters'][0]
                if v:refs.add('Graphics/Characters/'+decode(v))
    assert not refs-names,sorted(refs-names)
    assert 'Audio/ME/inn.ogg' in z.namelist()
    print(f'Archive CRC, stored entries and {len(data)} Ruby data files: OK')
    print(f'{len(refs)} typed assets and event references, {len(tilesets)} used tilesets: OK')
for path in DOCS.rglob('*.html'):
    for link in re.findall(r'(?:src|href)="([^"]+)"',path.read_text(encoding='utf-8')):
        if link.startswith(('http:','https:','data:','#')):continue
        assert (path.parent/unquote(link.split('#')[0])).exists(),(path,link)
html=(DOCS/'index.html').read_text(encoding='utf-8')
assert '/client-log' not in html
assert not re.search(r'@font-face', (DOCS/'assets/index-lP0ZUypO.css').read_text())
print('Gzip SHA-256, GitHub file sizes, static links, no remote logging: OK')
print(f'Initial binary transfer: {sum(a["transfer"] for a in manifest.values())/1024/1024:.2f} MiB')
