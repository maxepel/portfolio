// Style-agnostic HUD (layout from the Godot kit hud.gd): HP bar, gold, weapon, Q charges,
// potion counts, boss bar, floor card, Dren's barks, an interact prompt, and the damage /
// low-HP vignette. Plain DOM over the canvas; all numbers advance with game time.
import { GameState } from './state.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(snd) {
    this.snd = snd;
    this.root = $('hud');
    this.el = {
      hpFill: $('hp-fill'), hpLabel: $('hp-label'), gold: $('gold'), weapon: $('weapon'),
      potions: $('potions'), boss: $('boss'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      card: $('card'), cardText: $('card-text'), bark: $('bark'), prompt: $('prompt'), vignette: $('vignette'),
    };
    this.pips = [];
    for (let i = 0; i < 3; i++) {
      const p = document.createElement('div');
      p.className = 'abs pip';
      p.style.left = `calc(var(--s) * ${74 + i * 26}px)`;
      $('pips').appendChild(p);
      this.pips.push(p);
    }
    this.hero = null;
    this.boss = null;
    this.cardT = 99; this.cardHold = 0;
    this.barkT = 0;
    this.vigT = 0; this.vigStrength = 0; this.heartbeat = 0;
    this.last = {};
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setBoss(foe, title) { this.boss = foe; this.el.bossName.textContent = title; }
  clearBoss() { this.boss = null; this.el.boss.classList.add('hidden'); }

  flashDamage(amount) {
    this.vigT = 0.4;
    this.vigStrength = clamp(amount / 30, 0.15, 0.5);
  }

  showCard(text, hold = 2.0) {
    this.el.cardText.textContent = text;
    this.snd.play('card', -6.0);
    this.cardT = 0;
    this.cardHold = hold;
  }

  say(text) {
    this.el.bark.textContent = `Dren: ${text}`;
    this.barkT = 2.6;
  }

  prompt(text) { this.el.prompt.textContent = text; }

  reset() {
    this.cardT = 99; this.barkT = 0; this.vigT = 0;
    this.el.card.style.opacity = 0; this.el.bark.style.opacity = 0; this.el.prompt.textContent = '';
    this.clearBoss();
  }

  setText(key, el, text) {
    if (this.last[key] !== text) { this.last[key] = text; el.textContent = text; }
  }

  update(dt) {
    const gs = GameState, e = this.el;
    const frac = clamp(gs.hp / Math.max(1, gs.maxHp), 0, 1);
    e.hpFill.style.transform = `scaleX(${frac})`;
    this.setText('hp', e.hpLabel, `HP ${gs.hp} / ${gs.maxHp}`);
    this.setText('gold', e.gold, `${gs.gold} g`);
    this.setText('weapon', e.weapon, gs.weapon().name);
    this.setText('potions', e.potions, `[1] red ${gs.potions.red}    [2] blue ${gs.potions.blue}    [3] green ${gs.potions.green}`);
    const charges = this.hero ? this.hero.abilityCharges : 3;
    this.pips.forEach((p, i) => { p.style.opacity = i < charges ? 1 : 0.2; });
    if (this.boss && this.boss.hp > 0) {
      e.boss.classList.remove('hidden');
      e.bossFill.style.transform = `scaleX(${clamp(this.boss.hp / Math.max(1, this.boss.maxHp), 0, 1)})`;
    } else {
      e.boss.classList.add('hidden');
    }
    // floor card: fade in 0.3 s, hold, fade out 0.5 s
    this.cardT += dt;
    const t = this.cardT, h = this.cardHold;
    const a = t < 0.3 ? t / 0.3 : (t < 0.3 + h ? 1 : clamp(1 - (t - 0.3 - h) / 0.5, 0, 1));
    e.card.style.opacity = a;
    if (this.barkT > 0) { this.barkT -= dt; e.bark.style.opacity = clamp(this.barkT, 0, 1); }
    this.vigT = Math.max(0, this.vigT - dt);
    let base = 0;
    if (gs.hp > 0 && gs.hp < gs.maxHp * 0.25) { this.heartbeat += dt; base = 0.12 + 0.08 * Math.abs(Math.sin(this.heartbeat * 3.0)); }
    e.vignette.style.opacity = Math.max(base, this.vigStrength * clamp(this.vigT / 0.4, 0, 1));
  }
}
