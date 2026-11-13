import { liftBubbleAboveDemos } from './paper-bubble-placement.js';
import { sampleCourse, travelCourse } from './paper-physics.js';
import { figurePose, climbAmount, courseFrame, airPose, jetpackPose, waveArm, fallingPose, turnPose, translatePose } from './paper-pose.js?fall=3';
import { polylineCourse, courseDistance, pointAt, nearestOnCourse, planRoute, frontier, jumpPoint, jumpDuration, freshWallAhead, pinPracticeTarget } from './paper-tour.js?v=pin-visibility-2';
import { flightPoint, caughtPoint, drawFlightGear, createJetSmoke } from './paper-flight.js?v=6';
import { createToolShow } from './paper-tool-show.js?tour=9';
import { hitGrab, createGrab, stepGrab, grabPose, grabBody } from './paper-grab.js';
import { createSketchReader } from './paper-reader.js?reaction=2';
import { heroPose, heroRoute, drawWhoosh, drawCape } from './paper-cape.js';
import { replyFor, libraryHint } from './paper-library.js';
import { typesetText } from './paper-typeset.js?v=project-notes-3';
import { tourSpeechPages } from './paper-dialogue.js';
import { createScreenSplat } from './paper-splat.js';

/* The stick-figure guide: welcomes visitors to the portfolio and walks
   whatever path they build for him out of thread and pencil. He is never driven
   directly. Climbing is hand over hand; steep ways down are a slide. The real demo
   frames are surfaces too: he stands on top of them and can walk or climb their edges.
   Outside the tour he roams: he keeps up with whatever the visitor is reading, hopping
   along lines of text and demo frames, and catches up by pencil parachute or jetpack
   after a short pause off screen. */
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = new URL('./paper-guide.css?tools-tour=8&wrap=1&pages=1', import.meta.url).href;
document.head.append(css);

const mix = (a, b, t) => a + (b - a) * t;
const INK = '#141412'; // his pencil: plain black
const HOP = .42;       // seconds in the air for a hop
const SPEECH_GAP = 20000; // milliseconds between spontaneous remarks
const QUEST_GAP = 120000; // shared spacing for unsolicited quest requests and reminders
const GRAVITY = 1400;  // px/s², for falls and launches
// The slingshot ride home: fast off the band, easing up, then dropping onto the string.
const flingPoint = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, 1 - (1 - t) ** 2.2) - Math.sin(Math.PI * t) * 60 });
const STORE = 'paper-guide';
const saved = () => { try { return localStorage.getItem(STORE); } catch { return null; } };
const save = value => { try { localStorage.setItem(STORE, value); } catch { /* private mode */ } };

// Home ledge, as fractions of the playground box: where he lands if the ground vanishes.
const HOME = { x0: .02, x1: .14, y: .93 };
const ROAM_HOPS = 10;
const WALK_FREQUENCY = 1.3; // More frequent strolls, with the same movement speed.
const ROAM_AWAY = 2.5; // continuous seconds out of reading view before following
const NEAR_LINE = 320; // px: how close a fresh line must be for him to go and try it
const VISIT_CHANCE = .52; // share of fresh lines nearby that he goes to try
const FLAT = .3;       // climbAmount below this counts as flat enough to stand still on
// ── Everything he says about the tools. Edit freely: each `lines` entry is one bubble
// (keep them to a sentence or two), `prompt` is the try-it request he then waits on
// (it can depend on whether any pins are on the page), and `done` is his reply.
const INTRO = [
  { tool: 'browse', title: 'Browse',
    lines: ['Here is the toolbox! You can use each of these tools to interact with me on the page.', 'Browse lets you scroll and click through the projects. Press V or Esc to put your drawing tools down.'] },
  { tool: 'pencil', title: 'Pencil',
    lines: ['Drag on the paper to draw a line. I can walk on your lines and climb the steep ones!'] },
  { tool: 'eraser', title: 'Eraser',
    lines: ['Drag the eraser across a pencil line to rub it out. Erased too much? Undo brings it back.'] },
  { tool: 'pins', title: 'Pin + string',
    lines: ['Place a pin on empty paper. Click that pin, then place another to connect them with string. Drag a pin to tighten it.'],
    wait: 'string', prompt: pins => pins ? 'Your turn: click the circled pin on my string, then click empty paper to tie on a new one.' : 'Your turn: place a pin, click it, then place another to connect them.',
    done: 'String! I can walk that too, and bounce on it.' },
  { tool: 'undo', title: 'Undo',
    lines: ['Undo takes back your last change. Click this arrow, or press Ctrl / Cmd + Z.'] },
  { tool: 'clear', title: 'Clear',
    lines: ['Clear removes every pencil mark, pin, and string. Want them back? Click Undo. That’s the tools covered!'] }
];
// One welcome bubble per step; tool guidance stays in the question-mark tips.
const WELCOME = [
  'I’m Stickothy. Resident doodle, self-appointed welcoming committee. Welcome to Max’s portfolio!',
  'This is where Max keeps the things he’s been making: useful tools, playful experiments, and ideas that got a little out of hand.',
  'Scroll around, read what caught his curiosity, and try the projects for yourself. The embedded demos let you explore how each project works.',
  'Feel like leaving a mark? Open the pencil box for that. The little question marks explain the tools if you need a hand.',
  'Go on, find something you like. I’ll be walking around with you!',
  'Oh! Feel free to carry and interact with me with your mouse as well!'
];
// Project frames are walking surfaces and provide context for free-roaming remarks.
const PROJECTS = [
  { key: 'content-finder', frame: '#content-finder .demo .frame' },
  { key: 'canvas-widget', frame: '#canvas-widget .demo .frame' },
  { key: 'node-maps', frame: '#node-maps .demo .frame' },
  { key: 'disney', frame: '#disney .demo.banner' }
];
const IDLE_QUIPS = ['Yes, I do all my own stunts. The benefits are terrible.', 'I’ve found my purpose. Apparently it’s standing here.', 'Another visitor. I’ll alert absolutely no one.', 'My entire workout is cardio and line dancing.', 'I tried thinking outside the box. Fell off the page.', 'Please don’t erase my good side. I only have two dimensions.'];
// Said now and then when he turns up beside a project, at random. Edit freely.
const PRAISE = {
  'content-finder': ['Metadata. Even your pictures have a more detailed résumé than I do.', 'Apparently “the one I’m thinking of” is still too vague.', 'I typed “handsome” and it found a picture of me. Smart tool.', 'No more IMG_4032_final_FINAL.jpg. Bless this thing.', 'It found a sea lion in two seconds. I’ve been looking for my eraser for years.'],
  'canvas-widget': ['Five themes. None of them changes the deadline.', 'The assignments are sorted. We can’t have disorganized procrastination.', 'A ring chart. Your unfinished work deserved a logo.', 'Drop the lowest grade. Finally, a feature that understands negotiation.', 'All your assignments in one place. Now you can avoid them efficiently.', 'It calculates the grade you need. Earning it is apparently your department.', 'Every assignment in one tab. Now someone just has to do them.', 'Five themes and not one is pencil grey? I’ll allow it.'],
  'node-maps': ['You connect two nodes and it’s worldbuilding. I connect two pins and it’s a safety concern.', 'A sound-effects node. Somewhere to file the dramatic sighing.', 'A whole dungeon on one map, and I’d still get lost.', 'Can I be a node? I’d make a great side quest.', 'Claude drafts the nodes you skip? I want that for my homework.'],
  'disney': ['The happiest place on Earth. I assume my invitation is in the next patch.', 'My application to be a load-bearing character was declined.', 'I could be a cast member. I’m already excellent at standing in one spot.', 'Max built an entire theme park. I’m still waiting on a chair.', 'I asked for a park map. Max appears to have misunderstood the scope.', 'Man, I love Disneyland. I wish I was there!', 'A whole park made of paper? Finally, my people.', 'Save me a spot on Main Street. I’m very flat, I won’t take up much room.']
};
// Once, a while after the tour, he asks for a cape and waits. A triangle drawn for him becomes one:
// he walks over, puts it on, flies a lap of the screen, lands, and thinks better of it.
const CAPE_AFTER = 120; // seconds after the tour before he asks
const CAPE = {
  ask: 'Hey, could you draw me a cape? Any triangle will do.',
  wait: 'Take your time. I’ll wait right here.',
  notYet: 'Nice, but a cape needs three sides. I’ll keep waiting.',
  coming: ['A cape! Hold that thought, I’m coming over.', 'Ooh, that’s the one. Coming!'],
  lost: 'Hey! I was going to wear that.',
  done: ['Eh. I don’t wanna be a superhero. Too much flying, not enough standing around.',
    'Eh, I don’t wanna be a superhero. You have to save people. I can barely save my progress.',
    'Eh, I don’t wanna be a superhero. Great cape, terrible hours.']
};
// Said when he is picked up, in turn.
const ERASED = ['Hey! I’m not a mistake!', 'Careful, that’s my good leg.', 'Rude. I was drawn with love.', 'I’m load-bearing graphite, you know.',
  'Erase me and who’s going to walk your lines?', 'Ow! That tickles. Also, existential dread.', 'Nope. I’m permanent marker on the inside.'];
const LIFTED = ['Finally. A higher power with no plan.', 'Whee!', 'Whoa, put me down!', 'Where are we going?', 'I can see my ledge from here!'];
const TIPS = {
  browse: ['Browse', 'Scroll and click the page as normal, with the usual pointer. Use your mouse to carry Stickothy around, and click him to interact with him.Grab a string to twang it. Press V or Esc to come back here from any tool.'],
  pencil: ['Pencil', 'Drag to draw, click for a dot. Stickothy walks on your lines and recognizes drawings like a heart, star, house or cat, plus words in capitals like HI or HELLO. For other writing, click Stickothy and choose Read my writing. Shortcut: D.'],
  eraser: ['Eraser', 'Drag over a line to rub it out. Undo brings it back. Shortcut: E.'],
  pins: ['Pin', 'Place a pin, click it, then place another to connect them. Drag a pin to tighten the string. Shortcut: T.'],
  undo: ['Undo', 'Steps back one change, including a Clear. Ctrl or Cmd + Z does the same.'],
  clear: ['Clear', 'Wipes every line and pin from the page. You can undo it.']
};

const make = (tag, className, parent) => { const node = document.createElement(tag); if (className) node.className = className; parent?.append(node); return node; };

export function createGuide(api) {
  // ── Figure state ───────────────────────────────────────────────
  let at = 'home', position = .12, velocity = 0, facing = 1, moving = false;
  let phase = 0, crawl = 0, slide = 0, gait = 0, previousFootfall = 0, clock = 0;
  let walk = null, jump = null, body = { x: 0, y: 0 }, goal = null, ring = null;
  let waveUntil = 0, decideAt = -1, needDecide = false, before = null, hopAt = -1;
  let tour = { on: false, step: 0, mode: 'idle' }, lastSay = null, hushTimer = 0;
  let held = null, lifts = 0, finale = null, air = null, platform = null;
  let toolShow = null, toolHome = null;
  let phone = null, phoneAfter = 60;
  let climbStalled = 0;
  // The pose last drawn and what produced it, so a change of state blends instead of snapping.
  let drawn = null, xf = null;
  let asideAt = 0, deferredSpeech = null, introduced = false, invited = false, introComplete = false;
  // Project-focus styling stays on the page, but his remarks, asks and music comments run again.
  // Set this back to the dataset check to quiet him: document.body.dataset.projectFocus === 'true'
  const projectFocus = false;
  let musicRemarkPending = false, musicRemarkIndex = 0, musicRemarkRequested = false, lofiStarted = false;
  let wallPause = null, wallPoints = null, wallRemark = 0;
  let wallCross = null;
  // Once a visit, after a while on the page, he parachutes onto the music button and asks to
  // put on his own track. 'pending' until he lands there, then 'asked', then 'done'.
  let dj = null, djPicked = false;
  let djRetry = null;
  let nextQuestAt = performance.now() + QUEST_GAP;
  const questReady = () => performance.now() >= nextQuestAt;
  const noteQuestRequest = () => { nextQuestAt = performance.now() + QUEST_GAP; };
  let cape = null, capeAt = 0;
  let buttonScene = null, pendingButton = null;
  let buttonQuest = null; // waiting, wanted (declined), found, or done; once per visit
  const actionComments = new Map();
  
  const jetSmoke = createJetSmoke();
  const sketchReader = createSketchReader({
    strokes: api.strokes, width: api.width,
    result: recognized => {
      if(recognized.name==='button' && !tour.on && !buttonScene) {
        pendingButton=recognized; api.wake(2); return;
      }
      if(tour.on || buttonScene || document.hidden || bubbleKey === 'wall')return;
      if((recognized.kind==='triangle'||recognized.triangle)&&['waiting','wanted'].includes(cape?.state)){fetchCape(recognized.bounds);return;}
      if(heroic() || !readable(body.y))return;
      // Waiting on his cape, any other drawing gets a nudge toward three sides.
      if(cape?.state==='waiting'&&recognized.kind!=='word'){say('cape:not-yet',CAPE.notYet);hushLater('cape:not-yet',4500);return;}
      const action=recognized.kind==='word'?['Read again',offerReading]:recognized.kind==='drawing'?['What else?',showLibrary]:['Read as writing',offerReading];
      say('recognized',replyFor(recognized),[action,['Got it',hush]]);
      hushLater('recognized',6500);
    },
    status: state => {
      if(tour.on || document.hidden)return;
      const messages={loading:'Warming up the handwriting reader. The first read takes a moment; your drawing stays in this browser.',
        reading:'Reading your writing…',busy:'I’m still reading that line.',empty:'Draw a word or a short line first, then click me to read it.',
        unclear:'I couldn’t read that confidently. Try larger letters in one line.',
        changed:'The drawing changed, so I stopped reading the old version. Click me when your new line is ready.',
        error:'The handwriting reader couldn’t load or run. Shape recognition still works. You can try again.'};
      const actions=state==='error'||state==='unclear'?[['Try again',offerReading],['Got it',hush]]:
        state==='loading'||state==='reading'||state==='busy'?[['Cancel',()=>{sketchReader.cancel();hush();}]]:[];
      say('reading',messages[state]||messages.error,actions);
      if(state!=='loading'&&state!=='reading'&&state!=='busy')hushLater('reading',7000);
    }
  });

  // ── Geometry ───────────────────────────────────────────────────
  let geo = { left: 0, top: 0, w: 1, h: 1 }, home = null, frames = [], surfaceCache = null;
  let strokeCourses = new WeakMap(), ids = new WeakMap(), nextId = 1;
  const idOf = (object, prefix) => { if (!ids.has(object)) ids.set(object, `${prefix}:${nextId++}`); return ids.get(object); };
  const lineCourse = (x0, y0, x1, y1) => polylineCourse([{ x: x0, y: y0 }, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, { x: x1, y: y1 }]);

  function layout() {
    const r = api.host.getBoundingClientRect();
    geo = { left: r.left, top: r.top + scrollY, w: Math.max(1, r.width), h: Math.max(1, r.height) };
    home = lineCourse(geo.left + HOME.x0 * geo.w, geo.top + HOME.y * geo.h, geo.left + HOME.x1 * geo.w, geo.top + HOME.y * geo.h);
    // Each demo frame is a loop of edges he can walk (top, bottom) or climb (sides).
    frames = PROJECTS.map(s => {
      const el = document.querySelector(s.frame); if (!el) return null;
      const d = el.getBoundingClientRect(), l = d.left, rt = d.right, t = d.top + scrollY, b = d.bottom + scrollY;
      if (d.width < 40 || d.height < 40) return null;
      return { el, l, r: rt, t, b, courses: { top: lineCourse(l, t, rt, t), bottom: lineCourse(l, b, rt, b), left: lineCourse(l, t, l, b), right: lineCourse(rt, t, rt, b) } };
    });
    surfaceCache = null;
  }
  function strokeCourse(stroke) {
    if (!strokeCourses.has(stroke)) strokeCourses.set(stroke, polylineCourse(stroke.points.map(p => ({ x: p.x * api.width(), y: p.y }))));
    return strokeCourses.get(stroke);
  }
  function surfaces() {
    if (surfaceCache) return surfaceCache;
    const list = [{ id: 'home', ropes: home }];
    // Every thread is its own surface; threads meet at pins, where he steps across.
    for (const rope of api.ropes()) list.push({ id: idOf(rope, 'rope'), ropes: [rope] });
    for (const stroke of api.strokes()) {
      const course = strokeCourse(stroke);
      if (!course || course[0].length < 18) continue;
      list.push({ id: idOf(stroke, 'stroke'), ropes: course });
    }
    // Only a frame's top edge and its left side: on the bottom edge or the right side his
    // body would be drawn over the demo itself (he hangs to the left of a vertical line).
    frames.forEach((f, i) => { if (f) for (const side of ['top', 'left']) list.push({ id: `frame:${i}:${side}`, ropes: f.courses[side] }); });
    if (platform?.ready) list.push({ id: 'platform', ropes: platform.course });
    return surfaceCache = list;
  }
  const courseOf = id => surfaces().find(s => s.id === id)?.ropes;

  // ── Walking, jumping, falling ──────────────────────────────────
  // Routes take off and land at a line's very end. On a steep line that left him hanging
  // off a corner, so there he stops (or lands) a little way in from the end instead.
  const END_INSET = 16;
  function offEnd(ropes, pos) {
    if (!ropes?.length) return pos;
    const atStart = pos <= .001, atEnd = pos >= ropes.length - .001;
    if (!atStart && !atEnd) return pos;
    const frame = courseFrame(ropes, pos);
    if (!frame || climbAmount(frame) < .5) return pos;
    return travelCourse(ropes, pos, atStart ? END_INSET : -END_INSET);
  }
  function decide() {
    walk = null; ring = null;
    const list = surfaces();
    if (!list.some(s => s.id === at)) return;
    if (!goal) return;
    const plan = planRoute(list, at, goal.id);
    let target = { id: goal.id, pos: goal.pos, reached: true }, route = plan;
    if (!plan.found && goal.roam) { goal = null; return; }
    if (!plan.found) {
      const f = frontier(list, plan.reachable, goal.point);
      if (!f) return;
      target = { id: f.id, pos: f.pos, reached: false };
      ring = { x: f.x, y: f.y };
      route = planRoute(list, at, f.id);
    }
    const here = courseOf(at);
    walk = route.legs.length ? { pos: offEnd(here, route.legs[0].takeoff), then: route.legs[0] } : { pos: offEnd(here, target.pos), then: target.reached ? 'arrive' : 'frontier' };
    api.wake(1);
  }
  function startJump(leg) {
    const from = courseOf(at), to = courseOf(leg.to);
    if (!from || !to) { needDecide = true; return; }
    leg = { ...leg, land: offEnd(to, leg.land) };
    const a = pointAt(from, position), b = pointAt(to, leg.land);
    // Where two threads meet at a pin, or two edges at a corner, he just steps across.
    if (Math.hypot(b.x - a.x, b.y - a.y) < 8) {
      at = leg.to; position = leg.land; body = { ...b }; velocity = 0; needDecide = true; decideAt = clock; return;
    }
    jump = { from: a, to: b, t: 0, dur: jumpDuration(a, b), surface: leg.to, pos: leg.land };
    if (Math.abs(b.x - a.x) > 4) facing = Math.sign(b.x - a.x);
    velocity = 0;
  }
  // Free flight: dropped, launched off a string, or left with nothing underfoot.
  // User throws and failed climbs get a parachute; other accidental falls retain their return flight.
  // Tour flights and quiet respawns retain their normal collision behavior.
  function fall(vx = 0, vy = 0, from = null) {
    wallCross = null;
    phone = null;
    wallPause = null;
    air = { vx, vy, t: 0, from }; jump = null; walk = null; velocity = 0; at = 'air';
  }
  function fly(dt) {
    if (air.returnIn !== undefined) {
      air.returnIn -= dt;
      if (air.returnIn <= 0) {
        let target = roamTarget(false);
        if (!target) {
          const ledge = newPlatform();
          platform = { ...ledge, ready: true, t: 0 }; surfaceCache = null;
          target = { id: 'platform', pos: .5, point: { x: (ledge.x0 + ledge.x1) / 2, y: ledge.y } };
        }
        body = { x: Math.max(40, Math.min(api.width() - 40, target.point.x)), y: scrollY + innerHeight + 90 };
        air = null; awaySince = null;
        takeFlight(target, 'jetpack');
      }
      api.wake(.5); return;
    }
    const prev = { ...body };
    air.t += dt; air.vy += GRAVITY * dt;
    // Wait until the lower screen before opening, anticipating the next step
    // so a fast throw cannot skip past the deployment line.
    // A faster fall opens the canopy a little higher (still low on the screen), so it has room to brake.
    const deployY = scrollY + innerHeight - 56 - Math.min(74, Math.max(49, air.vy * .1));
    // Something to land on further along his fall? Then no parachute: he just drops onto it.
    if (!tour.on && (air.thrown || air.climbRecovery) && !air.quiet && air.vy > 0 && air.landsOn === undefined &&
        body.y + air.vy * dt >= deployY) air.landsOn = landingAhead();
    if (!tour.on && (air.thrown || air.climbRecovery) && !air.quiet && air.vy > 0 && !air.landsOn &&
        body.y + air.vy * dt >= deployY) {
      const entryPose = fallingPose(body, air.t, facing, air.rig ? grabPose(air.rig) : airPose(body, .85, facing));
      const ledge = newPlatform(scrollY + innerHeight - 56);
      platform = { ...ledge, ready: true, t: 0 }; surfaceCache = null;
      air = null;
      takeFlight({ id: 'platform', pos: .5,
        point: { x: (ledge.x0 + ledge.x1) / 2, y: ledge.y } }, 'parachute');
      jump.entryPose = entryPose; jump.caught = true;
      jump.dur = Math.min(2.8, Math.max(1.2, Math.abs(jump.to.y - jump.from.y) / 160));
      return;
    }
    if (air.rig) {
      stepGrab(air.rig, dt, null, api.reduced.matches);
      body = grabBody(air.rig);
      air.vx = (body.x - prev.x) / dt; air.vy = (body.y - prev.y) / dt;
    } else body = { x: body.x + air.vx * dt, y: body.y + air.vy * dt };
    // Only a clear sideways drift turns him; a swinging ragdoll hip would flip him back and forth.
    if (Math.abs(air.vx) > 120) facing = Math.sign(air.vx);
    if (!tour.on && !(air.thrown || air.climbRecovery) && !air.quiet && body.y > scrollY + innerHeight + 80) {
      air.returnIn = 2; hush(); api.wake(3); return;
    }
    if (air.vy > 0) {
      const reach = 3 + Math.hypot(body.x - prev.x, body.y - prev.y);
      for (const s of surfaces()) {
        if (s.id === air.from && air.t < .25) continue;
        const n = nearestOnCourse(s.ropes, body);
        if (n && n.dist < reach && n.y >= prev.y - 2 && (!air.climbRecovery || !steepAt(s.ropes, n.pos))) {
          air = null; at = s.id; position = n.pos; body = { x: n.x, y: n.y };
          if (isThread(at) && !api.reduced.matches) { const rope = courseOf(at)?.[0]; if (rope) api.kick(rope, position, 60); }
          needDecide = true; decideAt = clock; return;
        }
      }
    }
    const w = api.width(), bottom = document.documentElement.scrollHeight;
    if (body.y > bottom + 60 || body.x < -50 || body.x > w + 50) respawn();
    api.wake(.5);
  }
  // Runs his current fall forward (same gravity, same catch test as fly) until it meets a
  // surface or leaves the page. Returns that surface's id, or null.
  function landingAhead() {
    const step = 1 / 60, w = api.width(), bottom = document.documentElement.scrollHeight, list = surfaces();
    let x = body.x, y = body.y, vx = air.vx, vy = air.vy;
    for (let i = 0; i < 360; i++) {
      const px = x, py = y;
      vy += GRAVITY * step; x += vx * step; y += vy * step;
      if (y > bottom + 60 || x < -50 || x > w + 50) return null;
      if (vy <= 0) continue;
      const reach = 3 + Math.hypot(x - px, y - py);
      for (const s of list) {
        if (s.id === air.from && air.t + i * step < .25) continue;
        const n = nearestOnCourse(s.ropes, { x, y });
        if (n && n.dist < reach && n.y >= py - 2 && (!air.climbRecovery || !steepAt(s.ropes, n.pos))) return s.id;
      }
    }
    return null;
  }
  function respawn() {
    // Roaming, he drops back in from just above whatever the visitor is reading.
    if (!tour.on) {
      let spot = roamTarget(false);
      if (!spot) { platform = { ...newPlatform(), ready: true }; surfaceCache = null; spot = { point: { x: (platform.x0 + platform.x1) / 2 } }; }
      body = { x: spot.point.x, y: scrollY - 40 }; air = { vx: 0, vy: 0, t: 0, from: null, quiet: true }; return;
    }
    let rope = null;
    for (const r of api.ropes()) if (!rope || r.nodes[r.nodes.length >> 1].y < rope.nodes[rope.nodes.length >> 1].y) rope = r;
    const top = pointAt(rope ? [rope] : home, .5);
    body = { x: top.x, y: top.y - 220 }; air = { vx: 0, vy: 0, t: 0, from: null };
    say('respawn', 'Whoops! Back to the top.', [], false); hushLater('respawn', 2500);
  }
  // Pull the string he stands on and let go: it flings him the other way.
  function launch(rope, pullX, pullY) {
    if (held || jump || air || at !== idOf(rope, 'rope') || Math.hypot(pullX, pullY) < 25) return false;
    hush(); fall(-pullX * 9, -pullY * 9, at);
    air.thrown = true;
    return true;
  }
  const isThread = id => id.startsWith('rope:');
  function land() {
    if (jump.flight === 'jetpack' && !flatFooting(courseOf(jump.surface), jump.pos)) {
      const target = { id: jump.surface, pos: jump.pos, point: jump.to };
      const onLand = jump.onLand;
      takeFlight(target, 'jetpack'); jump.onLand = onLand;
      return;
    }
    const flung = jump.fling && !jump.roam;
    const onLand = jump.onLand;
    at = jump.surface; position = jump.pos; body = { ...jump.to }; jump = null; velocity = 0;
    if (buttonScene?.state === 'approach') {
      buttonScene.state='press'; buttonScene.t=0; needDecide=false;
      facing=buttonScene.cap.left < body.x ? -1 : 1;
      return;
    }
    if (deferredSpeech) {
      const speech = deferredSpeech; deferredSpeech = null; say(...speech);
      // Tour lines held during the flight home, and his music question, wait for the visitor;
      // asides fade on their own.
      if (speech[0] === 'tour:done') hushLater('tour:done', 12000);
      else if (!['skipped', 'dj'].includes(speech[0])) hushLater(speech[0], 6500);
    }
    if (flung) { finale = null; hop(); say('home', 'Back to the top! Click me any time. Every tool has a ? if you forget.', [['Got it', hush, true]], true); }
    if (isThread(at) && !api.reduced.matches) { const rope = courseOf(at)?.[0]; if (rope) api.kick(rope, position, 40); }
    needDecide = true; decideAt = clock;
    onLand?.();
  }
  function arrived(done) {
    if (done.then === 'wall-top') { crossWall(); return; }
    if (done.then === 'arrive' && goal?.roam) { goal = null; }
    else if (done.then && done.then.to) startJump(done.then);
  }

  // Called from the physics loop. Returns the thread he presses on, if he is on one.
  // The side toolbox is the roaming boundary; the tool tutorial can cross it.
  // A bottom toolbar on phones leaves the full page width available.
  function rightBoundary() {
    const tools = document.querySelector('.paper-tools')?.getBoundingClientRect();
    return Math.max(40, Math.min(api.width() - 30,
      tools && tools.left > api.width() / 2 ? tools.left - 30 : api.width() - 30));
  }
  function step(dt) {
    // Let the opening sketches finish before his autonomous movement begins.
    if (landingIntro && landingIntro.dataset.entranceComplete !== 'true' && !introduced && !held) {
      before = null;
      return null;
    }
    if (!tour.on && !toolShow && jump && jump.to.x > rightBoundary()) {
      const ledge = newPlatform(jump.to.y);
      platform = { ...ledge, ready: true, t: 0 }; surfaceCache = null;
      jump.to = { x: (ledge.x0 + ledge.x1) / 2, y: ledge.y };
      jump.surface = 'platform'; jump.pos = .5;
    }
    const result = stepMotion(dt);
    if (!tour.on && !toolShow && body.x > rightBoundary()) {
      const dx = rightBoundary() - body.x;
      body.x += dx; before = null;
      const rig = held || air?.rig;
      if (rig) for (const p of Object.values(rig.points)) { p.x += dx; p.px += dx; }
      if (air) air.vx = Math.min(0, air.vx);
      if (!held && !air && !jump) {
        const ropes = courseOf(at);
        const nearest = ropes && nearestOnCourse(ropes, body);
        if (nearest && nearest.x <= rightBoundary()) position = nearest.pos;
        else {
          const ledge = newPlatform(body.y);
          platform = { ...ledge, ready: true, t: 1 }; surfaceCache = null;
          at = 'platform'; position = .5;
          body = { x: (ledge.x0 + ledge.x1) / 2, y: ledge.y };
        }
        walk = null; goal = null; phone = null; velocity = 0; needDecide = false;
      }
    }
    return result;
  }
  function stepMotion(dt) {
    // Where he was a step ago, so drawing can land between steps.
    before = { at, jump, position, phase, x: body.x, y: body.y, t: jump?.t };
    clock += dt;
    if (phone) { stepPhone(dt); return null; }
    if(buttonScene && buttonScene.state!=='approach') { stepButtonScene(dt); return null; }
    retryDj();
    if(pendingButton && free() && bubbleKey!=='wall' && readable(body.y) && cape?.state!=='waiting') {
      const recognized=pendingButton; pendingButton=null; buttonQuest='found';
      say('button:offer','A button. Surely pressing it would be a sensible decision.',
        [['Press it',()=>pressDrawingButton(recognized),true],['Leave it alone',hush]]);
    }
    // The player is fixed to the viewport. Keep his destination on it if the
    // visitor scrolls during a flight, rather than landing at its old page position.
    if (jump?.music) {
      const target=musicLanding();
      if(target) { jump.to=target.point; jump.pos=target.pos; }
    }
    if (musicRemarkPending) remarkOnMusic();
    jetSmoke.step(dt, jump?.flight === 'jetpack' ? { x: body.x - facing * 1.5, y: body.y + 6 } : null);
    if (toolShow) { body = toolShow.step(dt); moving = toolShow?.moving ?? false; before = null; return null; }
    if (platform) updatePlatform(dt);
    if (heroic()) { stepHero(dt); return null; }
    if (cape?.state === 'shed') shedCape(dt);
    if (held) { swing(dt); return null; }
    if (air) { fly(dt); return null; }
    // Keep the host beside his welcome until the visitor finishes or dismisses it.
    // Explicit throws can still finish their flight; waves and small hops remain live.
    if (!introComplete && !jump) {
      walk = null; goal = null; ring = null; velocity = 0; moving = false;
      needDecide = false; crawl = 0; slide = 0; gait = 0;
      return null;
    }
    if (wallPause) {
      if (clock < wallPause.until) { api.wake(.5); return null; }
      const pause = wallPause;
      const stroke = api.strokes().find(s => s.points === pause.points);
      wallPause = null;
      hush();
      if (stroke && beginWallClimb(stroke, pause)) { api.wake(1); return null; }
      needDecide = true; decideAt = clock;
    }
    if (needDecide && !jump && clock >= decideAt) { needDecide = false; decide(); }
    if (jump) {
      jump.t += dt / jump.dur;
      if (jump.t >= 1) land(); else body = (jump.caught ? caughtPoint : jump.flight ? flightPoint : jump.fling ? flingPoint : jumpPoint)(jump.from, jump.to, jump.t);
      api.wake(.4); return null;
    }
    if (finale) pullBand(dt);
    const ropes = courseOf(at);
    if (!ropes) { fall(); return null; }
    position = Math.max(0, Math.min(ropes.length, position));
    const frame = courseFrame(ropes, position);
    crawl += ((frame ? climbAmount(frame) : 0) - crawl) * (1 - Math.exp(-dt * 12));
    let target = 0, descending = false;
    if (walk) {
      const remaining = courseDistance(ropes, position, walk.pos);
      // Arrive once this step would carry him there, so he brakes into the spot instead of crawling the last pixels.
      if (remaining < .5 || remaining <= Math.abs(velocity) * dt) { position = walk.pos; velocity = 0; const done = walk; walk = null; arrived(done); }
      else {
        const sign = Math.sign(walk.pos - position);
        descending = !!frame && crawl > .45 && frame.ty * sign > .4;
        const speed = descending ? 185 : mix(96, 62, crawl);
        target = sign * Math.min(speed, Math.sqrt(2 * 520 * remaining));
      }
    }
    if (jump) return null;
    if (cape?.state === 'fetch' && cape.ids.includes(at) && !walk && !goal && !needDecide) { putOnCape(); return null; }
    if (!walk && !goal && !needDecide && !velocity && !tour.on && !finale) settle(ropes);
    if (jump || air) return null;
    slide += ((descending ? 1 : 0) - slide) * (1 - Math.exp(-dt * 9));
    velocity += (target - velocity) * (1 - Math.exp(-dt * 15));
    if (Math.abs(velocity) < .15) velocity = 0;
    const previous = position;
    position = travelCourse(ropes, position, velocity * dt);
    moving = Math.abs(position - previous) > 1e-6;
    climbStalled = steepAt(ropes, position) && !moving ? climbStalled + dt : 0;
    if (climbStalled >= 2 && !finale) {
      climbStalled = 0; walk = null; goal = null; ring = null; needDecide = false;
      settle(ropes);
      if (jump || air) return null;
    }
    if (moving || walk) stillSince = clock;
    gait += ((moving ? 1 : 0) - gait) * (1 - Math.exp(-dt * 14));
    const here = sampleCourse(ropes, position);
    if (moving && frame) {
      const across = frame.tx * Math.sign(velocity);
      if (Math.abs(across) > .15) facing = Math.sign(across);
      // Hand over hand only while climbing; a slide has no stride.
      if (slide < .5) phase += Math.abs(velocity) * dt * (.2 + crawl * .08);
      const footfall = Math.floor(phase / Math.PI);
      if (footfall !== previousFootfall && isThread(at) && here && !api.reduced.matches) api.kick(ropes[0], here.u, 35);
      previousFootfall = footfall; api.wake(1.5);
    }
    if (walk || velocity || waveUntil > clock) api.wake(.5);
    if (here) body = { x: here.x, y: here.y };
    return isThread(at) && here ? { rope: ropes[0], u: here.u } : null;
  }

  // Find a flat resting spot without sending him off the end of a steep path.
  const steepAt = (ropes, pos) => { const f = courseFrame(ropes, pos); return !!f && climbAmount(f) > FLAT; };
  function settle(ropes) {
    if (!steepAt(ropes, position)) return;
    const y = pointAt(ropes, position).y;
    const down = pointAt(ropes, travelCourse(ropes, position, 4)).y >= y ? 1 : -1;
    const end = down > 0 ? ropes.length : 0, length = courseDistance(ropes, position, end);
    for (let d = 4; d < length; d += 4) {
      const pos = travelCourse(ropes, position, down * d);
      if (!steepAt(ropes, pos)) { walk = { pos, then: 'arrive' }; api.wake(1); return; }
    }
    const other = down > 0 ? 0 : ropes.length;
    const back = courseDistance(ropes, position, other);
    for (let d = 4; d < back; d += 4) {
      const pos = travelCourse(ropes, position, -down * d);
      if (!steepAt(ropes, pos)) { walk = { pos, then: 'arrive' }; api.wake(1); return; }
    }
    // Let go of a climb with no resting spot. Catch a flat line below, or
    // open the parachute near the screen bottom and draw a fresh landing line.
    const source = at;
    goal = null; ring = null; needDecide = false; climbStalled = 0;
    fall(0, 0, source); air.climbRecovery = true;
    api.wake(2);
  }

  // ── Picking him up ─────────────────────────────────────────────
  // Hold the actual bone that was picked. Gravity pulls the other joints around
  // it: a leg grip can turn him upside down, while a torso grip folds his limbs.
  function pickUp(grip, pose) {
    wallCross = null;
    phone = null;
    wallPause = null;
    held = createGrab(pose, grip);
    if (finale?.band) delete finale.band.hold;
    jump = null; air = null; walk = null; goal = null; velocity = 0; ring = null; finale = null;
    spotButton.classList.add('is-lifting');
    aside('lifted', LIFTED[lifts++ % LIFTED.length]);
  }
  function swing(dt) {
    stepGrab(held, dt, held.pointer || held.target, api.reduced.matches);
    body = grabBody(held); api.wake(.5);
  }
  function drop() {
    const rig = held;
    body = grabBody(rig); held = null;
    spotButton.classList.remove('is-lifting');
    fall(); air.thrown = true; air.rig = rig; rig.target = null;
    if (bubbleKey === 'lifted') hushLater('lifted', 1200);
  }

  // ── The finale ─────────────────────────────────────────────────
  // After the tour he pushes in two pins, ties a band between them, pulls it back,
  // and slingshots himself up the page to the string he started on.
  function slingshot() {
    if (api.reduced.matches || !api.slingshot) return false;
    const band = api.slingshot({ x: body.x - 70, y: body.y - 92 }, { x: body.x + 70, y: body.y - 92 });
    if (!band) return false;
    surfaceCache = null;
    finale = { band, t: 0, i: Math.floor(band.nodes.length / 2), from: null };
    say('finale', 'One more trick. Watch this!', [], true);
    return true;
  }
  function pullBand(dt) {
    const { band, i } = finale;
    finale.t += dt; api.wake(.5);
    if (finale.t < .7) return;
    // The bubble gets out of the way before the band is drawn back.
    if (!finale.from) { hush(); finale.from = { x: band.nodes[i].x, y: band.nodes[i].y }; }
    const k = Math.min(1, (finale.t - .7) / 1.1), e = k * k * (3 - 2 * k);
    band.hold = { i, x: mix(finale.from.x, body.x, e), y: mix(finale.from.y, body.y - 22, e) };
    if (finale.t < 2.1) return;
    delete band.hold;
    // Home is the string highest on the page (not the band), or else his ledge.
    let rope = null;
    for (const r of api.ropes()) if (r !== band && (!rope || r.nodes[r.nodes.length >> 1].y < rope.nodes[rope.nodes.length >> 1].y)) rope = r;
    const to = pointAt(rope ? [rope] : home, .5);
    jump = { from: { ...body }, to, t: 0, dur: 1.7, surface: rope ? idOf(rope, 'rope') : 'home', pos: .5, fling: true };
    if (Math.abs(to.x - body.x) > 4) facing = Math.sign(to.x - body.x);
    walk = null; velocity = 0; finale = { landing: true }; hush();
  }

  // ── Roaming ────────────────────────────────────────────────────
  // Outside the tour he lets the visitor read in peace: once he has been out of view for
  // a short pause he comes to find them. Close by, he hops there over text and
  // frames; far below, he parachutes; far above, he uses a jetpack. Something
  // new drawn or tied nearby he sometimes walks over to try. While they read,
  // he now and then wanders to another line nearby, favouring their drawings.
  const header = () => document.querySelector('.nav')?.getBoundingClientRect().bottom ?? 0;
  // Widget tops and the visitor's own drawings are where he likes to be; a widget top
  // counts as in view a little higher up, since it sits above the demo being read.
  const favourite = id => made(id) || id.endsWith(':top');
  function roamTarget(wander) {
    const lo = scrollY + Math.max(header() + 40, innerHeight * .3), hi = scrollY + innerHeight * .85, mid = (lo + hi) / 2;
    let best = null, score = Infinity;
    for (const s of surfaces()) {
      if (s.id === 'home' || s.id.endsWith(':left') || (wander && s.id === at)) continue;
      const pos = wander ? mix(.15, .85, Math.random()) * s.ropes.length : nearestOnCourse(s.ropes, { x: body.x, y: mid }).pos;
      const p = pointAt(s.ropes, pos);
      if (p.y < (s.id.endsWith(':top') ? scrollY + header() + 50 : lo) || p.y > hi) continue;
      if (p.x > rightBoundary()) continue;
      const d = Math.hypot(p.x - body.x, p.y - body.y);
      if (wander && (d < 30 || d > 280)) continue;
      const rank = (wander ? Math.random() : Math.abs(p.x - body.x) + Math.abs(p.y - mid) * .6) * (favourite(s.id) ? .3 : 1);
      if (rank < score) { score = rank; best = { id: s.id, pos, point: p, ropes: s.ropes }; }
    }
    return best;
  }
  const readable = y => y > scrollY + header() + 10 && y < scrollY + innerHeight - 20;
  const made = id => isThread(id) || id.startsWith('stroke:');
  const free = () => !(phone || buttonScene || tour.on || held || air || jump || wallPause || finale || document.hidden || at === 'air' || heroic());
  let awaySince = null, stillSince = 0, restFor = 3 / WALK_FREQUENCY;
  function roam(wander = false) {
    if (!introComplete || document.hidden || tour.on || held) { awaySince = null; return; }
    const here = readable(body.y);
    if (here) awaySince = null;
    else awaySince ??= performance.now();
    if (!free()) return;
    if (djRetry) return;
    if (cape?.state === 'fetch') { headForCape(); return; }
    if (!here) {
      if (performance.now() - awaySince < ROAM_AWAY * 1000) return;
      walk = null; goal = null; needDecide = false;
      go(roamTarget(false), 0, true);
      return;
    }
    if (cape?.state === 'waiting' || buttonQuest==='waiting') return; // standing by for a drawing
    if (visitId && clock >= visitAt) { visit(); if (goal) return; }
    if (walk || goal || !wander) return;
    if (clock - stillSince >= restFor) stroll();
  }
  // He never stands about for long: after a short rest he paces along whatever he's on
  // (a widget top is a good long walk), or now and then hops across to somewhere nearby.
  function stroll() {
    restFor = (1.9 + Math.random() * 2.7) / WALK_FREQUENCY; stillSince = clock;
    const ropes = courseOf(at); if (!ropes) return;
    if (startPhoneWalk(ropes)) return;
    const length = courseDistance(ropes, 0, ropes.length);
    if (length < 120 || Math.random() < .4) {
      const target = roamTarget(true);
      if (target) { const before = goal; go(target, 3, false); if (goal !== before) return; }
    }
    if (length < 40) return;
    // Somewhere along this surface, a fair way from where he stands.
    // Somewhere flat, since he never stops on a climb or a slide.
    let pos = null;
    for (let i = 0; i < 12 && pos === null; i++) {
      const p = mix(.06, .94, Math.random()) * ropes.length;
      if (Math.abs(p - position) * length >= Math.min(60, length * .4) && !steepAt(ropes, p) && pointAt(ropes, p).x <= rightBoundary()) pos = p;
    }
    if (pos === null) return;
    goal = { id: at, pos, point: pointAt(ropes, pos), roam: true };
    needDecide = true; decideAt = clock; api.wake(1);
  }
  // Heads for a spot: hopping there if it's within reach. Otherwise, when he's far off, he
  // parachutes down (or jets up) and draws himself a little platform beside the visitor's
  // reading; `exact` sends him to the spot itself instead (something they just drew).
  function go(target, hops, far, exact = false) {
    if (target) {
      const plan = planRoute(surfaces(), at, target.id);
      if (plan.found && plan.legs.length <= hops && (!far || exact) && !(far && api.reduced.matches)) {
        goal = { id: target.id, pos: target.pos, point: target.point, roam: true };
        needDecide = true; decideAt = clock; api.wake(1); return;
      }
    }
    if (!far) return;
    awaySince = null;
    const ledge = (exact || target?.id.endsWith(':top')) && target ? null : newPlatform();
    const dest = ledge ? { id: 'platform', pos: .5, point: { x: (ledge.x0 + ledge.x1) / 2, y: ledge.y }, ropes: ledge.course } : target;
    if (!dest) return;
    if (api.reduced.matches) { if (ledge) { platform = { ...ledge, ready: true, t: 1 }; surfaceCache = null; } at = dest.id; position = dest.pos; body = { ...dest.point }; api.invalidate(); return; }
    if (ledge) { platform = { ...ledge, ready: true, t: 0 }; surfaceCache = null; }
    takeFlight(dest);
  }
  // His own pencil ledge: in the reading area, beside his line of descent, and clear of
  // the demo frames and the toolbar.
  function newPlatform(y = scrollY + innerHeight * .58) {
    const w = api.width(), half = 34;
    let x = Math.max(70, Math.min(w - 130, body.x));
    for (const f of frames) {
      if (!f || x < f.l - half - 10 || x > f.r + half + 10 || y < f.t - 40 || y > f.b + 40) continue;
      x = f.l - half - 24 >= 40 ? f.l - half - 24 : f.r + half + 24;
    }
    x = Math.max(half + 6, Math.min(rightBoundary() - half, x));
    return { x0: x - half, x1: x + half, y, course: lineCourse(x - half, y, x + half, y), t: 0, fade: 0, ready: false };
  }
  // Something new was drawn or tied near him: now and then, after a moment's thought, he
  // walks over (never flies) to try it: a line to its end, where the pencil stopped, a
  // string to its nearest point. Otherwise it just joins the places he likes to roam.
  // If he's busy (mid-jump, held) when it's time to go, it waits until he's free.
  const known = new Set();
  let visitId = null, visitAt = 0;
  function visitNew() {
    const fresh = surfaces().filter(s => made(s.id) && !known.has(s.id));
    surfaces().forEach(s => known.add(s.id));
    if (!fresh.length || Math.random() >= VISIT_CHANCE) return;
    visitId = fresh.at(-1).id; visitAt = clock + 1.5 + Math.random() * 2.5;
  }
  function visit() {
    if (!visitId || clock < visitAt || !free()) return;
    const s = surfaces().find(s => s.id === visitId); visitId = null;
    if (!s) return;
    const n = nearestOnCourse(s.ropes, body);
    if (n.dist > NEAR_LINE) return;
    if (s.id.startsWith('stroke:')) go({ id: s.id, pos: s.ropes.length, point: pointAt(s.ropes, s.ropes.length), ropes: s.ropes }, ROAM_HOPS, false);
    else if (at !== s.id) go({ id: s.id, pos: n.pos, point: { x: n.x, y: n.y }, ropes: s.ropes }, ROAM_HOPS, false);
  }
  // Jetpack landings need room for both feet on a nearly horizontal stretch.
  function flatFooting(ropes, pos) {
    if (!ropes) return false;
    const a = travelCourse(ropes, pos, -12), b = travelCourse(ropes, pos, 12);
    if (courseDistance(ropes, a, b) < 22) return false;
    for (let i = 0; i <= 4; i++) {
      const f = courseFrame(ropes, a + (b - a) * i / 4);
      if (!f || Math.abs(f.ty) > .12) return false;
    }
    return true;
  }
  function flatJetTarget(target) {
    const ropes = courseOf(target.id) || target.ropes;
    if (flatFooting(ropes, target.pos)) return target;
    let best = null, distance = Infinity;
    if (ropes) {
      const length = courseDistance(ropes, 0, ropes.length);
      for (let d = 12; d <= length - 12; d += 6) {
        const pos = travelCourse(ropes, 0, d);
        if (!flatFooting(ropes, pos)) continue;
        const point = pointAt(ropes, pos), gap = Math.hypot(point.x - target.point.x, point.y - target.point.y);
        if (gap < distance) { distance = gap; best = { ...target, pos, point }; }
      }
    }
    if (best) return best;
    platform = { ...newPlatform(target.point.y), ready: true, t: 0 }; surfaceCache = null;
    return { id: 'platform', pos: .5, point: { x: (platform.x0 + platform.x1) / 2, y: platform.y } };
  }
  // An occasional distraction, with a long cooldown between mishaps.
  function startPhoneWalk(ropes) {
    if (clock < phoneAfter || api.reduced.matches || !bubble.hidden || !readable(body.y) || Math.random() >= .08) return false;
    const end = facing * (courseFrame(ropes, position)?.tx || 1) > 0 ? ropes.length : 0;
    const distance = courseDistance(ropes, position, end);
    if (distance < 35 || distance > 180) return false;
    for (let d = 0; d <= distance; d += 4) {
      const f = courseFrame(ropes, travelCourse(ropes, position, Math.sign(end - position) * d));
      if (!f || Math.abs(f.ty) > .12) return false;
    }
    const edge = pointAt(ropes, end);
    if (surfaces().some(s => s.id !== at && nearestOnCourse(s.ropes, edge)?.dist < 20)) return false;
    phone = { t: 0, end, direction: Math.sign(end - position), beyond: 0 };
    phoneAfter = clock + 100 + Math.random() * 60;
    walk = null; goal = null; needDecide = false; velocity = 0; waveUntil = 0; hopAt = -1;
    api.wake(2); return true;
  }
  function stepPhone(dt) {
    const ropes = courseOf(at);
    if (!ropes) { fall(); return; }
    phone.t += dt;
    moving = phone.t > 1.4;
    gait += ((moving ? 1 : 0) - gait) * (1 - Math.exp(-dt * 12));
    if (moving) {
      phase += 46 * dt * .2;
      const remaining = courseDistance(ropes, position, phone.end), step = 46 * dt;
      if (remaining <= step) { position = phone.end; phone.beyond += step - remaining; }
      else position = travelCourse(ropes, position, phone.direction * step);
    }
    const p = pointAt(ropes, position);
    body = { x: p.x + facing * phone.beyond, y: p.y };
    before = null; stillSince = clock;
    if (phone.beyond >= 14) { fall(facing * 46, 0, at); return; }
    api.wake(.5);
  }
  function takeFlight(target, mode = null) {
    wallPause = null;
    const flight = mode || (target.point.y > body.y ? 'parachute' : 'jetpack');
    if (flight === 'jetpack') target = flatJetTarget(target);
    const dist = Math.hypot(target.point.x - body.x, target.point.y - body.y);
    jump = { from: { ...body }, to: target.point, t: 0,
      dur: flight === 'parachute' ? Math.min(9, Math.max(2.8, dist / 260)) : Math.min(5, Math.max(1.6, dist / 700)),
      surface: target.id, pos: target.pos, flight, roam: true };
    if (Math.abs(target.point.x - body.x) > 4) facing = Math.sign(target.point.x - body.x);
    walk = null; velocity = 0; goal = null; ring = null; waveUntil = 0; hopAt = -1;
    hush();
    api.wake(1);
  }
  // His pencil ledge appears beneath the landing spot, then fades after he leaves.
  function updatePlatform(dt) {
    platform.t += dt;
    if (platform.drawing && platform.t >= .7) {
      platform.drawing = false; platform.ready = true; surfaceCache = null;
      startJump({ to: 'platform', land: nearestOnCourse(platform.course, body).pos });
    }
    const using = !platform.ready || at === 'platform' || jump?.surface === 'platform' || cape?.land?.id === 'platform';
    platform.fade = using ? 0 : platform.fade + dt;
    if (platform.fade > .6) { platform = null; surfaceCache = null; }
    api.wake(.3);
  }
  function drawPlatform(ctx) {
    if (buttonScene) return; // his landing surface is the drawn button itself
    const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const shown = platform.ready || platform.drawing ? ease(platform.t / .6) : 0;
    if (shown <= 0) return;
    ctx.save(); ctx.globalAlpha = 1 - ease(platform.fade / .6);
    inkLine(ctx, platform.x0, mix(platform.x0, platform.x1, shown), platform.y);
    ctx.restore();
  }

  // The drawn button becomes a tiny stage; the glass impact is a separate fixed layer.
  function askForButton() {
    buttonQuest='waiting';
    walk=null; goal=null; velocity=0; needDecide=false; visitId=null;
    showButtonAsk();
  }
  function showButtonAsk() {
    noteQuestRequest();
    say('button:ask','Draw me a button: a square or rectangle for the base, with a smaller one on top. What could go wrong?',[
      ['Draw a button',()=>{
        api.selectTool('pencil'); api.setBox(true);
        say('button:wait','Big box below, smaller box on top. Wobbly lines are fine.');
        hushLater('button:wait',5000);
      },true],
      ['Not now',()=>{buttonQuest='wanted';hush();}]
    ]);
  }
  function pressDrawingButton(recognized) {
    if (!free() || !recognized.capBounds) return;
    const cap=recognized.capBounds;
    const strokes=api.strokes().filter(s=>s.points.some(p=>{
      const x=p.x*api.width();return x>=recognized.bounds.left-4 && x<=recognized.bounds.right+4 &&
        p.y>=recognized.bounds.top-4 && p.y<=recognized.bounds.bottom+4;
    }));
    if (!strokes.length) { hush(); return; }
    buttonQuest='done';
    buttonScene={state:'approach',t:0,cap,strokes};
    visitId=null; deferredSpeech=null; needDecide=false;
    const x=(cap.left+cap.right)/2;
    platform={x0:cap.left,x1:cap.right,y:cap.top,course:lineCourse(cap.left,cap.top,cap.right,cap.top),t:1,fade:0,ready:true};
    surfaceCache=null;
    takeFlight({id:'platform',pos:platform.course.length/2,point:{x,y:cap.top}});
    if(api.reduced.matches)jump.dur=.01;
  }
  function stepButtonScene(dt) {
    const scene=buttonScene; scene.t+=dt; api.wake(.5);
    if(scene.state==='press') {
      // An exaggerated lean, then an awkward pause before the delayed launch.
      if(scene.t<1.05)return;
      scene.state='glass'; scene.t=0; hush();
      scene.effect=createScreenSplat({x:body.x,y:body.y-scrollY-15},api.reduced.matches);
      spotButton.style.visibility='hidden'; renderedPose=null; drawn=null; xf=null;
    }
    if(scene.state==='glass') {
      const frame=scene.effect.step(dt,innerWidth,innerHeight);
      if(frame.hit) dispatchEvent(new CustomEvent('portfolio:button-splat'));
      if(!frame.done)return;
      scene.effect.destroy(); buttonScene=null; spotButton.style.visibility='';
      platform=null; surfaceCache=null; deferredSpeech=['button:done','Found out what it does.',[],false];
      body={x:Math.max(30,Math.min(innerWidth-30,body.x)),y:scrollY-65};
      const target=roamTarget(false);
      if(target)takeFlight(target,'parachute');
      else {
        platform={...newPlatform(),ready:true}; surfaceCache=null;
        takeFlight({id:'platform',pos:platform.course.length/2,point:pointAt(platform.course,platform.course.length/2)},'parachute');
      }
      if(api.reduced.matches)jump.dur=.01;
    }
  }

  // ── The cape ───────────────────────────────────────────────────
  // He asks once, in place of a remark, then stops where he is and waits: no strolls, hops
  // or small talk until a triangle turns up (he only follows if the visitor scrolls away).
  // Only then does the rest begin: he heads over to it, lifts it off the page (Undo brings
  // it back) and puts it on, flies a lap of the screen, comes down on something in view,
  // and takes it off again. "Not now" lets him go back to roaming; a triangle drawn later
  // still counts.
  const heroic = () => cape?.state === 'equip' || cape?.state === 'fly';
  function askForCape() {
    cape = { state: 'waiting', remindAt: 0 };
    walk = null; goal = null; needDecide = false; visitId = null;
    showAsk(true);
  }
  // The ask stays up until it's answered. Cleared away unanswered (he flew after the
  // visitor, say), it comes back; once they've picked up the pencil, only as a reminder.
  function showAsk(wave = false) {
    noteQuestRequest();
    say('cape:ask', CAPE.ask, [
      ['Grab the pencil', () => {
        if (cape?.state === 'waiting') cape.remindAt = performance.now() + QUEST_GAP;
        api.selectTool('pencil'); say('cape:wait', CAPE.wait); hushLater('cape:wait', 3500);
      }, true],
      ['Not now', () => { if (cape?.state === 'waiting') cape = { state: 'wanted' }; hush(); }]
    ], wave);
  }
  // The reader only reports where the shape is, so the triangle is the newest ink inside
  // those bounds, counting back from the latest stroke.
  function fetchCape(bounds) {
    const w = api.width(), inside = s => s.points.every(p => p.x * w >= bounds.left - 1 && p.x * w <= bounds.right + 1 && p.y >= bounds.top - 1 && p.y <= bounds.bottom + 1);
    const strokes = [];
    for (const s of [...api.strokes()].reverse()) { if (!inside(s)) break; strokes.push(s); }
    if (!strokes.length) return;
    cape = { state: 'fetch', strokes, ids: strokes.map(s => idOf(s, 'stroke')) };
    walk = null; goal = null; needDecide = false; visitId = null;
    if (readable(body.y)) { say('cape:coming', CAPE.coming[Math.floor(Math.random() * CAPE.coming.length)]); hushLater('cape:coming', 4000); }
    headForCape();
  }
  // To the flattest spot on it nearest him, so he can stand still to put it on. If it's
  // out of reach he flies over, as when roaming.
  function headForCape() {
    if (!free() || goal || walk) return;
    const list = surfaces().filter(s => cape.ids.includes(s.id));
    if (!list.length) { putOnCape(); return; }
    let best = null;
    for (const s of list) for (let k = .04; k < .97; k += .04) {
      const pos = k * s.ropes.length, p = pointAt(s.ropes, pos);
      const score = Math.hypot(p.x - body.x, p.y - body.y) + (steepAt(s.ropes, pos) ? 400 : 0);
      if (!best || score < best.score) best = { id: s.id, pos, point: p, ropes: s.ropes, score };
    }
    go(best, ROAM_HOPS, true, true);
  }
  function lostCape() {
    cape = { state: 'wanted' };
    if (readable(body.y)) { say('cape:lost', CAPE.lost); hushLater('cape:lost', 3500); }
  }
  function putOnCape() {
    walk = null; goal = null; velocity = 0; ring = null; needDecide = false; hush();
    // With reduced motion he just wears it a moment, standing on the triangle.
    if (api.reduced.matches) { cape = { state: 'shed', t: -1.6 }; return; }
    const strokes = cape.strokes;
    cape = { state: 'equip', t: 0, ground: lineCourse(body.x - 12, body.y, body.x + 12, body.y) };
    at = 'cape'; crawl = 0; slide = 0; gait = 0;
    api.take?.(strokes);
    api.wake(2);
  }
  function stepHero(dt) {
    cape.t += dt; api.wake(.5);
    if (cape.state === 'equip') {
      if (cape.t < .75) return;
      // Somewhere in view to come down on; failing that, a pencil ledge of his own.
      let land = roamTarget(false);
      if (!land) {
        const ledge = newPlatform(Math.max(scrollY + innerHeight * .4, Math.min(scrollY + innerHeight * .8, body.y)));
        platform = { ...ledge, ready: true, t: 0 }; surfaceCache = null;
        land = { id: 'platform', pos: .5, point: { x: (ledge.x0 + ledge.x1) / 2, y: ledge.y } };
      }
      const top = scrollY + header() + 40, route = heroRoute(body, land.point, { left: 0, top, width: api.width(), height: scrollY + innerHeight - top }, facing);
      cape = { state: 'fly', t: 0, route, dur: Math.max(5.5, Math.min(9, route.length / 520)), land, from: { ...body },
        stance: figurePose(cape.ground, .5, 0, 0, facing, 0, 0), heading: route.at(0) };
      return;
    }
    const k = Math.min(1, cape.t / cape.dur), p = cape.route.at(k * k * (3 - 2 * k));
    body = { x: p.x, y: p.y }; cape.heading = p;
    if (Math.abs(p.dx) > .3) facing = Math.sign(p.dx);
    if (k < 1) return;
    // Down on the spot he picked, wherever a bouncing string has carried it since.
    const { land } = cape, ropes = courseOf(land.id);
    at = land.id; position = land.pos; velocity = 0;
    if (ropes) body = pointAt(ropes, land.pos);
    if (ropes && isThread(at)) api.kick(ropes[0], position, 60);
    cape = { state: 'shed', t: -.35 };
    needDecide = true; decideAt = clock;
  }
  // A beat after landing he thinks better of it, and the cape fades away.
  function shedCape(dt) {
    const was = cape.t; cape.t += dt; api.wake(.5);
    if (was < 0 && cape.t >= 0) { say('cape:done', CAPE.done[Math.floor(Math.random() * CAPE.done.length)]); hushLater('cape:done', 6000); }
    if (cape.t >= .8) cape = { state: 'done' };
  }
  // Hands on hips while it sketches itself on, then flat out in flight: easing out of that
  // stance at takeoff, and into reaching legs for the landing.
  function heroFigure(shown) {
    if (cape.state === 'equip') return figurePose(cape.ground, .5, 0, 0, facing, 0, 0);
    const k = Math.min(1, cape.t / cape.dur), h = cape.heading;
    const pitch = Math.max(-1.1, Math.min(1.1, Math.atan2(facing * h.dy, facing * h.dx)));
    let pose = heroPose(shown, facing, pitch, clock);
    if (cape.t < .3) pose = turnPose(translatePose(cape.stance, shown.x - cape.from.x, shown.y - cape.from.y), pose, cape.t / .3);
    if (k > .86) pose = turnPose(pose, airPose(shown, .85, facing), (k - .86) / .14);
    return pose;
  }
  // How it looks this frame: sketching itself in, streaming out behind him, fading away.
  function capeLook() {
    if (cape?.state === 'equip') return { grow: cape.t / .45 };
    if (cape?.state === 'fly') return { stream: Math.min(1, cape.t / .35) * (1 - Math.max(0, (cape.t / cape.dur - .86) / .14)) };
    if (cape?.state === 'shed') return { fade: Math.max(0, cape.t / .8) };
    return null;
  }

  // ── Small talk about the projects ──────────────────────────────
  // Wall-clock timing also works when the physics renderer is asleep.
  const lastRemarks = new Map();
  function remark() {
    if (projectFocus) return;
    if (!free() || document.hidden || performance.now() < asideAt || !bubble.hidden || !readable(body.y)) return;
    if (!cape && capeAt && performance.now() >= capeAt && questReady()) { askForCape(); return; }
    // Waiting on his cape, the ask is all he has to say.
    if (cape?.state === 'waiting') { if (questReady() && performance.now() >= cape.remindAt) showAsk(); return; }
    if(buttonQuest==='waiting') { if(questReady())showButtonAsk(); return; }
    if(!buttonQuest && questReady() && (cape?.state==='wanted' || cape?.state==='done' || (!capeAt && dj==='done'))) {
      askForButton();return;
    }
    if(!introduced)return;
    const step = PROJECTS.find(s => {
      const r = document.getElementById(s.key)?.getBoundingClientRect();
      return r && body.y >= r.top + scrollY - 40 && body.y <= r.bottom + scrollY;
    });
    const lines = step ? PRAISE[step.key] : IDLE_QUIPS;
    const key = step?.key || 'idle';
    const choices = lines.filter(line => line !== lastRemarks.get(key));
    const line = choices[Math.floor(Math.random() * choices.length)];
    lastRemarks.set(key, line);
    say('remark', line); hushLater('remark', 4500);
  }
  // Fonts, lazy images, and the demos settling can move a frame without changing the page's
  // size, so the body's ResizeObserver misses it; re-measure now and then, or he ends up
  // walking a line drawn inside the demo instead of along its top.
  function remeasure() {
    const moved = frames.some(f => f && Math.abs(f.el.getBoundingClientRect().top + scrollY - f.t) > 1);
    if (moved) changed('resize');
  }
  let roamTimer = 0;
  addEventListener('scroll', () => { clearTimeout(roamTimer); roamTimer = setTimeout(() => { remeasure(); roam(); }, 450); }, { passive: true });
  setInterval(() => { remeasure(); roam(true); }, 700 / WALK_FREQUENCY);
  setInterval(remark, 1000);
  setInterval(maybeDj, 1000);
  const DJ_TRACK = new URL('./assets/audio/stickothy-pace.ogg', import.meta.url).href;
  function musicLanding() {
    const block = document.querySelector('.music-controls') || document.querySelector('.music-toggle');
    if (!block) return null;
    const r = block.getBoundingClientRect();
    if (!r.width || getComputedStyle(block).visibility === 'hidden') return null;
    const y = r.top + scrollY - 1, x0 = r.left + 4, x1 = r.right - 4;
    platform = { x0, x1, y, course: lineCourse(x0, y, x1, y), t: 0, fade: 0, ready: true }; surfaceCache = null;
    walk = null; goal = null; needDecide = false; awaySince = null;
    return { id: 'platform', pos: platform.course.length / 2, point: { x: (x0 + x1) / 2, y } };
  }
  function landOnMusic(done) {
    const target=musicLanding();
    if(!target)return false;
    deferredSpeech=null;
    takeFlight(target,target.point.y>body.y?'parachute':'jetpack');
    jump.music=true;
    if(api.reduced.matches) { jump.flight=null; jump.dur=.01; }
    else if(Math.hypot(jump.to.x-jump.from.x,jump.to.y-jump.from.y)<80) {
      jump.flight=null; jump.dur=.6;
    }
    jump.onLand=done;
    return true;
  }
  function retryDj() {
    if (!djRetry || !free()) return;
    if (djRetry.stage === 'pending') {
      if(!readable(body.y) || !readable(body.y-46)) {
        const retry=djRetry;
        if(landOnMusic(()=>{if(djRetry===retry){retry.stage='pending';api.wake(4);}}))retry.stage='returning';
        return;
      }
      musicRemarkPending = false;
      walk=null;goal=null;velocity=0;needDecide=false;
      say('dj-paused', 'Hey! I was listening to that. One more try.');
      hushLater('dj-paused', 5000);
      djRetry = { stage: 'remark', at: clock + 1.8 }; return;
    }
    if (djRetry.stage !== 'remark' || clock < djRetry.at) return;
    const retry = djRetry;
    if(landOnMusic(() => {
      if (djRetry !== retry) return;
      djRetry = null; djPicked = true; musicRemarkPending = false;
      dispatchEvent(new CustomEvent('portfolio:play-track', { detail: { src: DJ_TRACK } }));
    }))retry.stage='flying';
  }
  addEventListener('portfolio:music-paused', e => {
    if (!e.detail?.stickothy || djRetry) return;
    djRetry = { stage: 'pending' }; api.wake(4);
  });
  addEventListener('portfolio:music-selection', e => {
    if (e.detail?.stickothy) {
      if (!djRetry) djRetry = { stage: 'pending' };
      api.wake(4);
    } else djRetry = null;
  });
  function maybeDj() {
    if (projectFocus) return;
    const btn = document.querySelector('.music-toggle');
    // The standing "click me" invitation may give way to him; any other line he's saying may not.
    if (!lofiStarted || dj || djRetry || !btn || !questReady() || !free() || buttonQuest==='waiting' || cape?.state==='waiting' || cape?.state==='fetch' || !(bubble.hidden || bubbleKey === 'welcome')) return;
    if(!landOnMusic(()=>{
      noteQuestRequest();
      say('dj', 'Mind if I put on something more my pace?', [['Sure', djPlay, true], ['Not now', () => { dj = 'done'; hush(); reinvite(); }]], true);
    }))return;
    dj = 'pending'; noteQuestRequest();
  }
  function djPlay() {
    const play=()=>{
      dj = 'done'; djPicked = true; musicRemarkPending = false; hush();
      dispatchEvent(new CustomEvent('portfolio:play-track', { detail: { src: DJ_TRACK } }));
      hop(); setTimeout(() => { musicRemarkPending = false; if(readable(body.y)) { say('dj-thanks', 'Ahh. Much better.', [], true); hushLater('dj-thanks', 3500); } reinvite(); }, 700);
    };
    const target=musicLanding();
    if(!target)return;
    // Approval can arrive after he has wandered away or the visitor has scrolled.
    if(at==='platform' && !jump && Math.hypot(body.x-target.point.x,body.y-target.point.y)<8)play();
    else landOnMusic(play);
  }
  // Not introduced yet: once he's done, the standing invitation to click him comes back.
  function reinvite() { if (!introduced) setTimeout(() => { if (!introduced && bubble.hidden && !jump) greet(); }, 5000); }

  // ── Speech bubble and figure hotspot ───────────────────────────
  // Both sit in a page-sized layer, so they scroll with him rather than chasing him.
  const uiLayer = make('div', 'paper-guide-layer', document.body);
  const bubble = make('div', 'paper-bubble', uiLayer);
  bubble.hidden = true; bubble.dataset.paperInteractive = ''; bubble.setAttribute('role', 'status');
  const bubbleLabel = make('strong', 'paper-bubble-label', bubble);
  const bubbleText = make('p', 'paper-bubble-text', bubble), bubbleActions = make('div', 'paper-bubble-actions', bubble), tail = make('span', 'paper-bubble-tail', bubble);
  // A comic tail, drawn twice like the outline; its fill covers the bubble's edge where they join.
  tail.innerHTML = '<svg viewBox="0 0 26 20" aria-hidden="true"><path class="fill" d="M1 0Q9 6 11 19 15 8 25 0Z"/><path d="M1.5.5Q9 6 11 19 15 8 24.5.5"/><path class="faint" d="M4 1.2Q10.5 7.5 11.8 17.5"/></svg>';
  let bubbleKey = null, bubbleSize = { w: 200, h: 60 }, bubbleSide = null, bubbleAt = null;
  // The handwriting face can arrive after the first words, so measure whenever the bubble changes size.
  new ResizeObserver(() => { if (!bubble.hidden) { bubbleSize = { w: bubble.offsetWidth, h: bubble.offsetHeight }; place(); } }).observe(bubble);
  const spotButton = make('button', 'paper-guide-spot', uiLayer);
  spotButton.type = 'button'; spotButton.setAttribute('aria-label', 'Say hi to ???');
  const svgNS = 'http://www.w3.org/2000/svg';
  const hitFigure = document.createElementNS(svgNS, 'svg');
  hitFigure.setAttribute('aria-hidden', 'true'); hitFigure.classList.add('paper-guide-hit');
  spotButton.append(hitFigure);
  const hitParts = ['torso', 'arms-1', 'legs-1', 'arms-0', 'legs-0'].map(part => {
    const path = document.createElementNS(svgNS, 'path');
    path.dataset.grabPart = part; hitFigure.append(path); return path;
  });
  const hitHead = document.createElementNS(svgNS, 'circle');
  hitHead.setAttribute('r', '5.5'); hitHead.classList.add('paper-guide-head'); hitFigure.append(hitHead);
  let renderedPose = null;
  const tipBox = make('div', 'paper-tip', document.body);
  tipBox.hidden = true; tipBox.dataset.paperInteractive = ''; tipBox.setAttribute('role', 'status');
  let tipFor = null;

  function say(key, text, actions = [], wave = false) {
    // Until he is clicked his only line is the invitation; everything else stays quiet.
    if (!introduced && key !== 'welcome') return;
    if (jump?.flight) {
      if (['recognized', 'reading', 'read-offer', 'tour:done', 'skipped'].includes(key)) deferredSpeech = [key, text, actions, wave];
      return;
    }
    asideAt = performance.now() + SPEECH_GAP;
    clearTimeout(hushTimer);
    lastSay = [key, text, actions, wave]; bubbleKey = key;
    const pages = tour.on ? tourSpeechPages(text, null, innerWidth < 600 ? 24 : 32) : [{text, kind:'speech'}];
    let pageIndex = 0;
    function renderPage() {
      const page = pages[pageIndex], more = pageIndex < pages.length - 1;
      bubbleText.textContent = page.text; bubbleActions.replaceChildren();
      bubble.dataset.speechPage = `${pageIndex + 1}/${pages.length}`;
      bubble.dataset.speechKind = page.kind;
      const station = toolShow && tour.mode === 'intro' && INTRO[tour.intro];
      bubbleLabel.replaceChildren();
      if (page.text) {
        if (introduced) {
          const name = make('span', 'paper-guide-name', bubbleLabel);
          name.textContent = 'Stickothy';
          if (station) bubbleLabel.append(document.createTextNode(` · ${tour.intro + 1} / ${INTRO.length} · ${station.title}`));
        } else bubbleLabel.textContent = '???';
      }
      bubble.classList.toggle('has-next', false);
      function button(label, run, primary = false) {
        const arrow = tour.on && primary;
        const b = make('button', arrow ? 'paper-bubble-next' : primary ? 'is-primary' : '', bubbleActions);
        b.type = 'button';
        if (arrow) {
          b.setAttribute('aria-label', label); b.title = label;
          b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10.5Q8 9.4 16.5 10M11.5 4.5Q13.2 7.2 16.5 10Q14.2 12.4 11 15.5"/><path class="retrace" d="M4 11.3L15.8 10.7M11.7 5.7L15.9 10.1L11.8 14.9"/></svg>';
          bubble.classList.add('has-next');
        } else b.textContent = label;
        b.addEventListener('click', run);
      }
      // Keep Skip available while reading; progression lives in the corner arrow.
      for (const [label,run,primary] of actions) if (!more || !primary) button(label,run,primary);
      if (more) button('Next dialogue page', () => {pageIndex++;renderPage();}, true);
      clearTimeout(leaveTimer); bubble.classList.remove('is-leaving');
      const fresh = bubble.hidden;
      bubble.hidden = false;
      typesetText(bubbleText);
      bubbleSize = {w:bubble.offsetWidth,h:bubble.offsetHeight};
      if (fresh) {bubbleSide=null;bubbleAt=null;}
      if (ui) placeUi(ui.x,ui.y,ui.below);
      api.wake(3);
    }
    renderPage();
    if (wave && !api.reduced.matches) waveUntil = clock + 2.8;
  }
  // The bubble fades out over a moment (still following him) rather than blinking off.
  let leaveTimer = 0;
  function hush() {
    clearTimeout(hushTimer); bubbleKey = null;
    if (bubble.hidden || bubble.classList.contains('is-leaving')) return;
    if (api.reduced.matches) { bubble.hidden = true; return; }
    bubble.classList.add('is-leaving');
    leaveTimer = setTimeout(() => { bubble.hidden = true; bubble.classList.remove('is-leaving'); }, 150);
  }
  // Small talk fades on its own, unless the visitor is pointing at it.
  function hushLater(key, ms) {
    clearTimeout(hushTimer);
    hushTimer = setTimeout(() => { if (bubbleKey === key) bubble.matches(':hover') ? hushLater(key, 1500) : hush(); }, ms);
  }
  // A little hop in place: when he greets someone, or gets poked.
  function hop() { if (!api.reduced.matches && !jump) { hopAt = clock; api.wake(1); } }
  const markTool = tool => {
    document.querySelectorAll('.paper-tray .is-hinted').forEach(b => b.classList.remove('is-hinted'));
    if (tool) document.querySelector(`.paper-tray [data-paper-tool="${tool}"], .paper-tray [data-paper-action="${tool}"]`)?.classList.add('is-hinted');
  };

  // ── Tour ───────────────────────────────────────────────────────
  // Each tool: a few lines of explanation (Next), then a try-it prompt he waits on.
  function intro(index, part = 0) {
    if (part === 0 && toolShow) {
      tour.mode = 'climb'; tour.intro = index; tour.waiting = null;
      hush(); markTool(null);
      toolShow.moveTo(INTRO[index].tool, () => { markTool(INTRO[index].tool); explainIntro(index, 0); });
      return;
    }
    explainIntro(index, part);
  }
  function practicePin() {
    return pinPracticeTarget(api.pins(), api.width(),
      { top: scrollY, height: innerHeight, header: header() },
      bubble.hidden ? null : bubble.getBoundingClientRect());
  }
  function explainIntro(index, part) {
    const s = INTRO[index], final = index === INTRO.length - 1;
    document.body.classList.remove('paper-tools-practice');
    tour.mode = 'intro'; tour.intro = index; tour.waiting = null; goal = null; walk = null; ring = null;
    if (part === 0) { api.selectTool(['undo', 'clear'].includes(s.tool) ? 'browse' : s.tool); api.setBox(true); markTool(s.tool); }
    if (part < s.lines.length) {
      const lastLine = part === s.lines.length - 1;
      const next = s.wait ? () => intro(index, part + 1) : final ? leaveTools : () => intro(index + 1);
      say(`intro:${index}:${part}`, s.lines[part], [[lastLine ? (s.wait ? 'Let me try' : final ? 'Finish tour' : 'Next tool') : 'Next', lastLine ? next : () => intro(index, part + 1), true], ['Skip the tour', skipTour]]);
    } else if (s.wait) {
      tour.waiting = s.wait;
      document.body.classList.add('paper-tools-practice');
      say(`intro:${index}:try`, s.prompt(api.pins().length > 0), [['Skip this step', () => intro(index + 1)], ['End tour', skipTour]]);
      const pin = s.wait === 'string' ? practicePin() : null;
      if (pin && !pin.visible) scrollTo({ top: 0, behavior: api.reduced.matches ? 'instant' : 'smooth' });
    }
  }
  function releaseTools() {
    if (!toolShow) return;
    toolShow.destroy(); toolShow = null; markTool(null); bubble.classList.remove('is-tools');
    hush(); // nothing is said in flight; his next line waits for the landing
    const previousCourse = courseOf(toolHome?.at), course = previousCourse || home;
    const destination = flatJetTarget({ id: previousCourse ? toolHome.at : 'home',
      pos: previousCourse ? toolHome.position : .5, point: pointAt(course, previousCourse ? toolHome.position : .5) });
    const { pos, point: to } = destination;
    // He flies home on the same pencil jetpack he arrived on.
    const dist = Math.hypot(to.x - body.x, to.y - body.y);
    jump = { from: { ...body }, to, t: 0, dur: api.reduced.matches ? .01 : Math.min(4, Math.max(1.4, dist / 700)),
      surface: destination.id, pos, flight: api.reduced.matches ? null : 'jetpack' };
    if (Math.abs(to.x - body.x) > 4) facing = Math.sign(to.x - body.x);
    at = 'tools'; moving = false; crawl = 0; slide = 0; gait = 0; before = null;
  }
  function leaveTools() {
    hush(); markTool(null); tour.mode = 'climb';
    if (toolShow) toolShow.leave(finishTools);
    else finishTools();
  }
  // The page reports what the visitor just made; an intro step waiting for it moves on.
  function blockWithInk(points) {
    if (wallCross || buttonScene || wallPoints === points || wallPause || tour.on || held || air || jump || heroic() ||
        !walk || !moving || Math.abs(velocity) < 12 || crawl > .45 || !readable(body.y)) return false;
    const frame = courseFrame(courseOf(at), position);
    const direction = Math.sign((frame?.tx || 0) * velocity);
    if (!direction || !freshWallAhead(points.map(p => ({ x: p.x * api.width(), y: p.y })), body, direction)) return false;
    wallPoints = points; wallPause = { points, until: clock + 2.2, source: at, direction, resume: goal };
    velocity = 0; moving = false; gait = 0;
    const lines = [
      'Oh, perfect. A wall. Exactly what this walk was missing.',
      'Sure. Put that right there. I was only using the path.',
      'Lovely. My commute now includes a climbing wall.',
      'A surprise wall. You really do spoil me.'
    ];
    say('wall', lines[wallRemark++ % lines.length]); hushLater('wall', 5500);
    api.wake(2); return true;
  }
  function beginWallClimb(stroke, pause) {
    const ropes = strokeCourse(stroke), source = courseOf(pause.source);
    if (!ropes || !source) return false;
    const contact = nearestOnCourse(ropes, body);
    if (!contact || contact.dist > 65) return false;
    const top = pointAt(ropes, 0).y < pointAt(ropes, ropes.length).y ? 0 : ropes.length;
    wallCross = { ...pause, id: idOf(stroke, 'stroke'), top };
    goal = null; walk = null; needDecide = false; climbStalled = 0;
    jump = { from: { ...body }, to: { x: contact.x, y: contact.y }, t: 0,
      dur: .35, surface: wallCross.id, pos: contact.pos,
      onLand: () => {
        if (!wallCross) return;
        needDecide = false;
        walk = { pos: wallCross.top, then: 'wall-top' };
      } };
    return true;
  }
  function crossWall() {
    const crossing = wallCross;
    if (!crossing) return;
    const source = courseOf(crossing.source), wall = courseOf(crossing.id);
    if (!source || !wall) {
      wallCross = null;
      const current = courseOf(at);
      if (current) settle(current); else fall();
      return;
    }
    const top = pointAt(wall, crossing.top), base = nearestOnCourse(source, top);
    const frame = courseFrame(source, base.pos);
    const pos = travelCourse(source, base.pos, crossing.direction * Math.sign(frame?.tx || 1) * 32);
    const to = pointAt(source, pos);
    // Finish the climb at the actual top, then step across onto the original path.
    body = { ...top }; facing = crossing.direction;
    jump = { from: { ...top }, to, t: 0, dur: jumpDuration(top, to), surface: crossing.source, pos,
      onLand: () => {
        wallCross = null; crawl = 0; slide = 0;
        goal = crossing.resume; needDecide = !!goal; decideAt = clock;
      } };
    walk = null; velocity = 0; needDecide = false; api.wake(1);
  }
  function notice(kind) {
    if (kind === 'stroke') {
      const stroke = api.strokes().at(-1);
      if(!tour.on)sketchReader.add(stroke);
      if (stroke && (stroke.points === wallPoints || blockWithInk(stroke.points))) return;
      aside('drawing', 'Bold line. Very confident about where it’s going.');
    }
    if (!tour.on || tour.mode !== 'intro' || tour.waiting !== kind) return;
    const index = tour.intro;
    document.body.classList.remove('paper-tools-practice');
    tour.waiting = null; hop();
    say(`nice:${index}`, INTRO[index].done);
    setTimeout(() => { if (tour.on && tour.mode === 'intro' && tour.intro === index) intro(index + 1); }, 1700);
  }
  function finishTools() {
    endTour(); api.selectTool('browse');
    say('tour:done', 'Your page, your path! Keep drawing, or switch to Browse to explore the projects.');
    if (!deferredSpeech) hushLater('tour:done', 12000);
  }
  function startTour() {
    wallPause = null;
    introduced = true; spotButton.setAttribute('aria-label', 'Say hi to Stickothy');
    tour = { on: true, step: 0, mode: 'welcome' };
    save('started');
    walk = null; goal = null; ring = null; velocity = 0; needDecide = false;
    closeTip(); api.selectTool('browse');
    welcomeStep(0);
  }
  function welcomeStep(index) {
    tour.step = index;
    const final = index === WELCOME.length - 1;
    say(`tour:welcome:${index}`, WELCOME[index], [
      [final ? 'Let’s explore' : 'Next', final ? () => { endTour(); hush(); } : () => welcomeStep(index + 1), true],
      ...(!final ? [['Skip intro', skipTour]] : [])
    ], index === 0);
  }
  function beginTools() {
    if (toolShow) return; // already on the way to the toolbar (a repeated click or key press)
    layout(); tour = { on: true, step: 0, mode: 'entrance' };
    save('started');
    toolHome = { at: courseOf(at) ? at : 'home', position: courseOf(at) ? position : .5 };
    jump = null; walk = null; air = null; finale = null; goal = null; ring = null; velocity = 0; waveUntil = 0; needDecide = false;
    hush(); closeTip(); api.selectTool('browse'); api.setBox(true);
    toolShow = createToolShow({ from: body, reduced: api.reduced, wake: api.wake, ready: () => intro(0) });
    api.wake(5);
  }
  function endTour() {
    introComplete = true;
    awaySince = null;
    releaseTools();
    tour = { on: false, step: 0, mode: 'idle' }; goal = null; ring = null; walk = null;
    save('done'); markTool(null); document.body.classList.remove('paper-tour');
    surfaceCache = null; needDecide = true;
    capeAt ||= performance.now() + CAPE_AFTER * 1000;
  }
  function skipTour() {
    endTour();
    hush();
  }
  // Keep the invitation visible until the visitor clicks him.
  function greet() {
    if (buttonScene || tour.on || bubbleKey === 'music') return;
    invited = true;
    hop();
    say('welcome', 'Welcome to Max’s portfolio! Make yourself at home. Click me to learn more about the page.', [], true);
  }
  // Clicking opens the tour button without dialogue. During a tour, it repeats his last line.
  // Press and drag him to pick him up; a press without a drag is a poke.
  let lift = null, dragged = false;
  // Rubbing the eraser over him (pressed on him or dragged across) gets a protest, not a pickup.
  let erasedAt = -Infinity, erasedCount = 0;
  function erasedOn(e) {
    if (api.tool() !== 'eraser' || !(e.buttons & 1) || !renderedPose || tour.on || held) return false;
    if (!hitGrab(renderedPose, { x: e.clientX, y: e.clientY + scrollY }, 9)) return false;
    if (performance.now() - erasedAt > 3500) {
      erasedAt = performance.now(); hop();
      say('erased', ERASED[erasedCount++ % ERASED.length]); hushLater('erased', 3000);
    }
    return true;
  }
  document.addEventListener('pointermove', erasedOn, { capture: true, passive: true });
  spotButton.addEventListener('pointerdown', e => {
    if (erasedOn(e)) { e.preventDefault(); return; }
    if (buttonScene || e.button !== 0 || tour.on || heroic() || !e.target.dataset.grabPart) return;
    // Wide hit strokes can overlap on this tiny figure. Pick the nearest real
    // bone rather than whichever transparent SVG path happens to be on top.
    const grip = hitGrab(renderedPose, { x: e.clientX, y: e.clientY + scrollY }, 7);
    if (!grip) return;
    e.preventDefault(); dragged = false;
    // Snapshot the visible pose before he can take another walking step.
    lift = { id: e.pointerId, x: e.clientX, y: e.clientY, clientY: e.clientY,
      grip, pose: structuredClone(renderedPose), offsetX: grip.point.x - e.clientX, offsetY: grip.point.y - e.clientY - scrollY };
    spotButton.setPointerCapture(e.pointerId);
  });
  spotButton.addEventListener('pointermove', e => {
    if (!lift || e.pointerId !== lift.id) return;
    if (!held) { if (Math.hypot(e.clientX - lift.x, e.clientY - lift.y) < 6) return; dragged = true; pickUp(lift.grip, lift.pose); }
    lift.clientY = e.clientY; lift.clientX = e.clientX;
    held.pointer = { x: e.clientX + lift.offsetX, y: e.clientY + scrollY + lift.offsetY }; api.wake(.5);
  });
  const letGo = e => {
    if (!lift || e.pointerId !== lift.id) return;
    const id = lift.id; lift = null; if (held) drop();
    if (spotButton.hasPointerCapture(id)) spotButton.releasePointerCapture(id);
  };
  spotButton.addEventListener('pointerup', letGo); spotButton.addEventListener('pointercancel', letGo);
  spotButton.addEventListener('lostpointercapture', letGo);
  addEventListener('blur', () => { if (lift) letGo({ pointerId: lift.id }); });
  addEventListener('scroll', () => {
    if (held && lift) { held.pointer = { x: lift.clientX + lift.offsetX, y: lift.clientY + scrollY + lift.offsetY }; api.wake(.5); }
  }, { passive: true });
  spotButton.addEventListener('click', () => {
    if (dragged) { dragged = false; return; }
    // Mid-flight a click would start the tour with its speech held back, leaving him silently
    // in tour mode (and no longer grabbable) once he lands. Flights ignore clicks instead.
    if (buttonScene || heroic() || jump?.flight) return;
    hop();
    if (tour.on) { if (bubble.hidden && lastSay) say(...lastSay); else hush(); return; }
    if (!introduced) { startTour(); return; }
    if (cape?.state === 'waiting') { showAsk(); return; }
    if (buttonQuest==='waiting') { showButtonAsk(); return; }
    const actions=[['Say hello again',startTour,true]];
    if(sketchReader.available())actions.push(['Read my writing',offerReading]);
    else actions.push(['What can you spot?',showLibrary]);
    say('poke', '', actions);
  });

  // ── Tool tutorials ─────────────────────────────────────────────
  function closeTip() { tipBox.hidden = true; tipFor = null; }
  function tip(tool, anchor) {
    if (tipFor === tool) { closeTip(); return; }
    const [title, text] = TIPS[tool];
    tipBox.replaceChildren();
    make('strong', '', tipBox).textContent = title;
    make('p', '', tipBox).textContent = text;
    tipBox.hidden = false; tipFor = tool;
    typesetText(tipBox.querySelector('p'));
    const r = anchor.getBoundingClientRect(), w = tipBox.offsetWidth;
    // Beside a side toolbar, or above a bottom one on phones.
    if (r.right > innerWidth * 2 / 3 && innerWidth > 600) { tipBox.style.left = `${r.left - w - 14}px`; tipBox.style.bottom = `${Math.max(12, innerHeight - r.bottom - 10)}px`; }
    else { tipBox.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`; tipBox.style.bottom = `${innerHeight - r.top + 12}px`; }
  }
  document.addEventListener('pointerdown', e => { if (tipFor && !e.target.closest('.paper-tip,.paper-help')) closeTip(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') closeTip(); });

  // ── Drawing ────────────────────────────────────────────────────
  function inkLine(ctx, x0, x1, y) {
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#45453e';
    for (const [w, a, dy] of [[1.7, .8, 0], [.7, .3, .9]]) {
      ctx.lineWidth = w; ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(x0, y + dy);
      for (let x = x0 + 6; x < x1; x += 6) ctx.lineTo(x, y + dy + Math.sin(x * .31) * .5);
      ctx.lineTo(x1, y + dy); ctx.stroke();
    }
    ctx.restore();
  }
  // Keep the renderer's hook while leaving scrolling entirely with the visitor.
  function follow() {}
  // `alpha` is how far the clock has run past the last physics step (0..1).
  function draw(ctx, alpha = 1, inView = () => true) {
    if(buttonScene?.state==='glass') { updateHitFigure(null,body); return; }
    const list = surfaces();
    if (at === 'home' || jump?.surface === 'home') inkLine(ctx, geo.left + HOME.x0 * geo.w, geo.left + HOME.x1 * geo.w, geo.top + HOME.y * geo.h);
    // Pin practice: a red dotted ring round one of his pins shows which to click. It picks the pin
    // nearest the middle of the screen that his speech bubble isn't covering.
    if (tour.on && tour.waiting === 'string' && !toolShow?.moving) {
      const best = practicePin();
      if (best && inView(best.y - 30, best.y + 10, 40)) {
        ctx.save(); ctx.strokeStyle = '#d0282e'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.setLineDash([1, 5]); ctx.lineDashOffset = api.reduced.matches ? 0 : -clock * 12;
        ctx.beginPath(); ctx.ellipse(best.x, best.y - 10, 17, 19, api.reduced.matches ? -.12 : -.12 + Math.sin(clock * 1.8) * .18, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
    if (ring && tour.on && !jump) {
      ctx.save(); ctx.strokeStyle = '#6a685c'; ctx.lineWidth = 1.1; ctx.globalAlpha = .75; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -clock * 6;
      ctx.beginPath(); ctx.ellipse(ring.x, ring.y - 14, 92, 66, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // The figure, blended from where he was a step ago unless he changed surface since.
    const same = !held && before && before.at === at && before.jump === jump;
    const pos = same ? mix(before.position, position, alpha) : position;
    const shown = same ? { x: mix(before.x, body.x, alpha), y: mix(before.y, body.y, alpha) } : body;
    if (platform) drawPlatform(ctx);
    jetSmoke.draw(ctx, inView);
    const ropes = list.find(s => s.id === at)?.ropes;
    let pose = null, frame = null, mode = 'show';
    if (toolShow) pose = toolShow.pose(alpha);
    else if (heroic()) { pose = heroFigure(shown); mode = 'hero'; }
    else if (held) { pose = grabPose(held); mode = 'held'; }
    else if (air) mode = 'air', pose = !tour.on && !air.quiet ? fallingPose(body, air.t, facing,
      air.rig ? grabPose(air.rig) : airPose(body, air.vy < 0 ? .25 : .85, facing)) :
      air.rig ? grabPose(air.rig) : airPose(body, air.vy < 0 ? .25 : .85, facing);
    else if (jump) mode = jump.flight || 'jump', pose = jump.flight === 'jetpack' ? jetpackPose(shown, clock, facing, jump.t)
      : airPose(shown, jump.flight ? .85 : same ? mix(before.t, jump.t, alpha) : jump.t, facing);
    else if (ropes) {
      pose = figurePose(ropes, pos, same ? mix(before.phase, phase, alpha) : phase, gait, facing, crawl, slide);
      frame = courseFrame(ropes, pos); mode = 'rope';
      if (phone && pose) {
        pose = translatePose(pose, facing * phone.beyond, 0);
        pose.head.x += facing * 3; pose.head.y += 3;
        for (let i = 0; i < pose.arms.length; i++) {
          const arm = pose.arms[i];
          arm.root = { ...pose.shoulder };
          arm.joint = { x: pose.shoulder.x + facing * (5 + i), y: pose.shoulder.y + 10 };
          arm.end = { x: pose.shoulder.x + facing * 12, y: pose.shoulder.y + 7 + i * 2 + Math.sin(clock * 5) * .4 };
        }
        mode = 'phone';
      }
      if (pose && waveUntil > clock && !moving) { waveArm(pose, clock); mode = 'wave'; }
    }
    if(pose && buttonScene?.state==='press') {
      const t=buttonScene.t;
      // Coil, jump clear, then stomp the cap before the fuse catches.
      const lift=api.reduced.matches?0:t<.22?Math.sin(t/.22*Math.PI)*4:t<.78?-34*Math.sin((t-.22)/.56*Math.PI):Math.sin(Math.min(1,(t-.78)/.2)*Math.PI)*7;
      pose=translatePose(pose,0,lift);
      for(const arm of pose.arms) {
        arm.root={...pose.shoulder};
        arm.joint={x:pose.shoulder.x+facing*9,y:pose.shoulder.y+(lift<0?-8:7)};
        arm.end={x:pose.shoulder.x+facing*14,y:pose.shoulder.y+(lift<0?-15:13)};
      }
    }
    if (jump?.entryPose && pose) {
      pose = turnPose(translatePose(jump.entryPose, shown.x-jump.from.x, shown.y-jump.from.y),
        pose, jump.t*jump.dur/.32);
    }
    // Walk to hop, a catch, a landing, a wave, turning round, the end of the tour: any change of
    // state eases out of the pose last drawn (carried along with him) instead of cutting to the new one.
    if (pose) {
      const key = `${mode}|${facing}`;
      if (drawn && drawn.key !== key && !api.reduced.matches)
        xf = { pose: drawn.pose, x: drawn.x, y: drawn.y, t: clock, dur: drawn.key.startsWith('show') ? .45 : .2 };
      if (xf && clock - xf.t < xf.dur) pose = turnPose(translatePose(xf.pose, shown.x - xf.x, shown.y - xf.y), pose, (clock - xf.t) / xf.dur);
      else xf = null;
      drawn = { pose, key, x: shown.x, y: shown.y };
    } else drawn = null;
    if (toolShow) ctx = toolShow.context(pose);
    // Before he is clicked the invitation rides above his head while he walks or stands, and
    // steps aside whenever he is lifted, falling, jumping or flying.
    if (!introduced && invited && !tour.on) {
      const calm = mode === 'rope' || mode === 'wave' || mode === 'phone';
      if (calm && bubble.hidden) say('welcome', 'Welcome to Max’s portfolio! Make yourself at home. Click me to learn more about the page.');
      else if (!calm && bubbleKey === 'welcome') hush();
    }
    placeUi(shown.x, shown.y, !!(tour.on && goal && goal.point.y < body.y - 40));
    updateHitFigure(pose, shown);
    if (!pose || !inView(shown.y - (jump?.flight ? 100 : 0), shown.y, 60)) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // All in black ink; the far limbs are only a touch thinner.
    const limb = (l, back) => {
      ctx.strokeStyle = INK; ctx.lineWidth = back ? 1.45 : 1.7;
      ctx.beginPath(); ctx.moveTo(l.root.x, l.root.y); ctx.lineTo(l.joint.x, l.joint.y); ctx.lineTo(l.end.x, l.end.y); ctx.stroke();
    };
    // Scuff marks trailing a slide, drawn up the line from where he sits on it.
    if (frame && slide > .5 && moving) {
      const up = frame.ty <= 0 ? 1 : -1, ax = frame.tx * up, ay = frame.ty * up, seat = frame;
      ctx.strokeStyle = '#6a685c'; ctx.lineWidth = .8;
      [[-2.2, 7, .5], [0, 12, .38], [2.2, 6, .3]].forEach(([off, len, alpha], k) => {
        const sx = seat.x + ay * off + ax * (3 + k * 2), sy = seat.y - ax * off + ay * (3 + k * 2);
        ctx.globalAlpha = alpha; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + ax * len, sy + ay * len); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    const sinceHop = clock - hopAt;
    if (hopAt >= 0 && sinceHop < HOP && !held) ctx.translate(0, -Math.sin(sinceHop / HOP * Math.PI) * 9);
    // Off the slingshot he tumbles: one full somersault on the way up.
    if (jump?.fling) { const turn = Math.min(1, jump.t * 1.4) * Math.PI * 2 * facing; ctx.translate(pose.hip.x, pose.hip.y); ctx.rotate(turn); ctx.translate(-pose.hip.x, -pose.hip.y); }
    // No paper mask under his body in flight: on the ruled sheet it read as a white outline.
    if (jump?.flight) drawFlightGear(ctx, pose, jump.flight, jump.t, clock, facing, jump.flight === 'jetpack');
    if (cape?.state === 'fly') drawWhoosh(ctx, shown, cape.heading, Math.sin(Math.PI * Math.min(1, cape.t / cape.dur)));
    const look = capeLook();
    if (look) drawCape(ctx, pose, { facing, clock, ...look });
    limb(pose.legs[1], true); limb(pose.arms[1], true);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(pose.hip.x, pose.hip.y); ctx.lineTo(pose.shoulder.x, pose.shoulder.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(pose.head.x, pose.head.y, 4.3 * (toolShow?.scale ?? 1), 0, Math.PI * 2); ctx.stroke();
    limb(pose.legs[0], false); limb(pose.arms[0], false);
    if (phone) {
      const hand = pose.arms[0].end;
      ctx.save(); ctx.translate(hand.x, hand.y - 3); ctx.rotate(facing * .2);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = .9;
      ctx.beginPath(); ctx.rect(-3, -5, 6, 10); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-1.5, -3); ctx.lineTo(1.5, -3); ctx.moveTo(-.8, 3); ctx.lineTo(.8, 3); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  // Keeps the bubble and the click target on him, in page coordinates. Only the
  // bubble's side depends on the viewport: below him when above would hit the header.
  let ui = null;
  const written = new WeakMap();
  function updateHitFigure(pose, shown) {
    if (!pose) { renderedPose = null; hitFigure.style.display = 'none'; return; }
    hitFigure.style.display = '';
    const sinceHop = clock - hopAt;
    const hop = hopAt >= 0 && sinceHop < HOP && !held ? -Math.sin(sinceHop / HOP * Math.PI) * 9 : 0;
    const turn = jump?.fling ? Math.min(1, jump.t * 1.4) * Math.PI * 2 * facing : 0;
    const point = p => {
      const dx = p.x - pose.hip.x, dy = p.y - pose.hip.y;
      return { x: pose.hip.x + dx * Math.cos(turn) - dy * Math.sin(turn),
        y: pose.hip.y + dx * Math.sin(turn) + dy * Math.cos(turn) + hop };
    };
    renderedPose = { hip: point(pose.hip), shoulder: point(pose.shoulder), head: point(pose.head),
      arms: pose.arms.map(l => ({ root: point(l.root), joint: point(l.joint), end: point(l.end) })),
      legs: pose.legs.map(l => ({ root: point(l.root), joint: point(l.joint), end: point(l.end) })) };
    const local = p => `${p.x - shown.x + 17},${p.y - shown.y + 46}`;
    for (const path of hitParts) {
      const part = path.dataset.grabPart;
      if (part === 'torso') path.setAttribute('d', `M${local(renderedPose.hip)}L${local(renderedPose.shoulder)}`);
      else {
        const [kind, side] = part.split('-'), l = renderedPose[kind][Number(side)];
        path.setAttribute('d', `M${local(l.root)}L${local(l.joint)}L${local(l.end)}`);
      }
    }
    hitHead.setAttribute('cx', renderedPose.head.x - shown.x + 17);
    hitHead.setAttribute('cy', renderedPose.head.y - shown.y + 46);
  }
  // This runs every frame, so skip style writes that would change nothing.
  function setStyle(node, prop, value) {
    let seen = written.get(node); if (!seen) written.set(node, seen = {});
    if (seen[prop] !== value) node.style[prop] = seen[prop] = value;
  }
  function clearDemoTop(left, top, width, height) {
    const demos = [...document.querySelectorAll('.project .demo')]
      .map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => ({left:rect.left + scrollX, right:rect.right + scrollX,
        top:rect.top + scrollY, bottom:rect.bottom + scrollY}));
    return liftBubbleAboveDemos({left,top,width,height}, demos);
  }
  function placeUi(x, y, below) {
    ui = { x, y, below };
    setStyle(spotButton, 'transform', `translate(${x - 17}px,${y - 46}px)`);
    if (bubble.hidden) return;
    const { w, h } = bubbleSize;
    bubble.classList.toggle('is-tools', !!toolShow);
    if (toolShow) {
      const left = Math.max(12, x - w - 30);
      const top = clearDemoTop(left, Math.max(scrollY + 76, Math.min(scrollY + innerHeight - h - 20, y - 32 - h / 2)), w, h);
      bubble.classList.remove('is-below');
      setStyle(tail, 'left', `${w + 9}px`);
      setStyle(tail, 'top', `${Math.max(20, Math.min(h - 20, y - 32 - top))}px`);
      setStyle(bubble, 'transform', `translate(${Math.round(left)}px,${Math.round(top)}px)`);
      return;
    }
    setStyle(tail, 'top', '');
    // The side (above or below him) is picked when a line starts and only changes once the
    // other side is clearly needed, so a bob near the header can't flip it back and forth.
    const room = y - scrollY - 58 - h;
    if (bubbleSide === null) bubbleSide = !below && room > 64 ? 'above' : 'below';
    else if (bubbleSide === 'above' && (below || room < 40)) bubbleSide = 'below';
    else if (bubbleSide === 'below' && !below && room > 100) bubbleSide = 'above';
    let above = bubbleSide === 'above';
    const left = Math.max(12, Math.min(document.documentElement.clientWidth - w - 12, x - w / 2));
    const desiredTop = above ? y - 58 - h : y + 20;
    const top = clearDemoTop(left, desiredTop, w, h);
    if (top < desiredTop) { above = true; bubbleSide = 'above'; }
    bubble.classList.toggle('is-below', !above);
    // It eases after him rather than snapping to every step and string bounce, then settles
    // on whole pixels (a fractional offset smears the handwriting).
    const now = performance.now(), k = tour.on ? 1 : bubbleAt ? 1 - Math.exp(-Math.min(.1, (now - bubbleAt.time) / 1000) * 12) : 1;
    bubbleAt = bubbleAt ? { x: mix(bubbleAt.x, left, k), y: mix(bubbleAt.y, top, k), time: now } : { x: left, y: top, time: now };
    const settled = Math.abs(bubbleAt.x - left) < .5 && Math.abs(bubbleAt.y - top) < .5;
    const bx = settled ? Math.round(left) : bubbleAt.x;
    // Easing may cross a demo even when the destination is clear. Lift immediately.
    const by = clearDemoTop(bx, settled ? Math.round(top) : bubbleAt.y, w, h);
    bubbleAt.y = by;
    if (by < (above ? y - 58 - h : y + 20)) bubble.classList.remove('is-below');
    setStyle(tail, 'left', `${Math.max(24, Math.min(w - 26, x - bx))}px`);
    setStyle(bubble, 'transform', `translate(${bx.toFixed(1)}px,${by.toFixed(1)}px)`);
    if (!settled) api.wake(.2);
  }
  const place = () => {
    if (toolShow) { body = toolShow.step(0); api.wake(.2); placeUi(body.x, body.y, false); }
    else if (ui && !bubble.hidden) placeUi(ui.x, ui.y, ui.below);
  };

  // ── Wiring ─────────────────────────────────────────────────────
  function remarkOnMusic() {
    if (projectFocus) return;
    if (buttonScene || tour.on || held || air || jump?.flight || document.hidden || !readable(body.y)) return;
    const lines = [
      'Finally, a soundtrack. My dramatic entrances were getting awkward.',
      'Good. Now my questionable decisions have background music.',
      'Music! That’s the entertainment budget gone. I’m still working for exposure.'
    ];
    musicRemarkPending = false;
    say('music', lines[musicRemarkIndex++ % lines.length], [], true);
    hushLater('music', 6500);
  }
  addEventListener('portfolio:music-started', e => {
    if (projectFocus) return;
    if (!e.detail?.stickothy) lofiStarted = true;
    if (djPicked) { djPicked = false; return; } // his own pick: he says his piece himself
    if (musicRemarkRequested) return;
    musicRemarkRequested = true; musicRemarkPending = true;
    if (!tour.on && !held && !air && !jump && !readable(body.y)) go(roamTarget(false), 0, true);
    remarkOnMusic(); api.wake(2);
  });
  // What he can recognize from the pencil, a few examples at a time.
  function showLibrary() {
    say('library', libraryHint(), [['Got it', hush, true]]);
  }
  function offerReading() {
    say('read-offer','I can try reading your latest word or short line. Your drawing stays in this browser.',
      [['Read this line',()=>sketchReader.read(),true],['Cancel',hush]]);
  }
  function aside(key, text) {
    if (projectFocus) return;
    const count = (actionComments.get(key) || 0) + 1; actionComments.set(key, count);
    if (buttonScene || !introduced || count % 3 || tour.on || document.hidden || air || jump || heroic() || cape?.state === 'waiting' || !bubble.hidden || performance.now() < asideAt || !readable(body.y)) return;
    asideAt = performance.now() + SPEECH_GAP;
    say(key, text); hushLater(key, 4500);
  }
  function changed(kind) {
    if(buttonScene && (kind==='resize' || !buttonScene.strokes.every(s=>api.strokes().includes(s)))) {
      buttonScene.effect?.destroy(); buttonScene=null; spotButton.style.visibility='';
      platform=null; jump=null; deferredSpeech=null; drawn=null; xf=null; at='home'; position=.5;
      body=pointAt(home,position); hush();
    }
    if(kind==='erase'||kind==='resize'||(kind==='edit'&&!sketchReader.available()))sketchReader.invalidate();
    if (kind === 'erase') aside('erasing', 'Ah. The creative process has entered denial.');
    surfaceCache = null;
    if (kind === 'resize') {
      layout(); strokeCourses = new WeakMap();
    }
    // Erasing splits strokes and a resize rebuilds strings; neither is something new to visit.
    if (kind === 'erase' || kind === 'resize') { pendingButton=null; surfaces().forEach(s => known.add(s.id)); }
    // Rubbed out or undone while he was on his way to wear it.
    if (cape?.state === 'fetch' && !cape.strokes.some(s => api.strokes().includes(s))) lostCape();
    needDecide = true; decideAt = clock + .12;
    if (kind === 'edit') setTimeout(visitNew, 300);
    api.invalidate();
  }
  // Demos and images load after the page does; keep the frame edges on the frames.
  new ResizeObserver(() => changed('resize')).observe(document.body);
  function busy() { return !!(phone || buttonScene || (tour.on && tour.waiting === 'string' && !api.reduced.matches) || xf || jetSmoke.active || toolShow?.moving || walk || jump || velocity || held || air || finale || (platform && (platform.drawing || platform.fade > 0 || platform.t < .7)) || waveUntil > clock || clock - hopAt < HOP || ['equip', 'fly', 'shed'].includes(cape?.state)); }

  layout();
  const first = api.ropes()[0];
  if (first) { at = idOf(first, 'rope'); position = .12; body = pointAt([first], position); }
  else { at = 'home'; position = .5; body = pointAt(home, position); }
  surfaces().forEach(s => known.add(s.id));
  const landingIntro = document.querySelector('.curiosity-intro');
  const scheduleWelcome = () => setTimeout(() => { if (!introduced) greet(); }, 3000);
  if (landingIntro && landingIntro.dataset.entranceComplete !== 'true') {
    landingIntro.addEventListener('curiosity:entrance-complete', scheduleWelcome, { once: true });
  } else {
    scheduleWelcome();
  }
  return { step, draw, follow, place, changed, notice, tip, busy, startTour, launch, blockWithInk };
}
