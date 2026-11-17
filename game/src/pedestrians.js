// Pedestrians: locals strolling the sidewalks. They wander corner to corner,
// flee from nearby violence, and can be knocked down by a speeding car (the
// caller reports the crime; this module only moves the people).

import { buildPerson } from './player.js';
import { CONFIG } from './config.js';
import { clamp, lerpAngle } from './random.js';

const SHIRTS = [0x4fb8c9, 0xf2b134, 0xe8e3d8, 0x3fa46a, 0xd96c75, 0x7a68b8, 0x2e7fc2];
const PANTS = [0x33404f, 0x6b5a4a, 0x27313d, 0x7a4a3a, 0x445566];

export class Pedestrian {
  constructor(scene, world, rng) {
    this.world = world; this.rng = rng;
    const parts = buildPerson(rng.pick(SHIRTS), rng.pick(PANTS), rng.pick([0xc98d5f, 0x8a5a34, 0xe8b48a, 0x6e4226]));
    this.mesh = parts.group; this.parts = parts;
    this.speed = rng.range(1.5, 2.6);
    this.walkPhase = rng.range(0, 6);
    this.state = 'walk'; // 'walk' | 'flee' | 'down'
    this.downTimer = 0; this.fleeTimer = 0; this.fleeFrom = null;
    this.heading = 0;
    this.relocate();
    scene.add(this.mesh);
  }
  get pos() { return this.mesh.position; }
  relocate() {
    const w = this.world, rng = this.rng;
    const coord = rng.pick(w.coords);
    const t = rng.range(-270, 270);
    if (rng.chance(0.5)) this.pos.set(coord + rng.sign() * (CONFIG.roadWidth / 2 + 1.8), 0, t);
    else this.pos.set(t, 0, coord + rng.sign() * (CONFIG.roadWidth / 2 + 1.8));
    this.pickTarget();
    this.state = 'walk';
    this.mesh.rotation.z = 0;
  }
  pickTarget() {
    const w = this.world, rng = this.rng;
    const ix = w.nearestRoadCoord(this.pos.x), iz = w.nearestRoadCoord(this.pos.z);
    // On a vertical street (x near a road line) stroll along z, and the other
    // way on a horizontal street, keeping the current sidewalk offset.
    if (Math.abs(this.pos.x - ix) <= Math.abs(this.pos.z - iz)) {
      this.target = { x: this.pos.x, z: iz + rng.sign() * 85 };
    } else {
      this.target = { x: ix + rng.sign() * 85, z: this.pos.z };
    }
  }
  scare(fromPos) {
    if (this.state === 'down') return;
    this.state = 'flee'; this.fleeTimer = 2.6; this.fleeFrom = fromPos;
  }
  knockDown() {
    if (this.state === 'down') return false;
    this.state = 'down'; this.downTimer = 5;
    this.mesh.rotation.z = Math.PI / 2;
    return true;
  }
  update(dt) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) this.relocate();
      return;
    }
    let tx, tz, speed = this.speed;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0 || !this.fleeFrom) { this.state = 'walk'; this.pickTarget(); return; }
      tx = this.pos.x + (this.pos.x - this.fleeFrom.x); tz = this.pos.z + (this.pos.z - this.fleeFrom.z);
      speed = 5.2;
    } else {
      tx = this.target.x; tz = this.target.z;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 2.2) { this.pickTarget(); return; }
    }
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz) || 1;
    this.heading = lerpAngle(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 8));
    this.pos.x += (dx / d) * speed * dt;
    this.pos.z += (dz / d) * speed * dt;
    this.pos.x = clamp(this.pos.x, -300, 300); this.pos.z = clamp(this.pos.z, -300, 330);
    this.walkPhase += dt * speed * 1.7;
    const swing = Math.sin(this.walkPhase) * 0.6;
    this.parts.legL.rotation.x = swing; this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.7; this.parts.armR.rotation.x = swing * 0.7;
    this.mesh.rotation.y = this.heading;
  }
}

export function spawnPedestrians(scene, world, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) peds.push(new Pedestrian(scene, world, rng));
  return peds;
}
