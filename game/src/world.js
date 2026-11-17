// Palmera Bay: the city itself. A road grid with marked lanes and sidewalks,
// blocks of canvas-faced buildings, palms, street lights, shop signs, props,
// and a beach with animated water along the south edge. The road network,
// building colliders and spawn data are exposed for traffic, police and play.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp } from './random.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 2;
  return tex;
}

function facadeTexture(rng, base, trim) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = trim; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 14, w, 14);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 4; x++) {
      const lit = rng.chance(0.42);
      g.fillStyle = lit ? '#ffd98a' : '#33505e';
      g.fillRect(10 + x * 29, 22 + y * 31, 19, 20);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(10 + x * 29, 22 + y * 31, 19, 5);
    }
  });
}

function signTexture(text, bg) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff8ea'; g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
  });
}

export function buildWorld(scene, rng) {
  const C = CONFIG;
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const circleColliders = []; // {x,z,r}
  const group = new THREE.Group(); scene.add(group);

  // Sky, light and fog: late-afternoon sun, warm haze.
  scene.background = new THREE.Color(0x8ec9e8);
  scene.fog = new THREE.Fog(0xf2c99a, 180, 620);
  const skyTex = canvasTexture(64, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#3f7fc4'); grad.addColorStop(0.55, '#9fd0ea'); grad.addColorStop(0.8, '#ffd9a0'); grad.addColorStop(1, '#ffb877');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 16, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  group.add(sky);
  const sun = new THREE.DirectionalLight(0xffe3b3, 2.4); sun.position.set(-160, 220, 120); group.add(sun);
  group.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a6a4a, 1.1));
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(26, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
  sunBall.position.set(-420, 300, 330); group.add(sunBall);

  // Ground: city slab, then sand and water to the south.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ color: 0x9aa06b }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; group.add(ground);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1400, C.waterZ - C.beachZ + 60), new THREE.MeshLambertMaterial({ color: 0xf0d493 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.0, (C.beachZ + C.waterZ) / 2 + 12); group.add(sand);

  const waterTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#1f7fa8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(0, 12 + i * 17); g.bezierCurveTo(32, 6 + i * 17, 96, 18 + i * 17, 128, 12 + i * 17); g.stroke(); }
  });
  waterTex.repeat.set(24, 10);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 500), new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.94 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.12, C.waterZ + 230); group.add(water);
  // A short pier.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6642 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 60), pierMat);
  pier.position.set(170, 0.7, C.waterZ + 22); group.add(pier);
  colliders.push({ minX: 165, maxX: 175, minZ: C.waterZ - 6, maxZ: C.waterZ + 52 });

  // Roads: asphalt strips with a dashed centre line baked into the texture.
  const roadTex = canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#3c4046'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a4f57'; for (let i = 0; i < 260; i++) g.fillRect(rng.float() * w, rng.float() * h, 2, 2);
    g.fillStyle = '#f7d154'; g.fillRect(6, h / 2 - 2, 44, 4); // one dash per tile, along the road
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 2, w, 2); g.fillRect(0, h - 4, w, 2);
  });
  const roadLen = C.cityHalf * 2 + 40;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadGeoX = new THREE.PlaneGeometry(roadLen, C.roadWidth);
  const roadGeoZ = new THREE.PlaneGeometry(C.roadWidth, roadLen);
  for (const coord of C.roadCoords) {
    const texX = roadTex.clone(); texX.needsUpdate = true; texX.repeat.set(roadLen / 16, 1);
    const rx = new THREE.Mesh(roadGeoX, new THREE.MeshLambertMaterial({ map: texX }));
    rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.02, coord); group.add(rx);
    const texZ = roadTex.clone(); texZ.needsUpdate = true; texZ.repeat.set(1, roadLen / 16);
    const rz = new THREE.Mesh(roadGeoZ, new THREE.MeshLambertMaterial({ map: texZ }));
    rz.rotation.x = -Math.PI / 2; rz.position.set(coord, 0.021, 0); group.add(rz);
  }
  // Sidewalks: pale strips flanking every road.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xcfc4ae });
  const walkGeoX = new THREE.BoxGeometry(roadLen, 0.18, C.sidewalkWidth);
  const walkGeoZ = new THREE.BoxGeometry(C.sidewalkWidth, 0.18, roadLen);
  for (const coord of C.roadCoords) for (const s of [-1, 1]) {
    const off = s * (C.roadWidth / 2 + C.sidewalkWidth / 2);
    const wx = new THREE.Mesh(walkGeoX, walkMat); wx.position.set(0, 0.09, coord + off); group.add(wx);
    const wz = new THREE.Mesh(walkGeoZ, walkMat); wz.position.set(coord + off, 0.09, 0); group.add(wz);
  }

  // Buildings: one to four per block, canvas facades from the palette.
  const facades = [];
  const palette = [['#f7e3c3', '#e8b04b'], ['#fce8e9', '#d96c75'], ['#dff3f0', '#3d9b8f'], ['#e9e4f5', '#7a68b8'], ['#fdf6d8', '#c9a227'], ['#f3e0cf', '#b87355'], ['#e2eef7', '#4a7fb5'], ['#fbe3f0', '#c65b96']];
  for (const [base, trim] of palette) facades.push(new THREE.MeshLambertMaterial({ map: facadeTexture(rng, base, trim) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b5a4a });
  const coords = C.roadCoords;
  const blockInset = C.roadWidth / 2 + C.sidewalkWidth + 1.5;
  for (let i = 0; i < coords.length - 1; i++) for (let j = 0; j < coords.length - 1; j++) {
    const x0 = coords[i] + blockInset, x1 = coords[i + 1] - blockInset;
    const z0 = coords[j] + blockInset, z1 = coords[j + 1] - blockInset;
    const bw = x1 - x0, bd = z1 - z0;
    const count = rng.int(1, 3);
    for (let k = 0; k < count; k++) {
      const w = rng.range(bw * 0.34, bw * 0.52), d = rng.range(bd * 0.34, bd * 0.52);
      const h = rng.range(10, 42) * (rng.chance(0.18) ? 1.7 : 1);
      const cx = count === 1 ? (x0 + x1) / 2 : x0 + (k % 2 + 0.5) * (bw / 2) + rng.range(-3, 3);
      const cz = count === 1 ? (z0 + z1) / 2 : z0 + (Math.floor(k / 2) + 0.5) * (bd / 2) + rng.range(-3, 3);
      const mat = rng.pick(facades);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
      mesh.position.set(cx, h / 2, cz); group.add(mesh);
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }
  }

  // Shop signs on street-facing buildings (original local names).
  const shopNames = ['Coco Loco', 'Palmera Deli', 'Sunset Tapes', 'Marina Bait', 'Cafe Ola', 'Neon Nails', 'Bay Books', 'Palm Pharmacy', 'Hotel Brisa', 'Taco Marea'];
  const signColors = ['#d94f3d', '#2e7fc2', '#3fa46a', '#7a4fa3', '#e2703a'];
  shopNames.forEach((name, idx) => {
    const coord = coords[1 + (idx % (coords.length - 2))];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.2),
      new THREE.MeshBasicMaterial({ map: signTexture(name, signColors[idx % signColors.length]) }));
    sign.position.set(coord - 12 + (idx % 3) * 12, 5.2, coords[idx % coords.length] + blockInset + 1.2);
    group.add(sign);
  });

  // Palms: instanced trunks and fronds along sidewalks and the beach.
  const palmSpots = [];
  for (const coord of coords) for (let t = -C.cityHalf + 18; t < C.cityHalf; t += 34) {
    if (rng.chance(0.6)) palmSpots.push({ x: coord + C.roadWidth / 2 + 2.4, z: t + rng.range(-3, 3) });
    if (rng.chance(0.6)) palmSpots.push({ x: t + rng.range(-3, 3), z: coord - C.roadWidth / 2 - 2.4 });
  }
  for (let x = -300; x <= 300; x += 26) if (rng.chance(0.8)) palmSpots.push({ x: x + rng.range(-4, 4), z: C.beachZ + rng.range(4, 22) });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 5); trunkGeo.translate(0, 3.5, 0);
  const frondGeo = new THREE.ConeGeometry(3.4, 1.6, 6); frondGeo.translate(0, 7.4, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a6642 }), palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: 0x2f9e5f }), palmSpots.length);
  const m4 = new THREE.Matrix4();
  palmSpots.forEach((p, i) => {
    m4.makeRotationY(rng.range(0, Math.PI * 2)); m4.setPosition(p.x, 0, p.z);
    trunks.setMatrixAt(i, m4); fronds.setMatrixAt(i, m4);
    circleColliders.push({ x: p.x, z: p.z, r: 0.5 });
  });
  group.add(trunks); group.add(fronds);

  // Street lights: instanced poles with warm heads (emissive, no real lights).
  const lightSpots = [];
  for (const a of coords) for (const b of coords) lightSpots.push({ x: a + 9.5, z: b + 9.5 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 6.4, 5); poleGeo.translate(0, 3.2, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f45 }), lightSpots.length);
  const headGeo = new THREE.BoxGeometry(0.7, 0.3, 0.7);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffd98a }), lightSpots.length);
  lightSpots.forEach((p, i) => { m4.identity(); m4.setPosition(p.x, 0, p.z); poles.setMatrixAt(i, m4); m4.setPosition(p.x, 6.5, p.z); heads.setMatrixAt(i, m4); });
  group.add(poles); group.add(heads);

  // Props: crates and barriers near corners, beach umbrellas.
  const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const crates = new THREE.InstancedMesh(crateGeo, new THREE.MeshLambertMaterial({ color: 0xb08954 }), 40);
  for (let i = 0; i < 40; i++) {
    const x = rng.pick(coords) + rng.sign() * 12, z = rng.pick(coords) + rng.sign() * 12;
    m4.makeRotationY(rng.range(0, 3)); m4.setPosition(x, 0.7, z); crates.setMatrixAt(i, m4);
    circleColliders.push({ x, z, r: 1.0 });
  }
  group.add(crates);
  const umbrellaGeo = new THREE.ConeGeometry(2.6, 1, 7); umbrellaGeo.translate(0, 2.6, 0);
  const umbrellas = new THREE.InstancedMesh(umbrellaGeo, new THREE.MeshLambertMaterial({ color: 0xe2703a }), 14);
  for (let i = 0; i < 14; i++) {
    const x = -280 + i * 42 + rng.range(-6, 6), z = C.beachZ + rng.range(8, 26);
    m4.identity(); m4.setPosition(x, 0, z); umbrellas.setMatrixAt(i, m4);
  }
  group.add(umbrellas);

  // Mission / landmark beacon base rings are drawn by missions.js; here we
  // add two fixed landmarks: a hospital cross and the police station sign.
  const hospSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: signTexture('+', '#e8e3d8') }));
  hospSign.position.set(C.hospital.x, 16, C.hospital.z + 20); group.add(hospSign);

  const roadSet = new Set(coords);
  function nearestRoadCoord(v) {
    let best = coords[0], bd = Infinity;
    for (const c of coords) { const d = Math.abs(c - v); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function isOnRoad(x, z) {
    return Math.abs(x - nearestRoadCoord(x)) < C.roadWidth / 2 + 1 || Math.abs(z - nearestRoadCoord(z)) < C.roadWidth / 2 + 1;
  }
  // Resolve a circle (x, z, r) out of every building AABB and prop circle.
  function collideCircle(pos, r) {
    pos.x = clamp(pos.x, -C.worldBound, C.worldBound);
    pos.z = clamp(pos.z, -C.worldBound, Math.max(C.worldBound, C.beachZ + 34));
    for (const b of colliders) {
      const nx = clamp(pos.x, b.minX, b.maxX), nz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - nx, dz = pos.z - nz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = nx + (dx / d) * r; pos.z = nz + (dz / d) * r; }
        else { // centre inside: push out along the smallest penetration axis
          const pl = pos.x - b.minX, pr = b.maxX - pos.x, pt = pos.z - b.minZ, pb = b.maxZ - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = b.minX - r; else if (m === pr) pos.x = b.maxX + r;
          else if (m === pt) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
        }
      }
    }
    for (const c of circleColliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = c.x + (dx / d) * rr; pos.z = c.z + (dz / d) * rr; }
    }
  }

  let waterTime = 0;
  return {
    group, colliders, circleColliders, coords, roadSet,
    spawn: { ...C.playerSpawn }, hospital: { ...C.hospital }, policeStation: { ...C.policeStation },
    hideout: { ...C.hideout }, missionMarker: { ...C.missionMarker },
    nearestRoadCoord, isOnRoad, collideCircle,
    intersections: coords.flatMap((x) => coords.map((z) => ({ x, z }))),
    update(dt) {
      waterTime += dt;
      waterTex.offset.set(Math.sin(waterTime * 0.14) * 0.03, waterTime * 0.008);
      water.position.y = 0.12 + Math.sin(waterTime * 0.8) * 0.05;
    },
  };
}
