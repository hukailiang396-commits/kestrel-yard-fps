// Kestrel Yard: a decommissioned desert relay station at dusk. Three lanes run south to
// north between the Vanguard spawn and the two sites: A Long down the east side (open
// sightline, crates), Mid through a doored connector, and B Tunnels down the west side
// (close quarters, roofed). Every box is both a collider and a surface a bullet stops on;
// the waypoint graph below is the only way bots travel, so its edges are all clear.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, y, z, material]
const BOXES = [
  // Floor and perimeter (5 m walls, open sky).
  [65.6, 0.4, 49.6, 0, -0.2, 0, 'sandDark'],
  [65.6, 5, 0.6, 0, 2.5, -24.3, 'concrete'],
  [65.6, 5, 0.6, 0, 2.5, 24.3, 'concrete'],
  [0.6, 5, 49.6, -32.3, 2.5, 0, 'concrete'],
  [0.6, 5, 49.6, 32.3, 2.5, 0, 'concrete'],
  // Mid connector: two walls leaving a 3 m door gap at x = 0, z = 0.
  [14, 3.4, 0.8, -9.5, 1.7, 0, 'concreteDark'],
  [14, 3.4, 0.8, 9.5, 1.7, 0, 'concreteDark'],
  [3.4, 3.4, 0.8, -3.4, 1.7, -4.5, 'concreteDark'],
  [3.4, 3.4, 0.8, 3.4, 1.7, -4.5, 'concreteDark'],
  // Mid booth (the relay hut): low walls around a raised pad.
  [6, 2.2, 0.6, 0, 1.1, 7.2, 'rustDark'],
  [0.6, 2.2, 5, -3, 1.1, 9.4, 'rustDark'],
  [0.6, 2.2, 5, 3, 1.1, 9.4, 'rustDark'],
  [6, 0.5, 5, 0, 0.25, 9.6, 'concrete'],
  // B Tunnels: roof slabs over the west lane, tight walls inside.
  [7, 0.5, 16, -24, 3.1, 2, 'concreteDark'],
  [0.6, 3, 16, -27.5, 1.5, 2, 'concreteDark'],
  [0.6, 3, 6, -20.5, 1.5, -2, 'concreteDark'],
  [0.6, 3, 6, -20.5, 1.5, 8, 'concreteDark'],
  [3.4, 2.4, 0.8, -24, 1.2, -6, 'rustDark'],
  // A Long: a broken wall and a watch platform.
  [0.8, 2.6, 9, 19.5, 1.3, 6, 'concreteDark'],
  [5, 0.5, 4, 26, 2.6, -2, 'concrete'],
  [0.8, 2.6, 4, 28.4, 1.3, -2, 'concreteDark'],
  // Site A frame (east-north) and site B frame (west-north).
  [10, 0.5, 0.6, 24, 3.2, -20.2, 'rust'],
  [0.6, 3.2, 10, 29.2, 1.6, -15.2, 'rust'],
  [10, 0.5, 0.6, -24, 3.2, -20.2, 'rust'],
  [0.6, 3.2, 10, -29.2, 1.6, -15.2, 'rust'],
  // Crates and cover, A Long side.
  [2.2, 1.2, 2.2, 22, 0.6, 12, 'rust'],
  [1.2, 1.2, 1.2, 26.5, 0.6, 8, 'rustDark'],
  [2.4, 0.9, 1.4, 20, 0.45, 2, 'rustDark'],
  [1.4, 2.2, 1.4, 27.5, 1.1, -6, 'rust'],
  [2.2, 1.1, 2.2, 21, 0.55, -9, 'rust'],
  [1.2, 1.2, 1.2, 25.5, 0.6, -12.5, 'rustDark'],
  [3, 1, 1.2, 17, 0.5, -13, 'rustDark'],
  [1.6, 0.8, 1.6, 28, 0.4, -17.5, 'rust'],
  // Crates and cover, Mid.
  [2, 1.1, 2, -7, 0.55, 12, 'rustDark'],
  [1.4, 1.4, 1.4, 7.5, 0.7, 13, 'rust'],
  [2.6, 0.9, 1.4, -6, 0.45, 4, 'rust'],
  [1.4, 2.4, 1.4, 8, 1.2, -7, 'rustDark'],
  [2, 1, 2, -8.5, 0.5, -10, 'rustDark'],
  [1.2, 1.2, 1.2, 5.5, 0.6, -14, 'rust'],
  [3.2, 0.8, 1.2, 0, 0.4, -17, 'rustDark'],
  // Crates and cover, B side.
  [2.2, 1.2, 2.2, -22, 0.6, 12, 'rust'],
  [1.2, 1.2, 1.2, -26.5, 0.6, 8, 'rustDark'],
  [2.4, 0.9, 1.4, -20, 0.45, 2, 'rustDark'],
  [1.4, 2.2, 1.4, -27.5, 1.1, -6, 'rust'],
  [2.2, 1.1, 2.2, -21, 0.55, -9, 'rust'],
  [1.2, 1.2, 1.2, -25.5, 0.6, -12.5, 'rustDark'],
  [3, 1, 1.2, -17, 0.5, -13, 'rustDark'],
  [1.6, 0.8, 1.6, -28, 0.4, -17.5, 'rust'],
  // Spawn cover.
  [2.4, 1, 1.4, -10, 0.5, 19, 'rustDark'],
  [2.4, 1, 1.4, 10, 0.5, 19, 'rustDark'],
  [1.4, 1.4, 1.4, -14, 0.7, -19, 'rust'],
  [1.4, 1.4, 1.4, 14, 0.7, -19, 'rust'],
  // Sandbag rows (low, crouch cover).
  [4, 0.7, 1, -12, 0.35, 15, 'sandDark'],
  [4, 0.7, 1, 12, 0.35, 15, 'sandDark'],
  [4, 0.7, 1, -12, 0.35, -16, 'sandDark'],
  [4, 0.7, 1, 12, 0.35, -16, 'sandDark'],
];

// Silos: cylinders approximated by a box collider of the same footprint.
const SILOS = [
  { x: 29.5, z: -21.5, r: 1.6, h: 6 },
  { x: -29.5, z: -21.5, r: 1.6, h: 6 },
  { x: 29.5, z: 21.5, r: 1.8, h: 7 },
  { x: -29.5, z: 21.5, r: 1.8, h: 7 },
];

// Waypoint graph. Indices are stable; bots pathfind with BFS over `links`.
// Paths are lists of these indices; followPath resolves each one.
export const WAYPOINTS = [
  { x: -6, z: 20, links: [1, 2, 4] }, // 0 Vanguard spawn
  { x: 0, z: 20, links: [0, 2, 6] }, // 1
  { x: 6, z: 20, links: [0, 1, 7] }, // 2
  { x: -12, z: 18, links: [0, 5] }, // 3
  { x: 12, z: 18, links: [2, 8] }, // 4
  { x: -18, z: 16, links: [3, 9] }, // 5 B approach
  { x: 0, z: 12, links: [1, 10, 11] }, // 6 mid south
  { x: 18, z: 16, links: [4, 12] }, // 7 A approach
  { x: 24, z: 10, links: [7, 13] }, // 8 A long
  { x: -24, z: 10, links: [5, 14] }, // 9 B tunnels
  { x: 0, z: 4, links: [6, 15] }, // 10 mid
  { x: -7, z: 12, links: [6, 14] }, // 11 mid west
  { x: 24, z: 2, links: [8, 16] }, // 12 A long
  { x: 24, z: -6, links: [12, 17] }, // 13 A long
  { x: -24, z: 2, links: [9, 18] }, // 14 B tunnels
  { x: 0, z: -4, links: [10, 19, 20] }, // 15 mid north
  { x: 24, z: -12, links: [13, 21] }, // 16 A entry
  { x: 24, z: -15, links: [16, 22] }, // 17 SITE A
  { x: -24, z: -6, links: [14, 23] }, // 18 B tunnels
  { x: -8, z: -20, links: [15, 24] }, // 19 Sentinel spawn west
  { x: 0, z: -20, links: [15, 19, 25] }, // 20 Sentinel spawn
  { x: 8, z: -20, links: [15, 25] }, // 21 Sentinel spawn east
  { x: 20, z: -17, links: [17, 21] }, // 22 A hold
  { x: 27, z: -12, links: [17, 21] }, // 23 A hold
  { x: -24, z: -12, links: [18, 26] }, // 24 B entry
  { x: -24, z: -15, links: [24, 27] }, // 25 SITE B
  { x: -20, z: -17, links: [25, 19] }, // 26 B hold
  { x: -27, z: -12, links: [25, 19] }, // 27 B hold
  { x: -4, z: -8, links: [15, 19] }, // 28 mid hold west
  { x: 4, z: -8, links: [15, 21] }, // 29 mid hold east
  { x: 7, z: 12, links: [6, 12] }, // 30 mid east link
];

export const SITES = {
  A: { name: 'A', x: 24, z: -15, minX: 19, maxX: 29, minZ: -20, maxZ: -10 },
  B: { name: 'B', x: -24, z: -15, minX: -29, maxX: -19, minZ: -20, maxZ: -10 },
};

export const SPAWNS = {
  vanguard: [
    { x: -6, z: 20, yaw: 0 },
    { x: 0, z: 20, yaw: 0 },
    { x: 6, z: 20, yaw: 0 },
    { x: -12, z: 18, yaw: 0.3 },
    { x: 12, z: 18, yaw: -0.3 },
  ],
  sentinel: [
    { x: -8, z: -20, yaw: Math.PI },
    { x: 0, z: -20, yaw: Math.PI },
    { x: 8, z: -20, yaw: Math.PI },
    { x: -16, z: -18, yaw: Math.PI },
    { x: 16, z: -18, yaw: Math.PI },
  ],
};

// BFS over the waypoint graph; returns a list of waypoint indices from `from` to `to`.
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of WAYPOINTS[cur].links) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = to;
        while (node !== from) {
          node = prev[node];
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i].x - x;
    const dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' || name === 'ink' ? 0.5 : 0.95,
      metalness: name === 'steel' ? 0.4 : 0.02,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, mat] of BOXES) box(w, h, d, x, y, z, mat);

  // Silos: a cylinder mesh with a matching box collider.
  const siloGeo = new THREE.CylinderGeometry(1.6, 1.8, 6, 14);
  for (const silo of SILOS) {
    const mesh = new THREE.Mesh(siloGeo, materials.concrete);
    mesh.scale.set(silo.r / 1.6, silo.h / 6, silo.r / 1.6);
    mesh.position.set(silo.x, silo.h / 2, silo.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(silo.x - silo.r, 0, silo.z - silo.r),
      new THREE.Vector3(silo.x + silo.r, silo.h, silo.z + silo.r),
    ));
    shootables.push(mesh);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(silo.r * 0.7, silo.r * 0.7, 0.5, 14), materials.rust);
    cap.position.set(silo.x, silo.h + 0.25, silo.z);
    group.add(cap);
  }

  // Painted ground: lane strips and the two site plates (thin, no collision).
  function plate(w, d, x, z, mat, y = 0.02) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.04, d),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[mat]), roughness: 0.95 }),
    );
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  plate(10, 10, 24, -15, 'rust');
  plate(10, 10, -24, -15, 'rust');
  plate(2.4, 44, 24, 0, 'sandDark');
  plate(2.4, 44, -24, 0, 'sandDark');
  plate(2.4, 44, 0, 0, 'sandDark');
  plate(8, 8, 0, 0, 'concreteDark', 0.015);

  // Relay tower at mid-north: the map's landmark, with a blinking beacon.
  const tower = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11, 1.2), materials.steel);
  mast.position.y = 5.5;
  mast.castShadow = true;
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.25, 12), materials.rust);
  dish.position.set(0, 8.4, 0);
  dish.rotation.x = Math.PI / 3;
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), beaconMat);
  beacon.position.y = 11.4;
  tower.add(mast, dish, beacon);
  tower.position.set(0, 0, -21.5);
  scene.add(tower);
  colliders.push(new THREE.Box3(new THREE.Vector3(-0.7, 0, -22.2), new THREE.Vector3(0.7, 11, -20.8)));
  shootables.push(mast);

  // Site beacons: tall poles with a glowing tip, so a site reads from across the map.
  const siteBeacons = [];
  for (const site of Object.values(SITES)) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.4, 0.3), materials.steel);
    pole.position.set(site.x, 2.2, site.z);
    pole.castShadow = true;
    const tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) });
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), tipMat);
    tip.position.set(site.x, 4.7, site.z);
    group.add(pole, tip);
    siteBeacons.push(tipMat);
  }

  // Dusk light: a low warm sun from the west, a cool sky fill, and warm fog.
  const sky = new THREE.HemisphereLight(new THREE.Color('#f2b880'), new THREE.Color('#4a3626'), 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.4);
  sun.position.set(-38, 16, 26);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7fb5b0'), 0.5);
  fill.position.set(20, 12, -30);
  scene.add(fill);

  // Sun disc low on the horizon, and dune silhouettes outside the walls.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3d'), fog: false }),
  );
  sunDisc.position.set(-70, 9, -60);
  sunDisc.lookAt(0, 9, 0);
  scene.add(sunDisc);
  const duneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sandDark), roughness: 1 });
  for (const [x, z, w, h] of [[-60, -50, 70, 7], [50, -55, 80, 9], [0, -70, 120, 6], [-70, 40, 60, 6], [70, 45, 60, 8]]) {
    const dune = new THREE.Mesh(new THREE.BoxGeometry(w, h, 18), duneMat);
    dune.position.set(x, h / 2 - 0.5, z);
    scene.add(dune);
  }

  let time = 0;
  return {
    colliders,
    shootables,
    waypoints: WAYPOINTS,
    sites: SITES,
    spawns: SPAWNS,
    group,
    // Segment vs AABB line-of-sight: true when nothing solid stands between a and b.
    hasLineOfSight(a, b) {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      if (len < 0.001) return true;
      dir.multiplyScalar(1 / len);
      const ray = new THREE.Ray(a, dir);
      const hit = new THREE.Vector3();
      for (const box3 of colliders) {
        if (ray.intersectBox(box3, hit)) {
          const d = hit.distanceTo(a);
          if (d < len - 0.05) return false;
        }
      }
      return true;
    },
    step(dt) {
      time += dt;
      const pulse = 0.55 + 0.45 * Math.sin(time * 2.4);
      beaconMat.color.setHex(0xf0a830).multiplyScalar(0.6 + pulse * 0.8);
      for (const mat of siteBeacons) mat.color.setHex(0xf0a830).multiplyScalar(0.6 + pulse * 0.8);
    },
  };
}
