// Cars: stylised meshes (body, cabin, wheels, lights), arcade physics with
// damage, lane-following traffic AI, and parked cars for the player to take.

import * as THREE from 'three';
import { CONFIG, CAR_COLORS } from './config.js';
import { clamp, lerpAngle } from './random.js';

const bodyGeo = new THREE.BoxGeometry(2.0, 0.62, 4.3);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.0);
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
const lightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.08);
const barGeo = new THREE.BoxGeometry(1.5, 0.22, 0.5);
const smokeGeo = new THREE.SphereGeometry(0.55, 7, 6);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17181a });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x223844 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });

export function makeCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f2f0 : color });
  const body = new THREE.Mesh(bodyGeo, paint); body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glassMat); cabin.position.set(0, 1.08, -0.25); g.add(cabin);
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.2, 4.34), new THREE.MeshLambertMaterial({ color: 0x2456c8 }));
    stripe.position.y = 0.62; g.add(stripe);
    const bar = new THREE.Mesh(barGeo, new THREE.MeshLambertMaterial({ color: 0x333333 }));
    bar.position.set(0, 1.48, -0.25); g.add(bar);
  }
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); wheels.push(w);
  }
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x661111 });
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(lightGeo, headMat); head.position.set(s * 0.62, 0.62, 2.16); g.add(head);
    const tail = new THREE.Mesh(lightGeo, brakeMat); tail.position.set(s * 0.62, 0.66, -2.16); g.add(tail);
  }
  const beaconL = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  const beaconR = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x2266ff }));
  if (isPolice) {
    beaconL.position.set(-0.4, 1.62, -0.25); beaconR.position.set(0.4, 1.62, -0.25);
    g.add(beaconL); g.add(beaconR);
  }
  const smoke = new THREE.Mesh(smokeGeo, new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.55 }));
  smoke.position.set(0, 1.25, 1.7); smoke.visible = false; g.add(smoke);
  return { group: g, wheels, brakeMat, beaconL, beaconR, smoke };
}

export class Car {
  constructor(scene, x, z, heading, color, isPolice = false) {
    const parts = makeCarMesh(color, isPolice);
    this.mesh = parts.group; this.wheels = parts.wheels;
    this.brakeMat = parts.brakeMat; this.beaconL = parts.beaconL; this.beaconR = parts.beaconR; this.smoke = parts.smoke;
    this.mesh.position.set(x, 0, z);
    this.heading = heading; this.speed = 0;
    this.health = CONFIG.carMaxHealth;
    this.isPolice = isPolice; this.wrecked = false;
    this.steerVis = 0; this.flash = 0;
    this.onCrash = null; // (strength, self) => void, wired by main
    scene.add(this.mesh);
    this.syncMesh();
  }
  get pos() { return this.mesh.position; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  // control: { throttle: -1..1, steer: -1..1, brake: bool, handbrake: bool }
  update(dt, control, world) {
    const C = CONFIG;
    if (this.wrecked) control = { throttle: 0, steer: 0, brake: true };
    if (control.throttle > 0) this.speed += C.carAccel * control.throttle * dt * (this.speed < 0 ? 2.2 : 1);
    if (control.throttle < 0) {
      if (this.speed > 0.5) this.speed -= C.carBrake * dt; // braking
      else this.speed += C.carReverseAccel * control.throttle * dt;
    }
    if (control.brake) this.speed -= Math.sign(this.speed) * C.carBrake * 0.8 * dt;
    const drag = C.carDrag * (control.handbrake ? 2.6 : 1);
    this.speed -= this.speed * drag * dt;
    if (!control.throttle && Math.abs(this.speed) < 0.25) this.speed = 0;
    this.speed = clamp(this.speed, C.carMaxReverse, C.carMaxSpeed * (this.isPolice ? 1.12 : 1));
    const steerTarget = clamp(control.steer, -1, 1) * 0.5;
    this.steerVis += (steerTarget - this.steerVis) * Math.min(1, dt * 8);
    if (Math.abs(this.speed) > 0.05) {
      const grip = control.handbrake ? 1.65 : 1;
      this.heading += (this.speed / 5.6) * Math.tan(this.steerVis) * grip * dt;
    }
    const f = this.forward();
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    world.collideCircle(this.pos, C.carRadius);
    const correction = Math.hypot(this.pos.x - (px + f.x * this.speed * dt), this.pos.z - (pz + f.z * this.speed * dt));
    if (correction > 0.25 && Math.abs(this.speed) > 4) {
      const strength = clamp(Math.abs(this.speed) / 22, 0.2, 1.4);
      this.damage(9 * strength * Math.abs(this.speed) * 0.55);
      if (this.onCrash) this.onCrash(strength, this);
      this.speed *= 0.35;
    }
    this.brakeMat.color.setHex(control.brake || control.throttle < 0 ? 0xff2a1a : 0x661111);
    this.syncMesh(dt);
  }
  damage(amount) {
    if (this.wrecked) return;
    this.health -= amount;
    if (this.health <= 0) { this.health = 0; this.wrecked = true; this.speed = 0; }
  }
  syncMesh(dt = 0) {
    this.mesh.rotation.y = this.heading;
    for (const w of this.wheels) w.rotation.x += this.speed * dt * 2.4;
    this.smoke.visible = this.health < 45;
    if (this.smoke.visible) { const s = 1 + (45 - this.health) / 30 + Math.sin(performance.now() * 0.01) * 0.15; this.smoke.scale.setScalar(Math.max(0.6, s)); }
    if (this.isPolice) {
      this.flash += dt * 9;
      const on = Math.sin(this.flash) > 0;
      this.beaconL.material.color.setHex(on ? 0xff2222 : 0x551111);
      this.beaconR.material.color.setHex(on ? 0x113377 : 0x2266ff);
    }
  }
  dispose(scene) { scene.remove(this.mesh); }
}

// Push overlapping cars apart; returns impact strength for the pair or 0.
export function resolveCarPair(a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz), min = 3.1;
  if (d >= min || d < 1e-4) return 0;
  const push = (min - d) / 2, nx = dx / d, nz = dz / d;
  a.pos.x -= nx * push; a.pos.z -= nz * push;
  b.pos.x += nx * push; b.pos.z += nz * push;
  const rel = Math.abs(a.speed - b.speed);
  const strength = clamp((rel + Math.min(Math.abs(a.speed), Math.abs(b.speed)) * 0.4) / 18, 0, 1.2);
  if (rel > 3) { a.damage(strength * 7); b.damage(strength * 7); a.speed *= 0.72; b.speed *= 0.72; }
  return strength;
}

function laneOffset(dir) { return { x: -dir.z * 3.2, z: dir.x * 3.2 }; }

// Traffic: drives waypoint to waypoint along the lane graph.
export class TrafficDriver {
  constructor(car, world, rng) {
    this.car = car; this.world = world; this.rng = rng;
    this.cruise = rng.range(8.5, 13);
    this.pickNext(true);
  }
  pickNext(first = false) {
    const coords = this.world.coords;
    const p = this.car.pos;
    const ix = this.world.nearestRoadCoord(p.x), iz = this.world.nearestRoadCoord(p.z);
    const dirs = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
    const options = dirs.filter((d) => {
      const nx = ix + d.x * 85, nz = iz + d.z * 85;
      return nx >= coords[0] - 1 && nx <= coords[coords.length - 1] + 1 && nz >= coords[0] - 1 && nz <= coords[coords.length - 1] + 1;
    });
    const dir = first || !this.dir ? this.rng.pick(options) : (this.rng.chance(0.62) && options.includes(this.dir) ? this.dir : this.rng.pick(options));
    this.dir = dir;
    const off = laneOffset(dir);
    const step = 85;
    this.target = { x: ix + dir.x * step + off.x, z: iz + dir.z * step + off.z };
    if (first) { // start partway along a street, already in lane
      this.car.pos.x = ix + off.x + dir.x * this.rng.range(8, 60) - (dir.x ? 0 : 0);
      this.car.pos.z = iz + off.z + dir.z * this.rng.range(8, 60);
      if (dir.x) this.car.pos.x = ix + dir.x * this.rng.range(8, 60); else this.car.pos.z = iz + dir.z * this.rng.range(8, 60);
      this.car.heading = Math.atan2(dir.x, dir.z);
    }
  }
  update(dt, obstacles) {
    const car = this.car;
    const dx = this.target.x - car.pos.x, dz = this.target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 7) this.pickNext();
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    let throttle = Math.abs(diff) < 1.1 ? 0.75 : 0.15;
    // Brake for anything close ahead.
    const f = car.forward();
    for (const o of obstacles) {
      if (o === car) continue;
      const ox = o.pos.x - car.pos.x, oz = o.pos.z - car.pos.z;
      const ahead = ox * f.x + oz * f.z, side = Math.abs(ox * f.z - oz * f.x);
      if (ahead > 0 && ahead < 9 && side < 2.4) { throttle = car.speed > 1 ? -0.7 : 0; break; }
    }
    const targetSpeed = throttle > 0 ? this.cruise : 0;
    if (car.speed > targetSpeed + 1) throttle = -0.5;
    car.update(dt, { throttle, steer: clamp(diff * 1.4, -1, 1), brake: false, handbrake: false }, this.world);
  }
}

export function spawnTraffic(scene, world, rng, count) {
  const drivers = [];
  for (let i = 0; i < count; i++) {
    const ix = rng.pick(world.coords), iz = rng.pick(world.coords);
    const car = new Car(scene, ix, iz, 0, rng.pick(CAR_COLORS));
    const driver = new TrafficDriver(car, world, rng);
    drivers.push(driver);
  }
  return drivers;
}

export function spawnParked(scene, world, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const alongX = rng.chance(0.5);
    const coord = rng.pick(world.coords);
    const t = rng.range(-270, 270);
    const side = rng.sign() * (CONFIG.roadWidth / 2 - 2.1);
    const x = alongX ? t : coord + side;
    const z = alongX ? coord + side : t;
    const heading = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? Math.PI : 0);
    const car = new Car(scene, x, z, heading, rng.pick(CAR_COLORS));
    car.syncMesh();
    cars.push(car);
  }
  // One reliable starter car beside the player spawn.
  const starter = new Car(scene, CONFIG.playerSpawn.x + 7, CONFIG.playerSpawn.z - 4, Math.PI, 0xd94f3d);
  starter.syncMesh();
  cars.push(starter);
  return cars;
}
