import { sampleCourse, travelCourse } from './paper-physics.js';

const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});
const add=(p,v,n)=>({x:p.x+v.x*n,y:p.y+v.y*n});
const smooth=t=>t*t*(3-2*t);

// A two-bone limb: the endpoint stays within reach and the joint bends toward
// the body's side of the string, instead of swinging through it.
export function solveLimb(root, target, upper, lower, bend) {
  const dx=target.x-root.x,dy=target.y-root.y,raw=Math.hypot(dx,dy);
  const length=Math.max(.001,Math.min(upper+lower-.05,Math.max(Math.abs(upper-lower)+.05,raw)));
  const tx=raw>.00001?dx/raw:0,ty=raw>.00001?dy/raw:1;
  const along=(upper*upper-lower*lower+length*length)/(2*length);
  const height=Math.sqrt(Math.max(0,upper*upper-along*along));
  const sign=(-ty*bend.x+tx*bend.y)>=0?1:-1;
  return {
    root,
    joint:{x:root.x+tx*along-ty*height*sign,y:root.y+ty*along+tx*height*sign},
    end:{x:root.x+tx*length,y:root.y+ty*length}
  };
}

export function climbAmount(at) {
  return smooth(Math.max(0,Math.min(1,(Math.abs(at.ty)-.48)/.38)));
}

export function courseFrame(ropes,position) {
  const at=sampleCourse(ropes,position); if(!at)return null;
  const before=sampleCourse(ropes,travelCourse(ropes,position,-12));
  const after=sampleCourse(ropes,travelCourse(ropes,position,12));
  const dx=after.x-before.x,dy=after.y-before.y,length=Math.hypot(dx,dy);
  return length>.001?{...at,tx:dx/length,ty:dy/length}:at;
}

function stride(phase, offset, moving) {
  const idle=offset? -6.5:6.5,activity=Number(moving); // at rest, feet apart in an A
  if(!activity)return {offset:idle,lift:0};
  const t=((phase/(2*Math.PI)+offset)%1+1)%1;
  if(t<.6)return {offset:mix(idle,9-18*t/.6,activity),lift:0};
  const swing=(t-.6)/.4;
  return {offset:mix(idle,-9+18*smooth(swing),activity),lift:Math.sin(swing*Math.PI)*2.5*activity};
}

const LEG=17.95; // hip to foot with the knee straight: solveLimb's full reach for two 9px bones
const unit=v=>{const n=Math.hypot(v.x,v.y)||1;return {x:v.x/n,y:v.y/n};};

// Three stances, blended: standing (crawl 0), climbing (crawl 1) and sliding down a
// steep line (crawl 1, slide 1). A climber keeps an upright body hanging beside the
// line and goes hand over hand; a slider leans back up the slope with one foot ahead.
export function figurePose(ropes,position,phase,moving,facing,crawl,slide=0) {
  const at=courseFrame(ropes,position); if(!at)return null;
  const up={x:0,y:-1};
  const uphill=at.ty<=0?1:-1;
  // Prefer the upper side of a slope. A small left/up bias near vertical keeps
  // the body from flipping sides when a bouncing string passes through vertical.
  const nx=at.tx*at.ty-.2*Math.abs(at.ty)**3,ny=-(at.tx**2)-.08*at.ty**2;
  const normal=unit({x:nx,y:ny});
  const along={x:at.tx*uphill,y:at.ty*uphill};              // up the line
  // Sample the actual curved string for every grip.
  const contact=(offset,lift=0)=>{
    const p=sampleCourse(ropes,travelCourse(ropes,position,offset));
    return {x:p.x+normal.x*lift,y:p.y+normal.y*lift};
  };
  const travel=moving?(facing*Math.sign(at.tx||1)):1;
  // He stands and walks upright on straight legs, like a compass: the hip rides as high
  // as the planted feet allow (so he bobs a little each step) and the swinging leg stays
  // straight too, only skimming the ground when it passes under him.
  const gait=Number(moving),reach=mix(1,.7,gait),steps=[stride(phase,0,moving),stride(phase,.5,moving)];
  const ground=steps.map(s=>contact(s.offset*reach*travel));
  let hipY=at.y-LEG;
  steps.forEach((s,k)=>{ if(s.lift<.01) hipY=Math.max(hipY,ground[k].y-Math.sqrt(Math.max(0,LEG*LEG-(ground[k].x-at.x)**2))); });
  // At rest both legs stay straight even where the string sags under one foot: the hip
  // goes where two leg-length circles around the feet meet, easing back as he walks off.
  let hipX=at.x;
  const [fa,fb]=ground,fdx=fb.x-fa.x,fdy=fb.y-fa.y,fd=Math.hypot(fdx,fdy);
  if(gait<1&&fd>.001&&fd<2*LEG) {
    const h=Math.sqrt(LEG*LEG-fd*fd/4);
    let px=-fdy/fd*h,py=fdx/fd*h; if(py>0){px=-px;py=-py;}
    hipX=mix((fa.x+fb.x)/2+px,hipX,gait); hipY=mix((fa.y+fb.y)/2+py,hipY,gait);
  }
  const standHip={x:hipX,y:hipY},standShoulder=add(standHip,up,12);
  // Climbing: the body hangs plumb and close beside the line, hip level with where he
  // is on it. Limbs move in diagonal pairs, as people climb ropes and ladders: while one
  // hand reaches high, the opposite knee comes up; the other hand pulls in at the chin as
  // the other leg straightens below. A gripping hand or foot stays put on the line while
  // the body rises past it (13.4px, the climb's travel during the grip part of a cycle).
  const climbHip=add(at,normal,4.5),climbShoulder=add(climbHip,up,12);
  const cycle=((phase/(2*Math.PI))%1+1)%1;
  const grip=(u,high,low,lift)=>{
    u=((u%1)+1)%1;
    if(u<.6)return {s:mix(high,low,u/.6),off:0};
    const k=(u-.6)/.4;
    return {s:mix(low,high,smooth(k)),off:Math.sin(k*Math.PI)*lift};
  };
  // Sliding is a bum slide down the line, as if it were the ground: sat on it, leaning
  // back up the slope, legs out ahead down the line, one hand trailing on the line
  // behind him, and the other arm thrown up and forward for balance.
  // He sits square to the line, so this uses a true perpendicular on his side of it.
  const down={x:-along.x,y:-along.y};
  const flip=(-along.y*normal.x+along.x*normal.y)<0?-1:1;
  const off={x:-along.y*flip,y:along.x*flip};
  const slideHip=add(at,off,2.5);
  const slideShoulder=add(slideHip,unit({x:off.x*.8+along.x*.6,y:off.y*.8+along.y*.6}),12);
  const bendAmount=crawl*slide;
  const hip=blend(standHip,blend(climbHip,slideHip,slide),crawl);
  const shoulder=blend(standShoulder,blend(climbShoulder,slideShoulder,slide),crawl);
  const spine=unit({x:shoulder.x-hip.x,y:shoulder.y-hip.y});
  // Climbing, the head tips out from the line (looking up at the next grip) so the arms clear it.
  const head=add(add(add(shoulder,spine,mix(6,5,crawl)),{x:normal.x,y:0},3.8*crawl*(1-slide)),down,1.2*crawl*slide);
  // Seen from the side, elbows drop down in front of the chest (between him and the line)
  // and knees come forward toward the line, as when hugging a rope; bending them outward
  // splays the limbs like a spider and drives the elbows into the head.
  const climbElbow={x:-normal.x*.7-along.x*.7,y:-normal.y*.7-along.y*.7};
  const climbKnee={x:-normal.x+along.x*.6,y:-normal.y+along.y*.6};
  const legs=[],arms=[];
  for(let side=0;side<2;side++) {
    const step=steps[side];
    const g=ground[side],dx=g.x-standHip.x;
    const standFoot=step.lift<.01?g:{x:g.x,y:Math.min(g.y-step.lift*.4,hipY+Math.sqrt(Math.max(0,LEG*LEG-dx*dx)))};
    const footGrip=grip(cycle+side*.5+.5,-3.4,-16.8,1.5);
    const climbFoot=contact(footGrip.s*uphill,footGrip.off);
    // One leg lies nearly straight along the line; the other rides a little higher, knee up.
    const slideFoot=add(add(slideHip,down,side?15:17.5),off,side?3.5:-1.5);
    const foot=blend(standFoot,blend(climbFoot,slideFoot,slide),crawl);
    const slideKnee=off;
    const kneeBend=blend(blend({x:facing,y:-.1},climbKnee,crawl),slideKnee,bendAmount);
    // Standing and walking, each leg is one straight line from hip to foot, like a drawn
    // stick figure; the knee only bends while he is climbing or sliding, not resting on a steep bit.
    const leg=solveLimb(hip,foot,9,9,kneeBend);
    leg.joint=blend(blend(leg.root,leg.end,.5),leg.joint,crawl*gait);
    legs.push(leg);
    const armStep=stride(phase,side*.5+.5,moving);
    // At rest the hands sit on the hips with elbows out at the waist; the arms start a
    // little down the chest so they don't rise off the neck like a shrug. Walking, the
    // arms hang nearly straight and swing against the legs.
    const out=side? -facing:facing;
    const hipsHand={x:hip.x+out*2.5,y:hip.y+.5};
    const swingHand={x:shoulder.x+armStep.offset*.6*travel,y:shoulder.y+14};
    const standHand=blend(hipsHand,swingHand,gait);
    const standElbow=blend({x:out,y:-.2},{x:-facing,y:.1},gait);
    // Hand over hand: each hand grips high above the head and is pulled down to the chin.
    const handGrip=grip(cycle+side*.5,26.5,13.1,2.5);
    const climbHand=contact(handGrip.s*uphill,handGrip.off);
    // Sliding, the near hand stays flat on the line behind his hip the whole way down;
    // the far arm is thrown up and forward, down the slope.
    const slideHand=side? add(slideShoulder,unit({x:off.x*.85+down.x*.55,y:off.y*.85+down.y*.55}),13.5):contact(12*uphill);
    const hand=blend(standHand,blend(climbHand,slideHand,slide),crawl);
    const armRoot=add(shoulder,spine,-2.5*(1-gait)*(1-crawl));
    // The trailing elbow bows out behind him, the raised one hangs a little below its arm.
    const slideElbow=side? down:unit({x:off.x+along.x,y:off.y+along.y});
    arms.push(solveLimb(armRoot,hand,7.5,7.5,blend(blend(standElbow,climbElbow,crawl),slideElbow,bendAmount)));
  }
  return {hip,shoulder,head,legs,arms,crawl,slide};
}

// In the air: arms thrown up, knees tucked on the way up, and legs reaching on the way down.
export function airPose(at, t, facing) {
  const hip={x:at.x,y:at.y-12},shoulder={x:at.x+facing*1.5,y:at.y-24},head={x:at.x+facing*2.4,y:at.y-31};
  const reach=smooth(Math.max(0,Math.min(1,(t-.4)/.5)));
  const legs=[],arms=[];
  for(let side=0;side<2;side++) {
    const foot={x:hip.x+facing*mix(3,5,reach)+(side?-3:3),y:hip.y+mix(8,16,reach)-(side?1.5:0)};
    legs.push(solveLimb(hip,foot,9,9,{x:facing,y:-.2}));
    const hand={x:shoulder.x+(side?-facing*4:facing*6),y:shoulder.y-mix(9,5,reach)};
    arms.push(solveLimb(shoulder,hand,7.5,7.5,{x:side?-facing:facing,y:.6}));
  }
  return {hip,shoulder,head,legs,arms,crawl:0};
}

// Powered flight: hold the straps, lean into thrust, and let the legs trail.
// Settle upright and extend the feet as he approaches the landing.
export function jetpackPose(at, time, facing, progress = .5) {
  const landing = smooth(Math.max(0, Math.min(1, (progress - .8) / .2)));
  const thrust = 1 - landing;
  const bob = Math.sin(time * 7) * .65 * thrust;
  const hip = { x: at.x, y: at.y - 14 + bob };
  const shoulder = { x: hip.x + facing * 4.5 * thrust, y: hip.y - 12 };
  const head = { x: shoulder.x + facing * (1 + 2 * thrust), y: shoulder.y - 7 };
  // Side on (facing ±1), both hands forward on the pack's control grips, elbows tucked down at his
  // sides, so the arms stay in front of his body and never cross the tanks on his back.
  // Front on (facing 0), both arms go straight up overhead.
  const front = facing === 0, spread = side => side ? -1 : 1;
  const arms = [0, 1].map(side => front
    ? solveLimb(shoulder, { x: shoulder.x + spread(side) * 2, y: shoulder.y - 14.8 }, 7.5, 7.5, { x: spread(side), y: 0 })
    : solveLimb(shoulder,
      { x: shoulder.x + facing * (side ? 5 : 7), y: shoulder.y + (side ? 10.5 : 9.5) + Math.sin(time * 7 + side) * .4 * thrust },
      7.5, 7.5, { x: 0, y: 1 }));
  // Legs hang under him with a lazy kick, a little forward of the exhaust (apart, front on).
  const legs = [0, 1].map(side => solveLimb(hip,
    { x: hip.x + (front ? spread(side) * 2.5 : facing * (side ? .5 : 2.5) * thrust) + Math.sin(time * 5 + side * Math.PI) * 1.2 * thrust,
      y: hip.y + mix(side ? 15 : 16, 17, landing) },
    9, 9, front ? { x: spread(side), y: .5 } : { x: facing, y: .5 }));
  return { hip, shoulder, head, arms, legs, crawl: 0 };
}

// Blend bone angles along the shortest turn, retaining limb lengths throughout.
export function turnPose(from, to, amount) {
  const t = smooth(Math.max(0, Math.min(1, amount)));
  const bone = (root, a, b, c, d) => {
    const angle = Math.atan2(b.y-a.y, b.x-a.x), target = Math.atan2(d.y-c.y, d.x-c.x);
    const delta = Math.atan2(Math.sin(target-angle), Math.cos(target-angle));
    const length = mix(Math.hypot(b.x-a.x,b.y-a.y), Math.hypot(d.x-c.x,d.y-c.y),t);
    return {x:root.x+Math.cos(angle+delta*t)*length,y:root.y+Math.sin(angle+delta*t)*length};
  };
  const hip=blend(from.hip,to.hip,t);
  const shoulder=bone(hip,from.hip,from.shoulder,to.hip,to.shoulder);
  const head=bone(shoulder,from.shoulder,from.head,to.shoulder,to.head);
  const pose={hip,shoulder,head,arms:[],legs:[],crawl:0};
  for(const kind of ['arms','legs']) for(let i=0;i<2;i++) {
    const a=from[kind][i],b=to[kind][i],anchor=kind==='arms'?'shoulder':'hip';
    const offset=blend({x:a.root.x-from[anchor].x,y:a.root.y-from[anchor].y},
      {x:b.root.x-to[anchor].x,y:b.root.y-to[anchor].y},t);
    const root={x:pose[anchor].x+offset.x,y:pose[anchor].y+offset.y};
    const joint=bone(root,a.root,a.joint,b.root,b.joint);
    pose[kind].push({root,joint,end:bone(joint,a.joint,a.end,b.joint,b.end)});
  }
  return pose;
}

export function translatePose(pose, dx, dy) {
  const move=p=>({x:p.x+dx,y:p.y+dy});
  return {...pose,hip:move(pose.hip),shoulder:move(pose.shoulder),head:move(pose.head),
    arms:pose.arms.map(l=>({root:move(l.root),joint:move(l.joint),end:move(l.end)})),
    legs:pose.legs.map(l=>({root:move(l.root),joint:move(l.joint),end:move(l.end)}))};
}

// Back-first free fall: arms reaching apart, legs spread forward like the reference.
export function fallingPose(at, time, facing, released) {
  const hip={x:at.x,y:at.y-12};
  const shoulder={x:hip.x-facing*10,y:hip.y-7};
  const head={x:shoulder.x-facing*5,y:shoulder.y-5};
  const arms=[0,1].map(side=>solveLimb(shoulder,
    {x:shoulder.x+facing*(side?-14:9),y:shoulder.y+(side?2:-12)},7.5,7.5,{x:side?-facing:facing,y:side?1:0}));
  const flutter=Math.sin(time*9)*1.2;
  const legs=[0,1].map(side=>solveLimb(hip,
    {x:hip.x+facing*(side?9:17),y:hip.y+(side?13:-5)+flutter},9,9,{x:facing,y:1}));
  const target={hip,shoulder,head,arms,legs,crawl:0};
  return released?turnPose(released,target,time/.4):target;
}

// A hello to the viewer, independent of his last walking direction. Keep the
// elbow beside his head and swing the upright forearm left and right.
export function waveArm(pose, time) {
  const root=pose.arms[0].root; // same height on the torso as the resting arm
  const joint={x:root.x+6.5,y:root.y-Math.sqrt(7.5**2-6.5**2)};
  const angle=Math.sin(time*11)*.42;
  const end={x:joint.x+Math.sin(angle)*7.5,y:joint.y-Math.cos(angle)*7.5};
  pose.arms[0]={root,joint,end};
  const restingRoot=pose.arms[1].root;
  pose.arms[1]=solveLimb(restingRoot,{x:pose.hip.x-2.5,y:pose.hip.y+.5},7.5,7.5,{x:-1,y:-.2});
  return pose;
}
