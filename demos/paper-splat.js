// Viewport coordinates keep the glass gag attached to the screen while the page scrolls.
const clamp = t => Math.max(0, Math.min(1, t));
export const SPLAT_DURATION = 3.9;
export function splatFrame(time, origin, width, height, reduced = false) {
  const launch = clamp(time / .48), slide = clamp((time - 1.85) / 1.5);
  const impact = time >= .48;
  const target = { x: width * .5, y: Math.max(110, height * .43) };
  const size = Math.min(6.5, width / 62, height / 76);
  const zoom = launch ** 2.4;
  return {
    x: reduced ? target.x : origin.x + (target.x-origin.x)*launch,
    y: (reduced ? target.y : origin.y + (target.y-origin.y)*launch) + (reduced ? 0 : slide**2*(height-target.y+size*65)),
    scale: reduced ? Math.min(2.5,size) : 1+(size-1)*zoom,
    squash: reduced ? 1 : impact ? 1 + .22*Math.exp(-(time-.48)*15)*Math.cos((time-.48)*24) : 1,
    opacity: reduced ? 1-clamp((time-1.5)/.5) : 1-clamp((time-3.35)/.4),
    smudge: impact ? .16*(1-clamp((time-2.4)/1.5)) : 0,
    impact, done: time >= (reduced ? 2 : SPLAT_DURATION), target, size
  };
}

export function createScreenSplat(origin, reduced) {
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('aria-hidden','true');
  svg.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:90;pointer-events:none;overflow:hidden';
  const make=(tag,attrs,parent=svg)=>{
    const node=document.createElementNS(ns,tag);
    for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);
    parent.append(node);return node;
  };
  const smudge=make('g',{fill:'none',stroke:'#36332e','stroke-width':2,'stroke-linecap':'round'});
  // Ghost of his spread limbs, with faint pencil skid marks rather than a white mask.
  make('path',{d:'M-23 -32L-11 -25L0 -18L11 -25L23 -32M0 -18L0 0L-13 12L-24 22M0 0L13 12L24 22M-20 28l-2 15M20 28l2 19M-5 -42l-4 -7M7 -42l4 -8'},smudge);
  const figure=make('g',{fill:'none',stroke:'#141412','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round'});
  make('path',{d:'M0 -18L0 0M0 -18L-11 -25L-23 -32M0 -18L11 -25L23 -32M0 0L-13 12L-24 22M0 0L13 12L24 22'},figure);
  make('circle',{cx:0,cy:-25,r:4.3},figure);
  const eyes=make('path',{d:'M-2.3 -26.5l1.4 1.4m0 -1.4l-1.4 1.4M.9 -26.5l1.4 1.4m0 -1.4l-1.4 1.4','stroke-width':.55,opacity:0},figure);
  // A pencil-drawn pressure burst stays anchored to the button as he flies out.
  const burst=make('g',{fill:'none',stroke:'#d0282e','stroke-width':2,'stroke-linecap':'round'});
  make('path',{d:'M0 -28L7 -13L23 -23L17 -7L35 -2L18 5L27 21L9 15L0 31L-7 15L-25 23L-17 5L-34 -2L-18 -9L-23 -24L-7 -14Z',fill:'#fff4d0'},burst);
  for(let i=0;i<10;i++) {
    const a=i*Math.PI/5;
    make('path',{d:`M${Math.cos(a)*42} ${Math.sin(a)*35}l${Math.cos(a)*12} ${Math.sin(a)*10}`},burst);
  }
  const speed=make('g',{fill:'none',stroke:'#36332e','stroke-width':1.2,opacity:0});
  make('path',{d:'M-31 -42l-16 -14M30 -42l17 -14M-32 20l-16 11M32 20l16 11'},speed);
  const impactLines=make('g',{fill:'none',stroke:'#36332e','stroke-width':1.1,opacity:0});
  make('path',{d:'M-34 -37l-8 -7M34 -37l8 -7M-35 22l-9 6M35 22l9 6M0 -43v-9'},impactLines);
  document.body.append(svg);
  let time=0,impacted=false;
  return {
    step(dt,width,height) {
      time+=dt;
      const f=splatFrame(time,origin,width,height,reduced);
      const pop=clamp(time/.22),burstFade=1-clamp((time-.16)/.44);
      burst.setAttribute('transform',`translate(${origin.x} ${origin.y+15}) scale(${reduced?1:.35+pop*1.3})`);
      burst.setAttribute('opacity',reduced?0:burstFade);
      speed.setAttribute('transform',`translate(${f.x} ${f.y}) scale(${f.scale})`);
      speed.setAttribute('opacity',reduced||f.impact?0:launchOpacity(time));
      impactLines.setAttribute('transform',`translate(${f.target.x} ${f.target.y}) scale(${f.size})`);
      impactLines.setAttribute('opacity',reduced||!f.impact?0:1-clamp((time-.48)/.35));
      figure.setAttribute('transform',`translate(${f.x} ${f.y}) scale(${f.scale*f.squash} ${f.scale/f.squash})`);
      figure.setAttribute('opacity',f.opacity);
      smudge.setAttribute('transform',`translate(${f.target.x} ${f.target.y}) scale(${f.size})`);
      smudge.setAttribute('opacity',reduced?0:f.smudge);
      eyes.setAttribute('opacity',f.impact?1:0);
      const hit=f.impact&&!impacted;impacted ||= f.impact;
      return {done:f.done,hit};
    },
    destroy(){svg.remove();}
  };
}

function launchOpacity(time) { return clamp(time/.12)*.45; }
