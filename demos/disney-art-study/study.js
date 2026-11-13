const maps={day:['Morning','V1 · Morning park concept','Early pixel-art park concept in bright morning light'],golden:['Sunset','V1 · Sunset park concept','Early pixel-art park concept in sunset light'],night:['Night','V1 · Night park concept','Early pixel-art park concept with nighttime lights']};
const map=document.querySelector('#map-image');
document.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',()=>{const kind=button.dataset.map;map.src=`assets/map-${kind}.webp`;map.alt=maps[kind][2];map.closest('button').dataset.caption=maps[kind][1];document.querySelector('#map-caption').textContent=maps[kind][1];document.querySelectorAll('[data-map]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));}));
const viewer=document.querySelector('dialog');let origin;
document.querySelectorAll('.artwork').forEach(button=>button.addEventListener('click',()=>{origin=button;const source=button.querySelector('img');document.querySelector('#viewer-image').src=source.src;document.querySelector('#viewer-image').alt=source.alt;document.querySelector('#viewer-caption').textContent=button.dataset.caption;viewer.showModal();}));
viewer.querySelector('.close').addEventListener('click',()=>viewer.close());viewer.addEventListener('close',()=>origin?.focus({preventScroll:true}));viewer.addEventListener('click',event=>{if(event.target===viewer){const r=viewer.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)viewer.close();}});

/* Sit every line of handwriting on a ruled line of the paper, as the main page does. */
(()=>{
  const LINE=32, FIRST=45.5; /* rules fall at 45.5 + 32k, matching the page background */
  const sel='h1,.lede,section h2,section>p,figcaption,footer .scribble,footer a';
  let timer=0;
  function align(){
    const items=[...document.querySelectorAll(sel)].filter(el=>el.offsetParent&&!el.closest('dialog'));
    /* One marker at a time: a marker inside a flex caption can add a pixel or two and push everything below. */
    const out=items.map(el=>{
      const m=document.createElement('span');
      m.style.cssText='display:inline-block;width:0;height:0;pointer-events:none';
      el.insertBefore(m,el.firstChild);
      const prev=parseFloat(el.dataset.lineShift||'0');
      const base=m.getBoundingClientRect().bottom+scrollY-prev;
      m.remove();
      const k=Math.round((base-FIRST)/LINE);
      return FIRST+k*LINE-base;
    });
    items.forEach((el,i)=>{el.dataset.lineShift=String(out[i]);el.style.translate=`0 ${out[i].toFixed(2)}px`;});
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(align,60);};
  document.fonts?.ready.then(schedule);
  addEventListener('load',schedule);addEventListener('resize',schedule);
  document.querySelectorAll('img').forEach(img=>img.addEventListener('load',schedule));
  new ResizeObserver(schedule).observe(document.body);
  schedule();
})();
