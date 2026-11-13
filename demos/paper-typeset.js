// Balance prose by whole words without changing letter spacing or font size.
// Short labels remain intact. On a viewport too narrow for four words, the
// browser's normal wrapping takes over rather than clipping or shrinking text.
export function balancedLines(text, measure, width, minimum = 4) {
  const words = text.trim().split(/\s+/);
  if(words.length<minimum*2 || width<=0)return null;
  const total=measure(words.join(' '));
  if(total<=width)return [words.join(' ')];
  const cache=new Map();
  const lineWidth=(a,b)=>{
    const key=`${a}:${b}`;
    if(!cache.has(key))cache.set(key,measure(words.slice(a,b).join(' ')));
    return cache.get(key);
  };
  for(let count=Math.max(2,Math.ceil(total/width));count<=Math.floor(words.length/minimum);count++) {
    const target=total/count,memo=new Map();
    function solve(start,left) {
      if(!left)return start===words.length?{cost:0,lines:[]}:null;
      const key=`${start}:${left}`;
      if(memo.has(key))return memo.get(key);
      let best=null;
      for(let end=start+minimum;end<=words.length-minimum*(left-1);end++) {
        const w=lineWidth(start,end);
        if(w>width)break;
        const next=solve(end,left-1);
        if(!next)continue;
        const cost=(w-target)**2+next.cost;
        if(!best||cost<best.cost)best={cost,lines:[words.slice(start,end).join(' '),...next.lines]};
      }
      memo.set(key,best);return best;
    }
    const best=solve(0,count);
    if(best)return best.lines;
  }
  return null;
}

let context;
export function typesetText(element) {
  if(!element?.getBoundingClientRect || typeof getComputedStyle!=='function' || element.dataset?.wrap==='natural')return;
  const text=element.textContent.trim().replace(/\s+/g,' ');
  if(!text || text.split(' ').length<8)return;
  // Only own plain prose and the line spans this function created.
  if([...element.children].some(n=>!n.classList.contains('paper-text-line')))return;
  const old=element.textContent;
  element.textContent=text;
  const css=getComputedStyle(element),box=element.getBoundingClientRect();
  const width=box.width-parseFloat(css.paddingLeft||0)-parseFloat(css.paddingRight||0);
  if(width<=0){element.textContent=old;return;}
  context ||= document.createElement('canvas').getContext('2d');
  if(!context)return;
  context.font=css.font||`${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
  if('letterSpacing'in context)context.letterSpacing=css.letterSpacing==='normal'?'0px':css.letterSpacing;
  const lines=balancedLines(text,s=>context.measureText(s).width,width-.5);
  if(!lines || lines.length===1)return;
  const children=[];
  lines.forEach((line,i)=>{
    const span=document.createElement('span');span.className='paper-text-line';
    span.textContent=line;span.style.display='block';children.push(span);
    if(i<lines.length-1)children.push(document.createTextNode(' '));
  });
  element.replaceChildren(...children);
}

if(typeof window!=='undefined') {
  const selector='.paper-intro-copy p, .paper-playground-note, .paper-playground-caption, .desc .lead, .desc .tagline, .desc .why, .desc .features li, .desc .project-note p, .dl-note, .paper-bubble-text, .paper-tip p';
  let pending=false;
  const schedule=()=>{
    if(pending)return;pending=true;
    requestAnimationFrame(()=>{pending=false;document.querySelectorAll(selector).forEach(typesetText);});
  };
  document.fonts?.ready.then(schedule);
  document.fonts?.addEventListener('loadingdone',schedule);
  addEventListener('resize',schedule,{passive:true});
  addEventListener('load',schedule,{once:true});
  const observer=new ResizeObserver(schedule);
  document.querySelectorAll('.desc, .paper-intro-copy, .paper-playground').forEach(e=>observer.observe(e));
  schedule();
}
