// The story chain: three jobs offered in order at the start marker near the
// spawn, plus free roam before, between and after them. Objectives are
// glowing beacons; timers and wrecked cars fail a job, and R retries it.

import { MISSIONS } from './config.js';
import { makeBeacon } from './police.js';
import { dist2d } from './random.js';

export class Missions {
  constructor(scene, world, saved) {
    this.world = world;
    this.beacon = makeBeacon(scene, 0xffd23e);
    this.packageBeacon = makeBeacon(scene, 0x53ff9e);
    this.nextIndex = saved?.nextMission ?? 0; // index into MISSIONS
    this.finished = saved?.finished ?? false;
    this.doneCount = this.nextIndex; // missions completed before this session
    this.phase = 'offered'; // 'offered' | 'active' | 'failed' | 'freeroam'
    this.active = null; // current mission def
    this.step = 0; // checkpoint index / pickup state
    this.timeLeft = 0;
    this.hasPackage = false;
    this.banner = null; // set by main when a phase change should announce
    if (this.finished) this.phase = 'freeroam';
    this.refreshBeacon();
  }
  get currentDef() { return MISSIONS[this.nextIndex] ?? null; }
  objective() {
    if (this.phase === 'offered' && this.currentDef) {
      const m = this.world.missionMarker;
      return { text: `Go to the gold marker to start: ${this.currentDef.name}`, x: m.x, z: m.z, title: 'NEON PALMS' };
    }
    if (this.phase === 'active' && this.active) {
      const a = this.active;
      if (a.checkpoints) {
        const cp = a.checkpoints[this.step];
        return { text: `Checkpoint ${this.step + 1}/${a.checkpoints.length} — drive through it`, x: cp.x, z: cp.z, title: a.title };
      }
      if (a.pickup) {
        if (!this.hasPackage) return { text: 'Pick up the package', x: a.pickup.x, z: a.pickup.z, title: a.title };
        return { text: 'Deliver the package to the marina gate', x: a.dropoff.x, z: a.dropoff.z, title: a.title };
      }
      if (a.hideout) {
        return { text: 'Reach the hideout, then lose the heat while staying near it', x: a.hideout.x, z: a.hideout.z, title: a.title };
      }
    }
    if (this.phase === 'failed') return { text: 'Job failed — press R to retry', x: null, z: null, title: this.active?.title ?? '' };
    return { text: 'Free roam — Palmera Bay is yours', x: null, z: null, title: 'NEON PALMS' };
  }
  refreshBeacon() {
    const o = this.objective();
    if (o.x === null) { this.beacon.set(0, 0, false); this.packageBeacon.set(0, 0, false); return; }
    const isPackage = this.phase === 'active' && this.active?.pickup && !this.hasPackage;
    this.beacon.set(o.x, o.z, !isPackage);
    this.packageBeacon.set(o.x, o.z, !!isPackage);
  }
  startNext() {
    const def = this.currentDef;
    if (!def) { this.phase = 'freeroam'; return null; }
    this.active = def; this.phase = 'active'; this.step = 0; this.hasPackage = false;
    this.timeLeft = def.timeLimit || 0;
    this.refreshBeacon();
    return def;
  }
  fail(reason) {
    if (this.phase !== 'active') return;
    this.phase = 'failed'; this.failReason = reason;
    this.refreshBeacon();
  }
  retry() {
    if (this.phase !== 'failed' || !this.active) return;
    this.phase = 'active'; this.step = 0; this.hasPackage = false;
    this.timeLeft = this.active.timeLimit || 0;
    this.refreshBeacon();
  }
  // Called every step. events: { onCheckpoint, onPickup, onComplete(def), onFail(reason) }
  update(dt, playerPos, ctx, events) {
    this.beacon.pulse(performance.now() / 1000);
    this.packageBeacon.pulse(performance.now() / 1000 + 1);
    if (this.phase === 'offered' && this.currentDef) {
      const m = this.world.missionMarker;
      if (dist2d(playerPos.x, playerPos.z, m.x, m.z) < 4.5) {
        const def = this.startNext();
        if (def) {
          if (def.stars) ctx.wanted.setStars(def.stars);
          events.onStart?.(def);
        }
      }
      return;
    }
    if (this.phase !== 'active' || !this.active) return;
    const a = this.active;
    if (a.timeLimit) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.fail('Out of time'); events.onFail?.('Out of time'); return; }
    }
    if (ctx.playerCarWrecked) { this.fail('Your car was wrecked'); events.onFail?.('Your car was wrecked'); return; }
    if (a.checkpoints) {
      const cp = a.checkpoints[this.step];
      if (dist2d(playerPos.x, playerPos.z, cp.x, cp.z) < 9) {
        this.step++; events.onCheckpoint?.(this.step, a.checkpoints.length);
        if (this.step >= a.checkpoints.length) this.complete(events);
        else this.refreshBeacon();
      }
      return;
    }
    if (a.pickup) {
      if (!this.hasPackage && dist2d(playerPos.x, playerPos.z, a.pickup.x, a.pickup.z) < 6) {
        this.hasPackage = true;
        ctx.wanted.setStars(Math.max(ctx.wanted.stars, a.pickupStars || 0));
        events.onPickup?.();
        this.refreshBeacon();
      } else if (this.hasPackage && dist2d(playerPos.x, playerPos.z, a.dropoff.x, a.dropoff.z) < 8) {
        this.complete(events);
      }
      return;
    }
    if (a.hideout) {
      const near = dist2d(playerPos.x, playerPos.z, a.hideout.x, a.hideout.z) < 26;
      if (near && ctx.wanted.stars <= 0) this.complete(events);
    }
  }
  complete(events) {
    const def = this.active;
    this.doneCount++;
    this.nextIndex++;
    this.active = null;
    if (this.nextIndex >= MISSIONS.length) { this.finished = true; this.phase = 'freeroam'; }
    else this.phase = 'offered';
    this.refreshBeacon();
    events.onComplete?.(def);
  }
}
