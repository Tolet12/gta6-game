// Police: units spawn at road edges in proportion to the wanted level,
// chase the player's position on foot or in a car, ram and pin, and fill the
// BUSTED meter when they stay close to a slow or stopped player.

import * as THREE from 'three';
import { Car } from './vehicles.js';
import { CONFIG } from './config.js';
import { clamp } from './random.js';

export class Police {
  constructor(scene, world, rng) {
    this.scene = scene; this.world = world; this.rng = rng;
    this.units = []; // Car instances with isPolice
    this.bust = 0; // 0..1
    this.seesPlayer = false;
  }
  spawnOne(playerPos) {
    // Enter from the nearest road edge intersection to the player.
    const coords = this.world.coords;
    const edge = this.rng.pick([coords[0], coords[coords.length - 1]]);
    const along = this.rng.chance(0.5);
    const x = along ? this.world.nearestRoadCoord(playerPos.x) : edge;
    const z = along ? edge : this.world.nearestRoadCoord(playerPos.z);
    if (Math.hypot(x - playerPos.x, z - playerPos.z) < 45) return; // never on top of the player
    const car = new Car(this.scene, x, z, Math.atan2(playerPos.x - x, playerPos.z - z), 0xffffff, true);
    car.speed = 6;
    this.units.push(car);
  }
  update(dt, playerPos, playerSpeed, wanted) {
    const want = wanted.desiredUnits();
    if (this.units.length < want) this.spawnOne(playerPos);
    // Heat gone: units give up and leave. Otherwise trim the surplus slowly.
    if (want === 0 && this.units.length > 0) { const c = this.units.pop(); c.dispose(this.scene); }
    else if (this.units.length > want + 1) { const c = this.units.pop(); c.dispose(this.scene); }
    this.seesPlayer = false;
    let closest = Infinity;
    const aggression = 0.75 + wanted.stars * 0.14;
    for (const unit of this.units) {
      const dx = playerPos.x - unit.pos.x, dz = playerPos.z - unit.pos.z;
      const dist = Math.hypot(dx, dz);
      closest = Math.min(closest, dist);
      if (dist < CONFIG.sightRange + 25) this.seesPlayer = true;
      // Aim at a point slightly ahead of the player to cut corners off.
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - unit.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      let throttle = 1;
      if (dist < 6) throttle = 0.25; // pin, don't orbit
      if (Math.abs(diff) > 2.4) throttle = -0.6; // turned around: back up
      const speedCap = 30 * aggression + 6;
      if (unit.speed > speedCap) throttle = 0;
      unit.update(dt, { throttle, steer: clamp(diff * 1.6, -1, 1), brake: false, handbrake: Math.abs(diff) > 1.2 && unit.speed > 10 }, this.world);
    }
    // BUSTED meter: a unit close in while the player is slow fills it.
    const slow = Math.abs(playerSpeed) < 2.2;
    if (closest < CONFIG.bustRange && slow && wanted.stars > 0) this.bust = clamp(this.bust + dt / CONFIG.bustFillSeconds, 0, 1);
    else this.bust = clamp(this.bust - dt / (CONFIG.bustFillSeconds * 0.7), 0, 1);
    return this.bust >= 1;
  }
  clear() {
    for (const u of this.units) u.dispose(this.scene);
    this.units = []; this.bust = 0; this.seesPlayer = false;
  }
  forceSpawnNear(playerPos, count) {
    // Screenshot staging: ring the player with units at road positions.
    const spots = [
      { x: playerPos.x - 4, z: playerPos.z - 13 }, { x: playerPos.x + 5, z: playerPos.z - 17 },
      { x: playerPos.x - 10, z: playerPos.z - 8 },
    ];
    for (let i = 0; i < Math.min(count, spots.length); i++) {
      const s = spots[i];
      const car = new Car(this.scene, s.x, s.z, Math.atan2(playerPos.x - s.x, playerPos.z - s.z), 0xffffff, true);
      this.units.push(car);
    }
  }
}

// A reusable beacon: a glowing translucent pillar plus a ground ring, used
// for mission objectives so they read from across the map.
export function makeBeacon(scene, color = 0xffd23e) {
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 21; g.add(pillar);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.1, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  scene.add(g);
  return { group: g, set(x, z, visible = true) { g.position.set(x, 0, z); g.visible = visible; }, pulse(t) { ring.scale.setScalar(1 + Math.sin(t * 4) * 0.12); } };
}
