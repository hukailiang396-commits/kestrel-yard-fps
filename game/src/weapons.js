// Weapons, grenades and the round economy. One table owns every number, so the buy menu,
// the HUD and the sim all agree. Damage is per pellet; the sim multiplies by the hitbox
// factor (head x4, body x1, legs x0.75) and halves it against Kevlar.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'Sidewinder P9', kind: 'pistol', price: 300,
    damage: 34, headMult: 4, pellets: 1, mag: 12, reserve: 48,
    fireGap: 0.16, auto: false, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.02, range: 60,
  },
  ar: {
    id: 'ar', name: 'Longbow AR', kind: 'rifle', price: 2700,
    damage: 33, headMult: 4, pellets: 1, mag: 30, reserve: 90,
    fireGap: 0.096, auto: true, reloadTime: 1.9,
    spreadStill: 0.003, spreadMove: 0.026, range: 80,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', kind: 'smg', price: 1500,
    damage: 26, headMult: 4, pellets: 1, mag: 32, reserve: 96,
    fireGap: 0.075, auto: true, reloadTime: 1.6,
    spreadStill: 0.005, spreadMove: 0.03, range: 45,
  },
  dmr: {
    id: 'dmr', name: 'Needle DMR', kind: 'dmr', price: 4750,
    damage: 88, headMult: 4, pellets: 1, mag: 10, reserve: 30,
    fireGap: 0.55, auto: false, reloadTime: 2.4,
    spreadStill: 0.001, spreadMove: 0.02, range: 110,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher 12', kind: 'shotgun', price: 1200,
    damage: 12, headMult: 4, pellets: 8, mag: 6, reserve: 24,
    fireGap: 0.8, auto: false, reloadTime: 2.6,
    spreadStill: 0.02, spreadMove: 0.045, range: 28,
  },
};

export const GRENADES = {
  flash: { id: 'flash', name: 'Flash', price: 200, max: 2, fuse: 1.1, blindTime: 2.6, blindRange: 26 },
  smoke: { id: 'smoke', name: 'Smoke', price: 300, max: 2, fuse: 1.4, life: 14, radius: 4.5 },
  frag: { id: 'frag', name: 'Frag', price: 300, max: 2, fuse: 1.6, damage: 110, radius: 7 },
};

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500,
  lossStreakCap: 3400,
  kevlarPrice: 650,
  maxMoney: 16000,
};

export const BUY_MENU = [
  { key: '1', id: 'ar', label: 'Longbow AR', price: 2700, note: '30-rd rifle, the all-rounder' },
  { key: '2', id: 'smg', label: 'Hornet SMG', price: 1500, note: 'Fast, close quarters' },
  { key: '3', id: 'dmr', label: 'Needle DMR', price: 4750, note: 'One shot, long lanes' },
  { key: '4', id: 'shotgun', label: 'Breacher 12', price: 1200, note: '8 pellets, tunnels' },
  { key: '5', id: 'p9', label: 'Sidewinder P9', price: 300, note: 'Sidearm, 12 rounds' },
  { key: '6', id: 'flash', label: 'Flash grenade', price: 200, note: 'Blinds bots that see it' },
  { key: '7', id: 'smoke', label: 'Smoke grenade', price: 300, note: 'Blocks sight lines 14 s' },
  { key: '8', id: 'frag', label: 'Frag grenade', price: 300, note: '110 damage in 7 m' },
  { key: '9', id: 'kevlar', label: 'Kevlar vest', price: 650, note: 'Halves damage taken' },
];

// Give a fighter a fresh loadout for a round. `keep` carries the previous round's primary.
export function freshLoadout(keepWeaponId) {
  const primary = keepWeaponId && WEAPONS[keepWeaponId] ? keepWeaponId : 'p9';
  const def = WEAPONS[primary];
  return {
    weaponId: primary,
    mag: def.mag,
    reserve: def.reserve,
    cooldown: 0,
    reloadLeft: 0,
    kevlar: false,
    grenades: { flash: 0, smoke: 0, frag: 0 },
    grenadeSelected: 'frag',
    flash: 0, // muzzle flash timer (view only)
    kick: 0,
  };
}

export function equipWeapon(loadout, weaponId) {
  const def = WEAPONS[weaponId];
  if (!def) return false;
  loadout.weaponId = weaponId;
  loadout.mag = def.mag;
  loadout.reserve = def.reserve;
  loadout.cooldown = 0;
  loadout.reloadLeft = 0;
  return true;
}

// Buy during the buy phase. Returns { ok, reason } and mutates money/loadout on success.
export function buyItem(money, loadout, itemId) {
  if (itemId === 'kevlar') {
    if (loadout.kevlar) return { ok: false, reason: 'Already wearing Kevlar' };
    if (money < ECONOMY.kevlarPrice) return { ok: false, reason: 'Not enough money' };
    loadout.kevlar = true;
    return { ok: true, cost: ECONOMY.kevlarPrice };
  }
  if (GRENADES[itemId]) {
    const def = GRENADES[itemId];
    if (loadout.grenades[itemId] >= def.max) return { ok: false, reason: 'Carrying max' };
    if (money < def.price) return { ok: false, reason: 'Not enough money' };
    loadout.grenades[itemId] += 1;
    loadout.grenadeSelected = itemId;
    return { ok: true, cost: def.price };
  }
  const def = WEAPONS[itemId];
  if (!def) return { ok: false, reason: 'Unknown item' };
  if (loadout.weaponId === itemId) {
    // Top up reserve ammo for the weapon already held.
    if (money < 200) return { ok: false, reason: 'Not enough money' };
    loadout.reserve = def.reserve;
    return { ok: true, cost: 200 };
  }
  if (money < def.price) return { ok: false, reason: 'Not enough money' };
  equipWeapon(loadout, itemId);
  return { ok: true, cost: def.price };
}

export function spreadFor(def, speed, crouching, aiming) {
  const moving = Math.min(1, speed / 5.2);
  let spread = def.spreadStill + moving * def.spreadMove;
  if (crouching) spread *= 0.65;
  if (aiming) spread *= 0.7;
  return spread;
}
