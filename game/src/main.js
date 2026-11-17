// NEON PALMS — boot and orchestration. Owns the renderer, the fixed-timestep
// loop, the third-person camera, the game state machine (title, playing,
// paused, busted, wasted), crime wiring between cars, pedestrians, wanted
// and police, mission events, and the localStorage save.

import * as THREE from 'three';
import { CONFIG, MISSIONS } from './config.js';
import { RNG, seedFromUrl, clamp, lerp, lerpAngle, dist2d } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { buildWorld } from './world.js';
import { Car, spawnTraffic, spawnParked, resolveCarPair } from './vehicles.js';
import { Player } from './player.js';
import { spawnPedestrians } from './pedestrians.js';
import { Wanted } from './wanted.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'neonpalms-save';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.nextMission !== 'number') return null;
    return { money: data.money, nextMission: clamp(data.nextMission, 0, MISSIONS.length), finished: !!data.finished };
  } catch { return null; }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.seed = seedFromUrl();
    this.rng = new RNG(this.seed);
    this.input = new Input(this.canvas);
    this.audio = new AudioSys();
    this.world = buildWorld(this.scene, this.rng);
    this.hud = new HUD();

    this.saved = loadSave();
    this.money = this.saved?.money ?? 0;
    this.player = new Player(this.scene, this.world.spawn);
    this.trafficDrivers = spawnTraffic(this.scene, this.world, this.rng, 14);
    this.parkedCars = spawnParked(this.scene, this.world, this.rng, 16);
    this.starterCar = this.parkedCars[this.parkedCars.length - 1];
    this.peds = spawnPedestrians(this.scene, this.world, this.rng, 16);
    this.wanted = new Wanted();
    this.police = new Police(this.scene, this.world, this.rng);
    this.missions = new Missions(this.scene, this.world, this.saved);

    this.state = 'title'; // title | playing | paused | busted | wasted
    this.camYaw = 0; // direction from the target TO the camera; spawn faces -z, so the camera sits at +z
    this.camPitch = 0.32; this.fov = 62;
    this.time = 0; this.shake = 0;
    this.wireCrashes();
    this.hud.setScreen('title', { hasSave: !!this.saved });
    document.getElementById('start-btn').addEventListener('click', () => this.startGame(true));
    document.getElementById('continue-btn').addEventListener('click', () => this.startGame(false));
    this.canvas.addEventListener('pointerdown', () => this.audio.ensure());
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ money: Math.floor(this.money), nextMission: this.missions.nextIndex, finished: this.missions.finished }));
    } catch { /* private mode etc: saving is best-effort */ }
  }

  startGame(fresh) {
    if (fresh) {
      this.money = 0;
      this.missions.nextIndex = 0; this.missions.doneCount = 0; this.missions.finished = false;
      this.missions.phase = 'offered'; this.missions.active = null; this.missions.refreshBeacon();
      this.wanted.clear(); this.police.clear();
      this.player.heal();
      if (this.player.mode === 'car') this.player.exitCar();
      this.player.pos.set(this.world.spawn.x, 0, this.world.spawn.z);
      this.save();
    }
    this.state = 'playing';
    this.hud.setScreen(null);
    this.audio.ensure();
  }

  wireCrashes() {
    const onCrash = (strength, car) => {
      this.audio.thud(strength);
      this.shake = Math.min(0.5, strength * 0.4);
      if (this.player.mode === 'car' && this.player.car === car && strength > 0.85) this.player.damage(3);
    };
    for (const c of [...this.parkedCars, ...this.trafficDrivers.map((d) => d.car)]) c.onCrash = onCrash;
    this._crashHandler = onCrash;
  }

  witnesses() { return [...this.peds, ...this.police.units]; }

  reportCrime(kind, pos) {
    const before = this.wanted.stars;
    const seen = this.wanted.report(kind, pos, this.witnesses());
    if (seen && this.wanted.stars > before) this.hud.showBanner('WANTED', `${'★'.repeat(this.wanted.stars)} — the police are coming`, 1.6);
    return seen;
  }

  nearestEnterableCar() {
    let best = null, bd = 3.4;
    for (const c of [...this.parkedCars, ...this.trafficDrivers.map((d) => d.car)]) {
      if (c.wrecked) continue;
      const d = dist2d(this.player.pos.x, this.player.pos.z, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enterCar(car) {
    const wasParked = this.parkedCars.includes(car);
    if (!car.stolen) {
      car.stolen = true;
      this.reportCrime('theft', car.pos);
      for (const ped of this.peds) if (dist2d(ped.pos.x, ped.pos.z, car.pos.x, car.pos.z) < 16) ped.scare(car.pos);
    }
    if (!wasParked) this.trafficDrivers = this.trafficDrivers.filter((d) => d.car !== car);
    else this.parkedCars = this.parkedCars.filter((c) => c !== car);
    car.onCrash = this._crashHandler;
    this.player.enterCar(car);
    this.audio.ensure();
  }

  placePlayerInCar(car, x, z, heading, speed) {
    car.stolen = true; // staging is not a crime scene
    if (this.player.mode === 'car' && this.player.car !== car) this.player.exitCar();
    car.pos.set(x, 0, z); car.heading = heading; car.speed = speed; car.syncMesh();
    if (!this.parkedCars.includes(car) && !this.trafficDrivers.some((d) => d.car === car)) this.parkedCars.push(car);
    if (this.player.mode !== 'car') this.enterCar(car);
    car.speed = speed; // enterCar may have reported a theft; keep staged speed
    this.camYaw = heading + Math.PI;
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.hud.setScreen('pause'); this.audio.setEngine(false, 0); this.audio.setSiren(false); }
    else if (this.state === 'paused') { this.state = 'playing'; this.hud.setScreen(null); }
  }

  endRun(kind) {
    // kind: 'wasted' | 'busted'
    this.state = kind;
    const cost = kind === 'wasted' ? CONFIG.wastedCost : CONFIG.bustedCost;
    this.money = Math.max(0, this.money - cost);
    if (this.missions.phase === 'active') this.missions.fail(kind === 'wasted' ? 'You were wasted' : 'You were busted');
    this.audio.fail();
    this.hud.setScreen('end', {
      title: kind.toUpperCase(),
      text: kind === 'wasted'
        ? `The hospital patched you up. Bill: $${cost}. Cash left: $${Math.floor(this.money)} · Missions done: ${this.missions.doneCount}`
        : `The police impounded your pride. Fine: $${cost}. Cash left: $${Math.floor(this.money)} · Missions done: ${this.missions.doneCount}`,
    });
    document.getElementById('end-title').className = `big-state ${kind}`;
    this.save();
  }

  respawn() {
    const spot = this.state === 'busted' ? this.world.policeStation : this.world.hospital;
    if (this.player.mode === 'car') this.player.exitCar();
    this.wanted.clear(); this.police.clear();
    this.player.heal();
    this.player.pos.set(spot.x, 0, spot.z);
    this.state = 'playing';
    this.hud.setScreen(null);
    this.hud.showBanner(this.state === 'busted' ? '' : 'BACK ON THE STREET', 'Palmera Bay keeps turning', 1.8);
  }

  playerSpeed() { return this.player.mode === 'car' ? this.player.car.speed : this.player.speedNow; }
  playerPos() { return this.player.mode === 'car' ? this.player.car.pos : this.player.pos; }

  step(dt) {
    this.time += dt;
    const input = this.input;
    if (this.state !== 'playing') {
      if ((this.state === 'busted' || this.state === 'wasted') && input.pressed('KeyR')) this.respawn();
      return;
    }
    if (input.pressed('Enter') && this.state === 'title') return;

    const playerPos = this.playerPos();
    // --- missions (may start a job when the marker is touched) ---
    this.missions.update(dt, playerPos, { wanted: this.wanted, playerCarWrecked: this.player.mode === 'car' && this.player.car.wrecked }, {
      onStart: (def) => { this.hud.showBanner(def.title.toUpperCase(), def.brief, 3.4); this.audio.chime(); },
      onCheckpoint: (n, total) => { this.audio.chime(); this.hud.showBanner('CHECKPOINT', `${n} of ${total}`, 1.2); },
      onPickup: () => { this.hud.showBanner('PACKAGE PICKED UP', 'The heat is on — deliver it!', 2.2); this.audio.chime(); },
      onComplete: (def) => {
        this.money += def.reward; this.audio.success(); this.audio.cash();
        if (this.missions.finished) this.hud.showBanner('👑 KING OF PALMERA BAY', `Final job done · +$${def.reward} · Cash $${Math.floor(this.money)}`, 5);
        else this.hud.showBanner('MISSION COMPLETE', `+$${def.reward} — ${def.name}`, 3.2);
        this.save();
      },
      onFail: (reason) => { this.audio.fail(); this.hud.showBanner('MISSION FAILED', `${reason} — press R to retry`, 3); },
    });
    if (this.missions.phase === 'failed' && input.pressed('KeyR')) {
      this.missions.retry();
      if (this.missions.active?.stars) this.wanted.setStars(this.missions.active.stars);
      this.hud.showBanner('TRY AGAIN', this.missions.active?.name ?? '', 1.6);
    }

    // --- player: on foot or driving ---
    let prompt = '';
    if (this.player.mode === 'foot') {
      const fwd = input.down('KeyW', 'ArrowUp') ? 1 : 0, back = input.down('KeyS', 'ArrowDown') ? 1 : 0;
      const left = input.down('KeyA', 'ArrowLeft') ? 1 : 0, right = input.down('KeyD', 'ArrowRight') ? 1 : 0;
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      // View forward (camera -> target) is -(sin, cos); screen right is (cos, -sin).
      const move = { x: -sin * (fwd - back) + cos * (right - left), z: -cos * (fwd - back) - sin * (right - left) };
      const len = Math.hypot(move.x, move.z);
      if (len > 1) { move.x /= len; move.z /= len; }
      this.player.update(dt, move, input.down('ShiftLeft', 'ShiftRight'), this.world);
      if (input.pressed('KeyF')) {
        this.player.startPunch(); this.audio.punch();
        for (const ped of this.peds) {
          const d = dist2d(this.player.pos.x, this.player.pos.z, ped.pos.x, ped.pos.z);
          const fx = Math.sin(this.player.heading), fz = Math.cos(this.player.heading);
          const ahead = (ped.pos.x - this.player.pos.x) * fx + (ped.pos.z - this.player.pos.z) * fz;
          if (d < 1.9 && ahead > 0) {
            ped.knockDown();
            this.reportCrime('punchPed', ped.pos);
            for (const other of this.peds) if (other !== ped && dist2d(other.pos.x, other.pos.z, ped.pos.x, ped.pos.z) < 14) other.scare(ped.pos);
          }
        }
      }
      const near = this.nearestEnterableCar();
      if (near) {
        prompt = 'E — enter car';
        if (input.pressed('KeyE')) this.enterCar(near);
      }
      // Traffic can hurt a pedestrian player.
      for (const d of this.trafficDrivers) this.checkCarHitsPlayer(d.car, dt);
    } else {
      const car = this.player.car;
      const control = {
        throttle: (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0),
        steer: (input.down('KeyA', 'ArrowLeft') ? 1 : 0) - (input.down('KeyD', 'ArrowRight') ? 1 : 0),
        brake: false, handbrake: input.down('Space'),
      };
      car.update(dt, control, this.world);
      this.player.pos.set(car.pos.x, 0, car.pos.z);
      this.player.heading = car.heading;
      if (car.wrecked) prompt = 'E — get out (car wrecked)';
      if (input.pressed('KeyE')) { this.player.exitCar(); this.parkedCars.push(car); }
    }

    // --- world life ---
    this.world.update(dt);
    const trafficCars = this.trafficDrivers.map((d) => d.car);
    for (const d of this.trafficDrivers) d.update(dt, [...trafficCars, ...(this.player.mode === 'car' ? [this.player.car] : []), ...this.peds]);
    for (const ped of this.peds) {
      ped.update(dt);
      // Cars knocking pedestrians down.
      const runners = this.player.mode === 'car' ? [this.player.car, ...trafficCars] : trafficCars;
      for (const car of runners) {
        if (Math.abs(car.speed) > 3.5 && dist2d(ped.pos.x, ped.pos.z, car.pos.x, car.pos.z) < 1.7) {
          if (ped.knockDown()) {
            this.audio.thud(0.7);
            if (car === this.player.car) {
              this.reportCrime('hitPed', ped.pos);
              for (const other of this.peds) if (other !== ped && dist2d(other.pos.x, other.pos.z, ped.pos.x, ped.pos.z) < 18) other.scare(ped.pos);
            }
          }
        }
      }
    }

    // --- police & wanted ---
    const speed = this.playerSpeed();
    const busted = this.police.update(dt, this.playerPos(), speed, this.wanted);
    this.wanted.update(dt, this.police.seesPlayer);
    if (busted) { this.endRun('busted'); return; }

    // Car-to-car impacts (player, traffic, police, parked).
    const allCars = [...trafficCars, ...this.police.units, ...this.parkedCars];
    if (this.player.mode === 'car') allCars.push(this.player.car);
    for (let i = 0; i < allCars.length; i++) for (let j = i + 1; j < allCars.length; j++) {
      const a = allCars[i], b = allCars[j];
      if (Math.abs(a.speed) < 0.1 && Math.abs(b.speed) < 0.1) continue;
      const strength = resolveCarPair(a, b);
      if (strength > 0.22) {
        const involvesPlayer = this.player.mode === 'car' && (a === this.player.car || b === this.player.car);
        const other = a === this.player.car ? b : a;
        if (involvesPlayer) {
          this.audio.thud(strength); this.shake = Math.min(0.5, strength * 0.45);
          if (other.isPolice) { this.reportCrime('hitPolice', this.player.car.pos); this.player.damage(strength * 2.5); }
        }
      }
    }

    if (this.player.health <= 0) { this.endRun('wasted'); return; }
    this._prompt = prompt;
  }

  checkCarHitsPlayer(car, dt) {
    if (Math.abs(car.speed) < 4) return;
    if (dist2d(this.player.pos.x, this.player.pos.z, car.pos.x, car.pos.z) < 2.0) {
      this.player.damage(14);
      this.audio.thud(0.9);
      const dx = this.player.pos.x - car.pos.x, dz = this.player.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.player.pos.x += (dx / d) * 2.4; this.player.pos.z += (dz / d) * 2.4;
      if (car.isPolice) { /* police cars are in the police list, not traffic */ }
    }
  }

  updateCamera(dt) {
    const input = this.input;
    if (input.dragging) { this.camYaw -= input.mouseDX * 0.005; this.camPitch = clamp(this.camPitch + input.mouseDY * 0.003, 0.08, 1.1); }
    const driving = this.player.mode === 'car';
    const target = driving ? this.player.car.pos : this.player.pos;
    let dist, height;
    if (driving) {
      const car = this.player.car;
      const behind = car.heading + Math.PI;
      if (!input.dragging) this.camYaw = lerpAngle(this.camYaw, behind, Math.min(1, dt * (Math.abs(car.speed) > 3 ? 2.6 : 0.8)));
      dist = 9.5 + Math.abs(car.speed) * 0.16; height = 4.3;
      const targetFov = 62 + clamp(Math.abs(car.speed) / CONFIG.carMaxSpeed, 0, 1) * 11;
      this.fov = lerp(this.fov, targetFov, Math.min(1, dt * 3));
    } else {
      if (!input.dragging && this.player.speedNow > 0.5) this.camYaw = lerpAngle(this.camYaw, this.player.heading + Math.PI, Math.min(1, dt * 2.2));
      dist = 7.5; height = 2.6 + this.camPitch * 3;
      this.fov = lerp(this.fov, 62, Math.min(1, dt * 3));
    }
    if (Math.abs(this.camera.fov - this.fov) > 0.05) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
    const cx = target.x + Math.sin(this.camYaw) * dist * Math.cos(this.camPitch * 0.4);
    const cz = target.z + Math.cos(this.camYaw) * dist * Math.cos(this.camPitch * 0.4);
    const cy = height + this.camPitch * 2;
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(cx + sx, cy + sy, cz);
    this.world.collideCircle(this.camera.position, 0.8); // never sit inside a building
    this.camera.lookAt(target.x, 1.5, target.z);
  }

  render() {
    this.updateCamera(1 / 60);
    this.renderer.render(this.scene, this.camera);
    const objective = this.missions.objective();
    const p = this.playerPos();
    const dist = objective.x != null ? dist2d(p.x, p.z, objective.x, objective.z) : null;
    this.hud.update({
      money: this.money,
      health: this.player.mode === 'car' ? Math.min(this.player.health, this.player.car.health + 25) : this.player.health,
      stars: this.wanted.stars,
      driving: this.player.mode === 'car',
      speed: this.player.mode === 'car' ? this.player.car.speed : 0,
      objective: { ...objective, distance: dist },
      timeLeft: this.missions.phase === 'active' ? this.missions.timeLeft : null,
      prompt: this.state === 'playing' ? (this._prompt ?? '') : '',
      bust: this.police.bust,
      playerPos: p, playerHeading: this.player.mode === 'car' ? this.player.car.heading : this.player.heading,
      traffic: this.trafficDrivers.map((d) => d.car),
      police: this.police.units,
    });
    const policeNear = this.police.units.some((u) => dist2d(u.pos.x, u.pos.z, p.x, p.z) < 42);
    this.audio.update(1 / 60, this.state === 'playing' && this.player.mode === 'car',
      this.player.mode === 'car' ? clamp(Math.abs(this.player.car.speed) / CONFIG.carMaxSpeed, 0, 1) : 0,
      this.state === 'playing' && policeNear);
  }
}

const game = new Game();
const shotName = new URLSearchParams(window.location.search).get('shot');
if (shotName) { try { stageShot(game, shotName); } catch (err) { console.error('shot staging failed', err); } }

window.__neonPalms = {
  game, get state() { return game.state; }, get world() { return game.world; },
  player: game.player, wanted: game.wanted, police: game.police, missions: game.missions,
  get money() { return game.money; },
  start: (fresh = true) => game.startGame(fresh),
  teleport: (x, z) => { game.player.pos.set(x, 0, z); if (game.player.mode === 'car') game.player.car.pos.set(x, 0, z); },
  setWanted: (n) => game.wanted.setStars(n),
  crime: (kind) => game.reportCrime(kind, game.playerPos()),
};

let last = performance.now(), acc = 0, ready = false;
function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = Math.min(0.25, (now - last) / 1000); last = now;
  if (game.input.pressed('KeyP', 'Escape') && (game.state === 'playing' || game.state === 'paused')) game.togglePause();
  if (game.state === 'title') {
    // A slow cinematic drift around the spawn while the title is up.
    game.time += elapsed;
    const t = game.time * 0.05;
    game.world.update(elapsed);
    for (const d of game.trafficDrivers) d.update(elapsed, game.trafficDrivers.map((x) => x.car));
    for (const ped of game.peds) ped.update(elapsed);
    game.camera.position.set(game.world.spawn.x + Math.sin(t) * 26, 10, game.world.spawn.z + Math.cos(t) * 26);
    game.camera.lookAt(game.world.spawn.x, 1, game.world.spawn.z - 10);
    game.renderer.render(game.scene, game.camera);
  } else if (game.state !== 'paused') {
    acc += elapsed;
    const stepSize = 1 / 60;
    let steps = 0;
    while (acc >= stepSize && steps < 5) { game.step(stepSize); acc -= stepSize; steps++; }
    if (steps === 5) acc = 0;
    game.render();
  } else {
    game.renderer.render(game.scene, game.camera);
  }
  game.input.endFrame();
  if (!ready) { ready = true; window.__gameReady = true; }
}
requestAnimationFrame(frame);

// Title screen Enter key.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && game.state === 'title') game.startGame(!game.saved ? true : false);
  if (e.code === 'Enter' && (game.state === 'busted' || game.state === 'wasted')) game.respawn();
});
