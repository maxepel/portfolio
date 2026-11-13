import * as THREE from './dungeon/js/vendor/three.module.min.js';
import { GLTFLoader } from './dungeon/js/vendor/addons/loaders/GLTFLoader.js';
import { HDRLoader } from './dungeon/js/vendor/addons/loaders/HDRLoader.js';

const TAU = Math.PI * 2;
const projects = ['Content Finder', 'Canvas Widget', 'Game Atlas', 'Disney'];
const ids = ['content-finder', 'canvas-widget', 'node-maps', 'disney'];
const V = (x,y,z) => new THREE.Vector3(x,y,z);
const ease = t => t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const smoother = t => t*t*t*(t*(t*6-15)+10);

function paintSurface(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const c=canvas.getContext('2d'),im=c.createImageData(256,256);let seed=731;
  for(let i=0;i<im.data.length;i+=4){seed=(seed*16807)%2147483647;const n=100+seed/2147483647*85;im.data[i]=im.data[i+1]=im.data[i+2]=n;im.data[i+3]=255;}
  c.putImageData(im,0,0);return new THREE.CanvasTexture(canvas);
}

function tapeTexture(title,index) {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=260;
  const c=canvas.getContext('2d'); let seed=92+index;
  const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  c.beginPath();c.moveTo(18,14);
  for(let x=18;x<1008;x+=13)c.lineTo(x,12+rnd()*7);
  for(let y=15;y<244;y+=10)c.lineTo(1005-rnd()*14,y);
  for(let x=1005;x>15;x-=13)c.lineTo(x,241+rnd()*7);
  for(let y=244;y>14;y-=10)c.lineTo(17+rnd()*12,y);
  c.closePath();c.fillStyle=['#d4c29b','#d0c9ad','#c9b08b','#babea1'][index];c.fill();c.clip();
  for(let i=0;i<17000;i++){c.fillStyle=`rgba(${rnd()>.5?'255,250,220':'71,56,36'},${rnd()*.09})`;c.fillRect(rnd()*1024,rnd()*260,1+rnd()*3,1);}
  const crease=c.createLinearGradient(0,0,0,260);crease.addColorStop(0,'#ffffff18');crease.addColorStop(.45,'#00000000');crease.addColorStop(.47,'#0000000b');crease.addColorStop(.49,'#ffffff18');crease.addColorStop(1,'#00000018');c.fillStyle=crease;c.fillRect(0,0,1024,260);
  c.fillStyle='#191b16';c.font='22px "Courier New",monospace';c.fillText(`MAX / ORIGINAL NEGATIVE                    REEL 0${index+1}`,60,62);
  c.font=`bold ${title.length>13?76:82}px "Courier New",monospace`;c.fillText(title,57,153);
  c.globalAlpha=.6;c.font='20px "Courier New",monospace';c.fillText('16mm  /  COLOUR  /  2026',60,210);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}

function roundedShape(w,h,r) {
  const s=new THREE.Shape(),x=-w/2,y=-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}

export class ScreeningRoom {
  constructor(canvas,{onPick,onReady,onFinish,onStage,onLayout}) {
    this.canvas=canvas;this.onPick=onPick;this.onFinish=onFinish;this.onStage=onStage;this.onLayout=onLayout;
    this.state='idle';this.active=-1;this.token=0;this.tweens=[];this.running=false;this.sound=true;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.22;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#181716');
    this.scene.fog=new THREE.FogExp2('#181716',.016);
    this.camera=new THREE.PerspectiveCamera(38,1,.1,100);this.look=V(0,1,0);
    this.ray=new THREE.Raycaster();this.mouse=new THREE.Vector2();this.hit=[];
    this.paintMap=paintSurface();
    this.mat={black:new THREE.MeshStandardMaterial({color:'#171915',metalness:.25,roughness:.5,bumpMap:this.paintMap,bumpScale:.008})};
    this.environment();this.lights();this.floor();this.buildProjector();this.buildReels();this.buildScreen();this.buildBeam();
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
    this.resize=()=>this.resizeScene();this.resizeScene();window.addEventListener('resize',this.resize);
    canvas.addEventListener('pointerdown', e=>{this.down=[e.clientX,e.clientY];});
    canvas.addEventListener('pointerup',e=>{
      if(!this.down||Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])>8)return;
      const hit=this.pick(e);if(hit!==null)this.onPick(hit);
    });
    canvas.addEventListener('pointermove',e=>{canvas.style.cursor=this.pick(e)!==null?'pointer':'default';});
    this.last=performance.now();this.draw=this.draw.bind(this);this.frame=requestAnimationFrame(this.draw);
    this.contextLost=e=>{e.preventDefault();this.reset();this.onStage('Graphics paused. Choose a project title to continue.');};
    canvas.addEventListener('webglcontextlost',this.contextLost);
    this.assetsReady=false;
    this.loadAssets().then(()=>onReady()).catch(error=>{
      console.error('Artist assets failed to load',error);onReady(false);
    });
    new HDRLoader().load('./assets/film/models/studio_small_03_1k.hdr',texture=>{
      const pmrem=new THREE.PMREMGenerator(this.renderer),environment=pmrem.fromEquirectangular(texture);
      this.environmentMap.dispose();this.environmentMap=environment;this.scene.environment=environment.texture;
      this.scene.environmentIntensity=.8;this.scene.environmentRotation.y=.6;texture.dispose();pmrem.dispose();this.needsRender=true;
    });
  }

  mesh(geometry,material,parent=this.scene,pos=V(0,0,0)) {
    const m=new THREE.Mesh(geometry,material);m.position.copy(pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  box(w,h,d,material,parent,pos,r=.06) {
    const g=new THREE.ExtrudeGeometry(roundedShape(w,h,r),{depth:d,bevelEnabled:true,bevelSize:Math.min(r*.4,.03),bevelThickness:.025,bevelSegments:3,steps:1,curveSegments:10});
    g.translate(0,0,-d/2);return this.mesh(g,material,parent,pos);
  }
  cylinder(r,depth,material,parent,pos,r2=r) {
    const g=new THREE.CylinderGeometry(r,r2,depth,64);g.rotateX(Math.PI/2);return this.mesh(g,material,parent,pos);
  }
  environment() {
    const s=new THREE.Scene();s.add(new THREE.Mesh(new THREE.BoxGeometry(30,25,30),new THREE.MeshBasicMaterial({color:'#77716a',side:THREE.BackSide})));
    for(const [p,scale,color] of [[V(-6,9,1),V(7,6,1),[5,4.6,4]], [V(6,5,4),V(3,8,1),[3,3.5,4]], [V(0,7,-8),V(9,3,1),[3,2.7,2.3]]]) {
      const m=new THREE.Mesh(new THREE.PlaneGeometry(scale.x,scale.y),new THREE.MeshBasicMaterial({color:new THREE.Color(...color),side:THREE.DoubleSide}));m.position.copy(p);m.lookAt(0,0,0);s.add(m);
    }
    const pmrem=new THREE.PMREMGenerator(this.renderer);this.environmentMap=pmrem.fromScene(s,.04);this.scene.environment=this.environmentMap.texture;pmrem.dispose();
    s.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});
  }
  lights() {
    this.scene.add(new THREE.AmbientLight('#b6b3ac',.25));
    const key=new THREE.DirectionalLight('#ffe8c7',3.8);key.position.set(-4,10,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:40});key.shadow.bias=-.0003;key.shadow.normalBias=.025;key.shadow.radius=3;this.scene.add(key);
    const fill=new THREE.DirectionalLight('#cad9e5',1.4);fill.position.set(7,5,-2);this.scene.add(fill);
    const rim=new THREE.DirectionalLight('#ffe6bf',1.8);rim.position.set(-2,3,-8);this.scene.add(rim);
    this.projectorLight=new THREE.PointLight('#ffeac4',0,18,2);this.projectorLight.position.set(-2.2,1.55,-4);this.scene.add(this.projectorLight);
  }
  floor() {
    this.mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshBasicMaterial({color:'#2c2823'}),this.scene).rotation.x=-Math.PI/2;
    const catcher=this.mesh(new THREE.PlaneGeometry(150,150),new THREE.ShadowMaterial({opacity:.38}),this.scene,V(0,.008,0));catcher.rotation.x=-Math.PI/2;catcher.castShadow=false;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');const g=c.createRadialGradient(128,128,1,128,128,128);g.addColorStop(0,'#000000b0');g.addColorStop(1,'#00000000');c.fillStyle=g;c.fillRect(0,0,256,256);this.contactTex=new THREE.CanvasTexture(canvas);
  }
  shadow(parent,x,z,w,d,opacity=.6) {
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:this.contactTex,transparent:true,opacity,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.012,z);parent.add(m);return m;
  }
  makeReel(index,label=true) {
    const group=new THREE.Group();group.userData.reel=index;
    if(label){
      const material=new THREE.MeshStandardMaterial({map:tapeTexture(projects[index],index),transparent:true,roughness:.94,metalness:0,side:THREE.DoubleSide,alphaTest:.1});
      const geometry=new THREE.PlaneGeometry(1.67,.43,32,10),position=geometry.getAttribute('position');
      for(let i=0;i<position.count;i++){
        const x=position.getX(i),y=position.getY(i);
        position.setZ(i,.004*Math.sin(x*32+y*13)+.035*Math.pow(Math.abs(x)/.835,12)+.008*Math.sin(y*27));
      }
      geometry.computeVertexNormals();
      const tape=this.mesh(geometry,material,group,V(-.015,.30,.17));tape.rotation.z=-.045+index*.017;
    }
    return group;
  }
  async loadAssets(){
    const loader=new GLTFLoader();
    const [projector,reel]=await Promise.all([
      loader.loadAsync('./assets/film/models/vintage-projector.glb'),
      loader.loadAsync('./assets/film/models/archive-reel.glb')
    ]);
    // The source's dust-only colour texture loses its enamel tint on glTF export.
    // Restore a restrained painted-metal finish while retaining its surface maps.
    const adjusted=new Set();
    projector.scene.traverse(o=>{
      if(!o.isMesh)return;
      for(const m of (Array.isArray(o.material)?o.material:[o.material])){
        if(adjusted.has(m))continue;adjusted.add(m);
        if(m.name==='Red Plastic Glossy'){m.map=null;m.color.set('#777464');m.metalness=.32;m.roughness=.36;m.needsUpdate=true;}
      }
    });
    reel.scene.traverse(o=>{
      if(!o.isMesh)return;
      for(const m of (Array.isArray(o.material)?o.material:[o.material])){
        if(m.name==='Silver steel'){m.metalness=1;m.roughness=.52;m.normalScale.set(.22,.22);m.envMapIntensity=.8;m.needsUpdate=true;}
      }
    });
    this.projector.add(projector.scene);
    const film=[];projector.scene.traverse(o=>{if(/^(top|bottom)_film_mesh/.test(o.name))film.push(o);});
    film.forEach(o=>this.thread.add(o));
    this.reels.forEach((group,i)=>{
      const asset=reel.scene.clone(true);group.add(asset);
      group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.userData.reel=i;this.hit.push(o);}});
      group.visible=true;
    });
    this.takeup.add(reel.scene.clone(true));
    this.projector.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    this.assetsReady=true;this.needsRender=true;
  }
  buildProjector() {
    this.projector=new THREE.Group();this.projector.position.set(-2.3,0,-2.3);this.projector.rotation.y=-.55;this.projector.scale.setScalar(1.15);this.scene.add(this.projector);this.projector.updateMatrixWorld(true);
    this.projectorContact=this.shadow(this.scene,-2.3,-2.3,5,5,.9);
    this.supplyMount=V(.366,3.324,-2.244);this.takeupMount=V(.372,2.052,2.094);
    this.lensPosition=V(.522,1.482,-1.58);
    this.mountedReelScale=1.101*this.projector.scale.x;
    this.takeup=this.makeReel(0,false);this.takeup.scale.setScalar(1.008);this.takeup.position.copy(this.takeupMount);this.takeup.rotation.y=Math.PI/2;this.projector.add(this.takeup);
    this.supply=new THREE.Group();this.supply.visible=false;this.projector.add(this.supply);
    this.lampMaterial=new THREE.MeshBasicMaterial({color:'#ffe5b0',transparent:true,opacity:0});
    this.lamp=this.cylinder(.17,.015,this.lampMaterial,this.projector,this.lensPosition.clone());
    this.thread=new THREE.Group();this.projector.add(this.thread);this.thread.visible=false;
  }
  buildReels() {
    this.reels=[];this.homes=[];this.shadows=[];
    for(let i=0;i<4;i++) {
      const reel=this.makeReel(i);reel.scale.setScalar(1.12);reel.position.set(-4.35+i*2.9,1.15,3.2);reel.rotation.set(-.11,-.18+i*.07,(-.07+i*.04));this.scene.add(reel);this.reels.push(reel);reel.visible=false;
      const shadow=this.shadow(this.scene,reel.position.x,reel.position.z,2.7,1.7,.8);this.shadows.push(shadow);
      reel.traverse(o=>{if(o.isMesh){o.userData.reel=i;this.hit.push(o);}});
    }
  }
  buildScreen() {
    const material=new THREE.MeshBasicMaterial({color:'#e6dfcb'});
    this.screen=new THREE.Group();this.screen.position.copy(this.projector.localToWorld(V(.522,2.7,-9)));this.screen.rotation.y=this.projector.rotation.y;this.scene.add(this.screen);this.screen.visible=false;
    this.box(8.8,5.15,.13,this.mat.black,this.screen,V(0,0,-.08),.025);
    this.screenMaterial=material;this.screenPlane=this.mesh(new THREE.PlaneGeometry(8.55,4.81),material,this.screen,V(0,0,.06));this.screenPlane.castShadow=false;
    this.screenMap=this.fallbackProjection(0);material.map=this.screenMap;
    this.screenGlow=new THREE.PointLight('#eddbb5',0,15);this.screenGlow.position.copy(this.projector.localToWorld(V(.522,2.7,-8)));this.scene.add(this.screenGlow);
  }
  fallbackProjection(index) {
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;const c=canvas.getContext('2d');c.fillStyle='#191b18';c.fillRect(0,0,1600,900);c.fillStyle='#c8ae76';c.font='22px monospace';c.fillText('MAX / SELECTED WORK',65,65);c.fillText(`NOW SHOWING / 0${index+1}`,65,190);c.fillStyle='#eee9db';c.font='70px Georgia';c.fillText(projects[index],65,330);c.font='27px Georgia';c.fillText(['Find files by meaning.','Your grades, always in view.','Map it. Build it. Play it.','A park in folded paper.'][index],65,395);c.fillStyle='#e5e1d7';c.fillRect(660,160,875,650);c.fillStyle='#343d30';c.font='30px monospace';c.fillText(projects[index]+' / PREVIEW',710,230);
    c.strokeStyle='#a2a58d';c.lineWidth=3;for(let i=0;i<6;i++){const x=720+i%3*250,y=330+Math.floor(i/3)*200;c.strokeRect(x,y,195,130);c.font='22px monospace';c.fillText(index===2?'Scene '+(i+1):'Sample '+(i+1),x+25,y+70);}
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
  }
  buildBeam() {
    const start=this.projector.localToWorld(this.lensPosition.clone()),end=this.screen.position.clone();const d=end.clone().sub(start);const length=d.length();
    this.projectorLight.position.copy(start);
    const geom=new THREE.ConeGeometry(4.2,length,48,1,true);geom.translate(0,-length/2,0);geom.rotateX(Math.PI/2);
    this.beamMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{power:{value:0},time:{value:0}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float power;uniform float time;void main(){float bands=.8+.2*sin(vUv.x*80.+time*.5);float edge=pow(sin(vUv.x*3.14159),2.);gl_FragColor=vec4(vec3(1.,.82,.53),power*.05*bands*(.3+.7*vUv.y)*edge);}' });
    this.beam=new THREE.Mesh(geom,this.beamMaterial);this.beam.position.copy(start);this.beam.quaternion.setFromUnitVectors(V(0,0,-1),d.normalize());this.scene.add(this.beam);
    // Sparse dust motes, only visible in the projection light.
    const p=[];let seed=33;for(let i=0;i<220;i++){seed=(seed*16807)%2147483647;const t=seed/2147483647;seed=(seed*16807)%2147483647;const a=seed/2147483647*TAU;seed=(seed*16807)%2147483647;const r=seed/2147483647*t*2.5;p.push(start.x+Math.cos(a)*r,start.y+t*1.3+Math.sin(a)*r,start.z-t*6);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));this.dustMaterial=new THREE.PointsMaterial({color:'#ffe5ba',size:.015,transparent:true,opacity:0,depthWrite:false});this.dust=new THREE.Points(geo,this.dustMaterial);this.scene.add(this.dust);
  }
  resizeScene() {
    const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;this.mobile=r.width<650;
    if(!r.width||!r.height)return;
    if(this.state==='idle'){
      const x=this.mobile?-.45:-2.3,delta=x-this.projector.position.x;
      this.projector.position.x=x;this.projectorContact.position.x=x;
      for(const object of [this.screen,this.screenGlow,this.beam,this.projectorLight,this.dust])object.position.x+=delta;
      this.projector.updateMatrixWorld(true);
    }
    this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();
    this.screen.scale.y=(8.55/this.camera.aspect)/4.81;this.needsRender=true;
    this.homeCamera=this.mobile?V(0,17,22):V(2.1,5.7,12.8);this.homeLook=this.mobile?V(0,.8,1.4):V(0,1.25,.2);
    this.reels.forEach((reel,i)=>{
      const home=this.mobile?V(i%2===0?-1.65:1.65,1.15,1.8+Math.floor(i/2)*5.0):V(-4.35+i*2.9,1.15,3.2);
      this.homes[i]={position:home,quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(-.11,-.18+i*.07,-.07+i*.04))};
      this.shadows[i].position.x=home.x;this.shadows[i].position.z=home.z;
      if(this.state==='idle')reel.position.copy(home);
    });
    if(this.state==='idle'){this.camera.position.copy(this.homeCamera);this.look.copy(this.homeLook);this.camera.lookAt(this.look);}
    this.camera.updateMatrixWorld();
    this.onLayout?.(this.homes.map(h=>{
      const p=h.position.clone().add(V(0,-1.4,0)).project(this.camera);
      return {x:(p.x+1)*r.width/2,y:(1-p.y)*r.height/2};
    }));
  }
  pick(event) {
    if(!['idle','ready'].includes(this.state))return null;
    const r=this.canvas.getBoundingClientRect();this.mouse.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.mouse,this.camera);
    const hit=this.ray.intersectObjects(this.hit,false)[0];return hit?hit.object.userData.reel:null;
  }
  tween(duration,update) {
    return new Promise(resolve=>this.tweens.push({start:performance.now(),duration,update,resolve}));
  }
  async choose(index) {
    if(!['idle','ready'].includes(this.state))return false;
    if(this.active===index&&this.state==='ready')return true;
    this.state='lifting';const token=++this.token;this.active=index;
    const reel=this.reels[index],start=reel.position.clone(),q=reel.quaternion.clone();
    const mount=this.projector.localToWorld(this.supplyMount.clone());const target=mount.clone().add(V(.65,.4,0));
    const tq=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI/2-.55,0));
    const others=this.reels.map(r=>({p:r.position.clone(),q:r.quaternion.clone()}));
    await this.tween(this.reduced.matches?0:1250,t=>{
      const e=smoother(t);reel.position.lerpVectors(start,target,e);reel.position.y+=Math.sin(t*Math.PI)*1.4;reel.quaternion.slerpQuaternions(q,tq,e);
      this.reels.forEach((r,i)=>{if(i!==index){r.position.lerpVectors(others[i].p,this.homes[i].position,e);r.quaternion.slerpQuaternions(others[i].q,this.homes[i].quaternion,e);this.shadows[i].material.opacity=.8;}});
      this.shadows[index].material.opacity=.8*(1-e*.9);
    });
    if(token!==this.token)return false;this.state='ready';return true;
  }
  startSound() {
    if(!this.sound)return;
    try {
      this.audio ||= new (window.AudioContext||window.webkitAudioContext)();this.audio.resume();
      const ctx=this.audio;this.soundBus=ctx.createGain();this.soundBus.gain.setValueAtTime(.001,ctx.currentTime);this.soundBus.gain.exponentialRampToValueAtTime(.07,ctx.currentTime+.65);this.soundBus.connect(ctx.destination);
      const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),a=buffer.getChannelData(0);
      for(let i=0;i<a.length;i++){const t=i/ctx.sampleRate,phase=(t*24)%1;a[i]=(Math.random()*2-1)*(.1+.9*Math.exp(-phase*40));}
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=3200;source.connect(filter);filter.connect(this.soundBus);source.start();this.noise=source;
      this.motor=ctx.createOscillator();this.motor.type='triangle';this.motor.frequency.setValueAtTime(35,ctx.currentTime);this.motor.frequency.exponentialRampToValueAtTime(74,ctx.currentTime+.9);const g=ctx.createGain();g.gain.value=.18;this.motor.connect(g);g.connect(this.soundBus);this.motor.start();
      // The mechanical latch closes before the motor settles into its rhythm.
      const latch=ctx.createOscillator(),gain=ctx.createGain();latch.type='square';latch.frequency.setValueAtTime(220,ctx.currentTime);latch.frequency.exponentialRampToValueAtTime(60,ctx.currentTime+.09);gain.gain.setValueAtTime(.04,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12);latch.connect(gain);gain.connect(ctx.destination);latch.start();latch.stop(ctx.currentTime+.15);
    } catch { /* The visual sequence remains usable when audio is unavailable. */ }
  }
  stopSound() {
    if(!this.audio||!this.soundBus)return;
    const t=this.audio.currentTime;this.soundBus.gain.cancelScheduledValues(t);this.soundBus.gain.setTargetAtTime(.0001,t,.08);
    this.noise?.stop(t+.4);this.motor?.stop(t+.4);this.noise=null;this.motor=null;this.soundBus=null;
  }
  async insert() {
    if(this.state!=='ready')return;this.state='playing';const token=++this.token;
    const reel=this.reels[this.active],start=reel.position.clone(),mount=this.projector.localToWorld(this.supplyMount.clone());
    this.startSound();
    const projection=this.fallbackProjection(this.active);this.screenMaterial.map=projection;this.screenMaterial.needsUpdate=true;
    const texturePath=`./assets/film/projection-${ids[this.active]}.png`;
    new THREE.TextureLoader().load(texturePath,t=>{if(token!==this.token){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;this.screenMaterial.map=t;this.screenMaterial.needsUpdate=true;},undefined,()=>{});
    if(this.reduced.matches){this.complete();return;}
    this.onStage('SEATING THE REEL');
    await this.tween(750,t=>{reel.position.lerpVectors(start,mount,smoother(t));reel.scale.setScalar(THREE.MathUtils.lerp(1.12,this.mountedReelScale,smoother(t)));});if(token!==this.token)return;
    this.running=true;this.thread.visible=true;this.onStage('THREADING / 24 FRAMES PER SECOND');
    await this.tween(900,t=>{const pulse=t<.7?(Math.sin(t*65)>.1?1:.12):1;this.lampMaterial.opacity=pulse*t;this.beamMaterial.uniforms.power.value=pulse*t;this.projectorLight.intensity=pulse*t*10;this.screenGlow.intensity=t*4;this.dustMaterial.opacity=t*.22;this.screen.visible=t>.16;this.screenMaterial.color.setScalar(.55+.45*pulse);});if(token!==this.token)return;
    this.onStage('LIGHTS DOWN. YOUR PROJECT IS ON.');
    const c0=this.camera.position.clone(),l0=this.look.clone(),behind=this.projector.localToWorld(V(3.7,4.8,5.5)),screenCenter=this.screen.position.clone();
    await this.tween(2100,t=>{
      const e=smoother(t);this.camera.position.lerpVectors(c0,behind,e);this.camera.position.x+=Math.sin(t*Math.PI)*2.8;this.camera.position.y+=Math.sin(t*Math.PI)*.7;this.look.lerpVectors(l0,screenCenter,e);this.camera.lookAt(this.look);
      this.scene.fog.density=.016+.012*e;
    });if(token!==this.token)return;
    await this.tween(350,()=>{});if(token!==this.token)return;
    this.onStage('ENTERING THE PROJECTION');
    const from=this.camera.position.clone(),distance=(8.55/this.camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)));
    const normal=V(0,0,1).applyQuaternion(this.screen.quaternion),to=screenCenter.clone().addScaledVector(normal,distance);
    await this.tween(1700,t=>{const e=ease(t);this.camera.position.lerpVectors(from,to,e);this.look.copy(screenCenter);this.camera.lookAt(this.look);this.beamMaterial.uniforms.power.value=1-e;});if(token!==this.token)return;
    this.complete();
  }
  complete() {
    ++this.token;this.tweens.splice(0).forEach(t=>t.resolve());this.state='finished';this.running=false;this.stopSound();this.onFinish(this.active);
  }
  reset() {
    ++this.token;this.tweens.splice(0).forEach(t=>t.resolve());this.stopSound();this.state='idle';this.running=false;this.active=-1;this.supply.visible=false;this.screen.visible=false;this.thread.visible=false;this.scene.fog.density=.016;this.needsRender=true;
    this.lampMaterial.opacity=0;this.beamMaterial.uniforms.power.value=0;this.projectorLight.intensity=0;this.screenGlow.intensity=0;this.dustMaterial.opacity=0;
    this.reels.forEach((r,i)=>{r.position.copy(this.homes[i].position);r.quaternion.copy(this.homes[i].quaternion);r.scale.setScalar(1.12);this.shadows[i].material.opacity=.8;});this.camera.position.copy(this.homeCamera);this.look.copy(this.homeLook);this.camera.lookAt(this.look);
  }
  draw(now) {
    const dt=Math.min((now-this.last)/1000,.05);this.last=now;
    const moving=this.tweens.length>0;
    for(const tw of [...this.tweens]){const t=tw.duration===0?1:Math.min(1,(now-tw.start)/tw.duration);tw.update(t);if(t===1){const i=this.tweens.indexOf(tw);if(i>=0)this.tweens.splice(i,1);tw.resolve();}}
    if(this.running){this.reels[this.active].rotateZ(dt*9);this.takeup.rotateZ(-dt*9.6);this.beamMaterial.uniforms.time.value=now*.001;this.dust.rotation.z=Math.sin(now*.0001)*.012;}
    if(!this.canvas.parentElement.hidden&&(moving||this.running||this.needsRender)){this.renderer.render(this.scene,this.camera);this.needsRender=false;}
    this.frame=requestAnimationFrame(this.draw);
  }
}
