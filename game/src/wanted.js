// Wanted level: 0-5 stars, the heat rules, and decay. A crime only counts
// when a witness (a pedestrian or a police unit) is within sight range of
// it. Out of police sight for long enough, stars fall one at a time.

import { CONFIG } from './config.js';

export const CRIME_STARS = {
  theft: 1, // taking a car that is not yours
  punchPed: 1, // punching a pedestrian
  hitPed: 2, // running a pedestrian down
  hitPolice: 2, // ramming a police car
};

export class Wanted {
  constructor() {
    this.stars = 0;
    this.hiddenTime = 0; // seconds since a police unit last saw the player
    this.seenByPolice = false;
  }
  setStars(n) { this.stars = Math.max(0, Math.min(5, Math.round(n))); this.hiddenTime = 0; }
  addStars(n) { this.setStars(this.stars + n); }
  clear() { this.stars = 0; this.hiddenTime = 0; }
  // Returns true when the crime was witnessed and heat was applied.
  report(kind, crimePos, witnesses) {
    const gain = CRIME_STARS[kind] ?? 0;
    if (gain <= 0) return false;
    const witnessed = witnesses.some((w) => Math.hypot(w.pos.x - crimePos.x, w.pos.z - crimePos.z) <= CONFIG.sightRange);
    if (!witnessed) return false;
    this.addStars(gain);
    return true;
  }
  update(dt, seenByPolice) {
    this.seenByPolice = seenByPolice;
    if (this.stars <= 0) { this.hiddenTime = 0; return; }
    if (seenByPolice) this.hiddenTime = 0;
    else {
      this.hiddenTime += dt;
      if (this.hiddenTime >= CONFIG.starDecaySeconds) {
        this.hiddenTime = 0;
        this.stars -= 1;
      }
    }
  }
  // How many units the heat currently fields.
  desiredUnits() { return this.stars <= 0 ? 0 : Math.min(2 + this.stars, 7); }
}
