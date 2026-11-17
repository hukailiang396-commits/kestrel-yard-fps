// Player movement: acceleration, friction, crouch and AABB collision, resolved one axis
// at a time so a wall never swallows the player. The feet stay on the ground plane; the
// map is flat, so there is no gravity or jumping — stopping to aim is the skill.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const RUN_SPEED = 5.4;
const WALK_SPEED = 2.6; // Shift: slow, quiet, tight spread
const CROUCH_SPEED = 2.4;
const ACCEL = 46;
const FRICTION = 10;

export function createPlayer(colliders) {
  const player = {
    position: new THREE.Vector3(0, 0, 19),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // lift keeps the floor out of the horizontal tests, so standing on the ground is never
  // read as walking into a wall.
  function overlaps(x, z, height, lift) {
    probe.min.set(x - RADIUS, lift, z - RADIUS);
    probe.max.set(x + RADIUS, height - lift, z + RADIUS);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  function look(dx, dy, sensitivity = 0.0021) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && player.crouching) {
      // Stand up only when the space above is clear.
      if (!overlaps(player.position.x, player.position.z, STAND_HEIGHT, 0.02)) {
        player.crouching = false;
        player.height = STAND_HEIGHT;
      }
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = player.crouching ? CROUCH_SPEED : walking ? WALK_SPEED : RUN_SPEED;
    const blend = Math.min(1, (ACCEL * dt) / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (!wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    const nextX = player.position.x + player.velocity.x * dt;
    if (!overlaps(nextX, player.position.z, player.height, 0.04)) player.position.x = nextX;
    else player.velocity.x = 0;
    const nextZ = player.position.z + player.velocity.z * dt;
    if (!overlaps(player.position.x, nextZ, player.height, 0.04)) player.position.z = nextZ;
    else player.velocity.z = 0;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
