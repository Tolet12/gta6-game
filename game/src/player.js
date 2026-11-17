// The player on foot: a simple articulated low-poly figure with walk/run
// limb swing and a punch, plus health and car entry state. The same figure
// builder dresses the pedestrians.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, lerpAngle } from './random.js';

export function buildPerson(shirt, pants, skin = 0xc98d5f) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), shirtMat);
  torso.position.y = 1.12; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.42), skinMat);
  head.position.y = 1.82; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48), shirtMat);
  cap.position.y = 2.08; g.add(cap);
  function limb(w, len, mat, x, y, z) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.y = -len / 2; pivot.add(m); g.add(pivot); return pivot;
  }
  const armL = limb(0.2, 0.78, shirtMat, -0.48, 1.5, 0);
  const armR = limb(0.2, 0.78, skinMat, 0.48, 1.5, 0);
  const legL = limb(0.24, 0.72, pantsMat, -0.19, 0.72, 0);
  const legR = limb(0.24, 0.72, pantsMat, 0.19, 0.72, 0);
  return { group: g, armL, armR, legL, legR, torso };
}

export class Player {
  constructor(scene, spawn) {
    const parts = buildPerson(0xff7847, 0x2b3a4a); // sunset-orange shirt
    this.mesh = parts.group; this.parts = parts;
    this.mesh.position.set(spawn.x, 0, spawn.z);
    this.heading = Math.PI; // face the street / camera start
    this.health = CONFIG.maxHealth;
    this.mode = 'foot'; // 'foot' | 'car'
    this.car = null;
    this.walkPhase = 0; this.punchTimer = 0; this.speedNow = 0;
    scene.add(this.mesh);
  }
  get pos() { return this.mesh.position; }
  startPunch() { if (this.punchTimer <= 0) this.punchTimer = 0.32; }
  // move: world-space wish direction (unit or zero), run: sprint held
  update(dt, move, run, world) {
    const moving = Math.hypot(move.x, move.z) > 0.05;
    const speed = run ? CONFIG.runSpeed : CONFIG.walkSpeed;
    this.speedNow = moving ? speed : 0;
    if (moving) {
      const want = Math.atan2(move.x, move.z);
      this.heading = lerpAngle(this.heading, want, Math.min(1, dt * 12));
      this.pos.x += move.x * speed * dt;
      this.pos.z += move.z * speed * dt;
      world.collideCircle(this.pos, CONFIG.playerRadius);
      this.walkPhase += dt * speed * 1.6;
    }
    const swing = moving ? Math.sin(this.walkPhase) * 0.65 : 0;
    this.parts.legL.rotation.x = swing; this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      const t = 1 - this.punchTimer / 0.32;
      this.parts.armR.rotation.x = -Math.sin(t * Math.PI) * 1.9;
    } else this.parts.armR.rotation.x = swing * 0.8;
    this.mesh.rotation.y = this.heading;
    this.mesh.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
  }
  damage(amount) { this.health = clamp(this.health - amount, 0, CONFIG.maxHealth); }
  heal() { this.health = CONFIG.maxHealth; }
  enterCar(car) { this.mode = 'car'; this.car = car; this.mesh.visible = false; }
  exitCar() {
    if (!this.car) return;
    const c = this.car;
    this.pos.set(c.pos.x + Math.cos(c.heading) * 2.4, 0, c.pos.z - Math.sin(c.heading) * 2.4);
    this.mode = 'foot'; this.car = null; this.mesh.visible = true;
  }
}
