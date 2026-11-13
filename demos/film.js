import { ScreeningRoom } from './film-scene.js';
(() => {
  const library=document.querySelector('.cinema');
  const cards=[...document.querySelectorAll('[data-reel]')];
  const sections=[...document.querySelectorAll('.project')];
  const back=document.querySelector('.library-back');
  const toolbar=document.querySelector('.screening-toolbar');
  const panel=document.querySelector('.insert-panel');
  const insert=document.querySelector('.insert-reel');
  const skip=document.querySelector('.skip-sequence');
  const status=document.querySelector('.scene-status');
  let room=null,selected=-1,selectionEpoch=0,phase='loading';
  cards.forEach(card=>{card.disabled=true;});
  function showProject(id,focus=true){
    const section=sections.find(s=>s.id===id);if(!section)return;
    library.hidden=true;document.body.classList.add('showing-project');
    back.hidden=toolbar.hidden=false;skip.hidden=true;
    sections.forEach(s=>s.classList.toggle('is-screening',s===section));
    document.querySelector('#screening-label').textContent='NOW SHOWING / '+section.querySelector('.eyebrow').textContent.trim();
    section.querySelectorAll('iframe[data-src]').forEach(f=>{if(!f.getAttribute('src'))f.src=f.dataset.src;});
    window.scrollTo(0,0);
    if(focus){const h=section.querySelector('h2');h.tabIndex=-1;h.focus({preventScroll:true});}
  }
  function finish(index){
    phase='finished';history.pushState(null,'','#'+cards[index].dataset.reel);
    showProject(cards[index].dataset.reel);
  }
  function returnLibrary(writeHistory=true){
    selectionEpoch++;phase=room&&!room.assetsReady?'loading':'idle';selected=-1;room?.reset();
    sections.forEach(s=>s.classList.remove('is-screening'));
    library.hidden=false;library.classList.remove('has-selection','is-playing','is-lifting');
    document.body.classList.remove('showing-project');panel.hidden=skip.hidden=true;back.hidden=toolbar.hidden=true;
    cards.forEach(c=>{c.disabled=phase==='loading';c.setAttribute('aria-pressed','false');});
    status.textContent=phase==='loading'?'PREPARING THE SCREENING ROOM…':'SELECT A REEL TO BEGIN';
    if(writeHistory)history.pushState(null,'',location.pathname+location.search);
    room?.resizeScene();window.scrollTo(0,0);
  }
  async function choose(index){
    if(!['idle','ready'].includes(phase))return;
    if(selected===index&&phase==='ready'){begin();return;}
    const epoch=++selectionEpoch;phase='lifting';selected=index;window.scrollTo(0,0);
    cards.forEach((c,i)=>c.setAttribute('aria-pressed',String(i===index)));
    if(!room){finish(index);return;}
    library.classList.add('has-selection','is-lifting');panel.hidden=true;
    status.textContent='POSITIONING '+cards[index].querySelector('span').textContent.split('/')[1].trim();
    const ready=await room.choose(index);
    if(epoch!==selectionEpoch||!ready)return;
    phase='ready';library.classList.remove('is-lifting');panel.hidden=false;insert.disabled=false;
    document.querySelector('#selected-title').textContent=cards[index].querySelector('span').textContent;
    status.textContent='REEL POSITIONED / CLICK AGAIN TO INSERT';insert.focus({preventScroll:true});
  }
  function begin(){
    if(phase!=='ready')return;phase='playing';panel.hidden=true;skip.hidden=false;
    library.classList.add('is-playing');cards.forEach(c=>c.disabled=true);skip.focus({preventScroll:true});room.insert();
  }
  cards.forEach((card,i)=>card.addEventListener('click',()=>choose(i)));
  insert.addEventListener('click',begin);
  document.querySelector('.cancel-reel').addEventListener('click',()=>{const i=selected;returnLibrary(false);cards[Math.max(0,i)].focus();});
  skip.addEventListener('click',()=>{if(phase==='playing')room.complete();});
  back.addEventListener('click',()=>returnLibrary());
  document.querySelector('.change-reel').addEventListener('click',()=>returnLibrary());
  document.querySelector('.film-brand').addEventListener('click',e=>{e.preventDefault();returnLibrary();});
  document.querySelector('.sound-toggle').addEventListener('click',e=>{
    const on=e.currentTarget.getAttribute('aria-pressed')!=='true';
    e.currentTarget.setAttribute('aria-pressed',String(on));e.currentTarget.textContent=on?'SOUND ON':'SOUND OFF';
    if(room){room.sound=on;if(!on)room.stopSound();}
  });
  addEventListener('keydown',e=>{if(e.key==='Escape'&&['lifting','ready','playing'].includes(phase))returnLibrary(false);});
  addEventListener('popstate',()=>{
    const id=location.hash.slice(1);returnLibrary(false);if(sections.some(s=>s.id===id))showProject(id);
  });
  try{room=new ScreeningRoom(document.querySelector('#cinema-canvas'),{
    onPick:i=>choose(i),onReady:(success=true)=>{phase='idle';cards.forEach(c=>{c.disabled=false;});status.textContent=success?'SELECT A REEL TO BEGIN':'CHOOSE A PROJECT';if(!success){room=null;document.querySelector('.scene-fallback').hidden=false;}},
    onFinish:finish,onStage:text=>{status.textContent=text;},
    onLayout:positions=>positions.forEach((p,i)=>{cards[i].style.setProperty('--reel-x',p.x+'px');cards[i].style.setProperty('--reel-y',p.y+'px');})
  });}catch(error){console.error('Screening room could not initialize:',error);status.textContent='CHOOSE A PROJECT';phase='idle';cards.forEach(c=>{c.disabled=false;});document.querySelector('.scene-fallback').hidden=false;}
  if(sections.some(s=>s.id===location.hash.slice(1)))showProject(location.hash.slice(1));
  // Restore the same demo element to its project when the viewer closes.
  const expanded = document.querySelector('.demo-expanded');
  const expandedContent = expanded.querySelector('.expanded-content');
  let originalSlot = null, activeFrame = null, originalButton = null;
  document.querySelectorAll('[data-fullscreen]').forEach(button => button.addEventListener('click', () => {
    originalButton = button; activeFrame = button.closest('[data-frame]');
    originalSlot = document.createComment('demo slot');
    activeFrame.before(originalSlot); expandedContent.append(activeFrame); expanded.showModal();
    expanded.querySelector('.close-expanded').focus();
  }));
  function restoreFrame() {
    if (!activeFrame) return;
    originalSlot.replaceWith(activeFrame); activeFrame = null;
    originalButton.focus();
  }
  expanded.querySelector('.close-expanded').addEventListener('click', () => expanded.close());
  expanded.addEventListener('close', restoreFrame);
  const dungeon = document.querySelector('.dungeon-dialog');
  document.querySelector('.close-dungeon').addEventListener('click', () => dungeon.close());
  dungeon.addEventListener('close', () => { dungeon.querySelector('iframe').removeAttribute('src'); });
  addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data) return;
    const node = document.querySelector('#node-maps iframe');
    if (e.data.type === 'portfolio:open-game' && e.data.game === 'dungeon' && e.source === node.contentWindow) {
      dungeon.querySelector('iframe').src = 'dungeon/index.html?embed=1'; dungeon.showModal();
    }
    if (e.data.type === 'portfolio:close-game' && e.source === dungeon.querySelector('iframe').contentWindow) dungeon.close();
  });


  // Small, local samples for the two tools whose full demos are still in progress.
  const searchBox = document.querySelector('.finder-search');
  searchBox.innerHTML = '<input aria-label="Search sample files" placeholder="Try beach, coral, or cozy…">';
  const names = ['Beach at sunset','Ocean waves','Cozy cabin','Beach walk','Coral reef','Cozy evening','Blue ocean','Coral garden','Warm cabin','Beach day','Ocean light','Cozy room'];
  const tiles = [...document.querySelectorAll('.finder-grid i')];
  tiles.forEach((tile, i) => { tile.textContent = names[i]; });
  function filter(value) { tiles.forEach((tile, i) => { tile.hidden = !names[i].toLowerCase().includes(value.toLowerCase().replace('bech', 'beach')); }); }
  const input = searchBox.querySelector('input');
  input.addEventListener('input', () => filter(input.value));
  document.querySelectorAll('.finder-tags span').forEach(tag => {
    const button = document.createElement('button'); button.textContent = tag.textContent; button.type = 'button';
    button.style.cssText = 'border:0;background:none;color:inherit;font:inherit;padding:0';
    tag.replaceChildren(button);
    button.addEventListener('click', () => { input.value = button.textContent.includes('cozy') ? 'cozy' : button.textContent; filter(input.value); });
  });
  const control = document.createElement('label'); control.className = 'grade-control';
  control.innerHTML = 'Try a final-exam score<input type="range" min="0" max="100" value="88" aria-label="Final exam score"><output>88% on the final → 88.0% overall</output>';
  document.querySelector('.widget-panel').append(control);
  control.querySelector('input').addEventListener('input', e => {
    const value = Number(e.target.value), total = 88 * .7 + value * .3;
    control.querySelector('output').textContent = `${value}% on the final → ${total.toFixed(1)}% overall`;
  });
  document.querySelectorAll('[data-carousel]').forEach(carousel => {
    const slides = [...carousel.querySelectorAll('.slide')]; let current = 0;
    function render() { slides.forEach((s, i) => s.classList.toggle('is-on', i === current)); carousel.querySelector('[data-count]').textContent = `${current + 1} / ${slides.length}`; }
    carousel.querySelector('[data-prev]').addEventListener('click', () => { current = (current - 1 + slides.length) % slides.length; render(); });
    carousel.querySelector('[data-next]').addEventListener('click', () => { current = (current + 1) % slides.length; render(); });
    render();
  });
})();
