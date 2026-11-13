// Everything Stickothy can recognize from the pencil, and what he says about it.
// Drawings are templates in a 0..100 box (y down), each a list of strokes; several
// templates may share a name for the different ways people draw the same thing.
// Stroke order and direction don't matter to the matcher, only where the ink lies.
// `min`/`max` bound how many strokes it takes: a smiley needs its eyes lifted off the
// page, and a check mark is never ten strokes. That keeps plain paths from matching.
// `match` loosens the score needed for a few that people draw less consistently.

const arc = (cx, cy, rx, ry, from, to, steps = 28) => Array.from({ length: steps + 1 }, (_, i) => {
  const a = (from + (to - from) * i / steps) * Math.PI / 180;
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
});
const ring = (cx, cy, rx, ry = rx) => arc(cx, cy, rx, ry, 0, 360, 36);
const dot = (x, y) => [[x, y], [x + .4, y + .4]];
const curve = (steps, f) => Array.from({ length: steps + 1 }, (_, i) => f(i / steps));
const turn = (strokes, degrees) => {
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return strokes.map(st => st.map(([x, y]) => [50 + (x - 50) * c - (y - 50) * s, 50 + (x - 50) * s + (y - 50) * c]));
};

const heart = curve(48, t => {
  const a = t * Math.PI * 2, x = 16 * Math.sin(a) ** 3;
  const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
  return [50 + x * 2.9, 48 + y * 2.9];
});
const starPoint = (k, r) => { const a = (-90 + k * 36) * Math.PI / 180; return [50 + Math.cos(a) * r, 54 + Math.sin(a) * r]; };
const arrowRight = [[[4, 50], [96, 50]], [[72, 28], [96, 50], [72, 72]]];
const petal = angle => {
  const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return arc(0, 0, 13, 7, 0, 360, 20).map(([x, y]) => [50 + (x + 22) * c - y * s, 38 + (x + 22) * s + y * c]);
};

export const DRAWINGS = [
  // All four button proportions: wide, square, loose/off-centre, and tall plunger.
  // Recognition fits the two rectangles geometrically rather than requiring a template copy.
  { name: 'button', min: 2, max: 8, templates: [
      [[[0, 45], [100, 45], [100, 75], [0, 75], [0, 45]], [[27, 45], [27, 25], [73, 25], [73, 45], [27, 45]]],
      [[[15, 45], [85, 45], [85, 100], [15, 100], [15, 45]], [[30, 45], [30, 10], [65, 10], [65, 45], [30, 45]]],
      [[[0, 48], [100, 45], [98, 80], [2, 78], [0, 48]], [[37, 46], [38, 25], [77, 24], [76, 46], [37, 46]]],
      [[[0, 65], [100, 65], [100, 95], [0, 95], [0, 65]], [[35, 65], [35, 5], [65, 5], [65, 65], [35, 65]]]],
    replies: ['A button! That looks dangerously pressable.', 'A button. Surely pressing it would be a sensible decision.'] },
  { name: 'heart', templates: [[heart]],
    replies: ['A heart! Careful, I’m only two-dimensional. I fall hard.', 'Is that for me? I don’t know what to say. I’m mostly graphite.'] },
  { name: 'star', match: .036, templates: [
      [Array.from({ length: 6 }, (_, k) => starPoint(k * 4, 47))],
      [Array.from({ length: 11 }, (_, k) => starPoint(k, k % 2 ? 19 : 47))]],
    replies: ['A star! Gold star for you, then.', 'You drew a star. I’d climb it, but the points look sharp.'] },
  { name: 'smiley face', min: 3, match: .034, templates: [
      [ring(50, 50, 45), [[35, 33], [35, 41]], [[65, 33], [65, 41]], arc(50, 52, 24, 22, 20, 160)],
      [ring(50, 50, 45), dot(35, 37), dot(65, 37), arc(50, 54, 22, 18, 15, 165)]],
    replies: ['A smiley face! Hello to you too.', 'That face is smiling at me. I’ll allow it.'] },
  { name: 'sun', min: 5, templates: [
      [ring(50, 50, 20), ...Array.from({ length: 8 }, (_, k) => {
        const a = k * Math.PI / 4; return [[50 + Math.cos(a) * 28, 50 + Math.sin(a) * 28], [50 + Math.cos(a) * 47, 50 + Math.sin(a) * 47]];
      })]],
    replies: ['A sun! Finally, some daylight on this page.', 'Sunshine. I’d put on sunscreen, but I’d smudge.'] },
  { name: 'house', templates: [
      [[[20, 46], [20, 92], [80, 92], [80, 46], [20, 46]], [[12, 48], [50, 10], [88, 48]]],
      [[[20, 46], [20, 92], [80, 92], [80, 46], [20, 46]], [[12, 48], [50, 10], [88, 48]], [[43, 92], [43, 70], [57, 70], [57, 92]]]],
    replies: ['A house! Is it mine? I’ve been sleeping on a line.', 'Nice house. Does it come with a ledge?'] },
  { name: 'tree', match: .034, templates: [
      [[[50, 4], [84, 70], [16, 70], [50, 4]], [[44, 70], [44, 96]], [[56, 70], [56, 96]]],
      [ring(50, 34, 30), [[40, 61], [40, 97], [60, 97], [60, 61]]]],
    replies: ['A tree! Can I climb it? I’m very good at climbing.', 'That’s a tree. I’ll be in the shade if anyone needs me.'] },
  { name: 'arrow', max: 3, match: .024, templates: [0, 90, 180, 270].map(d => turn(arrowRight, d)),
    replies: ['An arrow. Subtle. Where am I going?', 'Pointing me somewhere? I respond better to snacks.'] },
  { name: 'lightning bolt', max: 2, templates: [[[[62, 0], [30, 52], [58, 48], [36, 100]]]],
    replies: ['Lightning! I’m a pencil drawing. Please don’t.', 'A lightning bolt. Very dramatic. I approve.'] },
  { name: 'check mark', max: 2, templates: [[[[8, 56], [36, 86], [92, 12]]]],
    replies: ['A check mark. Done and done.', 'Checked. I’ll pretend I did that.'] },
  { name: 'X', min: 2, match: .05, templates: [[[[10, 10], [90, 90]], [[90, 10], [10, 90]]]],
    replies: ['X marks the spot. Should I start digging?', 'An X. Is that a treasure map or a no?'] },
  { name: 'spiral', max: 2, templates: [[curve(60, t => {
      const a = t * Math.PI * 6, r = 3 + t * 44; return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
    })]],
    replies: ['A spiral! I’m getting dizzy just looking at it.', 'Round and round. Please don’t make me walk that.'] },
  { name: 'moon', templates: [[arc(50, 50, 45, 45, 50, 310), arc(95, 50, 38, 38, 245, 115)], [arc(50, 50, 45, 45, -130, 130), arc(5, 50, 38, 38, -65, 65)]],
    replies: ['A moon. Is it bedtime already?', 'The moon! I’ll howl quietly.'] },
  { name: 'fish', templates: [[ring(42, 50, 30, 18), [[70, 50], [94, 30], [94, 70], [70, 50]]], [ring(58, 50, 30, 18), [[30, 50], [6, 30], [6, 70], [30, 50]]]],
    replies: ['A fish! I can’t swim. I’m paper.', 'That fish looks like it’s going places.'] },
  { name: 'cloud', templates: [[[...arc(24, 62, 14, 14, 90, 270, 12), ...arc(44, 44, 20, 20, 200, 330, 14), ...arc(70, 50, 17, 17, 240, 360, 12), ...arc(82, 64, 10, 10, 270, 450, 10), [24, 76]]]],
    replies: ['A cloud. I’ll keep an eye on the forecast.', 'Fluffy. Is it going to rain on my lines?'] },
  { name: 'flower', min: 2, templates: [[ring(50, 38, 9), ...[0, 60, 120, 180, 240, 300].map(petal), [[50, 47], [50, 98]]]],
    replies: ['A flower! For me? You shouldn’t have.', 'Pretty flower. I’d smell it, but I don’t have a nose.'] },
  { name: 'stick figure', min: 2, templates: [
      [ring(50, 15, 11), [[50, 26], [50, 62]], [[28, 44], [50, 34], [72, 44]], [[34, 96], [50, 62], [66, 96]]],
      [ring(50, 15, 11), [[50, 26], [50, 62]], [[26, 38], [74, 38]], [[34, 96], [50, 62], [66, 96]]]],
    replies: ['Hey, that’s me! You got my good side.', 'A stick figure! A friend? Finally, someone who gets me.'] },
  { name: 'music note', match: .036, templates: [[ring(32, 82, 12, 8), [[44, 80], [44, 12]], [[44, 12], [64, 28], [66, 46]]],
      [ring(24, 84, 11, 8), ring(70, 74, 11, 8), [[35, 82], [35, 18]], [[81, 72], [81, 8]], [[35, 18], [81, 8]]]],
    replies: ['A music note! Are you the one playing the music?', 'La la la. That’s all the singing you’ll get from me.'] },
  { name: 'question mark', templates: [[[...arc(50, 30, 22, 22, 190, 400, 22), [50, 56], [50, 70]], dot(50, 88)]],
    replies: ['A question mark. I have questions too. Mostly about erasers.', 'What? Don’t ask me, I just live here.'] },
  { name: 'cat', min: 3, match: .034, templates: [
      [ring(50, 58, 34), [[24, 36], [22, 8], [42, 26]], [[58, 26], [78, 8], [76, 36]], dot(38, 54), dot(62, 54)],
      [ring(50, 58, 34), [[24, 36], [22, 8], [42, 26]], [[58, 26], [78, 8], [76, 36]], [[4, 62], [30, 66]], [[70, 66], [96, 62]]]],
    replies: ['A cat! Please keep it away from my strings.', 'Kitty! I hope it doesn’t think I’m a toy.'] },
  { name: 'umbrella', templates: [[[...arc(50, 46, 45, 40, 180, 360), [5, 46]], [[50, 46], [50, 86], ...arc(42, 86, 8, 8, 0, 180, 8)]]],
    replies: ['An umbrella. Good thinking, ink runs.', 'Thanks for the umbrella. I’d hate to get washed off the page.'] },
  { name: 'mountain', max: 2, templates: [[[[0, 90], [30, 28], [50, 64], [72, 12], [100, 90]]]],
    replies: ['Mountains! I’ve been training for this.', 'I could climb those. Give me a minute. Or ten.'] },
  { name: 'wave', max: 2, match: .022, templates: [[curve(40, t => [t * 100, 50 + Math.sin(t * Math.PI * 4) * 14])]],
    replies: ['Waves! I’ll stay on the dry part of the page.', 'Surf’s up. I can’t swim, but I can watch.'] },
  { name: 'infinity sign', max: 2, templates: [[curve(60, t => {
      const a = t * Math.PI * 2, d = 1 + Math.sin(a) ** 2; return [50 + 48 * Math.cos(a) / d, 50 + 48 * Math.sin(a) * Math.cos(a) / d];
    })]],
    replies: ['Infinity. That’s how long I’ll be on this page.', 'Forever and ever. Bold of you.'] },
  { name: 'snowman', templates: [[ring(50, 70, 26), ring(50, 30, 16)], [ring(50, 72, 25), ring(50, 36, 16), dot(45, 32), dot(55, 32)]],
    replies: ['A snowman! It looks chilly.', 'Do you want to build a snowman? Oh, you did.'] },
  { name: 'balloon', templates: [[ring(50, 34, 26, 32), curve(16, t => [50 + Math.sin(t * Math.PI * 3) * 4, 66 + t * 32])]],
    replies: ['A balloon! Tie it to me and I’ll float away.', 'Don’t let go of that.'] },
  { name: 'eye', min: 2, templates: [[arc(50, 85, 52, 50, 213, 327), arc(50, 15, 52, 50, 33, 147), ring(50, 50, 13)]],
    replies: ['An eye. Are you watching me?', 'I see you seeing me.'] }
];

// Words written in capitals, letter by letter. Each word has its own answer.
export const WORDS = {
  HI: ['Hi yourself!', 'Oh, hi! You found the pencil.'],
  HELLO: ['Hello! Lovely handwriting.', 'Hello there! Want to draw me a path?'],
  HEY: ['Hey! What’s up?', 'Hey, you. Nice letters.'],
  YES: ['Yes! I agree. With what, I’m not sure.', 'A firm yes. Noted.'],
  NO: ['No? Fair enough.', 'No it is. I respect a clear answer.'],
  OK: ['OK! Glad we’re on the same page. Literally.', 'OK. Very agreeable of you.'],
  HELP: ['Help? Click me, I’ll show you the tools.', 'Don’t panic. Draw a line and I’ll walk it.'],
  STICKOTHY: ['That’s me! You spelled it right. Nobody does.', 'Stickothy! At your service.'],
  WOW: ['Wow indeed.', 'Wow! I know, I’m impressed too.'],
  LOL: ['LOL. I’m laughing on the inside. It’s graphite.', 'Glad something’s funny.'],
  COOL: ['Cool! Very cool.', 'Cool. I try to be.'],
  LOVE: ['Love! Right back at you.', 'Aw. I love you too, pencil person.'],
  BYE: ['Bye? Already? I’ll be here.', 'See you later! I’ll keep the page warm.'],
  MAX: ['Max! He made this page. And me.', 'Max. Good name. I’ve heard it before.'],
  ART: ['Art! Are you calling me art? Thank you.', 'Everything here is art if you squint.'],
  NICE: ['Nice! Thank you. I do my best.', 'Nice handwriting, too.'],
  YAY: ['Yay! Celebration time.', 'Yay! Confetti not included.'],
  WHY: ['Why? Great question. No idea.', 'Why not?'],
  HOME: ['Home. Mine’s the little line in the corner.', 'Home sweet home.'],
  PIZZA: ['Pizza! Now I’m hungry. I can’t even eat.', 'Pizza. Is that an offer?'],
  CAT: ['Cat. I prefer drawings of cats.', 'You wrote cat. Now draw one!']
};

const SHAPES = {
  circle: ['A circle! Nice and round.', 'That’s a pretty good circle. Better than mine.'],
  oval: ['An oval. A circle that relaxed a bit.', 'Oval. Egg-shaped. Are you hungry?'],
  triangle: ['A triangle! Three sides, all yours.', 'A triangle. Pointy.'],
  square: ['A square! Very fair on all sides.', 'Square. Solid choice.'],
  rectangle: ['A rectangle. Like a door. Or a phone.', 'Rectangle! Very tidy.']
};

const pick = list => list[Math.floor(Math.random() * list.length)];

// What he says about something recognized: its own lines when the library has them.
export function replyFor(recognized) {
  if (recognized.kind === 'word') {
    if (recognized.broad) return `My best guess is “${recognized.text}”.`;
    return WORDS[recognized.text] ? pick(WORDS[recognized.text]) : `I read “${recognized.text}”.`;
  }
  if (recognized.kind === 'drawing') {
    const entry = DRAWINGS.find(d => d.name === recognized.name);
    return pick(entry.replies);
  }
  return SHAPES[recognized.kind] ? pick(SHAPES[recognized.kind]) : `That looks like a ${recognized.kind}.`;
}

// A short list for when a visitor asks what he knows.
export function libraryHint() {
  const drawings = DRAWINGS.map(d => d.name), words = Object.keys(WORDS);
  const some = (list, n) => [...list].sort(() => Math.random() - .5).slice(0, n);
  const named = some(drawings, 4).map(n => `${/^[aeiouX]/i.test(n) ? 'an' : 'a'} ${n}`);
  return `I can spot ${DRAWINGS.length} drawings, like ${named.slice(0, -1).join(', ')} or ${named.at(-1)}, plus circles, squares and triangles. ` +
    `I also read ${words.length} words written in capitals, like ${some(words, 4).join(', ')}.`;
}
