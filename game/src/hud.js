// DOM HUD: health, money, stars, speed, objective text, banners, the bust
// meter, a damage vignette, and a 2D-canvas minimap (roads, blocks, player
// arrow, traffic dots, flashing police, the mission beacon). North is up.

import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), health: $('health-fill'), money: $('money'), stars: $('stars'),
      speed: $('speed'), objective: $('objective'), objTitle: $('obj-title'), objText: $('obj-text'),
      objDist: $('obj-dist'), objTimer: $('obj-timer'), banner: $('banner'), bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'), prompt: $('prompt'), bust: $('bust-wrap'), bustFill: $('bust-fill'),
      vignette: $('vignette'), minimap: $('minimap'),
      title: $('title-screen'), pause: $('pause-screen'), end: $('end-screen'),
      endTitle: $('end-title'), endText: $('end-text'), continueBtn: $('continue-btn'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.bannerUntil = 0;
    this.lastHealth = 100;
  }
  showBanner(title, sub = '', seconds = 2.6) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerUntil = performance.now() + seconds * 1000;
  }
  setScreen(name, data = {}) {
    // name: 'title' | 'pause' | 'end' | null
    this.el.title.classList.toggle('show', name === 'title');
    this.el.pause.classList.toggle('show', name === 'pause');
    this.el.end.classList.toggle('show', name === 'end');
    this.el.hud.classList.toggle('hidden', name === 'title');
    if (name === 'title') this.el.continueBtn.style.display = data.hasSave ? '' : 'none';
    if (name === 'end') { this.el.endTitle.textContent = data.title ?? ''; this.el.endText.textContent = data.text ?? ''; }
  }
  update(f) {
    // f: frame info from main (money, health, stars, speed, objective, bust...)
    this.el.money.textContent = `$${Math.floor(f.money)}`;
    this.el.health.style.width = `${Math.max(0, f.health)}%`;
    this.el.health.style.background = f.health > 35 ? '#57d95d' : '#e5484d';
    if (f.health < this.lastHealth - 4) { // damage flash
      this.el.vignette.classList.remove('flash'); void this.el.vignette.offsetWidth;
      this.el.vignette.classList.add('flash');
    }
    this.lastHealth = f.health;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < f.stars ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.opacity = f.stars > 0 ? '1' : '0.25';
    this.el.speed.textContent = f.driving ? `${Math.round(Math.abs(f.speed) * 3.6)} km/h` : '';
    const o = f.objective;
    this.el.objTitle.textContent = o.title ?? '';
    this.el.objText.textContent = o.text ?? '';
    this.el.objDist.textContent = o.distance != null ? `${Math.round(o.distance)} m` : '';
    this.el.objTimer.textContent = f.timeLeft != null && f.timeLeft > 0 ? `⏱ ${Math.ceil(f.timeLeft)}s` : '';
    this.el.prompt.textContent = f.prompt ?? '';
    this.el.prompt.style.opacity = f.prompt ? '1' : '0';
    this.el.bust.style.opacity = f.bust > 0.02 ? '1' : '0';
    this.el.bustFill.style.width = `${Math.round(f.bust * 100)}%`;
    if (this.bannerUntil && performance.now() > this.bannerUntil) { this.el.banner.classList.remove('show'); this.bannerUntil = 0; }
    this.drawMinimap(f);
  }
  drawMinimap(f) {
    const ctx = this.mapCtx, S = this.el.minimap.width;
    const range = CONFIG.cityHalf + 40;
    const toMap = (x, z) => [((x + range) / (range * 2)) * S, ((z + range) / (range * 2)) * S];
    ctx.fillStyle = '#20303c'; ctx.fillRect(0, 0, S, S);
    // Blocks then roads.
    ctx.fillStyle = '#2c4a3a';
    const inset = CONFIG.roadWidth / 2 + CONFIG.sidewalkWidth;
    const coords = CONFIG.roadCoords;
    for (let i = 0; i < coords.length - 1; i++) for (let j = 0; j < coords.length - 1; j++) {
      const [x0, z0] = toMap(coords[i] + inset, coords[j] + inset);
      const [x1, z1] = toMap(coords[j + 1] - inset, coords[j + 1] - inset);
      ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
    ctx.strokeStyle = '#596270'; ctx.lineWidth = Math.max(2, (CONFIG.roadWidth / (range * 2)) * S);
    for (const c of coords) {
      const [a] = toMap(-range, c); const [, b] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(0, b); ctx.lineTo(S, b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a === 0 ? toMap(c, 0)[0] : toMap(c, 0)[0], 0); ctx.lineTo(toMap(c, 0)[0], S); ctx.stroke();
    }
    // Beach + water strip.
    const [, beachY] = toMap(0, CONFIG.beachZ);
    ctx.fillStyle = '#e6cf8f'; ctx.fillRect(0, beachY, S, S - beachY);
    const [, waterY] = toMap(0, CONFIG.waterZ);
    ctx.fillStyle = '#2d84ad'; ctx.fillRect(0, waterY, S, S - waterY);
    // Mission beacon.
    if (f.objective.x != null) {
      const [bx, by] = toMap(f.objective.x, f.objective.z);
      ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,62,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, 7 + Math.sin(performance.now() * 0.006) * 2, 0, 7); ctx.stroke();
    }
    // Traffic dots.
    ctx.fillStyle = '#cfd6dd';
    for (const c of f.traffic ?? []) { const [x, y] = toMap(c.pos.x, c.pos.z); ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4); }
    // Police: flashing red / blue.
    const flash = Math.floor(performance.now() / 220) % 2 === 0;
    for (const c of f.police ?? []) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(f.playerPos.x, f.playerPos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI - f.playerHeading);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 10px system-ui'; ctx.fillText('N', S - 12, 12);
  }
}
