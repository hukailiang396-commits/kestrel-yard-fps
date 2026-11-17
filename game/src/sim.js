// The simulation: one state store, one fixed 60 Hz step, kept apart from rendering.
// main.js owns the meshes and hands the sim a raycast callback; the sim owns rounds,
// the economy, the charge, grenades, bot calls and every number the HUD shows.
// No per-frame allocation in the hot loops: vectors and the event list are reused.
import * as THREE from 'three';
import { WEAPONS, GRENADES, ECONOMY, buyItem, freshLoadout, spreadFor } from './weapons.js';
import { createPlayer } from './player.js';
import { makeBot, stepBot, assignRoundObjectives } from './bots.js';

const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const DETONATE_SECONDS = 35;
const WIN_ROUNDS = 8;

const tmpOrigin = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpA = { x: 0, y: 0, z: 0 };
const tmpB = { x: 0, y: 0, z: 0 };

export function createSim(world, api) {
  const playerCtl = createPlayer(world.colliders);
  const pstate = playerCtl.state;

  const state = {
    time: 0,
    phase: 'buy', // buy | live | over | matchover
    phaseT: BUY_SECONDS,
    round: 1,
    roundSite: 'A',
    scoreV: 0,
    scoreS: 0,
    money: ECONOMY.startMoney,
    lossStreak: 0,
    players: [],
    charge: { holderId: 'player', state: 'carried', site: 'A', x: 0, z: 0, plantT: 0, defuseT: 0, explodeT: 0 },
    grenades: [],
    smokes: [],
    tracers: [],
    feed: [],
    events: [],
    buyOpen: true,
    banner: null,
    bannerT: 0,
    overReason: '',
    matchWinner: null,
    player: null,
    seed: 1,
  };

  function emit(type, data) {
    state.events.push({ type, ...data });
  }

  function feed(text, team) {
    state.feed.unshift({ text, team, t: state.time });
    if (state.feed.length > 6) state.feed.pop();
  }

  function makePlayer() {
    const spawn = world.spawns.vanguard[0];
    pstate.position.set(spawn.x, 0, spawn.z);
    pstate.velocity.set(0, 0, 0);
    pstate.yaw = 0;
    pstate.pitch = 0;
    const player = {
      id: 'player',
      team: 'vanguard',
      isPlayer: true,
      name: 'You',
      x: spawn.x,
      z: spawn.z,
      yaw: 0,
      pitch: 0,
      hp: 100,
      alive: true,
      crouching: false,
      loadout: freshLoadout('p9'),
      kills: 0,
      deaths: 0,
      stepAcc: 0,
    };
    state.player = player;
    return player;
  }

  function spawnTeams() {
    const players = [makePlayer()];
    world.spawns.vanguard.slice(1).forEach((spawn, i) => {
      const bot = makeBot('vanguard', i, spawn, state.round);
      players.push(bot);
    });
    world.spawns.sentinel.forEach((spawn, i) => {
      players.push(makeBot('sentinel', i, spawn, state.round));
    });
    // Bots carry pistols/SMGs early; the player's loadout persists between rounds.
    state.players = players;
    state.charge.holderId = 'player';
    state.charge.state = 'carried';
    state.charge.site = state.roundSite;
    state.charge.plantT = 0;
    state.charge.defuseT = 0;
    state.charge.explodeT = 0;
    assignRoundObjectives(state, world);
  }

  function startRound() {
    state.phase = 'buy';
    state.phaseT = BUY_SECONDS;
    state.buyOpen = true;
    state.banner = null;
    state.grenades.length = 0;
    state.smokes.length = 0;
    state.tracers.length = 0;
    spawnTeams();
    const player = state.player;
    const loadout = player.loadout;
    const def = WEAPONS[loadout.weaponId];
    loadout.mag = def.mag;
    loadout.reserve = def.reserve;
    loadout.reloadLeft = 0;
    loadout.cooldown = 0;
    loadout.grenadeArmed = false;
    emit('roundStart', { round: state.round });
  }

  function endRound(winner, reason) {
    if (state.phase === 'over' || state.phase === 'matchover') return;
    state.phase = 'over';
    state.phaseT = 4;
    state.overReason = reason;
    state.buyOpen = false;
    if (winner === 'vanguard') {
      state.scoreV += 1;
      state.money = Math.min(ECONOMY.maxMoney, state.money + ECONOMY.winReward);
      state.lossStreak = 0;
      emit('roundWin', { reason });
      feed(`Vanguard takes round ${state.round} — ${reason}`, 'vanguard');
    } else {
      state.scoreS += 1;
      const lossPay = Math.min(ECONOMY.lossStreakCap, ECONOMY.lossReward + state.lossStreak * ECONOMY.lossStreakBonus);
      state.money = Math.min(ECONOMY.maxMoney, state.money + lossPay);
      state.lossStreak += 1;
      emit('roundLose', { reason });
      feed(`Sentinel takes round ${state.round} — ${reason}`, 'sentinel');
    }
    state.banner = { winner, reason, t: 4 };
    state.bannerT = 4;
    if (state.scoreV >= WIN_ROUNDS || state.scoreS >= WIN_ROUNDS) {
      state.matchWinner = winner;
    }
  }

  function nextRound() {
    if (state.matchWinner) {
      state.phase = 'matchover';
      state.phaseT = 0;
      emit('matchEnd', { winner: state.matchWinner });
      return;
    }
    state.round += 1;
    startRound();
  }

  function restartMatch() {
    state.round = 1;
    state.scoreV = 0;
    state.scoreS = 0;
    state.money = ECONOMY.startMoney;
    state.lossStreak = 0;
    state.matchWinner = null;
    state.feed.length = 0;
    const player = state.player;
    if (player) {
      player.loadout = freshLoadout('p9');
      player.kills = 0;
      player.deaths = 0;
    }
    startRound();
  }

  function aliveCount(team) {
    let n = 0;
    for (const p of state.players) if (p.alive && p.team === team) n += 1;
    return n;
  }

  function dropChargeAt(x, z) {
    state.charge.state = 'dropped';
    state.charge.holderId = null;
    state.charge.x = x;
    state.charge.z = z;
    feed('Charge dropped', 'vanguard');
  }

  function damage(target, amount, part, attacker) {
    if (!target.alive) return;
    let dmg = amount;
    if (target.loadout && target.loadout.kevlar) dmg *= 0.5;
    if (part === 'head') dmg *= WEAPONS.ar.headMult;
    else if (part === 'legs') dmg *= 0.75;
    target.hp -= dmg;
    if (attacker && attacker.isPlayer) emit('hit', { killed: target.hp <= 0 });
    if (target.hp > 0) return;
    target.hp = 0;
    target.alive = false;
    target.deaths += 1;
    if (attacker) {
      attacker.kills += 1;
      if (attacker.isPlayer) {
        state.money = Math.min(ECONOMY.maxMoney, state.money + ECONOMY.killReward);
      }
    }
    feed(`${attacker ? attacker.name : 'The yard'} ▸ ${target.name}${part === 'head' ? ' (headshot)' : ''}`, attacker ? attacker.team : null);
    emit('kill', { victim: target.id, killer: attacker ? attacker.id : null });
    if (state.charge.holderId === target.id) dropChargeAt(target.x, target.z);
    if (target.isPlayer) {
      state.buyOpen = false;
      emit('playerDead', {});
    }
  }

  function playerShoot() {
    const player = state.player;
    const loadout = player.loadout;
    const def = WEAPONS[loadout.weaponId];
    if (loadout.reloadLeft > 0 || loadout.cooldown > 0) return;
    if (loadout.mag <= 0) {
      emit('dry', {});
      loadout.cooldown = 0.25;
      return;
    }
    loadout.mag -= 1;
    loadout.cooldown = def.fireGap;
    loadout.flash = 0.06;
    loadout.kick = Math.min(0.09, loadout.kick + 0.02);
    const speed = playerCtl.groundSpeed();
    const spread = spreadFor(def, speed, player.crouching, false);
    const recoilPitch = 0.006 + Math.random() * 0.004;
    playerCtl.recoil(recoilPitch, (Math.random() * 2 - 1) * 0.003);
    tmpOrigin.set(player.x, pstate.position.y + pstate.eye, player.z);
    for (let pellet = 0; pellet < def.pellets; pellet += 1) {
      tmpDir.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
      tmpDir.x += (Math.random() * 2 - 1) * spread;
      tmpDir.y += (Math.random() * 2 - 1) * spread;
      tmpDir.z += (Math.random() * 2 - 1) * spread;
      tmpDir.normalize();
      const hit = api.raycast(tmpOrigin, tmpDir, def.range);
      if (hit) {
        state.tracers.push({ fx: tmpOrigin.x, fy: tmpOrigin.y, fz: tmpOrigin.z, tx: hit.point.x, ty: hit.point.y, tz: hit.point.z, t: 0.07, color: '#ffd27a' });
        if (hit.bot) damage(hit.bot, def.damage, hit.part, player);
      } else {
        const tx = tmpOrigin.x + tmpDir.x * def.range;
        const ty = tmpOrigin.y + tmpDir.y * def.range;
        const tz = tmpOrigin.z + tmpDir.z * def.range;
        state.tracers.push({ fx: tmpOrigin.x, fy: tmpOrigin.y, fz: tmpOrigin.z, tx, ty, tz, t: 0.07, color: '#ffd27a' });
      }
    }
    emit('shot', { kind: def.kind, x: player.x, z: player.z });
    // Gunfire is heard across the yard: nearby bots rotate toward it.
    for (const bot of state.players) {
      if (bot.isPlayer || !bot.alive) continue;
      const d = Math.hypot(bot.x - player.x, bot.z - player.z);
      if (d < 30) {
        bot.lastHeardX = player.x;
        bot.lastHeardZ = player.z;
        bot.heardT = 2;
      }
    }
  }

  function throwGrenade() {
    const player = state.player;
    const loadout = player.loadout;
    const type = loadout.grenadeSelected;
    if (!loadout.grenadeArmed || loadout.grenades[type] <= 0) return;
    loadout.grenades[type] -= 1;
    loadout.grenadeArmed = loadout.grenades.flash + loadout.grenades.smoke + loadout.grenades.frag > 0;
    const dir = new THREE.Vector3(-Math.sin(player.yaw), 0.32, -Math.cos(player.yaw)).normalize();
    state.grenades.push({
      type,
      x: player.x + dir.x * 0.5,
      y: pstate.position.y + pstate.eye - 0.1,
      z: player.z + dir.z * 0.5,
      vx: dir.x * 15,
      vy: 5.5,
      vz: dir.z * 15,
      fuse: GRENADES[type].fuse,
      ownerId: 'player',
    });
    emit('throw', { type });
  }

  function detonateGrenade(g) {
    const def = GRENADES[g.type];
    if (g.type === 'frag') {
      emit('explosion', { x: g.x, z: g.z });
      for (const p of state.players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - g.x, p.z - g.z);
        if (d < def.radius) {
          const fall = 1 - d / def.radius;
          damage(p, def.damage * (0.4 + 0.6 * fall), 'body', state.players.find((q) => q.id === g.ownerId) || null);
        }
      }
    } else if (g.type === 'flash') {
      emit('flashPop', { x: g.x, z: g.z });
      tmpA.x = g.x;
      tmpA.y = g.y;
      tmpA.z = g.z;
      for (const p of state.players) {
        if (!p.alive || p.isPlayer) continue;
        const d = Math.hypot(p.x - g.x, p.z - g.z);
        if (d > def.blindRange) continue;
        tmpB.x = p.x;
        tmpB.y = 1.5;
        tmpB.z = p.z;
        if (!world.hasLineOfSight(tmpA, tmpB)) continue;
        p.blindT = def.blindTime * (1 - d / (def.blindRange * 1.4));
        p.targetId = null;
      }
    } else if (g.type === 'smoke') {
      state.smokes.push({ x: g.x, z: g.z, radius: def.radius, t: def.life });
      emit('smokePop', { x: g.x, z: g.z });
    }
  }

  function stepGrenades(dt) {
    for (let i = state.grenades.length - 1; i >= 0; i -= 1) {
      const g = state.grenades[i];
      g.vy -= 12 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;
      if (g.y < 0.15) {
        g.y = 0.15;
        g.vy *= -0.35;
        g.vx *= 0.6;
        g.vz *= 0.6;
      }
      g.x = Math.max(-31.5, Math.min(31.5, g.x));
      g.z = Math.max(-23.5, Math.min(23.5, g.z));
      g.fuse -= dt;
      if (g.fuse <= 0) {
        detonateGrenade(g);
        state.grenades.splice(i, 1);
      }
    }
    for (let i = state.smokes.length - 1; i >= 0; i -= 1) {
      state.smokes[i].t -= dt;
      if (state.smokes[i].t <= 0) state.smokes.splice(i, 1);
    }
    for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
      state.tracers[i].t -= dt;
      if (state.tracers[i].t <= 0) state.tracers.splice(i, 1);
    }
  }

  function checkRoundEnd() {
    if (state.phase !== 'live') return;
    const vAlive = aliveCount('vanguard');
    const sAlive = aliveCount('sentinel');
    if (state.charge.state === 'planted') return; // planted rounds run to detonation/defusal
    if (vAlive === 0) endRound('sentinel', 'Vanguard eliminated');
    else if (sAlive === 0) endRound('vanguard', 'Sentinel eliminated');
  }

  // Bot shots are resolved by hit chance: distance, target speed, crouch and the bot's
  // own movement all matter, so a still target at close range is in real danger.
  const botApi = {
    damage(target, amount, part, attacker) {
      damage(target, amount, part, attacker);
    },
    botShoot(bot, target, dist) {
      const def = WEAPONS[bot.weaponId];
      const targetSpeed = target.isPlayer ? playerCtl.groundSpeed() : bot.speed * 0.5;
      let chance = 0.55 - dist * 0.011;
      chance *= targetSpeed > 3 ? 0.6 : targetSpeed > 0.5 ? 0.85 : 1;
      if (target.crouching) chance *= 0.85;
      chance = Math.max(0.08, Math.min(0.55, chance));
      const from = { x: bot.x, y: 1.45, z: bot.z };
      const hitRoll = Math.random() < chance;
      const headRoll = Math.random() < 0.12;
      if (hitRoll) {
        state.tracers.push({ fx: from.x, fy: from.y, fz: from.z, tx: target.x, ty: target.isPlayer ? 1.3 : 1.2, tz: target.z, t: 0.07, color: '#ff8a5c' });
        damage(target, def.damage, headRoll ? 'head' : 'body', bot);
      } else {
        const miss = 0.6 + Math.random() * 0.8;
        state.tracers.push({ fx: from.x, fy: from.y, fz: from.z, tx: target.x + (Math.random() * 2 - 1) * miss, ty: 1.2, tz: target.z + (Math.random() * 2 - 1) * miss, t: 0.07, color: '#ff8a5c' });
      }
      emit('shot', { kind: def.kind, x: bot.x, z: bot.z });
      for (const other of state.players) {
        if (other.isPlayer || !other.alive || other === bot) continue;
        const d = Math.hypot(other.x - bot.x, other.z - bot.z);
        if (d < 30) {
          other.lastHeardX = bot.x;
          other.lastHeardZ = bot.z;
          other.heardT = 2;
        }
      }
    },
    plantProgress(bot, frac) {
      state.charge.plantT = frac * PLANT_SECONDS;
      emit('plantTick', { frac });
    },
    plantCharge(bot, siteName) {
      state.charge.state = 'planted';
      state.charge.site = siteName;
      state.charge.explodeT = DETONATE_SECONDS;
      state.charge.holderId = null;
      feed(`${bot.name} planted the charge at Site ${siteName}`, 'vanguard');
      emit('planted', { site: siteName });
    },
    defuseProgress(bot, frac) {
      state.charge.defuseT = frac * DEFUSE_SECONDS;
      emit('defuseTick', { frac });
    },
    defuseCharge(bot) {
      state.charge.state = 'defused';
      feed(`${bot.name} defused the charge`, 'sentinel');
      emit('defused', {});
      endRound('sentinel', 'Charge defused');
    },
  };

  function stepPlayer(dt, input) {
    const player = state.player;
    if (!player.alive) return;
    for (const code of input.takePressed()) {
      if (code === 'KeyB' && state.phase === 'buy') {
        state.buyOpen = !state.buyOpen;
        emit('buyToggle', { open: state.buyOpen });
      }
      if (code === 'KeyR') {
        const loadout = player.loadout;
        const def = WEAPONS[loadout.weaponId];
        if (loadout.reloadLeft <= 0 && loadout.mag < def.mag && loadout.reserve > 0) {
          loadout.reloadLeft = def.reloadTime;
          emit('reload', {});
        }
      }
      if (code === 'KeyG') {
        const loadout = player.loadout;
        const order = ['frag', 'flash', 'smoke'];
        const owned = order.filter((t) => loadout.grenades[t] > 0);
        if (owned.length > 0) {
          const cur = owned.indexOf(loadout.grenadeSelected);
          loadout.grenadeSelected = owned[(cur + 1) % owned.length];
          loadout.grenadeArmed = true;
          emit('grenadeCycle', { type: loadout.grenadeSelected });
        } else {
          loadout.grenadeArmed = false;
        }
      }
      if (code === 'KeyE') {
        // E is held for planting; the hold itself is read from keys below.
      }
      if (state.buyOpen && state.phase === 'buy') {
        const item = { Digit1: 'ar', Digit2: 'smg', Digit3: 'dmr', Digit4: 'shotgun', Digit5: 'p9', Digit6: 'flash', Digit7: 'smoke', Digit8: 'frag', Digit9: 'kevlar' }[code];
        if (item) {
          const res = buyItem(state.money, player.loadout, item);
          if (res.ok) {
            state.money -= res.cost;
            emit('buy', { item });
          } else {
            emit('denied', { reason: res.reason });
          }
        }
      }
    }

    // Movement and look. Look is applied once per frame by main.js through sim.look(),
    // so the fixed steps never double-apply the mouse delta.
    if (state.phase === 'buy' || state.phase === 'live') {
      playerCtl.step(dt, input.state.keys);
      player.x = pstate.position.x;
      player.z = pstate.position.z;
      player.yaw = pstate.yaw;
      player.pitch = pstate.pitch;
      player.crouching = pstate.crouching;
      const speed = playerCtl.groundSpeed();
      if (speed > 0.5) {
        player.stepAcc += speed * dt;
        if (player.stepAcc > 2.2) {
          player.stepAcc = 0;
          emit('step', { x: player.x, z: player.z });
        }
      }
    }

    // Firing (or throwing when a grenade is armed).
    const loadout = player.loadout;
    if (loadout.cooldown > 0) loadout.cooldown -= dt;
    if (loadout.flash > 0) loadout.flash -= dt;
    loadout.kick += (0 - loadout.kick) * Math.min(1, dt * 10);
    if (loadout.reloadLeft > 0) {
      loadout.reloadLeft -= dt;
      if (loadout.reloadLeft <= 0) {
        const def = WEAPONS[loadout.weaponId];
        const take = Math.min(def.mag - loadout.mag, loadout.reserve);
        loadout.mag += take;
        loadout.reserve -= take;
      }
    }
    if (state.phase === 'live' && input.state.firing) {
      if (loadout.grenadeArmed) {
        throwGrenade();
        input.state.firing = false;
      } else {
        const def = WEAPONS[loadout.weaponId];
        if (def.auto) {
          playerShoot();
        } else if (loadout.cooldown <= 0) {
          playerShoot();
          input.state.firing = false; // semi-auto: one shot per click
        }
      }
    }

    // Planting: hold E inside a site while carrying the charge.
    if (state.phase === 'live' && state.charge.holderId === 'player' && state.charge.state === 'carried') {
      const site = state.roundSite === 'A' ? world.sites.A : world.sites.B;
      const inSite = player.x > site.minX && player.x < site.maxX && player.z > site.minZ && player.z < site.maxZ;
      if (inSite && input.state.keys.has('KeyE')) {
        state.charge.plantT += dt;
        emit('plantTick', { frac: state.charge.plantT / PLANT_SECONDS });
        if (state.charge.plantT >= PLANT_SECONDS) {
          state.charge.state = 'planted';
          state.charge.site = state.roundSite;
          state.charge.explodeT = DETONATE_SECONDS;
          state.charge.holderId = null;
          feed(`You planted the charge at Site ${state.roundSite}`, 'vanguard');
          emit('planted', { site: state.roundSite });
        }
      } else if (state.charge.plantT > 0) {
        state.charge.plantT = Math.max(0, state.charge.plantT - dt * 2);
      }
    }

    // Pick up a dropped charge by walking over it.
    if (state.charge.state === 'dropped') {
      const d = Math.hypot(player.x - state.charge.x, player.z - state.charge.z);
      if (d < 1.2) {
        state.charge.state = 'carried';
        state.charge.holderId = 'player';
        feed('You picked up the charge', 'vanguard');
      }
    }
  }

  function stepBots(dt) {
    for (const bot of state.players) {
      if (bot.isPlayer) continue;
      // A dropped charge is picked up by the nearest Vanguard bot walking over it.
      if (state.charge.state === 'dropped' && bot.team === 'vanguard' && bot.alive) {
        const d = Math.hypot(bot.x - state.charge.x, bot.z - state.charge.z);
        if (d < 1.2) {
          state.charge.state = 'carried';
          state.charge.holderId = bot.id;
          feed(`${bot.name} picked up the charge`, 'vanguard');
        }
      }
      stepBot(bot, state, world, botApi, dt);
    }
  }

  function step(dt, input) {
    state.time += dt;
    if (state.bannerT > 0) state.bannerT -= dt;
    if (state.phase === 'buy') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) {
        state.phase = 'live';
        state.phaseT = ROUND_SECONDS;
        state.buyOpen = false;
        emit('roundLive', {});
      }
    } else if (state.phase === 'live') {
      state.phaseT -= dt;
      if (state.charge.state === 'planted') {
        state.charge.explodeT -= dt;
        if (state.charge.explodeT <= 0) {
          state.charge.state = 'detonated';
          emit('explosion', { x: world.sites[state.charge.site].x, z: world.sites[state.charge.site].z });
          endRound('vanguard', 'Charge detonated');
        }
      } else if (state.phaseT <= 0) {
        endRound('sentinel', 'Time expired');
      }
    } else if (state.phase === 'over') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) nextRound();
    }
    if (state.phase === 'buy' || state.phase === 'live') {
      stepPlayer(dt, input);
      if (state.phase === 'live') stepBots(dt);
      stepGrenades(dt);
      checkRoundEnd();
    } else if (state.phase === 'over') {
      stepGrenades(dt);
    }
    world.step(dt);
  }

  startRound();

  return {
    state,
    step,
    look(dx, dy) {
      playerCtl.look(dx, dy);
    },
    aliveCount,
    restartMatch,
    startRound,
    endRound,
    damage,
    // Test/shot hook: set the sim to an exact pose without playing.
    pose(fn) {
      fn(state);
    },
    // Test/shot hook: place the player exactly. Assigning state.player
    // directly does not stick — every step overwrites it from the physics
    // body — so poses must go through here.
    teleport(x, z, yaw, pitch) {
      pstate.position.set(x, 0, z);
      pstate.velocity.set(0, 0, 0);
      pstate.yaw = yaw;
      pstate.pitch = pitch;
    },
  };
}
