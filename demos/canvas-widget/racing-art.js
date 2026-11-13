// Original open-wheel racing artwork. A car's center marks the exact progress
// endpoint; the filled track is the quantitative mark beneath the illustration.
function racingCarArt(color,number=1){
 return `<g class="racing-car" fill="${color}">
  <path d="M-7-12H7M-8 10H8" stroke="#667078" stroke-width="1.3"/>
  <rect x="-10" y="-16" width="5" height="9" rx="1.6" fill="#14191E"/><rect x="5" y="-16" width="5" height="9" rx="1.6" fill="#14191E"/>
  <rect x="-11" y="8" width="6" height="11" rx="1.8" fill="#14191E"/><rect x="5" y="8" width="6" height="11" rx="1.8" fill="#14191E"/>
  <path d="M-9-15v6M9-15v6M-10 10v7M10 10v7" stroke="#525A63" stroke-width=".65"/>
  <path d="M-3-22H3L4-11 7-3 7 10 4 16H-4L-7 10V-3L-4-11Z" stroke="#18232D" stroke-width=".7"/>
  <path d="M-10-23H10V-20H-10ZM-10 18H10V22H-10Z" stroke="#18232D" stroke-width=".7"/>
  <path d="M-10-22H10M-9 19H9" stroke="#fff" stroke-width=".55" opacity=".65"/>
  <path d="M-6-2L-2-6H2L6-2 4 10H-4Z" fill="#18232D"/>
  <ellipse cy="1" rx="2.3" ry="4.2" fill="#64798A"/><circle cy="1" r="1.8" fill="#F6E8CD"/>
  <path d="M-4 4V-1Q0-8 4-1V4M0-4V2" fill="none" stroke="#C8D1D6" stroke-width=".8"/>
  <path d="M-2-20V-10M-5 8l1 6M5 8l-1 6" stroke="#fff" opacity=".65" stroke-width=".65"/>
  <text x="0" y="15.5" text-anchor="middle" fill="#fff" stroke="none" style="font:4px Arial,sans-serif;font-weight:bold">${number}</text>
 </g>`;
}
function racingRingPosition(progress,radius){
 const angle=progress*Math.PI*2;
 return {x:150+radius*Math.sin(angle),y:150-radius*Math.cos(angle),rotation:progress*360+90};
}
function racingWeekData(limit=Infinity){
 const week=getWeekRange(state.weekStart);
 return state.courses.slice(0,limit).map(course=>{
  const due=state.assignments.filter(a=>a.courseId===course.id&&a.due&&a.due>=week.start&&a.due<=week.end);
  const done=due.filter(a=>a.done).length;
  return {course,done,total:due.length,progress:due.length?done/due.length:0};
 });
}
function drawRacingRings(){
 const svg=document.getElementById('ring-svg');if(!svg)return;
 const data=racingWeekData(6),pitch=74/Math.max(data.length-1,4);
 svg.setAttribute('viewBox','0 0 300 300');svg.setAttribute('width','300');svg.setAttribute('height','300');svg.setAttribute('role','img');
 svg.setAttribute('aria-label',`Circular racing progress. Each course completes one clockwise lap from twelve o’clock. ${data.map(d=>`${d.course.name}: ${d.done} of ${d.total}`).join('. ')}.`);
 let art=`<defs><pattern id="racing-checks" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#F4F3EE"/><path d="M0 0h3v3H0ZM3 3h3v3H3Z" fill="#20262D"/></pattern><pattern id="racing-carbon" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#20262D"/><path d="M0 3l3-3M3 6l3-3" stroke="#fff" opacity=".055" stroke-width="1"/></pattern></defs>`;
 // The original circular geometry stays intact. Curbing and instruments sit outside it.
 art+=`<circle cx="150" cy="150" r="125" fill="none" stroke="#F4F3EE" stroke-width="5"/><circle cx="150" cy="150" r="125" fill="none" stroke="var(--race-curb)" stroke-width="5" stroke-dasharray="10.9 10.9" transform="rotate(-90 150 150)"/><circle cx="150" cy="150" r="131" fill="none" stroke="var(--muted)" stroke-width=".6" opacity=".4"/>`;
 for(let i=0;i<40;i++){
  if(i===0)continue;
  const a=i*Math.PI/20,r=i%10===0?136:134;
  art+=`<path d="M${150+132*Math.sin(a)} ${150-132*Math.cos(a)}L${150+r*Math.sin(a)} ${150-r*Math.cos(a)}" stroke="var(--muted)" stroke-width="${i%10===0?1:.5}" opacity=".45"/>`;
 }
 data.forEach((d,i)=>{const radius=112-i*pitch,color=esc(d.course.color),p=racingRingPosition(d.progress,radius);
  art+=`<g class="racing-course" data-course-id="${esc(d.course.id)}"><title>Car ${i+1} · ${esc(d.course.name)}: ${d.done}/${d.total} assignments complete (${Math.round(d.progress*100)}%)</title><circle id="racing-line-${i}" class="racing-lane" cx="150" cy="150" r="${radius}" fill="none" stroke="var(--ring-track)" stroke-width="11"/><circle cx="150" cy="150" r="${radius}" fill="none" stroke="var(--race-lane-line)" stroke-width=".6" stroke-dasharray="3 5" opacity=".45"/>${d.progress>0?`<circle class="racing-progress" data-progress="${d.progress}" cx="150" cy="150" r="${radius}" pathLength="100" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="${d.progress*100} 100" transform="rotate(-90 150 150)"/>`:''}<g id="racing-car-${i}" data-progress="${d.progress}" transform="translate(${p.x} ${p.y}) rotate(${p.rotation}) scale(.6)">${racingCarArt(color,i+1)}</g></g>`;
 });
 const innerRadius=data.length?112-(data.length-1)*pitch:112;
 art+=`<path d="M150 31V${150-innerRadius+6}" stroke="url(#racing-checks)" stroke-width="5"/>`;
 if(!data.length)art+=`<text class="race-svg-caption" x="150" y="152" text-anchor="middle">ADD A COURSE TO JOIN THE GRID</text>`;
 svg.innerHTML=art;
}
function drawRacingBars(){
 const wrap=document.getElementById('bar-chart-wrap');if(!wrap)return;
 const data=racingWeekData(),h=Math.max(168,data.length*43+45),x=78,width=184;
 wrap.classList.toggle('many-courses',data.length>6);
 let art=`<defs><pattern id="racing-straight-checks" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="var(--bg)"/><path d="M0 0h3v3H0ZM3 3h3v3H3Z" fill="var(--text)"/></pattern></defs><text class="race-svg-caption" x="${x}" y="12">0%</text><text class="race-svg-caption" x="${x+width}" y="12" text-anchor="end">100%</text>`;
 data.forEach((d,i)=>{const y=35+i*43,endpoint=x+width*d.progress,color=esc(d.course.color);
  art+=`<g class="racing-course"><title>${esc(d.course.name)}: ${d.done}/${d.total} complete</title><text class="race-svg-course" x="3" y="${y+3}">${esc(d.course.code||d.course.name)}</text><path d="M${x} ${y}h${width}" stroke="var(--ring-track)" stroke-width="17"/><path d="M${x} ${y}h${width}" stroke="var(--muted)" stroke-width=".5" stroke-dasharray="4 5" opacity=".4"/>${d.progress>0?`<path class="racing-progress" data-progress="${d.progress}" d="M${x} ${y}h${width*d.progress}" stroke="${color}" stroke-width="5"/>`:''}<path d="M${x+width} ${y-10}v20" stroke="url(#racing-straight-checks)" stroke-width="5"/><g transform="translate(${endpoint} ${y}) rotate(90) scale(.48)">${racingCarArt(color,i+1)}</g><text class="race-svg-value" x="299" y="${y+4}" text-anchor="end">${d.done}/${d.total}</text></g>`;
 });
 if(!data.length)art+=`<text class="race-svg-caption" x="150" y="85" text-anchor="middle">ADD A COURSE TO JOIN THE GRID</text>`;
 wrap.innerHTML=`<svg class="racing-straights" viewBox="0 0 306 ${h}" role="img" aria-label="Pit straight course progress. All lanes use a common zero to one hundred percent scale. ${data.map(d=>`${esc(d.course.name)}: ${d.done}/${d.total} complete`).join('. ')}">${art}<text class="race-svg-caption" x="153" y="${h-4}" text-anchor="middle">CAR POSITION = ASSIGNMENTS COMPLETE</text></svg>`;
}
