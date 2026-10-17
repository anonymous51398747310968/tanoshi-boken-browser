/* 楽しい冒険を始まる — silent Canvas2D port
   No WebGL, WebAudio, audio elements, external CDNs or executable Ruby.
   Static assets & event/database data are converted from the author's published package.
*/
"use strict";
(() => {
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha:false, desynchronized:true });
const status = document.getElementById("status");
const W=544,H=416,T=32,SAVE_KEY="tanoshi-silent-2d-v1";
ctx.imageSmoothingEnabled=false;
let D=null,G=null,mode="loading",busy=false,modal=null,battle=null;
let images={},stepAt=0,path=[],lastClock=0,lastFrame=0,autoSeen=new Set(),messageTimer=null,mouseTarget=null;
let pointerX=0,pointerY=0;
const keys=new Set();
const DIRS={ArrowDown:2,ArrowLeft:4,ArrowRight:6,ArrowUp:8};
const DELTA={2:[0,1],4:[-1,0],6:[1,0],8:[0,-1]};
const NAME_COLORS=["#f6df9f","#bfe3ff","#f4bee4","#bce9cf"];
function rand(n){return Math.floor(Math.random()*Math.max(n,1))}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function arr(a){return Array.isArray(a)?a:[]}
function db(type,id){return (D?.db?.[type]||[])[Number(id)]||null}
function variable(id){return Number(G.vars[id]||0)}
function titleStatus(s){status.textContent=s}
function imagePath(key){return D?.sprites[key]||""}
function image(rel){
 if(!rel)return null;
 if(!images[rel]){
  const a=new Image();a.decoding="async";a.onload=()=>requestFrame();a.onerror=()=>{a.broken=true;requestFrame()};
  a.src=rel; images[rel]=a;
 }
 return images[rel].complete && images[rel].naturalWidth ? images[rel]:null;
}
function preload(rel){if(rel)image(rel)}
function requestFrame(){lastFrame=0}
function tblValue(t,x,y){if(!t||!t.dimensions)return 0;return t.data[y*t.dimensions[0]+x]||0}
function classStat(id,level,idx){
 const a=db("Actors",id),cls=db("Classes",a?.class_id);
 const t=cls?.params;return tblValue(t,idx,clamp(level,1,99))||[80,30,12,8,12,8,12,10][idx];
}
function actor(id){return G.actors[id]||(G.actors[id]=initialActor(id))}
function equipParams(id){
 const a=actor(id),stats=Array(8).fill(0);
 arr(a.equips).forEach((equip,slot)=>{
  const x=slot===0?db("Weapons",equip):db("Armors",equip);
  if(x)arr(x.params).forEach((v,i)=>stats[i]+=(Number(v)||0));
 });
 return stats;
}
function stats(id){
 const a=actor(id),eq=equipParams(id);
 const n=arr(eq).map((v,i)=>classStat(id,a.level,i)+v);
 return {maxhp:Math.max(1,n[0]),maxmp:Math.max(0,n[1]),atk:n[2],def:n[3],mat:n[4],mdf:n[5],agi:n[6],luk:n[7]};
}
function initialActor(id){
 const data=db("Actors",id)||{},lv=Number(data.initial_level||1);
 return {level:lv,exp:0,hp:classStat(id,lv,0),mp:classStat(id,lv,1),equips:arr(data.equips).slice(),name:data.name||("冒険者"+id),states:[]};
}
function makeState(){
 const s=D.db.System||{};
 const a={mapId:Number(s.start_map_id||3),x:Number(s.start_x||1),y:Number(s.start_y||0),
 dir:2,steps:0,gold:0,vars:{},switches:{},self:{},positions:{},party:arr(s.party_members).slice(),
 actors:{},items:{},weapons:{},armors:{},encounter:0,time:Date.now()};
 G=a;for(const id of [1,2])a.actors[id]=initialActor(id);
 return a;
}
function currentMap(){return D?.maps?.[String(G?.mapId)]||null}
function save(slot="auto"){
 if(!G)return;
 try{
  const data=JSON.stringify({v:1,at:Date.now(),state:G});
  localStorage.setItem(SAVE_KEY+":"+slot,data);
  if(slot!=="auto")titleStatus("スロット "+slot+" に保存しました");
  return true;
 }catch(e){titleStatus("セーブに失敗しました（保存領域を確認してください）");return false}
}
function getSave(slot){
 try{const raw=localStorage.getItem(SAVE_KEY+":"+slot);if(!raw)return null;
 const value=JSON.parse(raw);return value?.v===1&&value.state&&D?.maps?.[String(value.state.mapId)]?value:null;
 }catch{return null}
}
function loadSave(slot){
 const value=getSave(slot);if(!value)return false;
 G=value.state; G.vars ||= {};G.switches ||= {};G.self ||= {};G.positions ||= {};G.actors ||= {};
 for(const id of [1,2])if(!G.actors[id])G.actors[id]=initialActor(id);
 G.party ||= [1];G.items ||= {};G.weapons ||= {};G.armors ||= {};
 G.encounter ||= 0;path=[];autoSeen=new Set();
 mode="map";battle=null;modal=null;busy=false;
 prepareMap();save("auto");return true;
}
function saveTitle(slot){
 const q=getSave(slot);return q?"（"+new Date(q.at).toLocaleString("ja-JP")+"）":"（空）";
}
function csvLabel(id){return actor(id).name||db("Actors",id)?.name||"冒険者"}
function expNext(a){return 22*Math.pow(Math.max(1,a.level),1.7)}
function addExp(id,n){
 const a=actor(id),old=a.level;a.exp+=Math.max(0,Number(n)||0);
 while(a.exp>=expNext(a)&&a.level<50){
  a.exp-=expNext(a);a.level++;a.hp=stats(id).maxhp;a.mp=stats(id).maxmp;
 }
 return a.level-old;
}
function addGold(v){G.gold=clamp(G.gold+Math.round(Number(v)||0),0,999999)}
function changeItems(kind,id,num){const inv=G[kind],k=String(id);inv[k]=Math.max(0,(inv[k]||0)+Math.round(num));return inv[k]}
function makeAsset(){const m=currentMap();if(!m)return;preload(m.bg);preload(m.upper);
 for(const e of Object.values(m.events||{})){const pg=pageFor(e);if(pg?.graphic?.character_name)preload(imagePath("Characters|"+pg.graphic.character_name))}
 for(const a of G.party){let actorData=db("Actors",a);if(actorData?.character_name)preload(imagePath("Characters|"+actorData.character_name))}
}
function prepareMap(){
 const m=currentMap();if(!m){mode="error";titleStatus("マップの読み込みに失敗しました");return}
 G.x=clamp(G.x,0,m.w-1);G.y=clamp(G.y,0,m.h-1);
 titleStatus(m.name+"　／　移動 ↑↓←→　決定 Z　メニュー X　（無音）");
 makeAsset();requestFrame();
 queueMicrotask(checkAuto);
}
function changeMap(mapId,x,y,d=G.dir){
 if(!D.maps[String(mapId)])return false;
 G.mapId=Number(mapId);G.x=Number(x)||0;G.y=Number(y)||0;G.dir=Number(d)||2;G.encounter=0;
 path=[];mouseTarget=null;autoSeen=new Set();
 prepareMap();save("auto");return true;
}
function selfKey(eventId,ch){return G.mapId+":"+eventId+":"+ch}
function posFor(e){return G.positions[G.mapId+":"+e.id]||{x:e.x,y:e.y,dir:2}}
function conditionOk(c={},eid){
 const s=G.switches,v=G.vars;
 if(c.switch1_valid&&!s[c.switch1_id])return false;
 if(c.switch2_valid&&!s[c.switch2_id])return false;
 if(c.variable_valid&&Number(v[c.variable_id]||0)<Number(c.variable_value))return false;
 if(c.self_switch_valid&&!G.self[selfKey(eid,c.self_switch_ch)])return false;
 if(c.item_valid&&!G.items[String(c.item_id)])return false;
 if(c.actor_valid&&!G.party.includes(c.actor_id))return false;
 return true;
}
function pageFor(e){
 const ps=arr(e?.pages);
 for(let i=ps.length-1;i>=0;i--){if(conditionOk(ps[i].condition,e.id))return {...ps[i],pageIndex:i}}
 return null;
}
function entitiesAt(x,y){const m=currentMap();return Object.values(m?.events||{}).filter(e=>{const p=posFor(e);return p.x===x&&p.y===y&&pageFor(e)})}
function eventById(id){return currentMap()?.events?.[String(id)]||null}
function passable(x,y,dir){
 const m=currentMap();if(!m||x<0||y<0||x>=m.w||y>=m.h)return false;
 const flags=D.db.Tilesets[m.tileset]?.flags||[],o={2:1,4:2,6:4,8:8};
 const zdata=m.tiles;
 for(let z=2;z>=0;z--){
  const tid=zdata[(z*m.h+y)*m.w+x]||0;
  if(!tid)continue;
  const flag=flags[tid]||0;
  if(flag&0x10)continue;
  return (flag & (o[dir]||0))===0;
 }
 return true;
}
function canMove(dx,dy){
 const m=currentMap();if(!m)return false;
 const x=G.x+dx,y=G.y+dy;
 const dir=dx>0?6:dx<0?4:dy>0?2:8;
 const reverse={2:8,4:6,6:4,8:2}[dir];
 if(!passable(G.x,G.y,dir)||!passable(x,y,reverse))return false;
 for(const e of entitiesAt(x,y)){
  const p=pageFor(e);
  if(p.priority_type===1&&!p.through)return false;
 }
 return true;
}
function setPosition(who,x,y,dir){
 if(who===-1){G.x=x;G.y=y;if(dir)G.dir=dir}
 else if(who>0){const e=eventById(who);if(e)G.positions[G.mapId+":"+who]={x,y,dir:dir||posFor(e).dir}}
}
function tryTouchAt(x,y,trigger=1){
 for(const e of entitiesAt(x,y)){
  const p=pageFor(e);if(p&&(p.trigger===trigger||p.trigger===2))return runEvent(e,p);
 }
 return null;
}
function move(dir,forced=false){
 const d=DELTA[dir];if(!d||!G||!currentMap())return false;
 G.dir=dir;
 if(!forced&&!canMove(...d)){
  if(!busy){const e=entitiesAt(G.x+d[0],G.y+d[1]).find(e=>{const p=pageFor(e);return p&&p.trigger===2});
    if(e)runEvent(e,pageFor(e));}
  return false;
 }
 let x=G.x+d[0],y=G.y+d[1],m=currentMap();
 if(x<0||y<0||x>=m.w||y>=m.h)return false;
 G.x=x;G.y=y;G.steps++;
 if(!forced){
  if(G.steps%5===0)save("auto");
  tryTouchAt(x,y,1);
  if(!busy)encounterStep();
 }
 requestFrame();return true;
}
function faceTarget(){
 const d=DELTA[G.dir]||DELTA[2],x=G.x+d[0],y=G.y+d[1];
 const targets=entitiesAt(x,y).concat(entitiesAt(G.x,G.y).filter(e=>pageFor(e)?.priority_type===0));
 const e=targets.find(e=>pageFor(e)?.trigger===0);
 if(e)return runEvent(e,pageFor(e));
}
function encounterStep(){
 const m=currentMap(),ls=arr(m?.encounters);if(!ls.length||busy)return;
 if(G.party.some(a=>arr(actor(a).equips).includes(30)))return;
 G.encounter=(G.encounter||0)+1;
 if(G.encounter<(m.encounterStep||30)/2+rand(2))return;
 G.encounter=0;
 const total=ls.reduce((s,e)=>s+(e.weight||1),0);
 let n=rand(total),chosen=ls[0];
 for(const e of ls){n-=(e.weight||1);if(n<0){chosen=e;break}}
 startBattle(Number(chosen.troop_id||chosen.troopId||1));
}
function checkAuto(){
 if(!D||!G||busy||mode!=="map")return;
 for(const e of Object.values(currentMap()?.events||{})){
  const p=pageFor(e);
  if(!p||p.trigger!==3)continue;
  const sig=G.mapId+":"+e.id+":"+p.pageIndex;
  if(autoSeen.has(sig))continue;
  autoSeen.add(sig);runEvent(e,p);return;
 }
}
function plain(s){
 return String(s==null?"":s)
 .replace(/\\V\[(\d+)\]/gi,(_,n)=>String(variable(n)))
 .replace(/\\N\[(\d+)\]/gi,(_,n)=>actor(Number(n)).name)
 .replace(/\\P\[(\d+)\]/gi,(_,n)=>csvLabel(G.party[Number(n)-1]||1))
 .replace(/\\G/gi,"G")
 .replace(/\\[CcIi]\[\d+\]/g,"")
 .replace(/\\[{}.!|><^$]/g,"")
 .replace(/\\\\/g,"\\");
}
function modalStart(type,title,lines,choices,face){
 return new Promise(resolve=>{
  modal={type,title,lines:arr(lines),items:arr(choices),cursor:0,resolve,face,
    previous:battle?"battle":"map",created:performance.now()};
  mode=type;requestFrame();
 });
}
function finishModal(value){
 if(!modal)return;
 const m=modal;modal=null;mode=m.previous;m.resolve(value);requestFrame();
}
function say(lines,face=""){
 const filtered=arr(lines).map(s=>plain(s)).filter(x=>x!==null);
 return modalStart("message","",filtered,[],face);
}
function choose(title,items,allowCancel=true){
 return new Promise(resolve=>{
  modal={type:"select",title:plain(title),items:arr(items).map(q=>typeof q==="string"?{label:q}:q),cursor:0,
    resolve,allowCancel,previous:battle?"battle":"map",created:performance.now()};
  mode="select";requestFrame();
 });
}
function inputModal(key){
 if(!modal)return;
 if(modal.type==="message"){
  if(["Enter","z","Z"," ","Escape","x","X"].includes(key))finishModal(0);
  return;
 }
 if(modal.type==="select"){
  if(["ArrowUp","w","W"].includes(key)){modal.cursor=(modal.cursor+modal.items.length-1)%Math.max(1,modal.items.length)}
  if(["ArrowDown","s","S"].includes(key)){modal.cursor=(modal.cursor+1)%Math.max(1,modal.items.length)}
  if(["Escape","x","X"].includes(key)&&modal.allowCancel!==false)finishModal(-1);
  if(["Enter","z","Z"," "].includes(key)&&!modal.items[modal.cursor]?.disabled)finishModal(modal.cursor);
  requestFrame();
 }
}
function jumpPast(list,at,indent,match){
 for(let j=at+1;j<list.length;j++){
  const c=list[j];
  if(c[1]===indent&&match.includes(c[0]))return j;
 }
 return list.length;
}
function rangeOperation(first,last,fn){
 const to=Math.min(Math.max(first,last),999);for(let i=first;i<=to;i++)fn(i);
}
function eventValue(cmd){
 let [type,id,a,b]=cmd;
 if(type===0)return Number(id)||0;
 if(type===1)return variable(id);
 if(type===2){let low=Number(id),hi=Number(a);return low+rand(hi-low+1)}
 if(type===3){
  const source=Number(id);
  if(source===6)return G.steps;
  if(source===7)return G.gold;
  if(source===1)return actor(a||1).level;
  return 0;
 }
 if(type===4)return rubyValue(String(id));
 return Number(id)||0;
}
function rubyValue(src){
 const cleaned=String(src||"").trim();
 const v=cleaned.match(/\$game_variables\[(\d+)\]/);
 if(cleaned.includes("$game_party.gold"))return G.gold;
 if(cleaned.includes("$game_party.members.size"))return G.party.length;
 if(cleaned.match(/\$game_actors\[(\d+)\]\.level/)){
  let x=cleaned.replace(/\$game_actors\[(\d+)\]\.level/g,(_,id)=>actor(Number(id)).level)
   .replace(/\$game_variables\[(\d+)\]/g,(_,id)=>variable(id)).replace(/\.round\b/g,"");
  if(/^[\d+\-*/().\s]+$/.test(x)){
   try{return Math.round(Function('"use strict";return ('+x+')')())||0}catch{}
  }
 }
 if(v)return variable(v[1]);return 0;
}
function testRuby(textExpr){
 const exp=String(textExpr||"").trim();
 let m=exp.match(/\$game_party\.gold\s*(<=|>=|==|!=|<|>)\s*\$game_variables\[(\d+)\]/);
 if(m)return compare(G.gold,variable(m[2]),m[1]);
 m=exp.match(/\$game_variables\[(\d+)\]\s*(<=|>=|==|!=|<|>)\s*(\d+)/);
 if(m)return compare(variable(m[1]),Number(m[3]),m[2]);
 m=exp.match(/\$game_switches\[(\d+)\]/);if(m)return !!G.switches[m[1]];
 m=exp.match(/\$game_party\.members\.size\s*(<=|>=|==|!=|<|>)\s*(\d+)/);
 if(m)return compare(G.party.length,Number(m[2]),m[1]);
 if(exp.startsWith("!"))return !testRuby(exp.slice(1));
 return false;
}
function compare(a,b,op){return op==="=="?a==b:op==="!="?a!=b:op===">="?a>=b:op==="<="?a<=b:op===">"?a>b:a<b}
function branchCondition(p,eventId){
 const type=p[0],a=p[1],b=p[2];
 if(type===0)return !!G.switches[a]===(b===0);
 if(type===1)return compare(variable(a),b===0?p[3]:variable(p[3]),["==",">=", "<=",">","<","!="][p[4]||0]||"==");
 if(type===2)return !!G.self[selfKey(eventId,a)]===(b===0);
 if(type===4)return G.party.includes(a);
 if(type===8)return (G.items[a]||0)>0;
 if(type===9)return (G.weapons[a]||0)>0;
 if(type===10)return (G.armors[a]||0)>0;
 if(type===11)return keys.has(["ArrowDown","ArrowLeft","ArrowRight","ArrowUp"][a]||"");
 if(type===6){const t=a===-1?G.dir:posFor(eventById(a)||{id:0,x:0,y:0}).dir;return Number(t)===Number(b)}
 if(type===12)return testRuby(String(a));
 return false;
}
function targetEventId(param,eventId){return param===0?eventId:param}
function setValueRange(p){
 const [from,to,op,operandType,a,b,c]=p;
 const v=eventValue([operandType,a,b,c]);
 rangeOperation(from,to,id=>{
  const val=variable(id);
  G.vars[id]=Math.round(op===0?v:op===1?val+v:op===2?val-v:op===3?val*v:op===4?(v?val/v:0):(v?val%v:0));
 });
}
function adjustPartyNumber(kind,p){
 const [id,op,type,val]=p; const n=type===0?Number(val)||0:variable(val);
 changeItems(kind,id,op===0?n:-n);
}
async function moveRoute(target,route,eid){
 let id=targetEventId(target,eid);
 for(const c of arr(route?.list).slice(0,90)){
  const code=c.code,params=arr(c.parameters);
  if(code>=1&&code<=4){
   let d=[null,2,4,6,8][code],q=DELTA[d];if(id===-1)move(d,true);
   else {const e=eventById(id);if(e){let pos=posFor(e);setPosition(id,clamp(pos.x+q[0],0,currentMap().w-1),clamp(pos.y+q[1],0,currentMap().h-1),d)}}
   await sleep(65);
  }else if(code===15){await sleep(Math.min((params[0]||10)*12,450))}
  else if(code>=16&&code<=19){
   const d=[2,4,6,8][code-16];
   if(id===-1)G.dir=d;
   else {const e=eventById(id);if(e){const pos=posFor(e);setPosition(id,pos.x,pos.y,d)}}
  }
 }
 requestFrame();
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function scriptCode(src){
 let x=String(src||"");
 let a=x.match(/\$game_variables\[(\d+)\]\s*=\s*([\s\S]+)/);
 if(a){G.vars[a[1]]=rubyValue(a[2]);return "variable"}
 a=x.match(/\$game_switches\[(\d+)\]\s*=\s*(true|false)/);
 if(a){G.switches[a[1]]=a[2]==="true";return "switch"}
 if(/Scene_ItemSynthesis|recipe_switch_on|ItemSynthesis/.test(x))return "synthesis";
 if(/SceneManager\.goto\(Scene_Title\)/.test(x))return "title";
 return "ignore";
}
async function runScript(src){
 const command=scriptCode(src);
 if(command==="synthesis")await synthesis();
 if(command==="title"){battle=null;mode="title";busy=false}
}
async function runEvent(event,p=pageFor(event),options={}){
 if(!event||!p||busy&&!options.nested)return;
 const prior=busy;busy=true;path=[];let didTransfer=false;
 try{
  const list=arr(p.list),id=event.id;
  let choice={indent:-1,selected:-1},battleChoice={indent:-1,result:0};
  const loops=[];
  for(let i=0;i<list.length;i++){
   if(!G||mode==="title"||mode==="gameover")break;
   const [code,indent,params]=[list[i].code,list[i].indent,arr(list[i].parameters)],v=params;
   if(code===0||code===108||code===408||code===118||code===119||code===250||code===241||code===245||code===249||code===132||code===133||code===117&&!db("CommonEvents",v[0]))continue;
   if(code===101){
    const lines=[];
    while(list[i+1]?.code===401)lines.push(list[++i].parameters[0]);
    if(lines.length){await say(lines,v[0]?("Faces|"+v[0]+"|"+(v[1]||0)):"")}
   }
   else if(code===102){
    choice={indent,selected:await choose("選んでください",arr(v[0]).map(plain),Number(v[1])!==5)};
   }
   else if(code===402){
    if(choice.indent===indent&&choice.selected!==v[0])i=jumpPast(list,i,indent,[402,403,404])-1;
   }
   else if(code===403){
    if(choice.selected!==-1)i=jumpPast(list,i,indent,[404])-1;
   }
   else if(code===112){loops.push({index:i,indent})}
   else if(code===113){const last=loops.pop();if(last)i=jumpPast(list,i,last.indent,[413])}
   else if(code===413){const last=loops[loops.length-1];if(last&&last.indent===indent)i=last.index;}
   else if(code===111){
    if(!branchCondition(v,id))i=jumpPast(list,i,indent,[411,412])-1;
   }
   else if(code===411){i=jumpPast(list,i,indent,[412])-1}
   else if(code===121){rangeOperation(v[0],v[1],n=>{G.switches[n]=v[2]===0})}
   else if(code===122){setValueRange(v)}
   else if(code===123){G.self[selfKey(id,v[0])]=v[1]===0}
   else if(code===125){const n=v[1]===0?Number(v[2]):variable(v[2]);addGold(v[0]===0?n:-n)}
   else if(code===126){adjustPartyNumber("items",v)}
   else if(code===127){adjustPartyNumber("weapons",v)}
   else if(code===128){adjustPartyNumber("armors",v)}
   else if(code===129){
    const a=Number(v[0]);if(v[1]===0&&!G.party.includes(a)){G.party.push(a);actor(a)}
    else if(v[1]===1){G.party=G.party.filter(q=>q!==a)}
   }
   else if(code===201){
    const x=v[0]===0?v[2]:variable(v[2]),y=v[0]===0?v[3]:variable(v[3]);
    const map=v[0]===0?v[1]:variable(v[1]);
    if(changeMap(map,x,y,v[4]||G.dir)){didTransfer=true}
   }
   else if(code===203){
    const who=targetEventId(v[0],id),p0=who===-1?{x:G.x,y:G.y,dir:G.dir}:posFor(eventById(who)||event);
    const nx=v[1]===1?variable(v[2]):v[2],ny=v[1]===1?variable(v[3]):v[3];
    if(v[1]===2){const other=posFor(eventById(v[2])||event);setPosition(who,other.x,other.y,p0.dir);setPosition(v[2],p0.x,p0.y,other.dir)}
    else setPosition(who,nx,ny,v[4]||p0.dir);
   }
   else if(code===205){await moveRoute(v[0],v[1],id)}
   else if(code===206){/* vehicle not used */ }
   else if(code===211){G.transparent=v[0]===0}
   else if(code===212||code===213||code===216||code===221||code===222||code===223||code===225||code===231||code===232||code===233||code===234||code===235||code===236||code===251||code===242||code===246||code===261||code===281||code===282||code===283||code===284||code===285||code===293){/* silent visual effects omitted */}
   else if(code===230){await sleep(Math.min((v[0]||1)*1000/60,1250))}
   else if(code===301){
    const troop=v[0]===0?v[1]:v[0]===1?variable(v[1]):1;
    battleChoice={indent,result:await fight(troop)};
   }
   else if(code===601||code===602||code===603){
    const desired=code-601;
    if(battleChoice.result!==desired)i=jumpPast(list,i,indent,[601,602,603,604])-1;
   }
   else if(code===302){
    let goods=[v.slice(0,4)];
    while(list[i+1]?.code===605)goods.push(list[++i].parameters.slice(0,4));
    await shop(goods);
   }
   else if(code===303){actor(v[0]).name=prompt("名前を入力",actor(v[0]).name)||actor(v[0]).name}
   else if(code===311){modifyStats("hp",v)}
   else if(code===312){modifyStats("mp",v)}
   else if(code===314){recoverAll()}
   else if(code===315){const who=v[0],n=v[2]===0?v[3]:variable(v[3]);(who? [who]:G.party).forEach(a=>addExp(a,v[1]===0?n:-n))}
   else if(code===316){const who=v[0],n=v[2]===0?v[3]:variable(v[3]);(who?[who]:G.party).forEach(a=>{const x=actor(a);x.level=clamp(x.level+(v[1]===0?n:-n),1,50)})}
   else if(code===317){/* permanent attribute adjustment not critical */ }
   else if(code===318){const who=v[0]||G.party[0];const a=actor(who);a.learned ||= [];if(v[1]===0&&!a.learned.includes(v[2]))a.learned.push(v[2])}
   else if(code===319){const a=actor(v[0]);a.equips[v[1]]=v[2]}
   else if(code===321){actor(v[0]).classId=v[1]}
   else if(code===322){actor(v[0]).graphic=v[1]}
   else if(code===331||code===332||code===333||code===334||code===335||code===336){/* battle event state handled at battle close */ }
   else if(code===351){await mainMenu()}
   else if(code===352){await saveMenu()}
   else if(code===353){mode="gameover";break}
   else if(code===354){mode="title";break}
   else if(code===355){
    let script=String(v[0]||"");while(list[i+1]?.code===655)script+="\n"+String(list[++i].parameters[0]||"");
    await runScript(script);
   }
   else if(code===117){
    const common=db("CommonEvents",v[0]);
    if(common?.list)await runEvent({id, pages:[]},{list:common.list}, {nested:true});
   }
   else if(code===115){break}
   // Unsupported display-only commands deliberately do not block event progress.
  }
 }catch(e){console.error("Event processing",e);titleStatus("イベント処理の問題: "+String(e?.message||e))}
 finally{
  busy=prior; if(mode!=="title"&&mode!=="gameover"&&!modal){mode=battle?"battle":"map"}
  if(!busy){save("auto");queueMicrotask(checkAuto)}
  if(didTransfer)requestFrame();
 }
}
function modifyStats(name,v){
 const who=v[0]? [v[0]]:G.party;
 const q=v[2]===0?v[3]:variable(v[3]);
 for(const id of who){const a=actor(id);a[name]=clamp(a[name]+(v[1]===0?q:-q),0,stats(id)[name==="hp"?"maxhp":"maxmp"])}
}
function recoverAll(){for(const id of G.party){const a=actor(id),s=stats(id);a.hp=s.maxhp;a.mp=s.maxmp;a.states=[]}}
function currency(n){return Math.max(0,Number(n)||0).toLocaleString("ja-JP")+"G"}
function inventoryKind(type){return type===0?"items":type===1?"weapons":"armors"}
function itemName(type,id){return db(type,id)?.name||"不明な道具"}
async function shop(goods){
 const stock=goods.map(g=>{
  const kind=inventoryKind(g[0]),id=Number(g[1]);const item=db(kind==="items"?"Items":kind==="weapons"?"Weapons":"Armors",id);
  const price=g[2]===1?g[3]:item?.price||0;
  return {kind,id,item,price,caption:(item?.name||"品物")+"　"+currency(price)}
 }).filter(x=>x.item);
 for(;;){
  const ch=await choose("お店　所持金 "+currency(G.gold),["買う","売る","やめる"]);
  if(ch===-1||ch===2)break;
  if(ch===0){
   const v=await choose("買う　所持金 "+currency(G.gold),stock.map(s=>({label:s.caption,disabled:G.gold<s.price})));
   if(v<0)continue;
   const item=stock[v];if(!item||G.gold<item.price)continue;
   addGold(-item.price);changeItems(item.kind,item.id,1);await say([item.item.name+"を買った！"]);save("auto");
  }else{
   const owned=[];
   for(const [kind,type] of [["items","Items"],["weapons","Weapons"],["armors","Armors"]]){
    for(const [id,count] of Object.entries(G[kind]))if(count>0&&db(type,id)?.price)owned.push({kind,id,count,item:db(type,id)});
   }
   if(!owned.length){await say(["売れるものはないようだ。"]);continue}
   const v=await choose("売る　所持金 "+currency(G.gold),owned.map(o=>o.item.name+" ×"+o.count+"　"+currency(Math.floor(o.item.price/2))));
   if(v<0)continue;
   const q=owned[v],price=Math.floor(q.item.price/2);if(q.count>0){changeItems(q.kind,q.id,-1);addGold(price);await say([q.item.name+"を売った。"]);save("auto")}
  }
 }
}
async function synthesis(){
 for(;;){
  const options=[
   {from:"items",id:10,count:2,name:"スライムゼリー ×2 → ミニポーション",to:2},
   {from:"items",id:10,count:3,name:"スライムゼリー ×3 → ポーション",to:1}
  ];
  const n=await choose("アイテム合成",options.map(o=>({label:o.name,disabled:(G.items[o.id]||0)<o.count})));
  if(n<0)return;
  let q=options[n];if(q&&(G.items[q.id]||0)>=q.count){changeItems(q.from,q.id,-q.count);changeItems("items",q.to,1);await say([itemName("Items",q.to)+"を合成した！"]);save("auto")}
 }
}
async function mainMenu(){
 if(!G||mode==="title")return;const prev=busy;busy=true;
 try{
  for(;;){
   const ch=await choose("メニュー　"+currency(G.gold),["アイテム","スキル","装備","ステータス","セーブ","ロード","冒険に戻る","タイトルに戻る"]);
   if(ch<0||ch===6)break;
   if(ch===0)await itemMenu();
   if(ch===1)await skillMenu();
   if(ch===2)await equipMenu();
   if(ch===3)await statusMenu();
   if(ch===4)await saveMenu();
   if(ch===5)await loadMenu();
   if(ch===7){if(await choose("タイトルに戻りますか？",["戻る","キャンセル"])===0){battle=null;mode="title";break}}
  }
 }finally{busy=prev;if(mode!=="title")mode="map";requestFrame()}
}
function applyItemToActor(item,id){
 const a=actor(id),st=stats(id),e=arr(item.effects);let healed=0;
 for(const f of e){
  if(f.code===11){const n=Math.round(st.maxhp*(f.value1||0)+(f.value2||0));a.hp=clamp(a.hp+n,0,st.maxhp);healed+=n}
  if(f.code===12){const n=Math.round(st.maxmp*(f.value1||0)+(f.value2||0));a.mp=clamp(a.mp+n,0,st.maxmp);healed+=n}
  if(f.code===22){a.states=arr(a.states).filter(x=>x!==f.data_id);healed+=1}
 }
 if(!e.length&&item.damage?.type===3){a.hp=clamp(a.hp+30,0,st.maxhp);healed+=30}
 return healed;
}
async function itemMenu(){
 for(;;){
  const items=Object.entries(G.items).filter(([id,n])=>n>0&&db("Items",id));
  if(!items.length){await say(["持ち物は空っぽだ。"]);return}
  const n=await choose("アイテム",items.map(([id,c])=>itemName("Items",id)+" ×"+c));
  if(n<0)return;
  const [id]=items[n],item=db("Items",id);
  if(!item||item.occasion===1){await say(["今は使えない。"]);continue}
  const ix=await choose(item.name+"を誰に使う？",G.party.map(id=>csvLabel(id)+"　HP "+actor(id).hp+"/"+stats(id).maxhp));
  if(ix<0)continue;const a=G.party[ix];
  const val=applyItemToActor(item,a);
  if(!val){await say(["効果がなかった。"]);continue}
  if(item.consumable!==false)changeItems("items",id,-1);
  await say([csvLabel(a)+"は回復した。"]);save("auto");
 }
}
function availableSkills(id){
 const a=actor(id),act=db("Actors",id),c=db("Classes",a.classId||act?.class_id);
 const skills=new Set(arr(a.learned));
 for(const learn of arr(c?.learnings))if(learn.level<=a.level)skills.add(learn.skill_id);
 return [...skills].filter(n=>db("Skills",n)?.name);
}
async function skillMenu(){
 for(;;){
  const n=await choose("スキル　使う仲間",G.party.map(id=>csvLabel(id)+" Lv."+actor(id).level));
  if(n<0)return;const id=G.party[n];
  const skills=availableSkills(id).filter(i=>db("Skills",i)?.occasion!==1);
  if(!skills.length){await say(["使えるスキルがない。"]);continue}
  const ix=await choose(csvLabel(id)+"のスキル",skills.map(s=>db("Skills",s).name+"　MP "+(db("Skills",s).mp_cost||0)));
  if(ix<0)continue;const skill=db("Skills",skills[ix]),a=actor(id);
  if(a.mp<skill.mp_cost){await say(["MPが足りない。"]);continue}
  let target=id;
  if(skill.scope!==11){const q=await choose("対象を選ぶ",G.party.map(i=>csvLabel(i)+" HP "+actor(i).hp));if(q<0)continue;target=G.party[q]}
  a.mp-=skill.mp_cost||0;
  let got=applyItemToActor(skill,target);
  if(skill.damage?.type===3){const value=estimateDamage(skill,{...stats(id)}, {...stats(target)});actor(target).hp=clamp(actor(target).hp+value,0,stats(target).maxhp);got+=value}
  await say([skill.name+"！ "+csvLabel(target)+"のHPを回復した。"]);save("auto");
 }
}
async function equipMenu(){
 for(;;){
  const idx=await choose("装備する仲間",G.party.map(id=>csvLabel(id)+" Lv."+actor(id).level));
  if(idx<0)return;const id=G.party[idx],a=actor(id),slots=["武器","盾","頭","身体","装飾品"];
  for(;;){
   const n=await choose(csvLabel(id)+"の装備",slots.map((q,slot)=>q+"："+(slot===0?db("Weapons",a.equips[slot])?.name:db("Armors",a.equips[slot])?.name||"なし")));
   if(n<0)break;
   const candidates=[];
   const kind=n===0?"weapons":"armors",type=n===0?"Weapons":"Armors";
   for(const [itemId,count] of Object.entries(G[kind])){
    if(count>0){const obj=db(type,itemId);if(!obj||n!==0 && (obj.etype_id||0)!==n+1)continue;candidates.push({id:+itemId,label:obj.name})}
   }
   candidates.unshift({id:0,label:"外す"});
   const selection=await choose(slots[n]+"を選ぶ",candidates.map(o=>o.label));if(selection<0)continue;
   const prior=a.equips[n]||0,chosen=candidates[selection].id;
   if(prior)changeItems(kind,prior,1);
   if(chosen)changeItems(kind,chosen,-1);
   a.equips[n]=chosen;save("auto");
  }
 }
}
async function statusMenu(){
 for(const id of G.party){const a=actor(id),s=stats(id);
  await say([csvLabel(id)+"　レベル "+a.level+"　経験値 "+a.exp,
    "HP "+a.hp+"/"+s.maxhp+"　MP "+a.mp+"/"+s.maxmp,
    "攻撃 "+s.atk+"　防御 "+s.def+"　魔法 "+s.mat+"　速さ "+s.agi]);
 }
}
async function saveMenu(){
 const n=await choose("どこにセーブする？",[1,2,3].map(i=>"スロット "+i+" "+saveTitle(i)));
 if(n>=0){save(String(n+1));await say(["冒険の記録を保存した。"])}
}
async function loadMenu(){
 const list=[1,2,3].map(i=>getSave(String(i)));
 const n=await choose("どの記録をロードする？",[1,2,3].map((i,j)=>({label:"スロット "+i+" "+saveTitle(i),disabled:!list[j]})));
 if(n>=0&&list[n]){loadSave(String(n+1));await say(["冒険を再開した。"])}
}
function enemyStats(enemy){const p=arr(enemy?.params);return {maxhp:p[0]||45,maxmp:p[1]||0,atk:p[2]||10,def:p[3]||5,mat:p[4]||4,mdf:p[5]||4,agi:p[6]||4,luk:p[7]||4}}
function estimateDamage(skill,a,b){
 let formula=String(skill?.damage?.formula||"a.atk * 2 - b.def");
 if(formula.includes(".max")){
  formula=formula.replace(/^\[\((.+)\),\s*([-\d.]+)\]\.max$/,(_,expr,min)=>"Math.max(("+expr+"),"+min+")");
 }
 formula=formula.replace(/\.round\b/g,"").replace(/\.to_i\b/g,"");
 formula=formula.replace(/\.max\b/g,"").replace(/\.min\b/g,"");
 if(!/^[\w.\s()+\-*/,%<>=!&|?:\[\]]+$/.test(formula))return Math.max(1,a.atk*1.6-b.def);
 try{
  const val=Number(Function("a","b","v",'"use strict";return ('+formula+');')(a,b,G.vars));
  if(Number.isFinite(val))return Math.max(0,Math.round(val*(0.94+Math.random()*0.12)));
 }catch{}
 return Math.max(1,Math.round((a.atk*1.6-b.def)*(0.93+Math.random()*0.14)));
}
function drawBattleSource(e){
 const art=image(imagePath("Battlers|"+(e.db.battler_name||"")));return art;
}
async function fight(troopId){
 const troop=db("Troops",troopId);if(!troop||!troop.members?.length)return 0;
 const enemies=arr(troop.members).filter(m=>!m.hidden).map((m,i)=>{
  const dbEnemy=db("Enemies",m.enemy_id)||{name:"敵",params:[50,0,8,6,5,5,6,6]};
  const es=enemyStats(dbEnemy);
  preload(imagePath("Battlers|"+dbEnemy.battler_name));
  return {db:dbEnemy,id:m.enemy_id,hp:es.maxhp,mp:es.maxmp,name:dbEnemy.name||"モンスター",x:m.x||280,y:m.y||270,index:i,...es};
 });
 if(!enemies.length)return 0;
 const source=currentMap(); const bgName=Number(source?.tileset)===1?"Grassland":"DirtField";
 const b1=imagePath("Battlebacks1|"+bgName),b2=imagePath("Battlebacks2|"+bgName);
 preload(b1);preload(b2);
 battle={troopId,enemies,round:1,b1,b2,log:"モンスターが現れた！"};
 mode="battle";requestFrame();
 let outcome=0;
 try{
  await say([enemies.map(e=>e.name).join("、")+" が現れた！"]);
  for(let turn=0;turn<200;turn++){
   for(const id of G.party){
    const a=actor(id);if(a.hp<=0)continue;
    if(!enemies.some(e=>e.hp>0))break;
    let q=await choose(csvLabel(id)+"　HP "+a.hp+"/"+stats(id).maxhp+"　MP "+a.mp+"/"+stats(id).maxmp,["攻撃","スキル","アイテム","逃げる"]);
    if(q===3){if(Math.random()<0.7){await say(["うまく逃げ出した！"]);outcome=1;return outcome}await say(["逃げられなかった！"]);break}
    if(q<0)q=0;
    if(q===2){
     const owned=Object.entries(G.items).filter(([k,n])=>n>0&&db("Items",k));
     if(!owned.length){await say(["使えるアイテムがない！"]);q=0}
     else{
      const v=await choose("アイテム",owned.map(([k,n])=>db("Items",k).name+" ×"+n));
      if(v>=0){
       let [iid]=owned[v],item=db("Items",iid),target=G.party[0];
       const i=await choose("誰に使う？",G.party.map(j=>csvLabel(j)));
       if(i>=0)target=G.party[i];
       let healed=applyItemToActor(item,target);if(item.consumable!==false)changeItems("items",iid,-1);
       await say([item.name+"を使った。"+(healed?" HPを回復！":"")]);continue;
      }q=0;
     }
    }
    let skill=db("Skills",1);
    if(q===1){
     const avail=availableSkills(id).filter(i=>db("Skills",i)?.occasion!==2&&a.mp>=(db("Skills",i).mp_cost||0));
     const k=await choose("使うスキル",avail.map(i=>db("Skills",i).name+" MP "+db("Skills",i).mp_cost));
     if(k>=0){skill=db("Skills",avail[k]);a.mp-=(skill.mp_cost||0)}else q=0;
    }
    let living=enemies.filter(e=>e.hp>0),target=living[0];
    if(living.length>1){
     const k=await choose("攻撃する敵",living.map(e=>e.name+" HP "+Math.ceil(e.hp)));
     if(k>=0)target=living[k];
    }
    if(!target)continue;
    const as={...stats(id)};
    const damageType=Number(skill?.damage?.type||1);
    if(damageType===3){const heal=estimateDamage(skill,as,as);a.hp=clamp(a.hp+heal,0,as.maxhp);await say([csvLabel(id)+"の"+skill.name+"！ HP "+heal+" 回復"]);continue}
    let dmg=estimateDamage(skill,as,target);
    if(damageType===0)dmg=Math.max(1,as.atk*1.5-target.def);
    target.hp=Math.max(0,target.hp-dmg);battle.log=csvLabel(id)+"の"+skill.name+"！ "+target.name+"に"+dmg+"ダメージ";
    await say([battle.log]);
    if(target.hp<=0)await say([target.name+"を倒した！"]);
   }
   if(!enemies.some(e=>e.hp>0)){
    const xp=enemies.reduce((n,e)=>n+(e.db.exp||0),0),money=enemies.reduce((n,e)=>n+(e.db.gold||0),0);
    addGold(money);const levels=G.party.map(id=>{const up=addExp(id,xp);return up?csvLabel(id)+" レベルアップ！":null}).filter(Boolean);
    await say(["戦いに勝った！","経験値 "+xp+"、"+currency(money)+"を獲得！",...levels]);
    outcome=0;return outcome;
   }
   for(const e of enemies.filter(e=>e.hp>0)){
    const alive=G.party.filter(id=>actor(id).hp>0);if(!alive.length)break;
    const id=alive[rand(alive.length)],a=actor(id),st=stats(id);
    let skill=db("Skills",1),damage=Math.max(1,Math.round((e.atk*1.5-st.def)*(0.9+Math.random()*0.2)));
    a.hp=Math.max(0,a.hp-damage);battle.log=e.name+"の攻撃！ "+csvLabel(id)+"に"+damage+"ダメージ";
    await say([battle.log]);
   }
   if(!G.party.some(id=>actor(id).hp>0)){
    await say(["全員が倒れてしまった…"]);
    mode="gameover";outcome=2;return outcome;
   }
   battle.round++;
   save("auto");
  }
  await say(["長い戦いが終わった。"]);outcome=1;
  return outcome;
 }catch(e){console.error(e);outcome=1;return outcome}
 finally{battle=null;if(mode!=="gameover")mode="map";requestFrame()}
}
async function startBattle(id){
 if(busy)return;busy=true;
 try{await fight(id);save("auto")}
 finally{busy=false;if(mode!=="gameover")mode="map";checkAuto()}
}
function moveClick(tx,ty){
 if(busy||mode!=="map")return;
 const m=currentMap();if(!m||tx<0||ty<0||tx>=m.w||ty>=m.h)return;
 if(Math.abs(G.x-tx)+Math.abs(G.y-ty)<=1){
  if(tx===G.x&&ty===G.y){faceTarget();return}
  const e=entitiesAt(tx,ty).find(q=>pageFor(q)?.trigger===0);
  if(e){G.dir=tx>G.x?6:tx<G.x?4:ty>G.y?2:8;runEvent(e,pageFor(e));return}
 }
 // BFS path limited to the current map. Interact if the last step is blocked by an NPC.
 const start=[G.x,G.y],q=[start],seen=new Set([G.x+","+G.y]),prev=new Map();
 let found=false;
 for(let i=0;i<q.length&&i<10000;i++){
  const [x,y]=q[i];if(x===tx&&y===ty){found=true;break}
  for(const dir of [2,4,6,8]){
   const d=DELTA[dir],nx=x+d[0],ny=y+d[1],sig=nx+","+ny;
   if(nx<0||ny<0||nx>=m.w||ny>=m.h||seen.has(sig))continue;
   if(!passable(x,y,dir)||!passable(nx,ny,{2:8,4:6,6:4,8:2}[dir]))continue;
   if(entitiesAt(nx,ny).some(e=>pageFor(e)?.priority_type===1))continue;
   seen.add(sig);prev.set(sig,[x,y,dir]);q.push([nx,ny]);
  }
 }
 if(!found){path=[];return}
 let x=tx,y=ty,route=[];
 while(x!==G.x||y!==G.y){
  const p=prev.get(x+","+y);if(!p)break;
  route.push(p[2]);x=p[0];y=p[1];
 }
 path=route.reverse().slice(0,300);
}
function keyPress(key){
 if(mode==="loading"||mode==="error")return;
 if(modal){inputModal(key);return}
 if(mode==="title"){
  if(["Enter","z","Z"," "].includes(key))newGame();
  if(["l","L"].includes(key)&&getSave("auto"))loadSave("auto");
  return;
 }
 if(mode==="gameover"){
  if(["Enter","z","Z","Escape"].includes(key)){mode="title";battle=null;busy=false}
  return;
 }
 if(busy||mode==="battle")return;
 if(DIRS[key]){
  path=[];const now=performance.now();if(now-stepAt>95){move(DIRS[key]);stepAt=now}return;
 }
 if(["Enter","z","Z"," "].includes(key)){faceTarget();return}
 if(["Escape","x","X"].includes(key)){path=[];mainMenu()}
}
function newGame(){
 makeState();mode="map";busy=false;modal=null;battle=null;autoSeen=new Set();prepareMap();save("auto");
}
window.addEventListener("keydown",e=>{
 const k=e.key;
 if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Shift","Escape","Enter"].includes(k))e.preventDefault();
 keys.add(k);
 if(!e.repeat||mode==="map"&&DIRS[k])keyPress(k);
},{passive:false});
window.addEventListener("keyup",e=>keys.delete(e.key));
window.addEventListener("blur",()=>{keys.clear();path=[]});
const control=document.getElementById("controls");
for(const btn of control.querySelectorAll("[data-key]")){
 let interval=null;const key=btn.dataset.key;
 const down=e=>{e.preventDefault();canvas.focus();keys.add(key);keyPress(key);
  if(DIRS[key]||key==="Shift")interval=setInterval(()=>{if(DIRS[key])keyPress(key)},110)};
 const up=e=>{e.preventDefault();keys.delete(key);clearInterval(interval);interval=null};
 btn.addEventListener("pointerdown",down);btn.addEventListener("pointerup",up);
 btn.addEventListener("pointercancel",up);btn.addEventListener("pointerleave",up);
}
document.getElementById("fullscreen").onclick=()=>{
 const w=document.getElementById("game-wrap");
 (document.fullscreenElement?document.exitFullscreen():w.requestFullscreen())?.catch(()=>{});
};
const touch=document.getElementById("touchToggle");
touch.onclick=()=>{
 control.hidden=!control.hidden;touch.setAttribute("aria-pressed",String(!control.hidden));canvas.focus();
};
function modalClick(px,py){
 if(!modal)return;
 if(modal.type==="message"){finishModal(0);return}
 if(modal.type==="select"){
  const top=Math.max(68,(H-44-(modal.items.length+1)*27)/2);
  let i=Math.floor((py-top-43)/27);
  if(i>=0&&i<modal.items.length){modal.cursor=i;if(!modal.items[i]?.disabled)finishModal(i)}
  else if(py>H-35&&modal.allowCancel!==false)finishModal(-1);
 }
}
canvas.addEventListener("pointerdown",e=>{
 canvas.focus();const rect=canvas.getBoundingClientRect();
 const x=(e.clientX-rect.left)*W/rect.width,y=(e.clientY-rect.top)*H/rect.height;
 if(modal){modalClick(x,y);return}
 if(mode==="title"){newGame();return}
 if(mode==="gameover"){mode="title";return}
 if(mode==="map"&&!busy){
  const cam=camera(),tx=Math.floor((x+cam.x)/32),ty=Math.floor((y+cam.y)/32);moveClick(tx,ty);
 }
});
function camera(){
 let m=currentMap();if(!m)return {x:0,y:0};
 return {x:clamp(G.x*32-W/2+16,0,Math.max(0,m.w*32-W)),
         y:clamp(G.y*32-H/2+16,0,Math.max(0,m.h*32-H))};
}
function box(x,y,w,h,alpha=0.94){
 ctx.fillStyle="rgba(13,24,43,"+alpha+")";ctx.fillRect(x,y,w,h);
 ctx.strokeStyle="#8293ad";ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,w-2,h-2);
 ctx.strokeStyle="#d7bc8b";ctx.lineWidth=1;ctx.strokeRect(x+4,y+4,w-8,h-8);
}
function print(s,x,y,size=17,color="#f3f0e4",align="left",bold=false){
 ctx.fillStyle=color;ctx.font=(bold?"bold ":"")+size+"px 'Yu Gothic',Meiryo,system-ui";
 ctx.textAlign=align;ctx.textBaseline="top";ctx.fillText(String(s),x,y);
}
function drawSprite(category,name,index,dir,x,y,pattern=1){
 const pic=image(imagePath(category+"|"+name));if(!pic)return;
 const single=/^\$|^!\$/.test(name);
 const sw=pic.width/(single?3:12),sh=pic.height/(single?4:8);
 const charIdx=single?0:clamp(index||0,0,7),frames=single?3:12;
 const sx=(single?0:(charIdx%4)*3+0)*sw + clamp(pattern,0,2)*sw;
 const sy=((single?0:Math.floor(charIdx/4)*4)+({2:0,4:1,6:2,8:3}[dir]||0))*sh;
 const dx=Math.round(x+(32-sw)/2),dy=Math.round(y+32-sh);
 ctx.drawImage(pic,sx,sy,sw,sh,dx,dy,sw,sh);
}
function drawMapPart(img,cam){if(!img)return;const sx=Math.floor(cam.x),sy=Math.floor(cam.y),w=Math.min(W,img.width-sx),h=Math.min(H,img.height-sy);if(w>0&&h>0)ctx.drawImage(img,sx,sy,w,h,0,0,w,h)}
function drawMap(){
 const m=currentMap();if(!m)return;
 const cam=camera();ctx.fillStyle="#101a2c";ctx.fillRect(0,0,W,H);
 const ground=image(m.bg);if(ground)drawMapPart(ground,cam);
 else {ctx.fillStyle="#263b36";for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){
   ctx.fillRect(x*32-cam.x+2,y*32-cam.y+2,28,28)
 }}
 const entities=[];
 for(const e of Object.values(m.events||{})){
  const p=pageFor(e);if(!p||!p.graphic)continue;
  const pos=posFor(e),v=p.graphic;
  if(v.character_name)entities.push({cat:"Characters",name:v.character_name,index:v.character_index,dir:pos.dir||v.direction||2,
   x:pos.x,y:pos.y,pattern:v.pattern??1});
  else if(v.tile_id){const rel=D.sprites["EventTile|"+m.tileset+"|"+v.tile_id];if(rel)entities.push({tile:rel,x:pos.x,y:pos.y})}
 }
 if(!G.transparent){
  const id=G.party[0]||1,a=db("Actors",id)||{},gr=a.character_name?"":null;
  entities.push({cat:"Characters",name:a.character_name||"mekka",index:a.character_index||0,dir:G.dir,x:G.x,y:G.y,pattern:Math.floor(performance.now()/160)%3});
 }
 entities.sort((a,b)=>a.y-b.y);
 for(const e of entities){
  const x=Math.round(e.x*32-cam.x),y=Math.round(e.y*32-cam.y);
  if(x<-80||y<-100||x>W+40||y>H+40)continue;
  if(e.tile){let pic=image(e.tile);if(pic)ctx.drawImage(pic,x,y)}
  else drawSprite(e.cat,e.name,e.index,e.dir,x,y,e.pattern);
 }
 const upper=image(m.upper);if(upper)drawMapPart(upper,cam);
 ctx.fillStyle="rgba(9,21,37,0.73)";ctx.fillRect(7,5,Math.min(W-14,300),28);
 print(m.name,17,9,15,"#f7eccf", "left",true);
 print(currency(G.gold),W-12,8,15,"#fff2ba","right");
 if(mouseTarget){/* mouse navigation intentionally minimal */}
}
function drawTitle(){
 const grad=ctx.createLinearGradient(0,0,W,H);
 grad.addColorStop(0,"#25344e");grad.addColorStop(.55,"#16253b");grad.addColorStop(1,"#071526");
 ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
 for(let i=0;i<48;i++){let x=(i*137)%W,y=(i*89)%H;ctx.fillStyle="rgba(245,225,182,"+(.12+(i%4)*.06)+")";ctx.fillRect(x,y,2,2)}
 print("A LITTLE RPG ADVENTURE",W/2,53,14,"#ebd5b5","center");
 print("楽しい冒険を",W/2,107,38,"#ffe6ab","center",true);
 print("始まる",W/2,157,49,"#fff2d2","center",true);
 print("小さな旅の、その先へ。",W/2,223,15,"#bdcce3","center");
 box(128,281,288,89,0.78);
 print("▶　はじめから",W/2,294,18,"#fceabf","center",true);
 print(getSave("auto")?"L　つづきから（自動保存）":"記録はまだありません",W/2,330,13,"#bfcdde","center");
 print("原作：マクダレン　／　WebGL不要・完全無音",W/2,393,11,"#8ca6bb","center");
}
function drawBattle(){
 ctx.fillStyle="#182c38";ctx.fillRect(0,0,W,H);
 const b1=image(battle?.b1),b2=image(battle?.b2);
 if(b1)ctx.drawImage(b1,0,0,W,H);
 if(b2)ctx.drawImage(b2,0,0,W,H*0.8);
 const enemies=battle?.enemies||[];
 enemies.forEach((e,i)=>{
  if(e.hp<=0)return;
  const art=drawBattleSource(e);
  const bx=clamp(e.x,90,W-60),by=clamp(e.y,100,285);
  if(art){
   const max=clamp(120/(Math.max(art.width,art.height)/100),0.25,1);
   const dw=art.width*max,dh=art.height*max;
   ctx.drawImage(art,bx-dw/2,by-dh,dw,dh);
  }else{
   ctx.fillStyle="#845c70";ctx.beginPath();ctx.ellipse(bx,by-25,24,30,0,0,Math.PI*2);ctx.fill()
  }
  print(e.name,bx,by+3,14,"#fff0da","center",true);
  ctx.fillStyle="#273546";ctx.fillRect(bx-35,by+24,70,5);
  ctx.fillStyle="#e88475";ctx.fillRect(bx-35,by+24,70*e.hp/e.maxhp,5);
 });
 box(6,H-100,W-12,93,.9);
 print("ラウンド "+(battle?.round||1),19,H-91,15,"#ffdf9f");
 G.party.forEach((id,i)=>{
  const a=actor(id),s=stats(id);
  print(csvLabel(id)+" Lv."+a.level+"　HP "+a.hp+"/"+s.maxhp+"　MP "+a.mp+"/"+s.maxmp,19,H-63+i*26,15,a.hp>0?"#e9f4ff":"#ee9999");
 });
}
function wrapText(t,maxChars=36){
 let parts=[];for(const input of String(t).split("\n")){
  let line="";
  for(const ch of Array.from(input)){
   const len=[...line].reduce((s,c)=>s+(/[ -~]/.test(c)?.55:1),0);
   if(len>=maxChars){parts.push(line);line=""}
   line+=ch;
  }
  parts.push(line);
 }
 return parts;
}
function drawModal(){
 if(!modal)return;
 if(modal.type==="message"){
  const y=H-143;box(7,y,W-14,136);
  let textX=24;
  const face=String(modal.face||"");
  if(face.startsWith("Faces|")){
   const parts=face.split("|"),im=image(imagePath("Faces|"+parts[1]));
   if(im){const ix=Number(parts[2]),sx=(ix%4)*96,sy=Math.floor(ix/4)*96;
    ctx.drawImage(im,sx,sy,96,96,22,y+20,96,96);textX=126;}
  }
  const all=modal.lines.flatMap(s=>wrapText(s,textX===126?28:41));
  all.slice(0,5).forEach((s,i)=>print(s,textX,y+15+i*22,17));
  print("▼ 決定",W-20,H-22,12,"#e2c78d","right");
 }else if(modal.type==="select"){
  const items=modal.items,lines=items.length,top=Math.max(54,(H-54-(lines+1)*27)/2);
  const visible=lines>11?11:lines;
  const st=clamp(modal.cursor-8,0,Math.max(0,lines-visible));
  const h=Math.min(H-60,(visible+1)*27+22);
  box(55,top,W-110,h);
  print(modal.title,75,top+12,16,"#f7d59c","left",true);
  for(let i=0;i<visible;i++){
   const at=st+i,entry=items[at];if(!entry)continue;
   const y=top+44+i*27;
   if(at===modal.cursor){
    ctx.fillStyle="#436181";ctx.fillRect(66,y-2,W-133,25);
    print("▶",75,y,16,"#ffdf9b");
   }
   let s=plain(entry.label||entry.name||"");
   if(s.length>36)s=s.slice(0,35)+"…";
   print(s,97,y,15,entry.disabled?"#758198":"#f4f0e4");
  }
  if(lines>visible)print((modal.cursor+1)+"/"+lines,W-80,top+13,12,"#b8c5d5","right");
 }
}
function drawGameOver(){
 ctx.fillStyle="#0a0e19";ctx.fillRect(0,0,W,H);
 print("GAME OVER",W/2,135,42,"#f6bfab","center",true);
 print("冒険はここで終わってしまった…",W/2,225,18,"#bdc4d8","center");
 print("決定キーでタイトルへ",W/2,305,14,"#fff0bd","center");
}
function drawLoading(){ctx.fillStyle="#132034";ctx.fillRect(0,0,W,H);print("冒険の準備をしています…",W/2,H/2,18,"#fff0c6","center")}
function draw(){
 ctx.imageSmoothingEnabled=false;
 if(mode==="loading")drawLoading();
 else if(mode==="title")drawTitle();
 else if(mode==="gameover")drawGameOver();
 else if(mode==="error"){drawLoading();print("データを読み込めませんでした",W/2,250,15,"#ecaaaa","center")}
 else{
  if(battle)drawBattle();else drawMap();
  if(modal)drawModal();
 }
}
function tick(time){
 if(time-lastClock>33){
  lastClock=time;
  if(mode==="map"&&!busy&&!modal){
   const held=Object.keys(DIRS).find(k=>keys.has(k));
   if(held&&time-stepAt> (keys.has("Shift")?70:145)){stepAt=time;move(DIRS[held])}
   else if(path.length&&time-stepAt>110){stepAt=time;move(path.shift())}
   if(!held&&!path.length)checkAuto();
  }
  draw();
 }
 requestAnimationFrame(tick);
}
async function init(){
 try{
  const response=await fetch("./data.json",{cache:"default"});
  if(!response.ok)throw Error("HTTP "+response.status);
  D=await response.json();
  if(!D.maps||!Object.keys(D.maps).length||!D.db?.System)throw Error("原作データが見つかりません");
  makeState();mode="title";titleStatus("Canvas 2D／音なし　WebGL不要　Enterまたはタップで冒険開始");
  if(matchMedia("(pointer:coarse)").matches){control.hidden=false;touch.setAttribute("aria-pressed","true")}
 }catch(e){console.error("Loading silent game:",e);mode="error";titleStatus("起動に失敗: "+e.message)}
}
requestAnimationFrame(tick);
init();
})();
