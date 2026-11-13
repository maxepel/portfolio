// Run state (the Godot GameState autoload): Dren's HP, gear, potions, and gold, plus a
// small run log. No save file: every launch is a fresh run.

const BASE_MAX_HP = 100;

// Reach is in metres (the 2D px values / 48), arc in radians.
export const WEAPONS = {
  sword: { name: 'Chipped Sword', damage: 18, cooldown: 0.45, reach: 1.21, arc: 1.5, stun: 0.0 },
  daggers: { name: 'Dual Daggers', damage: 11, cooldown: 0.22, reach: 1.0, arc: 1.3, stun: 0.0 },
  warhammer: { name: 'Warhammer', damage: 34, cooldown: 0.8, reach: 1.25, arc: 1.7, stun: 0.6 },
  spear: { name: 'Spear', damage: 20, cooldown: 0.5, reach: 1.92, arc: 0.7, stun: 0.0 },
};

const ARMORS = {
  leather: { name: 'Patched Leather', bonus_hp: 0, reduction: 0 },
  plate: { name: "Hero's Plate", bonus_hp: 20, reduction: 1 },
};

export const GameState = {
  maxHp: BASE_MAX_HP,
  hp: BASE_MAX_HP,
  gold: 0,
  weaponId: 'sword',
  armorId: 'leather',
  abilities: ['dodge'],
  potions: { red: 2, blue: 0, green: 0 },
  upgradesTaken: {},
  runTime: 0,
  floorsCleared: 0,
  bossesKilled: [],
  deaths: 0,
  kills: {},
  events: [],

  startFreshRun() {
    this.gold = 0;
    this.runTime = 0;
    this.floorsCleared = 0;
    this.bossesKilled = [];
    this.deaths = 0;
    this.kills = {};
    this.events = [];
    this.resetRun();
  },

  resetRun() {
    this.maxHp = BASE_MAX_HP;
    this.hp = this.maxHp;
    this.weaponId = 'sword';
    this.armorId = 'leather';
    this.abilities = ['dodge'];
    this.potions = { red: 2, blue: 0, green: 0 };
    this.upgradesTaken = {};
    this.applyArmorBonus();
  },

  weapon() { return WEAPONS[this.weaponId]; },
  armor() { return ARMORS[this.armorId]; },
  damageReduction() { return this.armor().reduction; },
  hasAbility(a) { return this.abilities.includes(a); },

  takeUpgrade(biomeId, choice) {
    this.upgradesTaken[biomeId] = choice.name ?? '?';
    if (choice.kind === 'weapon') this.weaponId = choice.id;
    else if (choice.kind === 'armor') { this.armorId = choice.id; this.applyArmorBonus(); }
    else if (choice.kind === 'ability' && !this.abilities.includes(choice.id)) this.abilities.push(choice.id);
    this.logEvent(`upgrade ${biomeId} -> ${choice.name ?? '?'}`);
  },

  equipPlate() { this.armorId = 'plate'; this.applyArmorBonus(); },

  applyArmorBonus() {
    this.maxHp = BASE_MAX_HP + this.armor().bonus_hp;
    this.hp = Math.min(this.hp, this.maxHp);
  },

  heal(amount) { this.hp = Math.min(this.maxHp, Math.max(0, this.hp + amount)); },
  count(key) { this.kills[key] = (this.kills[key] || 0) + 1; },

  // One line in the run log, also read by the headless test.
  logEvent(text) {
    const line = `[kit] ${this.runTime.toFixed(1).padStart(6)}s ${text}`;
    this.events.push(line);
    if (this.events.length > 400) this.events.shift();
  },
};
