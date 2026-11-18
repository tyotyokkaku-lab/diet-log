import Anthropic from "../vendor/anthropic-sdk-1.3.0.js";

const APP_VERSION = "2026-11-18d";

(() => {
// ---------- tile ids: 0-8 萬子, 9-17 筒子, 18-26 索子, 27-33 字牌(東南西北白發中)
const NAMES = [];
for (let i=1;i<=9;i++) NAMES.push(i+"萬");
for (let i=1;i<=9;i++) NAMES.push(i+"筒");
for (let i=1;i<=9;i++) NAMES.push(i+"索");
NAMES.push("東","南","西","北","白","發","中");

const B="#1d3a8a", G="#1f7a3a", R="#c62a2a", K="#1c1c1c";
const KAN=["一","二","三","四","伍","六","七","八","九"];

const W="#f7f2e4", PK="#1f2c44", SG="#1d4a3a", MR="#a02a2e";
function pin(cx,cy,r,c,inner){
  const f=k=>(r*k).toFixed(2), ic=inner||c;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`+
    `<circle cx="${cx}" cy="${cy}" r="${f(.8)}" fill="${W}"/>`+
    `<circle cx="${cx}" cy="${cy}" r="${f(.62)}" fill="none" stroke="${c}" stroke-width="${f(.2)}" stroke-dasharray="${f(.32)} ${f(.16)}"/>`+
    `<circle cx="${cx}" cy="${cy}" r="${f(.38)}" fill="${ic}"/>`+
    `<circle cx="${cx}" cy="${cy}" r="${f(.15)}" fill="${W}"/>`;
}
function stick(cx,cy,h,c,rot=0){
  const w=6.6, x=cx-w/2, y=cy-h/2;
  return `<g transform="rotate(${rot} ${cx} ${cy})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${c}"/>`+
    [y+1.2,cy,y+h-1.2].map(yy=>`<rect x="${x-.8}" y="${(yy-1.3).toFixed(2)}" width="${w+1.6}" height="2.6" rx="1.3" fill="${c}"/><line x1="${x-.4}" y1="${yy}" x2="${x+w+.4}" y2="${yy}" stroke="${W}" stroke-width=".6"/>`).join("")+
    `<line x1="${cx}" y1="${y+3}" x2="${cx}" y2="${cy-2.5}" stroke="${W}" stroke-width="1"/>`+
    `<line x1="${cx}" y1="${cy+2.5}" x2="${cx}" y2="${y+h-3}" stroke="${W}" stroke-width="1"/></g>`;
}
function txt(s,x,y,size,c){
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${c}" text-anchor="middle" font-family="'Yuji Syuku','Shippori Mincho B1','Hiragino Mincho ProN','Yu Mincho',serif" font-weight="400" stroke="${c}" stroke-width=".6">${s}</text>`;
}
function face(id){
  const s = id%9+1;
  if (id<9) return txt(KAN[s-1],30,36,28,PK)+txt("萬",30,73,31,MR);
  if (id<18){
    const P={
      1:()=>`<circle cx="30" cy="44" r="23" fill="${PK}"/><circle cx="30" cy="44" r="20.5" fill="${W}"/>`+
        `<circle cx="30" cy="44" r="18" fill="none" stroke="${PK}" stroke-width="3.2" stroke-dasharray="2.2 1.5"/>`+
        `<circle cx="30" cy="44" r="14.5" fill="${PK}"/><circle cx="30" cy="44" r="12.5" fill="${W}"/>`+
        Array.from({length:8},(_,k)=>{const a=k*Math.PI/4;return `<circle cx="${(30+7*Math.cos(a)).toFixed(2)}" cy="${(44+7*Math.sin(a)).toFixed(2)}" r="3.6" fill="${MR}"/>`}).join("")+
        `<circle cx="30" cy="44" r="4" fill="${W}"/><circle cx="30" cy="44" r="2" fill="${MR}"/>`,
      2:()=>pin(30,25,12,PK)+pin(30,63,12,PK),
      3:()=>pin(15,20,9.5,PK)+pin(30,44,9.5,PK,MR)+pin(45,68,9.5,PK),
      4:()=>[26,62].map(y=>pin(18,y,10.5,PK)+pin(42,y,10.5,PK)).join(""),
      5:()=>pin(16,22,9.5,PK)+pin(44,22,9.5,PK)+pin(30,44,9.5,PK,MR)+pin(16,66,9.5,PK)+pin(44,66,9.5,PK),
      6:()=>pin(18,18,9,PK)+pin(42,18,9,PK)+[47,69].map(y=>pin(18,y,9,MR)+pin(42,y,9,MR)).join(""),
      7:()=>pin(14,15,7.8,PK)+pin(30,22,7.8,PK)+pin(46,29,7.8,PK)+[50,70].map(y=>pin(18,y,8.5,MR)+pin(42,y,8.5,MR)).join(""),
      8:()=>[16,35.5,55,74.5].map(y=>pin(18,y,8.6,PK)+pin(42,y,8.6,PK)).join(""),
      9:()=>[[20,PK],[44,MR],[68,PK]].map(([y,c])=>pin(13.5,y,8.2,c)+pin(30,y,8.2,c)+pin(46.5,y,8.2,c)).join("")
    }; return P[s]();
  }
  if (id<27){
    const S={
      1:()=>{
        // peacock: fan of feathers, body, red crest
        let f="";
        for(let k=0;k<7;k++){const a=(-160+k*23.3)*Math.PI/180, x=30+18*Math.cos(a), y=40+18*Math.sin(a);
          f+=`<line x1="30" y1="44" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${SG}" stroke-width="1.4"/>`+
             `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4" ry="5" fill="${SG}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="${W}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1" fill="${MR}"/>`;}
        return f+`<path d="M20 60 Q22 46 32 46 Q42 47 40 58 Q36 66 26 66 Z" fill="${PK}"/><path d="M24 58 q7 4 14 -1" stroke="${W}" stroke-width="1" fill="none"/>`+
          `<path d="M34 47 q5 -6 10 -4" stroke="${PK}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="45" cy="43" r="2.6" fill="${MR}"/><path d="M47 43 l4 1" stroke="${MR}" stroke-width="1.6"/>`+
          `<path d="M26 66 L24 75 M33 66 L35 75 M20 75 h8 M31 75 h8" stroke="${MR}" stroke-width="1.8" fill="none"/>`;
      },
      2:()=>stick(30,26,27,SG)+stick(30,62,27,SG),
      3:()=>stick(30,26,27,SG)+stick(18,62,27,SG)+stick(42,62,27,SG),
      4:()=>[26,62].map(y=>stick(18,y,27,SG)+stick(42,y,27,SG)).join(""),
      5:()=>[26,62].map(y=>stick(15,y,27,SG)+stick(45,y,27,SG)).join("")+stick(30,44,27,MR),
      6:()=>[26,62].map(y=>stick(14,y,27,SG)+stick(30,y,27,SG)+stick(46,y,27,SG)).join(""),
      7:()=>stick(30,17,19,MR)+[45,69].map(y=>stick(14,y,21,SG)+stick(30,y,21,SG)+stick(46,y,21,SG)).join(""),
      8:()=>[11,23.5,36.5,49].map((x,i)=>stick(x,26,27,SG,[0,24,-24,0][i])+stick(x,62,27,SG,[0,-24,24,0][i])).join(""),
      9:()=>[20,44,68].map(y=>stick(14,y,21,SG)+stick(30,y,21,MR)+stick(46,y,21,SG)).join("")
    }; return S[s]();
  }
  const h=id-27;
  if (h<4) return txt("東南西北"[h],30,58,38,PK);
  if (h===4) return "";
  if (h===5) return txt("發",30,58,38,SG);
  return txt("中",30,59,40,MR);
}
const svgCache={};
function tileSVG(id){
  return svgCache[id] ||= `<svg class="tile" viewBox="0 0 60 84" role="img" aria-label="${NAMES[id]}">`+
    `<defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf8ee"/><stop offset="1" stop-color="#ebe3cf"/></linearGradient></defs>`+
    `<rect x="1.5" y="2" width="58" height="82" rx="6" fill="#c9bfa6"/>`+
    `<rect x=".5" y=".5" width="57.5" height="81" rx="6" fill="url(#tg)" stroke="#d6ccb4" stroke-width=".8"/>`+
    face(id)+`</svg>`;
}

// ---------- hand logic
const ORPHANS=[0,8,9,17,18,26,27,28,29,30,31,32,33];
function counts(h){const c=new Array(34).fill(0);h.forEach(t=>c[t]++);return c;}
function sets(c){
  const i=c.findIndex(x=>x>0); if(i<0) return [];
  if(c[i]>=3){c[i]-=3;const r=sets(c);c[i]+=3;if(r)return [[i,i,i],...r];}
  if(i<27&&i%9<=6&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;const r=sets(c);c[i]++;c[i+1]++;c[i+2]++;if(r)return [[i,i+1,i+2],...r];}
  return null;
}
function winShape(c){ // c sums to 14 → groups or null
  for(let p=0;p<34;p++) if(c[p]>=2){c[p]-=2;const r=sets(c);c[p]+=2;if(r) return {kind:"通常形",groups:[[p,p],...r]};}
  const pairs=c.map((n,i)=>n===2?i:-1).filter(i=>i>=0);
  if(pairs.length===7) return {kind:"七対子",groups:pairs.map(p=>[p,p])};
  if(ORPHANS.every(i=>c[i]>=1)&&c.every((n,i)=>n===0||ORPHANS.includes(i))){
    const g=[];ORPHANS.forEach(i=>{for(let k=0;k<c[i];k++)g.push(i)});return {kind:"国士無双",groups:[g]};
  }
  return null;
}
function waitsFor(h){ // 13 tiles
  const c=counts(h), out=[];
  for(let t=0;t<34;t++){
    c[t]++; const s=winShape(c); c[t]--;
    if(s) out.push({t,left:4-c[t],shape:s});
  }
  return out;
}

// 向聴数（-1=和了、0=テンパイ）。通常形・七対子・国士無双の小さい方
function stdShanten(c){
  let best=8;
  const rec=(i,m,t,p)=>{
    while(i<34&&!c[i]) i++;
    if(i>=34){const v=8-2*m-Math.min(t,4-m)-p; if(v<best) best=v; return;}
    if(c[i]>=3){c[i]-=3;rec(i,m+1,t,p);c[i]+=3;}
    const sq=i<27&&i%9<=6;
    if(sq&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;rec(i,m+1,t,p);c[i]++;c[i+1]++;c[i+2]++;}
    if(!p&&c[i]>=2){c[i]-=2;rec(i,m,t,1);c[i]+=2;}
    if(m+t<4){
      if(c[i]>=2){c[i]-=2;rec(i,m,t+1,p);c[i]+=2;}
      if(i<27&&i%9<=7&&c[i+1]){c[i]--;c[i+1]--;rec(i,m,t+1,p);c[i]++;c[i+1]++;}
      if(sq&&c[i+2]){c[i]--;c[i+2]--;rec(i,m,t+1,p);c[i]++;c[i+2]++;}
    }
    c[i]--;rec(i,m,t,p);c[i]++;
  };
  rec(0,0,0,0); return best;
}
function shanten(c){
  let pairs=0,kinds=0; c.forEach(n=>{if(n){kinds++; if(n>=2)pairs++;}});
  const chiitoi=6-pairs+Math.max(0,7-kinds);
  let ok=0,op=0; ORPHANS.forEach(i=>{if(c[i]){ok++; if(c[i]>=2)op=1;}});
  return Math.min(stdShanten(c),chiitoi,13-ok-op);
}
// 受入：来ると向聴数が進む牌（seenで見えている枚数を引く）
function ukeire(c13,seen){
  const s0=shanten(c13), out=[];
  for(let t=0;t<34;t++){
    const left=4-seen[t]; if(left<=0) continue;
    c13[t]++; const s=shanten(c13); c13[t]--;
    if(s<s0) out.push({t,left});
  }
  return {s:s0,tiles:out,total:out.reduce((a,x)=>a+x.left,0)};
}

// ---------- state
let hand=[], lastAdded=null, isSample=false, selWait=null;
const SAMPLE=[1,2,3,4,5, 11,12,13, 23,24,25, 26,26]; // 23456萬 345筒 678索 99索 → 1-4-7萬待ち
const save=()=>{try{localStorage.setItem("mj-hand",JSON.stringify(isSample?[]:hand))}catch(e){}};
const sorted=()=>hand.slice().sort((a,b)=>a-b);

const $=id=>document.getElementById(id);
const MAX=14;

function add(t){
  if(isSample){hand=[];isSample=false;}
  if(hand.length>=MAX||counts(hand)[t]>=4) return;
  hand.push(t); lastAdded=t; selWait=null; save(); render();
}
function removeAt(i){
  hand.splice(i,1);
  isSample=false; lastAdded=null; selWait=null; save(); render();
}

function render(){
  // hand (in tap order; ソート sorts it)
  const s=hand, H=$("hand"); H.innerHTML="";
  const slots=14;
  for(let i=0;i<slots;i++){
    if(i<s.length){
      const b=document.createElement("button"); b.className="t"; b.innerHTML=tileSVG(s[i]);
      b.setAttribute("aria-label",NAMES[s[i]]+"を外す");
      if(lastAdded!==null&&i===s.length-1) b.classList.add("new");
      if(i===13) b.classList.add("tsumo");
      b.onclick=()=>removeAt(i); H.appendChild(b);
    } else {
      const d=document.createElement("div"); d.className="slot"+(i===13?" tsumo":""); d.textContent=i+1; H.appendChild(d);
    }
  }
  $("cnt").textContent=hand.length;
  $("sample-tag").hidden=!isSample;
  $("sort").disabled=hand.length<2;
  $("clear").disabled=!hand.length;

  // palette
  const c=counts(hand);
  document.querySelectorAll("#pal button.t").forEach(b=>{
    const t=+b.dataset.t; b.disabled=!isSample&&(c[t]>=4||hand.length>=MAX);
  });

  renderResult();
}

function renderResult(){
  const R=$("result"); R.innerHTML="";
  const n=hand.length;
  const p=(cls,text)=>{const e=document.createElement("p");e.className=cls;e.textContent=text;R.appendChild(e);return e;};
  if(n<13){
    p("verdict no",`あと${13-n}枚`);
    return;
  }
  if(n===14){
    const sh=winShape(counts(hand));
    if(sh){p("verdict win",`あがっています（${sh.kind}）`);R.appendChild(shapeEl(sh));return;}
    const cuts=[]; const seen=new Set();
    for(const t of sorted()){ if(seen.has(t))continue; seen.add(t);
      const rest=hand.slice(); rest.splice(rest.indexOf(t),1);
      const c14=counts(hand);
      const w=waitsFor(rest).map(x=>({...x,left:4-c14[x.t]})); if(w.length) cuts.push({t,w,total:w.reduce((a,x)=>a+Math.max(0,x.left),0)});
    }
    if(!cuts.length){
      const c14=counts(hand), opts=[];
      for(const t of seen){ c14[t]--; const u=ukeire(c14.slice(),counts(hand)); c14[t]++; opts.push({t,...u}); }
      const minS=Math.min(...opts.map(o=>o.s));
      const best=opts.filter(o=>o.s===minS).sort((x,y)=>y.total-x.total||y.tiles.length-x.tiles.length||x.t-y.t);
      p("verdict no",`あがっていません・${minS}向聴`);
      p("hint","どれを切ってもテンパイになりません。受入枚数（来ると1歩テンパイに近づく牌の枚数）が多い順です。");
      const box=document.createElement("div");box.className="cuts";
      best.forEach(o=>box.appendChild(cutRow(o.t,`切り<br>受入${o.total}枚`,o.tiles)));
      R.appendChild(box);
      p("hint","切る牌をタップすると、その牌を手牌から外します。");
      return;
    }
    cuts.sort((x,y)=>y.total-x.total||y.w.length-x.w.length||x.t-y.t);
    p("verdict ok","あがっていません・これを切るとテンパイ");
    const box=document.createElement("div");box.className="cuts";
    cuts.forEach(({t,w,total})=>box.appendChild(cutRow(t,`切り<br>${w.length}種${total}枚`,w)));
    R.appendChild(box);
    p("hint","切る牌をタップすると、その牌を手牌から外します。");
    return;
  }
  // 13 tiles
  const w=waitsFor(hand);
  if(!w.length){
    const c=counts(hand), u=ukeire(c.slice(),c);
    p("verdict no",`ノーテン（${u.s}向聴）・受入${u.tiles.length}種${u.total}枚`);
    const wb=document.createElement("div");wb.className="waitbox";
    wb.innerHTML=`<span class="wl">受入</span>`; wb.appendChild(waitRow(u.tiles,false,9));
    R.appendChild(wb);
    p("hint","来ると1歩テンパイに近づく牌です。");
    return;
  }
  const live=w.filter(x=>x.left>0), total=live.reduce((a,x)=>a+x.left,0);
  p("verdict ok",`テンパイ　${w.length}種 ・ 残り${total}枚`);
  if(!live.length) p("hint","待ち牌はすべて手牌で4枚使っています（純カラ）。");
  const wb=document.createElement("div");wb.className="waitbox";
  wb.innerHTML=`<span class="wl">待ち</span>`;
  wb.appendChild(waitRow(w,true));
  R.appendChild(wb);
  const sel=w.find(x=>x.t===selWait);
  if(sel){p("shape-label",`${NAMES[sel.t]}であがったときの形（${sel.shape.kind}）`);R.appendChild(shapeEl(sel.shape));}
  else p("hint","待ち牌をタップすると、あがったときの形を表示します。");
}
// 待ち牌を1行に並べる（多いときは牌の間を詰めて小さくする）
function cutRow(t,label,tiles){
  const row=document.createElement("div");row.className="cut";
  const b=document.createElement("button");b.className="t cut-tile";b.innerHTML=tileSVG(t);
  b.setAttribute("aria-label",NAMES[t]+"を切る");
  b.onclick=()=>{hand.splice(hand.lastIndexOf(t),1);isSample=false;lastAdded=null;selWait=null;save();render();};
  const lbl=document.createElement("span");lbl.className="cut-lbl";lbl.innerHTML=label;
  row.append(b,lbl,waitRow(tiles,false,9));
  return row;
}
function waitRow(w,tappable,maxCols=34){
  const box=document.createElement("div");box.className="waits";
  const many=w.length>=7, cols=Math.min(w.length,maxCols);
  box.style.gridTemplateColumns=`repeat(${cols},minmax(0,${tappable?40:32}px))`;
  box.style.rowGap="4px";
  box.style.columnGap=many?"2px":"6px";
  w.forEach(x=>{
    const d=document.createElement("div");d.className="wait"+(x.left?"":" dead")+(tappable&&selWait===x.t?" sel":"");
    const tile=document.createElement(tappable?"button":"div");tile.className="t";tile.innerHTML=tileSVG(x.t);
    if(tappable){
      tile.setAttribute("aria-label",`${NAMES[x.t]}で和了したときの形を見る`);
      tile.onclick=()=>{selWait=selWait===x.t?null:x.t;renderResult();};
    }
    const l=document.createElement("span");l.className="left";l.textContent=many?`${x.left}枚`:`残り${x.left}枚`;
    d.append(tile,l);box.appendChild(d);
  });
  return box;
}
function shapeEl(sh){
  const d=document.createElement("div");d.className="shape";
  sh.groups.forEach(g=>{const e=document.createElement("div");e.className="grp";e.innerHTML=g.map(tileSVG).join("");d.appendChild(e);});
  return d;
}

// palette: 筒子, 索子, 萬子, 字牌 (same order as common tools)
const PAL=[["筒子",9,9],["索子",18,9],["萬子",0,9],["字牌",27,7]];
const pal=$("pal");
PAL.forEach(([name,start,len])=>{
  const line=document.createElement("div");line.className="pal-line";
  const lab=document.createElement("p");lab.className="pal-name";lab.textContent=name;line.appendChild(lab);
  const row=document.createElement("div");row.className="pal-row";line.appendChild(row);
  for(let t=start;t<start+len;t++){
    const b=document.createElement("button");b.className="t";b.dataset.t=t;b.innerHTML=tileSVG(t);
    b.setAttribute("aria-label",NAMES[t]+"を追加");b.onclick=()=>add(t);row.appendChild(b);
  }
  pal.appendChild(line);
});
$("sort").onclick=()=>{hand.sort((a,b)=>a-b);lastAdded=null;save();render();};
$("clear").onclick=()=>{hand=[];isSample=false;lastAdded=null;selWait=null;save();render();};
render();

// ---------- 写真から読み取る（Claude API）
const MODEL = "claude-opus-5-5";
const KEY_KEY = "mahjong.apiKey";
const OTHER_KEYS = ["dietlog.apiKey", "shiftcal.apiKey"]; // 同じサイトの食事ログ・シフトに入れたキーも使う
function getKey(){ try{ return localStorage.getItem(KEY_KEY) || OTHER_KEYS.map(k=>localStorage.getItem(k)).find(Boolean) || ""; }catch{ return ""; } }
function setKey(v){ try{ v ? localStorage.setItem(KEY_KEY,v) : localStorage.removeItem(KEY_KEY); }catch{} }

const CODE={};
"mpsz".split("").forEach((suit,si)=>{for(let k=1;k<=9;k++){const id=si===3?(k<=7?27+k-1:null):si*9+k-1; if(id!==null) CODE[k+suit]=id;}});
const PROMPT=`この写真には日本の麻雀牌が写っています。写っている牌をすべて、左から右へ（複数段なら上の段から）順に読み取ってください。
牌コード:
- 萬子 1m〜9m（漢数字と「萬」）
- 筒子 1p〜9p（丸の数）
- 索子 1s〜9s（竹の本数。1sは鳥の絵）
- 字牌 1z=東 2z=南 3z=西 4z=北 5z=白（無地・枠だけ） 6z=發 7z=中
赤ドラの5も普通の5m/5p/5sとして扱ってください。牌の裏面や、牌以外の物は数えないでください。
note には、読み取りに自信がない牌があれば日本語で一言書いてください（なければ空文字）。`;
const TILE_CODES=Object.keys(CODE);
const OCR_SCHEMA={type:"object",additionalProperties:false,required:["tiles","note"],
  properties:{tiles:{type:"array",items:{type:"string",enum:TILE_CODES}},note:{type:"string"}}};

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("画像を読み込めませんでした。別の写真でお試しください。"));};
    img.src=url;
  });
}
// 牌の絵が読めるよう長辺1600pxまでのJPEGにする
async function toJpeg(file,maxSide=1600){
  const img=await loadImage(file), iw=img.naturalWidth, ih=img.naturalHeight;
  if(!iw||!ih) throw new Error("画像のサイズを読み取れませんでした。");
  const sc=Math.min(1,maxSide/Math.max(iw,ih)), cv=document.createElement("canvas");
  cv.width=Math.round(iw*sc); cv.height=Math.round(ih*sc);
  const ctx=cv.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,cv.width,cv.height);
  ctx.drawImage(img,0,0,cv.width,cv.height);
  const dataUrl=cv.toDataURL("image/jpeg",0.9);
  if(!dataUrl.startsWith("data:image/jpeg")) throw new Error("画像の変換に失敗しました。");
  return {dataUrl,base64:dataUrl.split(",")[1]};
}

async function readTiles(base64){
  const apiKey=getKey();
  if(!apiKey) throw new Error("APIキーが未設定です。下の「設定」で入力してください。");
  const client=new Anthropic({apiKey,dangerouslyAllowBrowser:true});
  let res;
  try{
    res=await client.beta.messages.create({
      model:MODEL, max_tokens:16000,
      betas:["server-side-fallback-2026-07-01"], fallbacks:"default",
      output_config:{effort:"medium",format:{type:"json_schema",schema:OCR_SCHEMA}},
      messages:[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:"image/jpeg",data:base64}},
        {type:"text",text:PROMPT}]}]
    });
  }catch(e){
    if(e instanceof Anthropic.AuthenticationError) throw new Error("APIキーが正しくないようです。下の「設定」で確認してください。");
    if(e instanceof Anthropic.RateLimitError) throw new Error("混み合っています。少し待ってからもう一度試してください。");
    if(e instanceof Anthropic.APIConnectionError) throw new Error("通信できませんでした。電波の状態を確認してください。");
    if(e instanceof Anthropic.APIError && e.status===400 && /credit|balance/i.test(e.message)) throw new Error("APIのクレジット残高が足りないようです。");
    if(e instanceof Anthropic.APIError) throw new Error(`AIの呼び出しに失敗しました（${e.status ?? ""}）：${e.message}`);
    throw e;
  }
  if(res.stop_reason==="refusal") throw new Error("この写真は読み取れませんでした。牌だけが写るように撮り直してください。");
  const text=res.content.filter(b=>b.type==="text").map(b=>b.text).join("");
  try{ return JSON.parse(text); }catch{ throw new Error("読み取り結果がうまく受け取れませんでした。もう一度お試しください。"); }
}

const st=$("pstatus"), camBtn=$("cam-btn"), libBtn=$("lib-btn");
let busy=false;
const setStatus=(t,err)=>{st.textContent=t;st.classList.toggle("err",!!err);};
camBtn.onclick=()=>$("cam").click();
libBtn.onclick=()=>$("lib").click();
$("cam").onchange=e=>handleFile(e.target);
$("lib").onchange=e=>handleFile(e.target);

async function handleFile(input){
  const f=input.files&&input.files[0]; input.value="";
  if(!f||busy) return;
  if(!getKey()){ setStatus("写真の読み取りには Claude の APIキーが必要です。下の「設定」で入力してください。",true); $("settings").open=true; return; }
  busy=true; camBtn.disabled=libBtn.disabled=true;
  try{
    const {dataUrl,base64}=await toJpeg(f);
    const img=$("preview"); img.src=dataUrl; img.hidden=false;
    setStatus("読み取り中…（30秒〜1分ほどかかることがあります）");
    const res=await readTiles(base64);
    const ids=[], unknown=[];
    (Array.isArray(res?.tiles)?res.tiles:[]).forEach(x=>{const k=String(x).trim().toLowerCase(); if(k in CODE) ids.push(CODE[k]); else unknown.push(x);});
    if(!ids.length){setStatus("牌を見つけられませんでした。牌がはっきり写るように撮り直してください。",true);return;}
    // 同じ牌は4枚まで・最大14枚
    const c=new Array(34).fill(0), kept=[]; let dropped=0;
    ids.forEach(t=>{ if(c[t]<4&&kept.length<MAX){c[t]++;kept.push(t);} else dropped++; });
    hand=kept; isSample=false; lastAdded=null; selWait=null; save(); render();
    let msg=`${ids.length}枚読み取りました。`;
    if(kept.length<13) msg+=`あと${13-kept.length}枚を牌のボタンで足してください。`;
    if(kept.length===14) msg+="14枚なので、あがりか、どれを切るとテンパイになるかを表示しています。";
    if(dropped) msg+=`（多すぎた${dropped}枚は外しました）`;
    if(unknown.length) msg+=`（読めなかった牌: ${unknown.length}枚）`;
    if(res.note) msg+=` メモ: ${String(res.note).slice(0,140)}`;
    msg+=" 間違いがあれば手牌をタップして直してください。";
    setStatus(msg);
    $("h-hand").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(e){
    setStatus(e.message||"読み取りに失敗しました。もう一度お試しください。",true);
  }finally{
    busy=false; camBtn.disabled=libBtn.disabled=false;
  }
}

// ---------- 設定（APIキー）
function renderKeyStatus(){
  let own="", other="";
  try{ own=localStorage.getItem(KEY_KEY)||""; other=OTHER_KEYS.map(k=>localStorage.getItem(k)).find(Boolean)||""; }catch{}
  $("keyStatus").textContent = own ? `設定済み（最後の4文字：${own.slice(-4)}）` : other ? "食事ログ・シフトに入れたキーを使います" : "未設定";
  $("checkKey").hidden=!getKey();
  $("delKey").hidden=!own;
}
$("saveKey").onclick=()=>{
  const v=$("apiKey").value.replace(/[\s​-‍﻿]/g,"");
  if(!v) return;
  if(!/^sk-ant-[A-Za-z0-9_-]{80,}$/.test(v)){
    $("keyMsg").textContent = v.includes("...")||v.includes("…")
      ? "一覧に表示されている省略されたキー（…が入ったもの）は使えません。新しくキーを作って、作った直後に表示されるキーを全部コピーしてください。"
      : "APIキーの形ではないようです。sk-ant- で始まる長いキーを全部コピーして貼り付けてください。";
    return;
  }
  setKey(v); $("apiKey").value=""; renderKeyStatus(); $("checkKey").click();
};
$("delKey").onclick=()=>{ setKey(""); $("keyMsg").textContent="このアプリのキーを消しました。"; renderKeyStatus(); };
$("checkKey").onclick=async()=>{
  const b=$("checkKey"); b.disabled=true; b.textContent="確認中…"; $("keyMsg").textContent="";
  try{
    const client=new Anthropic({apiKey:getKey(),dangerouslyAllowBrowser:true});
    await client.models.list({limit:1}); // 料金のかからない呼び出しでキーを確かめる
    $("keyMsg").textContent="このAPIキーは使えます。";
  }catch(e){
    $("keyMsg").textContent = e instanceof Anthropic.AuthenticationError ? "このAPIキーは使えません（間違っているか、無効になったキーです）。"
      : e instanceof Anthropic.APIConnectionError ? "通信できませんでした。電波の状態を確認してください。"
      : "確認できませんでした："+e.message;
  }finally{ b.disabled=false; b.textContent="キーが使えるか確認する"; }
};
renderKeyStatus();

$("appVersion").textContent = APP_VERSION;
$("appVersionFoot").textContent = APP_VERSION;
$("forceUpdate").onclick = () => { location.replace(location.pathname + "?v=" + Date.now()); };

// 公開中の最新版と違えば、自動で読み込み直す（Safariが古いページを覚えていることがあるため）
(async () => {
  try {
    const r = await fetch("version.txt?t=" + Date.now(), { cache: "no-store" });
    const v = (await r.text()).trim();
    if (r.ok && v && v !== APP_VERSION && !sessionStorage.getItem("mahjong.reloaded." + v)) {
      sessionStorage.setItem("mahjong.reloaded." + v, "1");
      location.replace(location.pathname + "?v=" + Date.now());
    }
  } catch {}
})();
})();
