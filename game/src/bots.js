// Bot AI: waypoint routes, holds, rotations, plant/defuse, and firefights. Bots only ever
// travel on the waypoint graph, so they never walk through a wall; their decisions are a
// small state machine fed by what they can see (vision cone + line of sight + smoke) and
// what they hear (gunfire within 30 m). Difficulty lives in two numbers: reaction time
// (350–600 ms before the first shot) and hit chance, which falls with distance and with
// how fast the target moves.
import { WEAPONS } from './weapons.js';
import { findPath, nearestWaypoint, WAYPOINTS } from './world.js';

export const BOT_NAMES = {
  vanguard: ['Falcon', 'Harrier', 'Osprey', 'Merlin'],
  sentinel: ['Warden', 'Bulwark', 'Sentry', 'Aegis', 'Rampart'],
};

const BOT_SPEED = 3.9;
const VISION_RANGE = 55;
const VISION_HALF_ANGLE = 1.05; // ~60 degrees each side
const HEAR_RANGE = 30;
const EYE = 1.5;

function botWeapon(round, index) {
  if (round <= 1) return index % 2 === 0 ? 'smg' : 'p9';
  const pool = ['ar', 'smg', 'ar', 'dmr', 'shotgun'];
  return pool[(round + index) % pool.length];
}

export function makeBot(team, index, spawn, round) {
  const weaponId = botWeapon(round, index);
  const def = WEAPONS[weaponId];
  return {
    id: `${team}-${index}`,
    team,
    isPlayer: false,
    name: BOT_NAMES[team][index % BOT_NAMES[team].length],
    x: spawn.x,
    z: spawn.z,
    yaw: spawn.yaw,
    hp: 100,
    alive: true,
    weaponId,
    mag: def.mag,
    reserve: def.reserve,
    kevlar: round > 2 && index % 2 === 0,
    speed: BOT_SPEED * (0.92 + Math.random() * 0.16),
    state: team === 'sentinel' ? 'hold' : 'route',
    path: [],
    pathI: 0,
    holdT: 0,
    holdWp: -1,
    targetId: null,
    reactT: 0,
    burstLeft: 0,
    burstPause: 0,
    cooldown: 0,
    reloadLeft: 0,
    strafeDir: 1,
    strafeT: 0,
    blindT: 0,
    plantT: 0,
    defuseT: 0,
    site: null,
    kills: 0,
    deaths: 0,
    fall: 0, // death animation progress (visual only)
    lastHeardX: 0,
    lastHeardZ: 0,
    heardT: 0,
    stepPhase: Math.random() * 6,
  };
}

// Segment vs smoke sphere: true when the sight line passes through any live smoke.
export function smokeBlocks(a, b, smokes) {
  for (const smoke of smokes) {
    const cx = smoke.x;
    const cz = smoke.z;
    const r = smoke.radius;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 0.001) continue;
    let t = ((cx - a.x) * dx + (cz - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t - cx;
    const pz = a.z + dz * t - cz;
    if (px * px + pz * pz < r * r) return true;
  }
  return false;
}

function canSee(bot, enemy, world, smokes) {
  const dx = enemy.x - bot.x;
  const dz = enemy.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist > VISION_RANGE) return false;
  const want = Math.atan2(-dx, -dz);
  let diff = want - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > VISION_HALF_ANGLE) return false;
  const a = { x: bot.x, y: EYE, z: bot.z };
  const b = { x: enemy.x, y: enemy.crouching ? 1.0 : EYE, z: enemy.z };
  if (!world.hasLineOfSight(a, b)) return false;
  if (smokeBlocks(a, b, smokes)) return false;
  return true;
}

function moveWithCollision(bot, dx, dz, colliders) {
  const r = 0.34;
  const h = 1.72;
  function blocked(x, z) {
    for (const c of colliders) {
      // max.y > 0.05 (not > 0): the floor's top face lands a float epsilon above 0 and
      // must not read as a wall.
      if (x + r > c.min.x && x - r < c.max.x && h > c.min.y && c.max.y > 0.05 && z + r > c.min.z && z - r < c.max.z) return true;
    }
    return false;
  }
  const nx = bot.x + dx;
  if (!blocked(nx, bot.z)) bot.x = nx;
  const nz = bot.z + dz;
  if (!blocked(bot.x, nz)) bot.z = nz;
  bot.x = Math.max(-31.5, Math.min(31.5, bot.x));
  bot.z = Math.max(-23.5, Math.min(23.5, bot.z));
}

function faceToward(bot, x, z, dt, rate = 7) {
  const want = Math.atan2(-(x - bot.x), -(z - bot.z));
  let diff = want - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  bot.yaw += diff * Math.min(1, dt * rate);
}

function followPath(bot, dt, colliders, speedMul = 1) {
  if (bot.pathI >= bot.path.length) return true;
  // Paths hold waypoint indices; resolve each one to its coordinates.
  const wp = WAYPOINTS[bot.path[bot.pathI]];
  const dx = wp.x - bot.x;
  const dz = wp.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.7) {
    bot.pathI += 1;
    return bot.pathI >= bot.path.length;
  }
  const step = bot.speed * speedMul * dt;
  moveWithCollision(bot, (dx / dist) * step, (dz / dist) * step, colliders);
  faceToward(bot, wp.x, wp.z, dt, 5);
  return false;
}

function routeTo(bot, wpIndex) {
  const from = nearestWaypoint(bot.x, bot.z);
  bot.path = findPath(from, wpIndex);
  bot.pathI = 0;
}

// One bot, one fixed step. `api` is the sim's handle for damage, tracers, sound and hearing.
export function stepBot(bot, state, world, api, dt) {
  if (!bot.alive) return;
  bot.cooldown = Math.max(0, bot.cooldown - dt);
  bot.burstPause = Math.max(0, bot.burstPause - dt);
  bot.heardT = Math.max(0, bot.heardT - dt);
  if (bot.reloadLeft > 0) {
    bot.reloadLeft -= dt;
    if (bot.reloadLeft <= 0) {
      const def = WEAPONS[bot.weaponId];
      const take = Math.min(def.mag - bot.mag, bot.reserve);
      bot.mag += take;
      bot.reserve -= take;
    }
  }
  if (bot.blindT > 0) {
    bot.blindT -= dt;
    bot.yaw += dt * 1.5; // blind bots stumble and turn
    return;
  }

  // Perception: nearest visible enemy.
  const enemies = state.players.filter((p) => p.alive && p.team !== bot.team);
  let seen = null;
  let seenDist = Infinity;
  for (const enemy of enemies) {
    if (!canSee(bot, enemy, world, state.smokes)) continue;
    const d = Math.hypot(enemy.x - bot.x, enemy.z - bot.z);
    if (d < seenDist) {
      seenDist = d;
      seen = enemy;
    }
  }
  if (seen) {
    if (bot.targetId !== seen.id) {
      bot.targetId = seen.id;
      bot.reactT = 0.35 + Math.random() * 0.25; // reaction time before first shot
      bot.burstLeft = 0;
    }
  } else {
    bot.targetId = null;
  }

  // Charge carrier plants when the site is reached and no enemy is close.
  if (state.charge.holderId === bot.id && state.charge.state === 'carried') {
    const site = state.charge.site === 'A' ? world.sites.A : world.sites.B;
    const inSite = bot.x > site.minX && bot.x < site.maxX && bot.z > site.minZ && bot.z < site.maxZ;
    if (inSite && !seen) {
      bot.state = 'plant';
      bot.plantT += dt;
      api.plantProgress(bot, bot.plantT / 3);
      if (bot.plantT >= 3) {
        api.plantCharge(bot, site.name);
        bot.plantT = 0;
        bot.state = 'hold';
      }
      return;
    }
    if (bot.state !== 'route' || bot.pathI >= bot.path.length) {
      routeTo(bot, state.charge.site === 'A' ? 17 : 25);
      bot.state = 'route';
    }
  }

  // Defuse: a Sentinel at the planted site works the charge.
  if (state.charge.state === 'planted' && bot.team === 'sentinel') {
    const site = state.charge.site === 'A' ? world.sites.A : world.sites.B;
    const inSite = bot.x > site.minX && bot.x < site.maxX && bot.z > site.minZ && bot.z < site.maxZ;
    // Site clear means no Vanguard alive within 16 m of the site centre.
    const siteClear = !state.players.some((p) => p.alive && p.team === 'vanguard'
      && Math.hypot(p.x - site.x, p.z - site.z) < 16);
    if (inSite && siteClear) {
      bot.state = 'defuse';
      bot.defuseT += dt;
      api.defuseProgress(bot, bot.defuseT / 5);
      if (bot.defuseT >= 5) {
        api.defuseCharge(bot);
        bot.defuseT = 0;
        bot.state = 'hold';
      }
      return;
    }
    if (!siteClear && bot.state !== 'route') {
      routeTo(bot, state.charge.site === 'A' ? 17 : 25);
      bot.state = 'route';
    }
  }

  // Engage: strafe, burst fire, reload when dry.
  if (seen) {
    bot.state = 'engage';
    faceToward(bot, seen.x, seen.z, dt, 9);
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) {
      bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      bot.strafeT = 0.7 + Math.random() * 0.7;
    }
    const strafe = bot.strafeDir * bot.speed * 0.45 * dt;
    const fx = Math.cos(bot.yaw);
    const fz = -Math.sin(bot.yaw);
    moveWithCollision(bot, -fz * strafe, fx * strafe, world.colliders);
    bot.reactT -= dt;
    if (bot.reactT <= 0 && bot.reloadLeft <= 0) {
      if (bot.mag <= 0) {
        bot.reloadLeft = WEAPONS[bot.weaponId].reloadTime;
      } else if (bot.burstLeft <= 0 && bot.burstPause <= 0) {
        bot.burstLeft = 3 + Math.floor(Math.random() * 3);
        bot.burstPause = 0.45 + Math.random() * 0.45;
      } else if (bot.burstLeft > 0 && bot.cooldown <= 0) {
        bot.burstLeft -= 1;
        bot.mag -= 1;
        bot.cooldown = WEAPONS[bot.weaponId].fireGap;
        api.botShoot(bot, seen, seenDist);
      }
    }
    return;
  }

  // Rotate toward gunfire the bot heard (defenders especially).
  if (bot.heardT > 0 && bot.team === 'sentinel' && bot.state !== 'route') {
    const heardWp = nearestWaypoint(bot.lastHeardX, bot.lastHeardZ);
    routeTo(bot, heardWp);
    bot.state = 'route';
    bot.heardT = 0;
  }

  // Hold: sweep the angle, then drift to the next hold point.
  if (bot.state === 'hold') {
    bot.holdT -= dt;
    bot.yaw += Math.sin(state.time * 0.7 + bot.stepPhase) * dt * 0.5;
    if (bot.holdT <= 0) {
      const holds = bot.team === 'sentinel'
        ? (bot.site === 'A' ? [22, 23] : bot.site === 'B' ? [26, 27] : [28, 29, 15])
        : [6, 10, 15];
      bot.holdWp = holds[Math.floor(Math.random() * holds.length)];
      routeTo(bot, bot.holdWp);
      bot.state = 'route';
      bot.holdT = 6 + Math.random() * 5;
    }
    return;
  }

  // Route: follow the waypoint path; on arrival, hold.
  if (bot.state === 'route') {
    const arrived = followPath(bot, dt, world.colliders);
    if (arrived) {
      bot.state = 'hold';
      bot.holdT = 4 + Math.random() * 4;
    }
  }
}

// Assign round objectives: attackers pick a site and a lane each; defenders split the sites.
export function assignRoundObjectives(state, world) {
  const site = Math.random() < 0.5 ? 'A' : 'B';
  state.roundSite = site;
  const targetWp = site === 'A' ? 17 : 25;
  const attackers = state.players.filter((p) => !p.isPlayer && p.team === 'vanguard');
  attackers.forEach((bot, i) => {
    bot.site = site;
    bot.state = 'route';
    bot.plantT = 0;
    bot.defuseT = 0;
    const via = i === 0 ? (site === 'A' ? 8 : 9) : i === 1 ? 6 : site === 'A' ? 12 : 14;
    const from = nearestWaypoint(bot.x, bot.z);
    const firstLeg = findPath(from, via);
    const secondLeg = findPath(via, targetWp);
    bot.path = firstLeg.concat(secondLeg.slice(1));
    bot.pathI = 0;
  });
  const defenders = state.players.filter((p) => p.team === 'sentinel');
  defenders.forEach((bot, i) => {
    bot.site = i < 2 ? 'A' : i < 4 ? 'B' : 'mid';
    bot.state = 'hold';
    bot.holdT = 3 + i * 1.5;
    bot.holdWp = bot.site === 'A' ? 22 + (i % 2) : bot.site === 'B' ? 26 + (i % 2) : 28 + (i % 2);
    bot.plantT = 0;
    bot.defuseT = 0;
    routeTo(bot, bot.holdWp);
    bot.state = 'route';
  });
}
