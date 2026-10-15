"""Prepare a conservative, lossless static release from the working browser build."""
from pathlib import Path
import gzip, hashlib, json, re, shutil, zipfile, zlib
from asset_audit import DataReader, walk, decode
from inspect_game import MarshalReader, extract_rgss3

import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--browser-build',type=Path,required=True)
parser.add_argument('--archive',type=Path,required=True)
args=parser.parse_args()
BASE=args.browser_build.resolve()
DEST=Path(__file__).resolve().parent.parent
DOCS = DEST / 'docs'

def main():
    DOCS.mkdir(parents=True, exist_ok=True)
    (DOCS/'assets').mkdir(exist_ok=True)
    source = BASE/'web/tanoshi-boken.mkxpz'
    with zipfile.ZipFile(source) as z:
        entries = {n:z.read(n) for n in z.namelist()}
    # The native audio pack resolves this inn jingle; the unpacked source is in BGS.
    entries['Audio/ME/inn.ogg'] = entries['Audio/BGS/inn.ogg']
    scripts = MarshalReader(entries['Data/Scripts.rvdata2']).read()
    code = '\n'.join(decode(zlib.decompress(s[2])) for s in scripts)
    strings = set(re.findall(r'''["']([^"'\n]+)["']''',code))
    audio = set()
    for name,data in entries.items():
        if not name.startswith('Data/') or name.endswith('Scripts.rvdata2'): continue
        reader = DataReader(data)
        root = reader.read()
        assert reader.pos == len(data), name
        for node in walk(root):
            if isinstance(node,bytes): strings.add(decode(node))
            if isinstance(node,dict) and node.get('__class__') in (b'RPG::BGM',b'RPG::BGS',b'RPG::ME',b'RPG::SE'):
                sound = decode(node.get(b'@name',b''))
                if sound: audio.add('Audio/'+decode(node['__class__']).split('::')[-1]+'/'+sound)
    # Custom pictures include constructed names (face suffixes, lights, minimaps).
    original = extract_rgss3(args.archive.read_bytes())
    script_tokens = set(re.findall(r'''["']([^"'\n]+)["']''',code))
    keep = {}
    for name,data in entries.items():
        p=Path(name); stem=p.stem; no_ext=p.with_suffix('').as_posix()
        if name.startswith('Audio/'):
            wanted = name.startswith('Audio/SE/') or no_ext in audio or no_ext in script_tokens
            # Handle RPG::BGM.new("name") and event script strings conservatively.
            wanted |= stem in script_tokens and name.startswith(('Audio/BGM/','Audio/BGS/','Audio/ME/'))
        elif name.startswith('Graphics/'):
            wanted = name in original or stem in strings or name.startswith(('Graphics/System/','Graphics/Animations/'))
        elif name.startswith('Fonts/'):
            # VL Gothic contains the full Japanese glyph set; retain its license bundle.
            wanted = 'kiloji' not in name.lower() and 'VL-PGothic' not in name
        else: wanted = True
        if wanted: keep[name]=data
    # Validate every typed audio reference, including ME vs BGM category distinctions.
    missing = [n for n in sorted(audio) if not any(Path(k).with_suffix('').as_posix()==n for k in keep)]
    assert not missing, missing
    build=DEST/'build'; build.mkdir(exist_ok=True)
    archive=build/'tanoshi-boken.mkxpz'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as z:
        for name,data in sorted(keep.items()):
            info=zipfile.ZipInfo(name,(2026,10,15,0,0,0)); z.writestr(info,data)
    with zipfile.ZipFile(archive) as z: assert z.testzip() is None
    raw=archive.read_bytes(); game_hash=hashlib.sha256(raw).hexdigest()
    manifest={}
    for name,data in [('tanoshi-boken.mkxpz',raw),('mkxp-z_libretro.wasm',(BASE/'web/mkxp-z_libretro.wasm').read_bytes())]:
        packed=gzip.compress(data,compresslevel=9,mtime=0)
        digest=hashlib.sha256(data).hexdigest()
        packed_name=name+'.'+digest[:12]+'.gz'
        (DOCS/packed_name).write_bytes(packed)
        assert gzip.decompress(packed)==data
        manifest[name]={'file':packed_name,'size':len(data),'transfer':len(packed),'sha256':digest}
    player=(BASE/'web/assets/player.js').read_text(encoding='utf-8')
    player,n=re.subn(r'wn=\d+,X=0',f'wn={len(raw)},X=0',player); assert n==1
    player,n=re.subn(r'Dn=`[0-9a-f]{64}`',f'Dn=`{game_hash}`',player); assert n==1
    marker='else Bn+=e,Hn();if(a!=='
    assert player.count(marker)==1
    player=player.replace(marker,'else Bn+=e,Hn();if(i.size!==e)throw Error("Download size mismatch: "+n);if(a===`fetch`&&t){const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await i.arrayBuffer())),x=>x.toString(16).padStart(2,"0")).join("");if(digest!==t)throw Error("Download checksum mismatch: "+n)}if(a!==')
    (DOCS/'assets/player.js').write_text(player,encoding='utf-8')
    for name in ['mkxp-z_libretro.js','assets/index-lP0ZUypO.css']:
        shutil.copyfile(BASE/'web'/name,DOCS/name)
    css = (DOCS/'assets/index-lP0ZUypO.css').read_text(encoding='utf-8')
    css = re.sub(r'@font-face\s*\{[^}]*\}', '', css)
    css = css.replace('Roboto','system-ui')
    (DOCS/'assets/index-lP0ZUypO.css').write_text(css,encoding='utf-8')
    html=(BASE/'web/index.html').read_text(encoding='utf-8')
    html=re.sub(r'    function report\(kind,values\).*?\n','',html)
    html=html.replace('report(kind,args);','').replace("report('error',[message]);",'')
    html=html.replace('./assets/player.js','./boot.js')
    html=html.replace('同じブラウザ・同じURLで続きから遊べます。','同じブラウザ・同じURLで続きから遊べます。サイトデータの削除でセーブも消去されます。<br><a href="./credits.html" style="color:#bac7d7">クレジット・動作環境</a>')
    html=html.replace('初回は少し時間がかかります。',f'初回の通信量は約{sum(v["transfer"] for v in manifest.values())/1024/1024:.0f}MBです。')
    (DOCS/'index.html').write_text(html,encoding='utf-8')
    (DOCS/'.nojekyll').write_text('')
    (DOCS/'asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    report={'originalGameBytes':source.stat().st_size,'gameBytes':len(raw),'gameFiles':len(keep),'removedFiles':len(entries)-len(keep),'assets':manifest,'retained':sorted(keep),'removed':sorted(set(entries)-set(keep))}
    (DEST/'asset-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('retained','removed')},indent=2))

if __name__=='__main__': main()
