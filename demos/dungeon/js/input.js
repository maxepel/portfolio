// Keyboard and mouse only: WASD/arrows move, mouse aims, click or J attacks, Space dodges,
// Q ability, 1/2/3 potions, E interacts. "pressed" is edge-triggered like Godot's
// is_action_just_pressed; each press is consumed once per frame by the game step.

const KEYS = {
  move_up: ['KeyW', 'ArrowUp'], move_down: ['KeyS', 'ArrowDown'],
  move_left: ['KeyA', 'ArrowLeft'], move_right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE'], dodge: ['Space'], ability: ['KeyQ'],
  potion_1: ['Digit1', 'Numpad1'], potion_2: ['Digit2', 'Numpad2'], potion_3: ['Digit3', 'Numpad3'],
  attack: ['KeyJ'],
};

export class Input {
  constructor(canvas) {
    this.down = new Set();        // KeyboardEvent.code currently held
    this.queued = new Set();      // actions pressed since the last consume
    this.mouse = { x: 0, y: 0, inside: false, down: false };
    this.enabled = false;
    this.codeToActions = {};
    for (const a in KEYS) for (const c of KEYS[a]) (this.codeToActions[c] ||= []).push(a);
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.down = false; });
    canvas.addEventListener('pointermove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; });
    canvas.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    canvas.addEventListener('pointerdown', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 0 && this.enabled) { this.mouse.down = true; this.queued.add('attack'); }
    });
    window.addEventListener('pointerup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onKey(e, isDown) {
    const acts = this.codeToActions[e.code];
    if (!acts) return;
    if (this.enabled) e.preventDefault();       // keep Space/arrows from scrolling the page
    if (isDown) {
      if (!this.down.has(e.code) && this.enabled) for (const a of acts) this.queued.add(a);
      this.down.add(e.code);
    } else {
      this.down.delete(e.code);
    }
  }

  held(action) { return KEYS[action].some((c) => this.down.has(c)); }

  // Godot Input.get_vector: x = right - left, y = down - up, length clamped to 1.
  moveVector() {
    const x = (this.held('move_right') ? 1 : 0) - (this.held('move_left') ? 1 : 0);
    const y = (this.held('move_down') ? 1 : 0) - (this.held('move_up') ? 1 : 0);
    const len = Math.hypot(x, y);
    return len > 1 ? [x / len, y / len] : [x, y];
  }

  // True once per press; consumes it.
  pressed(action) {
    if (this.queued.has(action)) { this.queued.delete(action); return true; }
    return false;
  }

  clear() { this.queued.clear(); this.down.clear(); this.mouse.down = false; }
}
