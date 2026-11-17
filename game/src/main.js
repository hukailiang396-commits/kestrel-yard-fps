// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// main.js owns the meshes, the camera and the raycast; sim.js owns the numbers. The two
// meet through the state store and the raycast callback, never through shared mutation.
// ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createSim } from './sim.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { WEAPONS } from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2b1d12');
scene.fog = new THREE.Fog(new THREE.Color('#2b1d12'), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);

// The raycast the sim shoots through: world surfaces plus every bot's hitboxes.
const raycaster = new THREE.Raycaster();
const hitMeshes = [];
const botMeshes = new Map();
const tmpVec = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function buildBotMeshes(bot) {
  const group = new THREE.Group();
  const teamColor = bot.team === 'vanguard' ? PALETTE.amber : PALETTE.teal;
  const teamDark = bot.team === 'vanguard' ? PALETTE.amberDark : PALETTE.tealDark;
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamDark), roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a06b'), roughness: 0.85 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.5, metalness: 0.4 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.18), darkMat);
  legL.position.set(-0.12, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.12;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.3), bodyMat);
  torso.position.y = 1.16;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skinMat);
  head.position.y = 1.66;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.28), bodyMat);
  band.position.y = 1.76;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), gunMat);
  gun.position.set(0.2, 1.28, -0.3);
  group.add(legL, legR, torso, head, band, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  torso.userData.bot = bot;
  torso.userData.part = 'body';
  head.userData.bot = bot;
  head.userData.part = 'head';
  legL.userData.bot = bot;
  legL.userData.part = 'legs';
  legR.userData.bot = bot;
  legR.userData.part = 'legs';
  hitMeshes.push(torso, head, legL, legR);
  scene.add(group);
  botMeshes.set(bot.id, { group, legL, legR, torso, head });
  return group;
}

const sim = createSim(world, {
  raycast(origin, dir, maxDist) {
    raycaster.set(origin, dir);
    raycaster.far = maxDist;
    const hits = raycaster.intersectObjects(world.shootables.concat(hitMeshes), false);
    const hit = hits[0];
    if (!hit) return null;
    return { point: hit.point, bot: hit.object.userData.bot ?? null, part: hit.object.userData.part ?? 'body', dist: hit.distance };
  },
});
const state = sim.state;
for (const bot of state.players) if (!bot.isPlayer) buildBotMeshes(bot);

// View model: one gun per weapon kind, rebuilt when the weapon changes.
const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.45, metalness: 0.5 });
const gunDark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#17191c'), roughness: 0.6, metalness: 0.3 });
const viewModel = new THREE.Group();
viewModel.position.set(0.24, -0.2, -0.42);
camera.add(viewModel);
const flashMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.26, 0.26),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
);
flashMesh.position.set(0.24, -0.17, -0.95);
flashMesh.visible = false;
camera.add(flashMesh);
const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
flashLight.position.set(0.24, -0.16, -0.6);
camera.add(flashLight);
const grenadeBall = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 12, 10),
  new THREE.MeshStandardMaterial({ color: new THREE.Color('#3d5a3a'), roughness: 0.6 }),
);
grenadeBall.position.set(0.24, -0.2, -0.42);
grenadeBall.visible = false;
camera.add(grenadeBall);

let lastWeaponId = '';
function rebuildViewModel(weaponId) {
  if (weaponId === lastWeaponId) return;
  lastWeaponId = weaponId;
  while (viewModel.children.length > 0) viewModel.remove(viewModel.children[0]);
  const def = WEAPONS[weaponId];
  const len = def.kind === 'dmr' ? 0.62 : def.kind === 'pistol' ? 0.2 : def.kind === 'shotgun' ? 0.5 : def.kind === 'smg' ? 0.34 : 0.44;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len), gunMat);
  viewModel.add(receiver);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, len * 0.7), gunDark);
  barrel.position.set(0, 0.025, -len * 0.6);
  viewModel.add(barrel);
  if (def.kind === 'shotgun') {
    const barrel2 = barrel.clone();
    barrel2.position.y = -0.02;
    viewModel.add(barrel2);
  }
  if (def.kind === 'dmr') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), gunDark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, 0);
    viewModel.add(scope);
  }
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.18), gunDark);
  stock.position.set(0, -0.02, len / 2 + 0.05);
  viewModel.add(stock);
}

// Tracers, grenades and smoke are pooled lines/meshes, reused every frame.
const tracerPool = [];
for (let i = 0; i < 24; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracerPool.push(line);
}
const grenadePool = [];
for (let i = 0; i < 8; i += 1) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#3d5a3a'), roughness: 0.6 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  grenadePool.push(mesh);
}
const smokePool = [];
for (let i = 0; i < 6; i += 1) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8b0a4'), transparent: true, opacity: 0.5, depthWrite: false }),
  );
  mesh.visible = false;
  scene.add(mesh);
  smokePool.push(mesh);
}
const chargeMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.28, 0.34),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.4 }),
);
chargeMesh.visible = false;
scene.add(chargeMesh);
const chargeLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 8);
scene.add(chargeLight);

let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let bobPhase = 0;

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (state.phase === 'matchover') {
    sim.restartMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  hud.hideOverlay();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (state.phase === 'live' && state.player.alive && started) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  const p = state.player;
  camera.position.set(p.x, 1.6 + (p.crouching ? -0.58 : 0) + Math.sin(bobPhase) * 0.025, p.z);
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
}

function drainEvents() {
  const events = state.events.splice(0, state.events.length);
  for (const evt of events) {
    const d = evt.x !== undefined ? Math.hypot(evt.x - state.player.x, evt.z - state.player.z) : 0;
    switch (evt.type) {
      case 'shot':
        audio.shot(evt.kind, d);
        break;
      case 'hit':
        hud.hitMarker(evt.killed, evt.killed ? 400 : 90);
        audio.hit(evt.killed);
        break;
      case 'kill':
        break;
      case 'dry':
        audio.dryClick();
        break;
      case 'reload':
        audio.reload();
        break;
      case 'buy':
        audio.buy();
        break;
      case 'denied':
        audio.denied();
        break;
      case 'throw':
        audio.throwWhoosh();
        break;
      case 'explosion':
        audio.explosion(d);
        hud.flashDamage();
        break;
      case 'flashPop':
        audio.flashPop(d);
        break;
      case 'smokePop':
        break;
      case 'step':
        audio.step(d);
        break;
      case 'plantTick':
        hud.setPlant(evt.frac, 'PLANTING THE CHARGE — HOLD E');
        break;
      case 'planted':
        hud.setPlant(0, '');
        hud.showBanner('CHARGE PLANTED', `Site ${evt.site} — hold the site until it blows`);
        break;
      case 'defuseTick':
        hud.setPlant(evt.frac, 'DEFUSING THE CHARGE');
        break;
      case 'defused':
        hud.setPlant(0, '');
        break;
      case 'roundWin':
        audio.roundWin();
        hud.showBanner('ROUND WON', evt.reason);
        break;
      case 'roundLose':
        audio.roundLose();
        hud.showBanner('ROUND LOST', evt.reason);
        break;
      case 'roundStart':
        hud.hideBanner();
        if (started && state.player.alive && !input.state.locked && !shot) hud.showOverlay('start');
        break;
      case 'roundLive':
        hud.hideBanner();
        break;
      case 'playerDead':
        hud.showOverlay('dead');
        if (document.pointerLockElement) document.exitPointerLock();
        break;
      case 'matchEnd':
        hud.hideOverlay();
        hud.showScoreboard(scoreRows(), `${evt.winner === 'vanguard' ? 'VANGUARD' : 'SENTINEL'} WINS THE MATCH`);
        hud.showPlayAgain(true);
        if (document.pointerLockElement) document.exitPointerLock();
        break;
      default:
        break;
    }
  }
}

function scoreRows() {
  return state.players.map((p) => ({ name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, alive: p.alive }));
}

function syncHud() {
  const p = state.player;
  const loadout = p.loadout;
  hud.setHealth(p.hp);
  hud.setAmmo(loadout.mag, loadout.reserve);
  hud.setMoney(state.money);
  hud.setTimer(state.phaseT, state.phase);
  hud.setScore(state.scoreV, state.scoreS);
  hud.setAlive(sim.aliveCount('vanguard'), sim.aliveCount('sentinel'));
  hud.setFeed(state.feed);
  const def = WEAPONS[loadout.weaponId];
  const speed = Math.hypot(p.x - (syncHud.px ?? p.x), p.z - (syncHud.pz ?? p.z)) * 60;
  syncHud.px = p.x;
  syncHud.pz = p.z;
  const spread = def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
  hud.setCrosshair(4 + spread * 900 + loadout.kick * 120);
  hud.setGrenade(loadout.grenadeSelected, loadout.grenades[loadout.grenadeSelected], loadout.grenadeArmed);
  hud.showBuy(state.buyOpen && state.phase === 'buy');
  if (state.charge.state === 'planted') {
    hud.setCharge(`CHARGE AT SITE ${state.charge.site} — ${Math.ceil(state.charge.explodeT)}s`);
    hud.setPlant(state.charge.explodeT / 35, `DETONATION IN ${Math.ceil(state.charge.explodeT)}s`);
  } else if (state.charge.state === 'carried' && state.charge.holderId === 'player') {
    hud.setCharge('YOU CARRY THE CHARGE — plant at Site A or B (hold E)');
    if (state.charge.plantT <= 0) hud.setPlant(0, '');
  } else if (state.charge.state === 'dropped') {
    hud.setCharge('CHARGE DROPPED — walk over it to pick it up');
  } else {
    hud.setCharge('');
    if (state.charge.plantT <= 0 && state.charge.defuseT <= 0) hud.setPlant(0, '');
  }
  if (input.state.keys.has('Tab')) hud.showScoreboard(scoreRows(), `KESTREL YARD — ROUND ${state.round}`);
  else if (state.phase !== 'matchover') {
    hud.hideScoreboard();
    hud.showPlayAgain(false);
  }
  if (state.bannerT <= 0 && state.phase !== 'over') hud.hideBanner();
}

function syncWorld(dt) {
  for (const bot of state.players) {
    if (bot.isPlayer) continue;
    const meshes = botMeshes.get(bot.id);
    if (!meshes) continue;
    meshes.group.position.set(bot.x, 0, bot.z);
    meshes.group.rotation.y = bot.yaw;
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt * 2.5);
      meshes.group.rotation.x = -bot.fall * 1.45;
      meshes.group.position.y = -bot.fall * 0.08;
    } else {
      const moving = bot.state === 'route' || bot.state === 'engage';
      const swing = moving ? Math.sin(state.time * 9 + bot.stepPhase) * 0.5 : 0;
      meshes.legL.rotation.x = swing;
      meshes.legR.rotation.x = -swing;
      if (Math.random() < dt * 0.5) audio.step(Math.hypot(bot.x - state.player.x, bot.z - state.player.z));
    }
  }
  // Tracers.
  for (let i = 0; i < tracerPool.length; i += 1) {
    const line = tracerPool[i];
    const t = state.tracers[i];
    if (!t) {
      line.visible = false;
      continue;
    }
    line.visible = true;
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, t.fx, t.fy, t.fz);
    pos.setXYZ(1, t.tx, t.ty, t.tz);
    pos.needsUpdate = true;
    line.material.color.set(t.color);
  }
  // Grenades in flight.
  for (let i = 0; i < grenadePool.length; i += 1) {
    const mesh = grenadePool[i];
    const g = state.grenades[i];
    if (!g) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(g.x, g.y, g.z);
  }
  // Smoke volumes.
  for (let i = 0; i < smokePool.length; i += 1) {
    const mesh = smokePool[i];
    const s = state.smokes[i];
    if (!s) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(s.x, 1.2, s.z);
    mesh.scale.setScalar(s.radius);
    mesh.material.opacity = Math.min(0.55, s.t * 0.2 + 0.25);
  }
  // The charge: blinking at the planted site, or lying where it dropped.
  if (state.charge.state === 'planted') {
    const site = world.sites[state.charge.site];
    chargeMesh.visible = true;
    chargeMesh.position.set(site.x, 0.2, site.z);
    chargeLight.position.set(site.x, 1, site.z);
    chargeLight.intensity = 6 + Math.sin(state.time * 6) * 4;
  } else if (state.charge.state === 'dropped') {
    chargeMesh.visible = true;
    chargeMesh.position.set(state.charge.x, 0.2, state.charge.z);
    chargeLight.position.set(state.charge.x, 1, state.charge.z);
    chargeLight.intensity = 3;
  } else {
    chargeMesh.visible = false;
    chargeLight.intensity = 0;
  }
  // View model follows the weapon and the kick.
  const loadout = state.player.loadout;
  rebuildViewModel(loadout.weaponId);
  grenadeBall.visible = !!loadout.grenadeArmed;
  viewModel.visible = !loadout.grenadeArmed;
  viewModel.position.z = -0.42 + loadout.kick;
  viewModel.rotation.x = loadout.kick * 2.2;
  if (loadout.reloadLeft > 0) {
    const def = WEAPONS[loadout.weaponId];
    viewModel.rotation.x = -0.55 * Math.min(1, (def.reloadTime - loadout.reloadLeft) * 2);
  }
  flashMesh.visible = loadout.flash > 0;
  flashMesh.rotation.z = random() * 6;
  flashLight.intensity = loadout.flash > 0 ? 18 : 0;
}

function step(dt) {
  sim.step(dt, input);
  drainEvents();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (look.x || look.y) sim.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    bobPhase += Math.hypot(state.player.x - (frame.px ?? state.player.x), state.player.z - (frame.pz ?? state.player.z)) * 2.4;
    frame.px = state.player.x;
    frame.pz = state.player.z;
    syncCamera();
    syncWorld(dt);
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  // Place the player through the sim: assigning state.player directly does
  // not stick, the next step overwrites it from the physics body.
  const p = state.player;
  const dx = point.x - p.x;
  const dy = point.y - 1.6;
  const dz = point.z - p.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  sim.teleport(p.x, p.z, Math.atan2(-dx, -dz), Math.asin(Math.max(-1, Math.min(1, dy / len))));
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideScoreboard();
  const p = state.player;
  if (name === 'start') {
    // The title screen: KESTREL, the premise, the controls, Click to play.
    p.x = 0;
    p.z = 20;
    aimAt(new THREE.Vector3(4, 1.5, -10));
    state.buyOpen = false;
    state.phase = 'buy';
    state.phaseT = 12;
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'play') {
    // Mid firefight: aiming down Mid at a Sentinel in the open, hitmarker live, tracer in the air.
    state.phase = 'live';
    state.phaseT = 62;
    state.scoreV = 3;
    state.scoreS = 2;
    state.buyOpen = false;
    p.hp = 82;
    p.x = 0;
    p.z = 6;
    const enemy = state.players.find((b) => b.team === 'sentinel' && b.alive);
    enemy.x = 1.5;
    enemy.z = -2;
    enemy.yaw = Math.PI;
    enemy.state = 'engage';
    state.money = 4250;
    p.loadout.weaponId = 'ar';
    p.loadout.mag = 24;
    p.loadout.reserve = 90;
    aimAt(new THREE.Vector3(enemy.x, 1.4, enemy.z));
    settle(30);
    state.tracers.push({ fx: p.x, fy: 1.5, fz: p.z, tx: enemy.x, ty: 1.3, tz: enemy.z, t: 4, color: '#ffd27a' });
    hud.hitMarker(false, 4000);
    state.feed.unshift({ text: 'You ▸ Sentry', team: 'vanguard', t: state.time });
  } else if (name === 'plant') {
    // Site A, charge going down, a defender in frame.
    state.phase = 'live';
    state.phaseT = 41;
    state.scoreV = 5;
    state.scoreS = 4;
    state.buyOpen = false;
    p.hp = 100;
    p.x = 21;
    p.z = -12;
    state.charge.state = 'carried';
    state.charge.holderId = 'player';
    state.charge.site = 'A';
    state.charge.plantT = 1.9;
    const enemy = state.players.find((b) => b.team === 'sentinel' && b.alive);
    enemy.x = 27;
    enemy.z = -12;
    enemy.yaw = Math.PI * 0.75;
    enemy.state = 'hold';
    p.loadout.weaponId = 'ar';
    p.loadout.mag = 28;
    p.loadout.reserve = 60;
    aimAt(new THREE.Vector3(enemy.x, 1.4, enemy.z));
    settle(20);
    hud.setPlant(1.9 / 3, 'PLANTING THE CHARGE — HOLD E');
  } else {
    // Match over: the scoreboard with a real match behind it, Vanguard 8–5, Play again.
    state.phase = 'matchover';
    state.scoreV = 8;
    state.scoreS = 5;
    state.matchWinner = 'vanguard';
    const stats = {
      You: [14, 7, true], Falcon: [9, 11, true], Harrier: [11, 9, false], Osprey: [7, 10, true], Merlin: [12, 8, true],
      Warden: [10, 12, false], Bulwark: [8, 9, true], Sentry: [11, 14, false], Aegis: [6, 10, true], Rampart: [10, 8, true],
    };
    for (const pl of state.players) {
      const s = stats[pl.name];
      if (!s) continue;
      [pl.kills, pl.deaths, pl.alive] = s;
    }
    p.x = 0;
    p.z = 10;
    aimAt(new THREE.Vector3(0, 1.5, -12));
    settle(20);
    hud.showScoreboard(scoreRows(), 'VANGUARD WINS THE MATCH — 8–5');
    hud.showPlayAgain(true);
  }
  syncCamera();
  syncWorld(0.016);
  syncHud();
  drainEvents();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug/test hook for headless playtests (read-only state, no gameplay effect).
window.__game = { state, sim };

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
