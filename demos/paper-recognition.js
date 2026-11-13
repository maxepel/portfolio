// Small geometric recognizer. Coordinates are page pixels, never normalized x.
import { DRAWINGS, WORDS } from './paper-library.js';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function inkBounds(strokes) {
  const points = strokes.flat();
  if (!points.length) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    left = Math.min(left, p.x); right = Math.max(right, p.x);
    top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const a = points[0], b = points.at(-1), dx = b.x - a.x, dy = b.y - a.y;
  let far = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
    const d = distance(p, { x: a.x+t*dx, y: a.y+t*dy });
    if (d > far) { far = d; index = i; }
  }
  return far > tolerance ? [...simplify(points.slice(0,index+1),tolerance).slice(0,-1),
    ...simplify(points.slice(index),tolerance)] : [a,b];
}
function connect(strokes, gap) {
  const remaining = strokes.filter(s=>s.length>1).map(s=>[...s]);
  const points = remaining.shift();
  if (!points) return null;
  while (remaining.length) {
    let best = null;
    remaining.forEach((s,i)=>{
      for (const reverse of [false,true]) {
        const d = distance(points.at(-1), reverse?s.at(-1):s[0]);
        if (!best || d < best.d) best = {i,reverse,d};
      }
    });
    if (best.d > gap) return null;
    const next = remaining.splice(best.i,1)[0];
    points.push(...(best.reverse?next.reverse():next));
  }
  return points;
}
// Rough polygons: fit the largest triangle or quadrilateral inside the ink's convex hull,
// then accept it only if the ink runs close along every side and nowhere else. This
// forgives what the corner count can't: rounded corners, bowed sides, a gap or overshoot
// where the pen closes, a start halfway along a side, and sides drawn as separate strokes.
function hull(points) {
  const sorted = [...points].sort((a,b)=>a.x-b.x||a.y-b.y), cross = (o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const half = list => { const h=[]; for (const p of list) { while (h.length>1 && cross(h.at(-2),h.at(-1),p)<=0) h.pop(); h.push(p); } h.pop(); return h; };
  return [...half(sorted), ...half(sorted.reverse())];
}
const area = (a,b,c) => Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
const polygonArea = h => Math.abs(h.reduce((sum,p,i)=>sum+(p.x*h[(i+1)%h.length].y-h[(i+1)%h.length].x*p.y),0))/2;
function toSegment(p, a, b) {
  const dx=b.x-a.x, dy=b.y-a.y, t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return distance(p,{x:a.x+t*dx,y:a.y+t*dy});
}
// The biggest triangle (n = 3) or quadrilateral (n = 4) with its corners on the hull: each
// diagonal i-k takes the hull point farthest from it on one side, or on both sides.
function largest(h, n) {
  const far = (i, k, from, to) => { let top = -1, at = -1; for (let j = from; j < to; j++) { const a = area(h[i],h[j%h.length],h[k]); if (a > top) { top = a; at = j%h.length; } } return [top, at]; };
  let corners = null, best = 0;
  for (let i = 0; i < h.length; i++) for (let k = i+2; k < h.length; k++) {
    const [a, j] = far(i,k,i+1,k), [b, l] = n === 4 ? far(i,k,k+1,i+h.length) : [0, -1];
    if (n === 4 && l < 0) continue;
    if (a+b > best) { best = a+b; corners = n === 4 ? [h[i],h[j],h[k],h[l]] : [h[i],h[j],h[k]]; }
  }
  return { corners, best };
}
function fitPolygon(strokes, bounds, n) {
  const diagonal = Math.hypot(bounds.width,bounds.height), step = diagonal/120, ink = [];
  let inkLength = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i++) {
    const d = distance(s[i-1],s[i]), m = Math.max(1,Math.ceil(d/step)); inkLength += d;
    for (let k = 0; k < m; k++) ink.push({x:s[i-1].x+(s[i].x-s[i-1].x)*k/m, y:s[i-1].y+(s[i].y-s[i-1].y)*k/m});
  }
  if (ink.length < 12) return null;
  const outline = hull(ink);
  if (outline.length < n) return null;
  // Wobbly ink makes a hull of hundreds of points; a few dozen keep every corner.
  let h = outline;
  for (let t = diagonal*.003; h.length > 48; t *= 1.5) h = simplify([...h,h[0]],t).slice(0,-1);
  const { corners, best } = largest(h, n);
  // A square or circle has a lot of hull left over outside its biggest triangle, and a
  // circle (but not a square with rounded corners) outside its biggest quadrilateral.
  if (!corners || best/polygonArea(outline) < (n === 3 ? .55 : .8)) return null;
  const sidesOf = c => c.map((a,i)=>[a,c[(i+1)%n]]), lengthOf = c => sidesOf(c).reduce((sum,[a,b])=>sum+distance(a,b),0);
  const lengths = sidesOf(corners).map(([a,b])=>distance(a,b)), perimeter = lengthOf(corners);
  // No sliver triangles (that's a line). Four sides means four real corners and no stub
  // of a side: a triangle with a blunt tip or a bump is still a triangle.
  const angles = corners.map((p,i)=>{ const a=corners[(i+1)%n],b=corners[(i+n-1)%n];
    return Math.acos(Math.max(-1,Math.min(1,((a.x-p.x)*(b.x-p.x)+(a.y-p.y)*(b.y-p.y))/(distance(a,p)*distance(b,p)||1)))); });
  if (n === 3 ? Math.min(...angles) < .22 : Math.max(...angles) > 2.5 || Math.min(...lengths) < perimeter*.09) return null;
  // The pen goes round the middle about once and doesn't double back, as a scribble does.
  const g = {x:corners.reduce((sum,p)=>sum+p.x,0)/n, y:corners.reduce((sum,p)=>sum+p.y,0)/n};
  let swept = 0, back = 0;
  for (const st of strokes) {
    let net = 0, total = 0;
    for (let i = 1; i < st.length; i++) {
      const d = Math.atan2(st[i].y-g.y,st[i].x-g.x)-Math.atan2(st[i-1].y-g.y,st[i-1].x-g.x), turn = Math.atan2(Math.sin(d),Math.cos(d));
      net += turn; total += Math.abs(turn);
    }
    swept += Math.abs(net); back += total-Math.abs(net);
  }
  if (swept < Math.PI*1.25 || swept > Math.PI*3 || back > Math.PI*.6) return null;
  const offs = c => { const sides = sidesOf(c); return ink.map(p=>Math.min(...sides.map(([a,b])=>toSegment(p,a,b)))); };
  const mean = list => list.reduce((a,b)=>a+b,0)/list.length;
  const fits = c => {
    const perimeter = lengthOf(c);
    // About one outline's worth of ink.
    if (inkLength < perimeter*.68 || inkLength > perimeter*1.6) return false;
    // How far ink may stray follows the shape's own thickness as well as its box, or the
    // diagonal of a long flat box (or of half a box, drawn so far) passes for a triangle.
    // A pixel or two more for small shapes, where the hand's wobble is a bigger share.
    const thickness = 2*polygonArea(c)/perimeter, slack = (box, thick) => Math.min(diagonal*box, thickness*thick);
    const off = offs(c).sort((a,b)=>a-b);
    if (mean(off) > slack(.05,.22)+1 || off[Math.floor(off.length*.95)] > slack(.11,.5)+2) return false;
    // Ink along most of the outline, and along at least half of every side: an open V or a
    // caret is missing one, however close its ends come to where the third side would be.
    // A box needs more of each side, or a U with the ends of its lid begun would pass.
    const along = sidesOf(c).map(([a,b]) => {
      let covered = 0;
      for (let t = .05; t < 1; t += .1) { const q = {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t}; if (ink.some(p=>distance(p,q) < slack(.08,.4)+1)) covered++; }
      return covered / 10;
    });
    return Math.min(...along) >= (n === 3 ? .5 : .7) && along.reduce((a,b)=>a+b,0) >= n*.78;
  };
  // Rounded corners pull the biggest shape inside the ink in from its straight sides. Also
  // try it with every side moved out the same distance, to where it lies along the ink.
  const outward = (a,b) => {
    const l = distance(a,b)||1, x = (b.y-a.y)/l, y = (a.x-b.x)/l;
    return x*((a.x+b.x)/2-g.x)+y*((a.y+b.y)/2-g.y) < 0 ? {x:-x,y:-y} : {x,y};
  };
  const moved = d => corners.map((p,i)=>{
    const u = outward(corners[(i+n-1)%n],p), v = outward(p,corners[(i+1)%n]), s = d/(1+u.x*v.x+u.y*v.y);
    return {x:p.x+(u.x+v.x)*s, y:p.y+(u.y+v.y)*s};
  });
  let wide = corners, least = mean(offs(corners));
  for (let k = 1; k <= 6; k++) { const c = moved(best/perimeter*k*.1), m = mean(offs(c)); if (m < least) { least = m; wide = c; } }
  // `stray` is how far the worst of the ink lies off the outline, fitting or not, so one
  // reading can be weighed against another. `dent` is how deep the ink dips inside its
  // hull, for its thickness: a heart's top, the dips between a cloud's puffs.
  const off = offs(wide).sort((a,b)=>a-b), edges = h.map((a,i)=>[a,h[(i+1)%h.length]]);
  const dent = Math.max(...ink.map(p=>Math.min(...edges.map(([a,b])=>toSegment(p,a,b)))))/(2*best/perimeter);
  return { corners: [wide, corners].find(fits) ?? null, stray: off[Math.floor(off.length*.95)], dent };
}
// Square or rectangle from four corners, or null when they aren't roughly right angles.
function boxKind(corners) {
  const lengths=corners.map((p,i)=>distance(p,corners[(i+1)%4]));
  const rightAngles=corners.every((p,i)=>{
    const a=corners[(i+3)%4],b=corners[(i+1)%4];
    return Math.abs((a.x-p.x)*(b.x-p.x)+(a.y-p.y)*(b.y-p.y))/(distance(a,p)*distance(b,p)||1)<.32;
  });
  if(!rightAngles) return null;
  const across=lengths[0]+lengths[2], down=lengths[1]+lengths[3];
  return Math.max(across,down)/Math.min(across,down)<1.23?'square':'rectangle';
}
export function recognizeShape(strokes) {
  const bounds = inkBounds(strokes);
  if (!bounds || Math.max(bounds.width,bounds.height)<40 || strokes.length>8) return null;
  // A box first: its fourth corner keeps it from passing the triangle fit anyway, but a
  // blunt-tipped triangle can pass for four sides, so a lopsided four isn't the answer.
  // Three sides only when four don't explain the ink far better: a box with a side left
  // open fits a triangle along its diagonal, but fits its own four sides more closely still.
  const rough = () => {
    if (Math.min(bounds.width,bounds.height)<14) return null;
    const box = fitPolygon(strokes,bounds,4), kind = box?.corners && boxKind(box.corners);
    // No library drawing is a plain box, so a rough one needn't give way to one.
    if (kind) return {kind,bounds};
    const triangle = fitPolygon(strokes,bounds,3);
    return triangle?.corners && !(box && box.stray < triangle.stray*.6) ? {kind:'triangle',bounds,rough:true} : null;
  };
  if (Math.min(bounds.width,bounds.height)<24) return rough();
  const diagonal = Math.hypot(bounds.width,bounds.height), gap = Math.max(10,diagonal*.1);
  const points = connect(strokes,gap);
  if (!points || points.length<4 || distance(points[0],points.at(-1))>gap) return rough();
  const length = points.reduce((sum,p,i)=>sum+(i?distance(p,points[i-1]):0),0);
  if (length<diagonal*1.9 || length>diagonal*4) return rough();
  const closed = [...points,points[0]];
  let corners = simplify(closed,diagonal*.04).slice(0,-1);
  // Remove a redundant start point if the pen began halfway along an edge.
  corners = corners.filter((p,i,all)=>{
    const a=all[(i+all.length-1)%all.length],b=all[(i+1)%all.length];
    return ((p.x-a.x)*(b.x-p.x)+(p.y-a.y)*(b.y-p.y))/(distance(a,p)*distance(p,b)||1)<.94;
  });
  if (corners.length===3 || corners.length===4) {
    const turns=corners.map((p,i)=>{
      const a=corners[(i+1)%corners.length],b=corners[(i+2)%corners.length];
      return (a.x-p.x)*(b.y-a.y)-(a.y-p.y)*(b.x-a.x);
    });
    const convex=turns.every(t=>t>0)||turns.every(t=>t<0);
    if (convex) {
      // Reject curved sides that happened to simplify to a small polygon.
      const straightError = points.reduce((sum,p)=>sum+Math.min(...corners.map((a,i)=>{
        const b=corners[(i+1)%corners.length],dx=b.x-a.x,dy=b.y-a.y;
        const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
        return distance(p,{x:a.x+t*dx,y:a.y+t*dy});
      })),0)/points.length/diagonal;
      if (straightError<.022) {
        if (corners.length===3) return {kind:'triangle',bounds};
        const kind=boxKind(corners);
        if(kind) return {kind,bounds};
      }
    }
  }
  const polygon = rough();
  if (polygon) return polygon;
  const cx=(bounds.left+bounds.right)/2,cy=(bounds.top+bounds.bottom)/2;
  const radii=points.map(p=>Math.hypot((p.x-cx)/(bounds.width/2),(p.y-cy)/(bounds.height/2)));
  const error=radii.reduce((n,r)=>n+Math.abs(1-r),0)/radii.length;
  let winding=0;
  for(let i=1;i<points.length;i++) {
    const a=Math.atan2(points[i-1].y-cy,points[i-1].x-cx),b=Math.atan2(points[i].y-cy,points[i].x-cx);
    winding+=Math.atan2(Math.sin(b-a),Math.cos(b-a));
  }
  if(error<.085 && Math.abs(winding)>5.5 && Math.abs(winding)<7) {
    return {kind:Math.max(bounds.width,bounds.height)/Math.min(bounds.width,bounds.height)<1.22?'circle':'oval',bounds};
  }
  return null;
}

// A conservative point-cloud matcher for a few uppercase, separated-letter words.
const GLYPHS = {
  H:[[[0,0],[0,3]],[[2,0],[2,3]],[[0,1.5],[2,1.5]]],
  I:[[[0,0],[2,0]],[[1,0],[1,3]],[[0,3],[2,3]]],
  E:[[[2,0],[0,0],[0,3],[2,3]],[[0,1.5],[1.7,1.5]]],
  L:[[[0,0],[0,3],[2,3]]], O:[[[1,0],[0,0.4],[0,2.6],[1,3],[2,2.6],[2,.4],[1,0]]],
  Y:[[[0,0],[1,1.5],[2,0]],[[1,1.5],[1,3]]],
  S:[[[2,0],[0,0],[0,1.5],[2,1.5],[2,3],[0,3]]],
  N:[[[0,3],[0,0],[2,3],[2,0]]], P:[[[0,3],[0,0],[2,0],[2,1.5],[0,1.5]]],
  T:[[[0,0],[2,0]],[[1,0],[1,3]]], C:[[[2,0],[0,0],[0,3],[2,3]]],
  K:[[[0,0],[0,3]],[[2,0],[0,1.5],[2,3]]],
  A:[[[0,3],[1,0],[2,3]],[[.5,1.6],[1.5,1.6]]], V:[[[0,0],[1,3],[2,0]]],
  W:[[[0,0],[.5,3],[1,1.2],[1.5,3],[2,0]]], M:[[[0,3],[0,0],[1,1.5],[2,0],[2,3]]],
  X:[[[0,0],[2,3]],[[2,0],[0,3]]], F:[[[2,0],[0,0],[0,3]],[[0,1.5],[1.5,1.5]]],
  U:[[[0,0],[0,2.4],[.6,3],[1.4,3],[2,2.4],[2,0]]],
  Z:[[[0,0],[2,0],[0,3],[2,3]]],
  R:[[[0,3],[0,0],[2,0],[2,1.5],[0,1.5]],[[.8,1.5],[2,3]]],
  B:[[[0,3],[0,0],[1.5,0],[2,.4],[2,1.1],[1.5,1.5],[0,1.5]],[[1.5,1.5],[2,1.9],[2,2.6],[1.5,3],[0,3]]]
};
export const KNOWN_WORDS = Object.keys(WORDS);
export function wordTemplate(word, plainI = false) {
  return [...word].flatMap((c,i)=>(c==='I'&&plainI?[[[1,0],[1,3]]]:GLYPHS[c]||[]).map(s=>s.map(([x,y])=>({x:x+i*3,y}))));
}
function cloud(strokes) {
  const b=inkBounds(strokes),points=[];
  if(!b || !b.width || !b.height)return null;
  for(const s of strokes)for(let i=1;i<s.length;i++) {
    const a=s[i-1],z=s[i],steps=Math.max(1,Math.ceil(distance(a,z)/Math.max(b.width,b.height)*80));
    for(let k=0;k<steps;k++) points.push({x:(a.x+(z.x-a.x)*k/steps-b.left)/b.width,y:(a.y+(z.y-a.y)*k/steps-b.top)/b.height});
  }
  return {points,ratio:b.width/b.height};
}
const templates=KNOWN_WORDS.flatMap(word=>[false,true].map(plain=>({word,...cloud(wordTemplate(word,plain))})));
export function recognizeKnownWord(strokes) {
  const b=inkBounds(strokes),input=cloud(strokes);
  if(!input || Math.min(b.width,b.height)<18 || strokes.length<2 || input.points.length<12 || input.points.length>1800)return null;
  const directed=(a,b)=>{
    let sum=0;
    for(const p of a){let best=Infinity;for(const q of b){const dx=p.x-q.x,dy=p.y-q.y,d=dx*dx+dy*dy;if(d<best)best=d;}sum+=Math.sqrt(best);}
    return sum/a.length;
  };
  const scored=templates.map(t=>({word:t.word,error:(directed(input.points,t.points)+directed(t.points,input.points))/2+
    Math.abs(Math.log(input.ratio/t.ratio))*.06}));
  const ranked=KNOWN_WORDS.map(word=>({word,error:Math.min(...scored.filter(t=>t.word===word).map(t=>t.error))})).sort((a,b)=>a.error-b.error);
  return ranked[0].error<.047 && ranked[1].error-ranked[0].error>.012?{kind:'word',text:ranked[0].word,bounds:b}:null;
}

// Library drawings: a $P-style point-cloud matcher (Vatavu, Anthony & Wobbrock, 2012).
// Ink is resampled to a fixed number of points, scaled evenly and centred, then greedily
// matched point to point against every template, so stroke order and direction don't
// matter. A drawing is named only when it matches clearly better than anything else.
const CLOUD = 40;
function resample(strokes, n) {
  const lines = strokes.filter(s => s.length), lengths = lines.map(s => s.reduce((sum,p,i)=>sum+(i?distance(p,s[i-1]):0),0));
  const total = lengths.reduce((a,b)=>a+b,0);
  if (!lines.length || n < lines.length) return null;
  // Every stroke gets a point (dots for eyes count); the rest go by length.
  const share = lengths.map(l => total ? l / total * (n - lines.length) : (n - lines.length) / lines.length);
  const counts = share.map(Math.floor);
  share.map((v,i)=>[v-counts[i],i]).sort((a,b)=>b[0]-a[0]).slice(0, n - lines.length - counts.reduce((a,b)=>a+b,0)).forEach(([,i])=>counts[i]++);
  const out = [];
  lines.forEach((s, k) => {
    const m = counts[k] + 1, step = lengths[k] / Math.max(1, m - 1);
    let walked = 0, i = 1;
    for (let j = 0; j < m; j++) {
      const target = m === 1 ? 0 : j * step;
      while (i < s.length - 1 && walked + distance(s[i-1], s[i]) < target) { walked += distance(s[i-1], s[i]); i++; }
      if (s.length === 1) { out.push({ x: s[0].x, y: s[0].y }); continue; }
      const a = s[i-1], b = s[i], seg = distance(a, b) || 1, t = Math.max(0, Math.min(1, (target - walked) / seg));
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  });
  return out;
}
function normalized(strokes) {
  const points = resample(strokes, CLOUD), b = points && inkBounds([points]);
  if (!b) return null;
  const size = Math.max(b.width, b.height) || 1;
  const cx = points.reduce((s,p)=>s+p.x,0) / points.length, cy = points.reduce((s,p)=>s+p.y,0) / points.length;
  return points.map(p => ({ x: (p.x - cx) / size, y: (p.y - cy) / size }));
}
function cloudDistance(a, b, start) {
  const n = a.length, used = new Array(n).fill(false);
  let sum = 0, i = start;
  do {
    let best = Infinity, index = 0;
    for (let j = 0; j < n; j++) if (!used[j]) { const d = distance(a[i], b[j]); if (d < best) { best = d; index = j; } }
    used[index] = true;
    sum += (1 - ((i - start + n) % n) / n) * best;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}
function cloudMatch(a, b) {
  const step = Math.max(1, Math.floor(Math.sqrt(a.length)));
  let best = Infinity;
  for (let i = 0; i < a.length; i += step) best = Math.min(best, cloudDistance(a, b, i), cloudDistance(b, a, i));
  return best / a.length;
}
const DRAWING_MATCH = .03, DRAWING_MARGIN = .003;
const drawingTemplates = DRAWINGS.filter(d => d.name !== 'button').flatMap(d => d.templates.map(t => ({ name: d.name, min: d.min ?? 1, max: d.max ?? 14, match: d.match ?? DRAWING_MATCH,
  cloud: normalized(t.map(s => s.map(([x, y]) => ({ x, y })))) })));

// A broad pedestal with a narrower rectangular plunger above it. Fit stroke groups,
// not stroke order: visitors can draw either box first, backwards, or side by side
// in separate pen strokes. Keep this structural so nested boxes aren't buttons.
function recognizeButton(strokes, bounds) {
  if (!strokes.length || strokes.length > 8 || Math.max(bounds.width, bounds.height) < 40) return null;
  // A visitor may trace the entire stepped outline without lifting the pencil.
  // Infer its shoulder height, then verify every exposed edge of both boxes.
  const silhouette=()=>{
    const points=resample(strokes,256), diagonal=Math.hypot(bounds.width,bounds.height);
    if(!points)return null;
    const cuts=strokes.flatMap(s=>simplify(s,diagonal*.025).map(p=>p.y));
    for(const cut of cuts) {
      const baseHeight=bounds.bottom-cut, capHeight=cut-bounds.top;
      if(Math.min(baseHeight,capHeight)<12 || capHeight>baseHeight*2.5)continue;
      const upper=points.filter(p=>p.y<cut-Math.max(3,capHeight*.15));
      const c=inkBounds([upper]);if(!c)continue;
      if(c.width<bounds.width*.18 || c.width>bounds.width*.85 ||
        c.left<bounds.left+bounds.width*.04 || c.right>bounds.right-bounds.width*.04)continue;
      const vertices=[
        {x:bounds.left,y:cut},{x:c.left,y:cut},{x:c.left,y:bounds.top},{x:c.right,y:bounds.top},
        {x:c.right,y:cut},{x:bounds.right,y:cut},{x:bounds.right,y:bounds.bottom},{x:bounds.left,y:bounds.bottom}
      ];
      const edges=vertices.map((p,i)=>[p,vertices[(i+1)%8]]);
      const tolerance=Math.max(3,Math.min(baseHeight,capHeight,c.width)*.2+1);
      const allowed=[...edges,[vertices[1],vertices[4]]]; // optional shared edge
      const errors=points.map(p=>Math.min(...allowed.map(([a,b])=>toSegment(p,a,b)))).sort((a,b)=>a-b);
      if(errors.reduce((a,b)=>a+b,0)/errors.length>tolerance*.55 || errors[Math.floor(errors.length*.95)]>tolerance*1.5)continue;
      if(!vertices.every(p=>points.some(q=>distance(p,q)<tolerance*.85)))continue;
      if(!edges.every(([a,b])=>{
        let hits=0;
        for(let i=0;i<10;i++) {
          const t=(i+.5)/10,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
          if(points.some(q=>distance(p,q)<tolerance*1.4))hits++;
        }
        return hits>=7;
      }))continue;
      return {kind:'drawing',name:'button',bounds,
        baseBounds:{...bounds,top:cut,height:baseHeight},
        capBounds:{...c,top:bounds.top,bottom:cut,height:capHeight}};
    }
    return null;
  };
  const rectangle = group => {
    const b = inkBounds(group);
    if (!b || Math.min(b.width, b.height) < 12 || Math.max(b.width, b.height) / Math.min(b.width, b.height) > 8) return null;
    const points = resample(group, 96), tolerance = Math.min(b.width, b.height) * .19;
    const corners = [{x:b.left,y:b.top},{x:b.right,y:b.top},{x:b.right,y:b.bottom},{x:b.left,y:b.bottom}];
    const sides = corners.map((p,i) => [p,corners[(i+1)%4]]);
    const errors = points.map(p => Math.min(...sides.map(([a,c]) => toSegment(p,a,c))));
    if (errors.reduce((sum,e) => sum+e,0)/errors.length > tolerance*.5 || errors.filter(e => e > tolerance).length > points.length*.1) return null;
    // Rounded loops can lie near the sides too, but don't reach the four corners.
    if (!corners.every(p => points.some(q => distance(p,q) < tolerance*.95))) return null;
    return { bounds:b, points, sides, tolerance };
  };
  const covered = (rect, other, upper) => rect.sides.every(([a,b],side) => {
    // The base's top edge can supply the plunger's bottom edge (a three-sided cap).
    const ink = upper && side === 2 ? [...rect.points,...other.points] : rect.points;
    let hits = 0;
    for (let i=0;i<10;i++) {
      const t=(i+.5)/10, p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
      if (ink.some(q => distance(p,q) < rect.tolerance*1.5)) hits++;
    }
    return hits >= 7;
  });
  // Fix the first stroke in one group to avoid testing each partition twice.
  for (let mask=1;mask<(1<<strokes.length)-1;mask+=2) {
    const a=[],b=[];
    strokes.forEach((s,i) => ((mask & (1<<i)) ? a : b).push(s));
    const ra=rectangle(a), rb=rectangle(b);
    if (!ra || !rb) continue;
    const [cap,base]=ra.bounds.top < rb.bounds.top ? [ra,rb] : [rb,ra];
    const c=cap.bounds, f=base.bounds, gap=c.bottom-f.top;
    if (c.width < f.width*.18 || c.width > f.width*.85 || c.height > f.height*2.5 ||
        c.left < f.left-f.width*.06 || c.right > f.right+f.width*.06 ||
        Math.abs(gap) > Math.min(c.height,f.height)*.38 || c.top >= f.top) continue;
    if (covered(base,cap,false) && covered(cap,base,true))
      return {kind:'drawing',name:'button',bounds,baseBounds:f,capBounds:c};
  }
  return silhouette();
}
export function recognizeDrawing(strokes) {
  const b = inkBounds(strokes);
  if (!b || Math.max(b.width, b.height) < 30 || strokes.length > 14) return null;
  const button = recognizeButton(strokes,b);
  if (button) return button;
  const input = normalized(strokes);
  if (!input) return null;
  const best = new Map();
  // Each name keeps its best template, scored against the bar that name has to clear.
  for (const t of drawingTemplates) if (strokes.length >= t.min && strokes.length <= t.max)
    best.set(t.name, Math.min(best.get(t.name) ?? Infinity, cloudMatch(input, t.cloud) * DRAWING_MATCH / t.match));
  if (!best.size) return null;
  const [first, second = [null, Infinity]] = [...best].sort((x, y) => x[1] - y[1]);
  return first[1] < DRAWING_MATCH && second[1] - first[1] > DRAWING_MARGIN ? { kind: 'drawing', name: first[0], bounds: b } : null;
}

// Everything the pencil can be read as, most certain first. A rough triangle is the loosest
// guess, so it gives way to a library drawing that matches clearly (a heart is a rounded
// triangle with a dent in the top). It still says it could be one (`triangle`), for the cape.
export function recognizeInk(strokes) {
  const word = recognizeKnownWord(strokes);
  if (word) return word;
  const shape = recognizeShape(strokes);
  if (shape && !shape.rough) return shape;
  const drawing = recognizeDrawing(strokes);
  return drawing ? (shape?.kind === 'triangle' ? { ...drawing, triangle: true } : drawing) : shape;
}
