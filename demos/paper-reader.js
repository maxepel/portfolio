import { inkBounds, recognizeShape, recognizeKnownWord, recognizeInk } from './paper-recognition.js';

// Only actual visitor strokes enter this buffer. The canvas's paper, figure,
// pins and automatic tour drawings are never sent to the recognizers.
export function createSketchReader({ strokes, width, result, status }) {
  let batch = [], pending = 0, lastAt = 0, generation = 0, worker = null, reading = false, watchdog = 0, completedShape = false, lastLabel = null;
  const alive = () => batch.length > 0 && batch.every(s => strokes().includes(s));
  const pixels = () => batch.map(s => s.points.map(p=>({ x:p.x*width(), y:p.y })));
  const fresh = () => alive() && performance.now()-lastAt < 120000;
  function add(stroke) {
    if (!stroke?.points?.length) return;
    if(reading){cancel();status('changed');}
    clearTimeout(pending); generation++;
    const now=performance.now(), current=inkBounds([stroke.points.map(p=>({x:p.x*width(),y:p.y}))]);
    const previous=alive()?inkBounds(pixels()):null;
    const near=previous && current && current.left<previous.right+90 && current.right>previous.left-90 &&
      current.top<previous.bottom+40 && current.bottom>previous.top-40;
    // A finished shape starts a new batch, unless the new stroke lands on it: eyes in a
    // circle, rays round it, a roof on a square. Then it can grow into a library drawing.
    const joinGap=previous?Math.max(15,Math.min(40,previous.height*.35)):15;
    const onIt=previous && current && current.left<previous.right+joinGap && current.right>previous.left-joinGap &&
      current.top<previous.bottom+joinGap && current.bottom>previous.top-joinGap;
    if(!near || (now-lastAt>30000 && !onIt) || now-lastAt>120000 || batch.length>=60 || (completedShape && !onIt)){batch=[];lastLabel=null;}
    completedShape=false;
    batch.push(stroke); lastAt=now;
    // Closed geometric shapes can react before his 300ms visit-to-new-ink hop.
    // Leave a longer pause for drawings and words that may need more strokes.
    const delay = recognizeShape(pixels()) ? 120 : 450;
    pending=setTimeout(()=>{
      if(!fresh())return;
      const ink=pixels();
      let recognized=recognizeInk(ink);
      // Nearby ink that came to nothing (a first try, a stray mark) shouldn't hide a shape
      // drawn beside it: read the newest strokes on their own, and keep only those.
      let newest = null, newestCount = 0;
      for(let k=Math.min(8,batch.length-1);k>=1;k--){
        const candidate=recognizeInk(ink.slice(-k));
        if(candidate?.name==='button') { recognized=candidate;newestCount=k;break; }
        if(!recognized && !newest && candidate){newest=candidate;newestCount=k;}
      }
      if(!recognized && newest)recognized=newest;
      if(recognized && newestCount)batch=batch.slice(-newestCount);
      if(!recognized)return;
      // Adding a door to a house he already named shouldn't make him say "house" again.
      const label=recognized.kind==='word'?recognized.text:recognized.kind==='drawing'?recognized.name:recognized.kind;
      completedShape=recognized.kind!=='word';
      if(label!==lastLabel){lastLabel=label;result(recognized);}
    },delay);
  }
  function invalidate() {
    if(reading){cancel();status('changed');}
    generation++; clearTimeout(pending);
    batch=[]; lastLabel=null;
  }
  function cancel() {
    generation++; clearTimeout(watchdog); reading=false;
    worker?.terminate();worker=null;
  }
  function read() {
    if(!fresh()){status('empty');return;}
    if(reading){status('busy');return;}
    clearTimeout(pending);
    const ink=pixels(),known=recognizeKnownWord(ink);
    if(known){result(known);return;}
    const b=inkBounds(ink);
    if(!b || b.width<8 || b.height<8){status('empty');return;}
    // Crop a single written line, with enough white margin for the text model.
    const scale=Math.min(3,Math.max(1,80/b.height),1600/Math.max(1,b.width),512/Math.max(1,b.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(b.width*scale+40);canvas.height=Math.ceil(b.height*scale+40);
    const ctx=canvas.getContext('2d');
    if(!ctx){status('error');return;}
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#000';ctx.lineWidth=Math.max(2,1.8*scale);ctx.lineCap='round';ctx.lineJoin='round';
    for(const line of ink){
      ctx.beginPath();line.forEach((p,i)=>ctx[i?'lineTo':'moveTo']((p.x-b.left)*scale+20,(p.y-b.top)*scale+20));ctx.stroke();
    }
    const id=++generation;
    try {
      worker ||= new Worker(new URL('./paper-handwriting-worker.js',import.meta.url),{type:'module'});
      reading=true;
      const fail=()=>{
        clearTimeout(watchdog);reading=false;worker?.terminate();worker=null;
        if(id===generation)status('error');
      };
      worker.onerror=fail;
      watchdog=setTimeout(fail,240000);
      worker.onmessage=({data})=>{
        if(data.id!==id)return;
        if(data.status){if(id===generation)status(data.status);return;}
        reading=false;clearTimeout(watchdog);
        if(id!==generation || !fresh())return;
        if(data.error){worker.terminate();worker=null;status('error');return;}
        const text=(data.text||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,160);
        if(!text || !/[a-z]/i.test(text)){status('unclear');return;}
        result({kind:'word',text,bounds:b,broad:true});
      };
      status('loading');
      worker.postMessage({id,image:canvas.toDataURL('image/png')});
    } catch {
      reading=false;clearTimeout(watchdog);worker?.terminate();worker=null;status('error');
    }
  }
  return { add, read, cancel, invalidate, available:fresh };
}
