// quick manual reimplementation to inspect numbers without ts-node
const STAGE_LAYOUT_NORM = {
  MIN_SEATS: 2, MAX_SEATS: 9,
  felt: { cx:0.5, cy:0.5, rx:0.45, ry:0.29 },
  rail: { cx:0.5, cy:0.5, rx:0.455, ry:0.295 },
  plateFromStage: 0.205, plateMinW:124, plateMaxW:240,
  avatarFrac:0.46, nameplateH:56,
  heroCardScale:1.2, oppCardScale:1.05, cardPeekFrac:0.54, stagePad:10,
};
const BASE_CARD_HEIGHT=90;
function clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n));}
function platePixelSize(stage){
  const compact = stage.width<700;
  const m = Math.min(stage.width, stage.height);
  const heroCardScale = compact?0.82:STAGE_LAYOUT_NORM.heroCardScale;
  const avatarFrac = compact?0.44:STAGE_LAYOUT_NORM.avatarFrac;
  const nameplateH = compact?40:STAGE_LAYOUT_NORM.nameplateH;
  const width = clamp(Math.max(m*STAGE_LAYOUT_NORM.plateFromStage, stage.width*(compact?0.205:0.13)), compact?76:STAGE_LAYOUT_NORM.plateMinW, compact?104:STAGE_LAYOUT_NORM.plateMaxW);
  const avatar = Math.round(width*avatarFrac);
  const cardPeek = Math.round(BASE_CARD_HEIGHT*heroCardScale*STAGE_LAYOUT_NORM.cardPeekFrac);
  const nameplateOverlap = compact?3:8;
  const height = cardPeek+avatar+nameplateH-nameplateOverlap+4;
  return {width:Math.round(width), height};
}
function resolveStageLayout(n, stage){
  const compact = stage.width<700;
  const avatarFrac = compact?0.44:STAGE_LAYOUT_NORM.avatarFrac;
  const plate = platePixelSize(stage);
  const avatarSize = Math.round(plate.width*avatarFrac);
  const feltW = stage.width*0.86;
  const feltH = compact? Math.min(stage.height*0.66, feltW/1.08) : Math.min(stage.height*0.82, feltW/2.15);
  const felt = {x:(stage.width-feltW)/2, y:(stage.height-feltH)/2, w:feltW, h:feltH};
  const railCenterX = felt.x+felt.w/2, railCenterY = felt.y+felt.h/2;
  const seatOutset = avatarSize*0.35;
  const railRx = felt.w/2+seatOutset, railRy = felt.h/2+seatOutset;
  const seats=[];
  for(let i=0;i<n;i++){
    const theta=(i/n)*Math.PI*2;
    const x = railCenterX - railRx*Math.sin(theta);
    const y = railCenterY + railRy*Math.cos(theta);
    seats.push({i,x:Math.round(x),y:Math.round(y),theta:(theta*180/Math.PI).toFixed(0)});
  }
  return {plate, avatarSize, seats, felt};
}
const stage={width:390,height:844};
const r = resolveStageLayout(9,stage);
console.log("plate", r.plate, "avatarSize", r.avatarSize);
console.log("felt", r.felt);
for(const s of r.seats) console.log(s);
// compute pairwise min distance between adjacent seats
for(let i=0;i<r.seats.length;i++){
  const a=r.seats[i], b=r.seats[(i+1)%r.seats.length];
  const dx=a.x-b.x, dy=a.y-b.y;
  console.log(`dist ${i}-${(i+1)%r.seats.length}:`, Math.hypot(dx,dy).toFixed(1), "dx",dx,"dy",dy);
}
