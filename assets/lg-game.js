/* LG Recycling — walk the park. A built 3D scene of the concept (not map imagery): real terrain shape,
   textured ground coloured from the aerial, modelled tents, hut, lift and trees, day to night. */
import * as THREE from 'https://unpkg.com/three@0.160.1/build/three.module.js';

const A = 'assets/';
const EYE = 1.65;
const S = {};               // scene state
let booted = false, bootP = null, running = false, lastT = 0;

/* ---------- procedural textures ---------- */
function canvasTex(w, h, draw, opts) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; if (opts && opts.nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const TEX = {
  ground: () => canvasTex(512, 512, (g, w, h) => {
    const r = rnd(11); g.fillStyle = '#8f8878'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 110 + r() * 60; g.fillStyle = `rgb(${v + 10},${v},${v - 18})`; g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 3); }
    for (let i = 0; i < 2600; i++) { const x = r() * w, y = r() * h, l = 5 + r() * 12, a = -0.5 + r(); const v = 95 + r() * 50;
      g.strokeStyle = `rgba(${v + 20},${v + 10},${v - 30},0.85)`; g.lineWidth = 1 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * l, y - Math.cos(a) * l * 0.6 - l * 0.4); g.stroke(); }
    for (let i = 0; i < 500; i++) { const v = 150 + r() * 70; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2.2, 0, 7); g.fill(); }
  }),
  canvas: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ece3cf'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,105,80,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  }),
  plank: () => canvasTex(256, 256, (g, w, h) => {
    const r = rnd(5); g.fillStyle = '#7a5c3c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { const v = 100 + r() * 40; g.fillStyle = `rgb(${v + 22},${v - 4},${v - 36})`; g.fillRect(0, y + 2, w, 28);
      g.strokeStyle = 'rgba(60,40,20,0.35)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, y + 4 + r() * 24); g.bezierCurveTo(w * 0.3, y + r() * 30, w * 0.7, y + r() * 30, w, y + 4 + r() * 24); g.stroke(); } }
  }),
  canopy: () => { const t = canvasTex(256, 256, (g, w, h) => {
    const r = rnd(21); g.clearRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) { const cx = w / 2 + (r() - 0.5) * w * 0.86, cy = h / 2 + (r() - 0.5) * h * 0.86; if (Math.hypot(cx - w / 2, cy - h / 2) > w * 0.46) continue;
      const v = 60 + r() * 55; g.fillStyle = `rgba(${v + 8},${v + 22},${v - 10},${0.75 + r() * 0.25})`; g.beginPath(); g.ellipse(cx, cy, 5 + r() * 9, 3 + r() * 6, r() * 3, 0, 7); g.fill(); }
  }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; },
  stone: () => canvasTex(128, 128, (g, w, h) => { const r = rnd(9); g.fillStyle = '#6b6560'; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { const v = 80 + r() * 60; g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 6, 0, 7); g.fill(); } }),
  gravel: () => canvasTex(256, 256, (g, w, h) => { const r = rnd(4); g.fillStyle = '#b4a992'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { const v = 140 + r() * 80; g.fillStyle = `rgb(${v + 6},${v},${v - 14})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); } })
};

/* ---------- height fields ---------- */
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
function decodeHeights(im) {
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, im.width, im.height).data, n = im.width, out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 32 + 300;
  return { h: out, n };
}
function sampleH(f, size, x, z) {
  const n = f.n, u = (x + size / 2) / size * (n - 1), v = (z + size / 2) / size * (n - 1);
  const i = Math.max(0, Math.min(n - 2, Math.floor(u))), j = Math.max(0, Math.min(n - 2, Math.floor(v))), fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j));
  const h = f.h; return h[j * n + i] * (1 - fu) * (1 - fv) + h[j * n + i + 1] * fu * (1 - fv) + h[(j + 1) * n + i] * (1 - fu) * fv + h[(j + 1) * n + i + 1] * fu * fv;
}
function groundAt(x, z) {
  const half = S.nearM / 2 - 2;
  if (Math.abs(x) < half && Math.abs(z) < half) return sampleH(S.hn, S.nearM, x, z);
  return sampleH(S.hf, S.farM, x, z);
}

/* ---------- terrain meshes ---------- */
function terrainMesh(field, size, colourTex, detailRepeat, blendTo) {
  const n = field.n, geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; let y = field.h[k];
    if (blendTo) { // feather the near tier into the far one at its edge
      const x = pos.getX(k), z = pos.getZ(k), e = Math.max(Math.abs(x), Math.abs(z)) / (size / 2), w = Math.max(0, Math.min(1, (e - 0.88) / 0.12));
      if (w > 0) y = y * (1 - w) + sampleH(blendTo.f, blendTo.size, x, z) * w;
    }
    pos.setY(k, y);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: colourTex, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: S.tex.ground }; sh.uniforms.detailRepeat = { value: detailRepeat };
    sh.fragmentShader = sh.fragmentShader.replace('uniform vec3 diffuse;', 'uniform vec3 diffuse; uniform sampler2D detailMap; uniform float detailRepeat;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n { vec3 dt = texture2D(detailMap, vMapUv * detailRepeat).rgb; diffuseColor.rgb = min(vec3(1.0), diffuseColor.rgb * dt * 2.05 + 0.03); }');
  };
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m;
}

/* ---------- objects ---------- */
function place(obj, x, z, yOff, rotY) { obj.position.set(x, groundAt(x, z) + (yOff || 0), z); if (rotY) obj.rotation.y = rotY; return obj; }
function shadowed(o) { o.castShadow = true; o.receiveShadow = true; return o; }
function tent(x, z, rot) {
  const g = new THREE.Group();
  const deckM = new THREE.MeshStandardMaterial({ map: S.tex.plank, roughness: 0.9 });
  const deck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.32, 5.8), deckM)); deck.position.y = 0.16; g.add(deck);
  for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), deckM); leg.position.set(dx, -0.3, dz); g.add(leg); }
  const canM = new THREE.MeshStandardMaterial({ map: S.tex.canvas, roughness: 0.95, emissive: new THREE.Color('#ffb961'), emissiveIntensity: 0 });
  S.tentMats.push(canM);
  const wall = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.4, 0.95, 18, 1, true), canM)); wall.position.y = 0.32 + 0.475; g.add(wall);
  const cone = shadowed(new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.85, 18, 1, true), canM)); cone.position.y = 0.32 + 0.95 + 1.425; g.add(cone);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6), new THREE.MeshStandardMaterial({ color: '#6b5236' })); pole.position.y = 0.32 + 2.2; g.add(pole);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), new THREE.MeshStandardMaterial({ color: '#4a3a2a', side: THREE.DoubleSide })); door.position.set(0, 0.32 + 0.95, 2.41); g.add(door);
  // guy ropes
  const ropeM = new THREE.LineBasicMaterial({ color: '#cfc4ad' }); const pts = [];
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 2.4, 0.32 + 0.95 + 0.3, Math.sin(a) * 2.4), new THREE.Vector3(Math.cos(a) * 3.6, 0, Math.sin(a) * 3.6)); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), ropeM));
  // chairs and a lantern on the deck, a fire pit beside it
  const chairM = new THREE.MeshStandardMaterial({ color: '#2f4a3a', roughness: 0.8 });
  for (const dx of [-1.6, 1.6]) { const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), chairM); seat.position.set(dx, 0.32 + 0.45, -1.9); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.06), chairM); back.position.set(dx, 0.32 + 0.75, -2.17); g.add(back);
    for (const [lx, lz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), chairM); l.position.set(dx + lx, 0.32 + 0.225, -1.9 + lz); g.add(l); } }
  const lampM = new THREE.MeshStandardMaterial({ color: '#f6e7c5', emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0 }); S.lampMats.push(lampM);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), lampM); lamp.position.set(2.3, 0.32 + 1.0, -2.3); g.add(lamp);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), chairM); post.position.set(2.3, 0.32 + 0.5, -2.3); g.add(post);
  const pit = new THREE.Group(); pit.position.set(3.9, 0, -2.6);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 8, 18), new THREE.MeshStandardMaterial({ map: S.tex.stone, roughness: 1 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.14; pit.add(ring);
  const emberM = new THREE.MeshStandardMaterial({ color: '#2a1d14', emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 0 }); S.fireMats.push(emberM);
  const ember = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), emberM); ember.rotation.x = -Math.PI / 2; ember.position.y = 0.12; pit.add(ember);
  g.add(pit);
  S.fires.push({ x: x + Math.cos(rot) * 3.9 + Math.sin(rot) * 2.6, z: z - Math.sin(rot) * 3.9 + Math.cos(rot) * 2.6 });
  // local ground: raise the deck so it sits level on the slope
  return place(g, x, z, 0.1, rot);
}
function hut(x, z, rot) {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#4a3b2c', roughness: 0.9 });
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(9, 2.7, 5.5), wood)); body.position.y = 1.35; g.add(body);
  const roofM = new THREE.MeshStandardMaterial({ color: '#2b2f31', roughness: 0.7, metalness: 0.3 });
  for (const s of [-1, 1]) { const r = shadowed(new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.12, 3.3), roofM)); r.position.set(0, 2.7 + 0.72, s * 1.45); r.rotation.x = s * 0.44; g.add(r); }
  const winM = new THREE.MeshStandardMaterial({ color: '#c9d6d8', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 }); S.lampMats.push(winM);
  for (const dx of [-3, 0, 3]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), winM); w.position.set(dx, 1.6, 2.76); g.add(w); }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.1), new THREE.MeshStandardMaterial({ color: '#1f1a16' })); door.position.set(-3.2, 1.05, -2.76); door.rotation.y = Math.PI; g.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ color: '#f1ead9' })); sign.position.set(1.5, 2.3, 2.76); g.add(sign);
  return place(g, x, z, 0, rot);
}
function shelter(x, z, rot, name) {
  const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: '#2d3335', roughness: 0.6, metalness: 0.4 });
  for (const [dx, dz] of [[-3.2, -1.9], [3.2, -1.9], [-3.2, 1.9], [3.2, 1.9]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.1, 8), steel); p.position.set(dx, 1.55, dz); g.add(p); }
  const roof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.16, 4.6), new THREE.MeshStandardMaterial({ color: '#3a4042', metalness: 0.3, roughness: 0.6 }))); roof.position.y = 3.15; g.add(roof);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.5), new THREE.MeshStandardMaterial({ map: S.tex.plank })); bench.position.set(0, 0.5, -1.5); g.add(bench);
  const lampM = new THREE.MeshStandardMaterial({ color: '#f6e7c5', emissive: new THREE.Color('#ffe0a3'), emissiveIntensity: 0 }); S.lampMats.push(lampM);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.2), lampM); lamp.position.set(0, 3.0, 0); g.add(lamp);
  return place(g, x, z, 0, rot);
}
function lift(sc) {
  const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: '#b9bec2', roughness: 0.5, metalness: 0.6 });
  const top = [];
  const chain = [sc.B, ...sc.towers, sc.T];
  chain.forEach((p, k) => {
    const y = groundAt(p[0], p[1]); const h = (k === 0 || k === chain.length - 1) ? 5.8 : 8.6;
    if (k > 0 && k < chain.length - 1) {
      const t = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, h, 10), steel)); t.position.set(p[0], y + h / 2, p[1]); g.add(t);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 3.4), new THREE.MeshStandardMaterial({ color: '#f0b429', roughness: 0.6 })); arm.position.set(p[0], y + h - 0.3, p[1]);
      arm.rotation.y = Math.atan2(sc.T[0] - sc.B[0], sc.T[1] - sc.B[1]); g.add(arm);
    }
    top.push(new THREE.Vector3(p[0], y + h - 0.35, p[1]));
  });
  // cable with a little sag between supports
  const pts = [];
  for (let k = 0; k < top.length - 1; k++) { const a = top[k], b = top[k + 1]; for (let u = 0; u <= 1; u += 0.1) { const v = a.clone().lerp(b, u); v.y -= Math.sin(u * Math.PI) * 0.7; pts.push(v); } }
  const curve = new THREE.CatmullRomCurve3(pts); S.cable = curve;
  const ropeM = new THREE.MeshStandardMaterial({ color: '#dcdcd6', metalness: 0.5, roughness: 0.4 });
  const dir = new THREE.Vector3(sc.T[0] - sc.B[0], 0, sc.T[1] - sc.B[1]).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.6);
  for (const sg of [-1, 1]) { const c2 = new THREE.CatmullRomCurve3(pts.map(v => v.clone().add(side.clone().multiplyScalar(sg)))); const cable = new THREE.Mesh(new THREE.TubeGeometry(c2, 220, 0.11, 6, false), ropeM); g.add(cable); }
  // hangers that travel up the line
  S.hangers = [];
  const hm = new THREE.MeshStandardMaterial({ color: '#f0b429', roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c89a76', roughness: 0.8 }), kit = [new THREE.MeshStandardMaterial({ color: '#2b2f33' }), new THREE.MeshStandardMaterial({ color: '#7a1f1f' }), new THREE.MeshStandardMaterial({ color: '#1f4e7a' })];
  const tyre = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });
  for (let k = 0; k < 6; k++) { const h = new THREE.Group(); const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), steel); rope.position.y = -1.2; h.add(rope);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), hm); bar.position.y = -2.4; h.add(bar);
    if (k % 2 === 0) { // a rider on a bike, towed along
      const r = new THREE.Group(); r.position.y = -2.4 - 1.05 - 0.1;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 4, 8), kit[(k / 2) % 3]); body.position.y = 0.95; r.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: '#222' })); head.position.y = 1.5; r.add(head);
      for (const dz of [-0.55, 0.55]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 6, 16), tyre); w.rotation.y = Math.PI / 2; w.position.set(0, 0.33, dz); r.add(w); }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.0), kit[(k / 2 + 1) % 3]); frame.position.y = 0.6; r.add(frame);
      const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 3, 6), skin); legs.position.set(0.12, 0.5, 0.1); r.add(legs);
      r.rotation.y = Math.PI / 2; h.add(r);
    }
    h.rotation.y = Math.atan2(dir.x, dir.z); g.add(h); S.hangers.push({ m: h, t: (k / 6 + 0.05) % 1 }); }
  return g;
}
function trees(list) {
  const n = list.length;
  const trunkG = new THREE.CylinderGeometry(0.12, 0.2, 3.2, 6); trunkG.translate(0, 1.6, 0);
  const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#6e5a48', roughness: 1 }), n); trunk.castShadow = true;
  const canG = new THREE.BufferGeometry();
  // two crossed planes
  const quad = (rot) => { const p = new THREE.PlaneGeometry(6, 6); p.translate(0, 3, 0); p.rotateY(rot); return p; };
  const q1 = quad(0), q2 = quad(Math.PI / 2);
  const pos = new Float32Array([...q1.attributes.position.array, ...q2.attributes.position.array]);
  const uv = new Float32Array([...q1.attributes.uv.array, ...q2.attributes.uv.array]);
  const nor = new Float32Array([...q1.attributes.normal.array, ...q2.attributes.normal.array]);
  canG.setAttribute('position', new THREE.BufferAttribute(pos, 3)); canG.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); canG.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const idx = []; const i1 = q1.index.array, i2 = q2.index.array; for (const v of i1) idx.push(v); for (const v of i2) idx.push(v + 4); canG.setIndex(idx);
  const canM = new THREE.MeshStandardMaterial({ map: S.tex.canopy, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: '#d9dccf' });
  const can = new THREE.InstancedMesh(canG, canM, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((t, k) => {
    const y = groundAt(t[0], t[1]); const sc = t[2]; q.setFromAxisAngle(up, (k * 0.73) % 6.28);
    p.set(t[0], y, t[1]); s.set(sc, sc, sc); m.compose(p, q, s); trunk.setMatrixAt(k, m);
    s.set(sc * 1.15, sc * 1.05, sc * 1.15); p.set(t[0], y + 1.3 * sc, t[1]); m.compose(p, q, s); can.setMatrixAt(k, m);
  });
  const g = new THREE.Group(); g.add(trunk, can); return g;
}
function pumpTrack(sc) {
  const g = new THREE.Group(), dirt = new THREE.MeshStandardMaterial({ color: '#8c6a48', roughness: 1 });
  const zone = sc.kidsZone; let len = 0; const segs = [];
  for (let k = 0; k < zone.length; k++) { const a = zone[k], b = zone[(k + 1) % zone.length]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, d]); len += d; }
  for (let s = 0; s < len; s += 5.5) { let acc = 0; for (const [a, b, d] of segs) { if (s < acc + d) { const u = (s - acc) / d; const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
      const r = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), dirt)); r.scale.set(2.4, 0.55, 1.6); r.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); place(r, x, z, 0); g.add(r); break; } acc += d; } }
  return g;
}

/* ---------- sky ---------- */
function sky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#5f93c4') }, hor: { value: new THREE.Color('#dfe6e2') }, sun: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color('#fff3d6') }, night: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vW = normalize((modelMatrix * vec4(position,1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, hor, sun, sunCol; uniform float night; varying vec3 vW;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){ float y = max(0.0, vW.y); vec3 c = mix(hor, top, pow(y, 0.55));
        float sd = max(0.0, dot(normalize(vW), normalize(sun))); c += sunCol * (pow(sd, 48.0) * 0.9 + pow(sd, 6.0) * 0.18);
        vec3 st = floor(vW * 180.0); float s = step(0.9975, hash(st)) * night * smoothstep(0.02, 0.2, y); c += vec3(s);
        gl_FragColor = vec4(c, 1.0); }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(7000, 32, 16), mat); m.frustumCulled = false; return m;
}
const SUNK = [ // t: 0 noon, 0.5 dusk, 1 night
  { el: 58, az: 335, top: '#5f93c4', hor: '#e2e8e4', fog: '#d6dcd6', sun: '#fff3d6', sunI: 2.4, hemiI: 0.85, hemiS: '#cfe0f0', hemiG: '#8d7a5c', night: 0 },
  { el: 5, az: 275, top: '#3b4f86', hor: '#f0a86a', fog: '#d6ab8a', sun: '#ffb070', sunI: 1.1, hemiI: 0.45, hemiS: '#7f84b0', hemiG: '#5b4a3a', night: 0 },
  { el: -20, az: 300, top: '#070b18', hor: '#1a2642', fog: '#131a2c', sun: '#000000', sunI: 0.0, hemiI: 0.75, hemiS: '#6f86b8', hemiG: '#3a332c', night: 1 }
];
function mixC(a, b, u) { return new THREE.Color(a).lerp(new THREE.Color(b), u); }
function setSun(t) {
  t = Math.max(0, Math.min(1, t)); S.sunT = t;
  const [a, b, u] = t < 0.5 ? [SUNK[0], SUNK[1], t * 2] : [SUNK[1], SUNK[2], (t - 0.5) * 2];
  const L = (x, y) => x + (y - x) * u;
  const el = L(a.el, b.el) * Math.PI / 180, az = L(a.az, b.az) * Math.PI / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  S.sunDir = dir;
  const skyM = S.skyMesh.material; skyM.uniforms.top.value = mixC(a.top, b.top, u); skyM.uniforms.hor.value = mixC(a.hor, b.hor, u); skyM.uniforms.sun.value = dir; skyM.uniforms.sunCol.value = mixC(a.sun, b.sun, u); skyM.uniforms.night.value = L(a.night, b.night);
  S.sun.color = mixC(a.sun, b.sun, u); S.sun.intensity = Math.max(0.02, L(a.sunI, b.sunI)); S.sun.visible = el > -0.05;
  S.moon.intensity = 1.3 * L(a.night, b.night);
  S.hemi.intensity = L(a.hemiI, b.hemiI); S.hemi.color = mixC(a.hemiS, b.hemiS, u); S.hemi.groundColor = mixC(a.hemiG, b.hemiG, u);
  S.scene.fog.color = mixC(a.fog, b.fog, u); S.renderer.setClearColor(S.scene.fog.color);
  const glow = Math.max(0, Math.min(1, (t - 0.3) / 0.5));
  S.tentMats.forEach(m => { m.emissiveIntensity = glow * 0.9; }); S.lampMats.forEach(m => { m.emissiveIntensity = glow * 2.2; }); S.fireMats.forEach(m => { m.emissiveIntensity = glow * 2.6; });
  S.glow = glow;
  if (S.ui && S.ui.sun && Math.abs(S.ui.sun.value / 100 - t) > 0.01) S.ui.sun.value = Math.round(t * 100);
}

/* ---------- player ---------- */
const SPAWN = {
  deck: (sc) => { const t = sc.tents[1], c = sc.tents[14]; return { x: t[0] + 3.4, z: t[1] + 3.6, yaw: yawTo([t[0] + 3.4, t[1] + 3.6], [c[0] + 20, c[1] + 60]), path: null }; },
  camp: (sc) => ({ x: sc.glampPath[0][0], z: sc.glampPath[0][1], yaw: 0, path: sc.glampPath }),
  carpark: (sc) => ({ x: sc.basePath[0][0], z: sc.basePath[0][1], yaw: 0, path: sc.basePath }),
  base: (sc) => ({ x: sc.B[0] - 4, z: sc.B[1] - 9, yaw: Math.atan2(sc.T[0] - sc.B[0], -(sc.T[1] - sc.B[1])), path: null }),
  top: (sc) => ({ x: sc.T[0] - 7, z: sc.T[1] + 3, yaw: Math.atan2(sc.B[0] - sc.T[0], -(sc.B[1] - sc.T[1])), path: null }),
  kids: (sc) => ({ x: sc.kids[0] - 34, z: sc.kids[1] - 22, yaw: Math.PI * 0.75, path: null }),
  summit: (sc) => ({ x: sc.summit[0], z: sc.summit[1], yaw: -Math.PI * 0.6, path: null })
};
function yawTo(from, to) { return Math.atan2(to[0] - from[0], -(to[1] - from[1])); }
function tick(now) {
  if (!running) return; requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  const P = S.player;
  // auto-walk along a path
  if (P.path && P.auto) {
    const pts = P.path; let seg = P.seg; const a = pts[seg], b = pts[seg + 1];
    if (b) { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); P.u += 1.35 * dt / d;
      if (P.u >= 1) { P.seg++; P.u = 0; if (P.seg >= pts.length - 1) { P.auto = false; P.seg = pts.length - 2; P.u = 1; S.ui.auto.setAttribute('aria-pressed', 'false'); } }
      const s2 = Math.min(pts.length - 2, P.seg), u2 = Math.min(1, P.u); const a2 = pts[s2], b2 = pts[s2 + 1];
      P.x = a2[0] + (b2[0] - a2[0]) * u2; P.z = a2[1] + (b2[1] - a2[1]) * u2;
      if (now - P.lastLook > 2500) { const ty = yawTo(a2, b2); let d2 = ((ty - P.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; P.yaw += d2 * Math.min(1, dt * 1.6); P.pitch += (0 - P.pitch) * Math.min(1, dt * 1.2); }
    }
  } else {
    // free walk
    const sp = (P.run ? 4.6 : 2.3) * dt, f = P.fwd, r = P.side;
    if (f || r) { const dx = Math.sin(P.yaw) * f + Math.cos(P.yaw) * r, dz = -Math.cos(P.yaw) * f + Math.sin(P.yaw) * r; const l = Math.hypot(dx, dz) || 1; P.x += dx / l * sp; P.z += dz / l * sp; }
  }
  // keep out of the tents and the hut, and inside the near area
  for (const t of S.sc.tents) { const dx = P.x - t[0], dz = P.z - t[1], d = Math.hypot(dx, dz); if (d < 3.4 && d > 0.001) { P.x = t[0] + dx / d * 3.4; P.z = t[1] + dz / d * 3.4; } }
  { const h = S.sc.amen, dx = P.x - h[0], dz = P.z - h[1], d = Math.hypot(dx, dz); if (d < 6 && d > 0.001) { P.x = h[0] + dx / d * 6; P.z = h[1] + dz / d * 6; } }
  const lim = S.farM / 2 - 200; P.x = Math.max(-lim, Math.min(lim, P.x)); P.z = Math.max(-lim, Math.min(lim, P.z));
  const gy = groundAt(P.x, P.z); P.y += ((gy + EYE) - P.y) * Math.min(1, dt * 8);
  const cam = S.camera; cam.position.set(P.x, P.y, P.z);
  P.pitch = Math.max(-1.2, Math.min(1.2, P.pitch));
  cam.rotation.set(0, 0, 0, 'YXZ'); cam.rotation.y = -P.yaw; cam.rotation.x = P.pitch;
  // sun shadows follow the player
  S.sun.position.copy(S.sunDir).multiplyScalar(220).add(cam.position); S.sun.target.position.copy(cam.position); S.sun.target.updateMatrixWorld();
  S.skyMesh.position.copy(cam.position);
  // moving lift hangers and flickering fires
  if (S.cable) for (const h of S.hangers) { h.t = (h.t + dt * 0.011) % 1; const p = S.cable.getPointAt(h.t); h.m.position.copy(p); }
  if (S.glow > 0) { const fl = 0.85 + 0.15 * Math.sin(now / 90) * Math.sin(now / 230); S.fireMats.forEach((m, k) => { m.emissiveIntensity = S.glow * 2.2 * (fl + 0.1 * Math.sin(now / 140 + k)); });
    // the nearest fire pits get a real light
    const near = S.fires.map(f => ({ f, d: Math.hypot(f.x - P.x, f.z - P.z) })).sort((a, b) => a.d - b.d).slice(0, S.fireLights.length);
    S.fireLights.forEach((L, k) => { const n = near[k]; if (n && n.d < 60) { L.visible = true; L.position.set(n.f.x, groundAt(n.f.x, n.f.z) + 0.6, n.f.z); L.intensity = 26 * S.glow * (fl + 0.15 * Math.sin(now / 110 + k)); } else L.visible = false; });
  } else S.fireLights.forEach(L => { L.visible = false; });
  S.renderer.render(S.scene, S.camera);
  if (S.ui.where) { const t = S.sunT; S.ui.where.textContent = (P.auto ? 'Walking' : 'Standing') + ' · ' + Math.round(gy) + ' m above sea level'; }
}

/* ---------- build ---------- */
async function boot() {
  if (booted) return; if (bootP) return bootP;
  bootP = (async () => {
    const [sc, hnI, hfI, nearI, farI] = await Promise.all([fetch(A + 'lg-game-scene.json').then(r => r.json()), loadImage(A + 'lg-game-hnear.png'), loadImage(A + 'lg-game-hfar.png'), loadImage(A + 'lg-game-near.jpg'), loadImage(A + 'lg-game-far.jpg')]);
    S.sc = sc; S.nearM = sc.near_m; S.farM = sc.far_m; S.hn = decodeHeights(hnI); S.hf = decodeHeights(hfI);
    S.tex = { ground: TEX.ground(), canvas: TEX.canvas(), plank: TEX.plank(), canopy: TEX.canopy(), stone: TEX.stone(), gravel: TEX.gravel() };
    S.tex.ground.repeat.set(1, 1);
    S.tentMats = []; S.lampMats = []; S.fireMats = []; S.fires = [];
    const el = document.getElementById('game-canvas');
    S.renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, powerPreference: 'high-performance' });
    S.renderer.setPixelRatio(Math.min(1.6, window.devicePixelRatio || 1)); S.renderer.shadowMap.enabled = true; S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    S.renderer.outputColorSpace = THREE.SRGBColorSpace; S.renderer.toneMapping = THREE.ACESFilmicToneMapping; S.renderer.toneMappingExposure = 1.08;
    S.scene = new THREE.Scene(); S.scene.fog = new THREE.Fog('#d6dcd6', 350, 4200);
    S.camera = new THREE.PerspectiveCamera(66, 1, 0.3, 9000);
    const nearTex = new THREE.Texture(nearI); nearTex.colorSpace = THREE.SRGBColorSpace; nearTex.anisotropy = 8; nearTex.needsUpdate = true;
    const farTex = new THREE.Texture(farI); farTex.colorSpace = THREE.SRGBColorSpace; farTex.anisotropy = 4; farTex.needsUpdate = true;
    const far = terrainMesh(S.hf, S.farM, farTex, S.farM / 26, null); far.position.y = -0.6; S.scene.add(far);
    const near = terrainMesh(S.hn, S.nearM, nearTex, S.nearM / 5.5, { f: S.hf, size: S.farM }); S.scene.add(near);
    // objects
    const campRot = Math.atan2(sc.T[0] - sc.tents[7][0], -(sc.T[1] - sc.tents[7][1]));
    sc.tents.forEach((t, k) => S.scene.add(tent(t[0], t[1], campRot + (k % 3 - 1) * 0.25)));
    S.scene.add(hut(sc.amen[0], sc.amen[1], 0.35));
    const liftRot = Math.atan2(sc.T[0] - sc.B[0], -(sc.T[1] - sc.B[1]));
    S.scene.add(shelter(sc.T[0], sc.T[1], liftRot, 'top')); S.scene.add(shelter(sc.B[0], sc.B[1], liftRot, 'base'));
    S.scene.add(lift(sc)); S.scene.add(trees(sc.trees)); S.scene.add(pumpTrack(sc));
    // a few cars at the car park
    const carM = [new THREE.MeshStandardMaterial({ color: '#d8d8d6', metalness: 0.6, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#2f3b4a', metalness: 0.6, roughness: 0.4 })];
    for (let k = 0; k < 3; k++) { const c = new THREE.Group(); const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.0, 1.9), carM[k % 2])); b.position.y = 0.75; c.add(b); const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.7), carM[k % 2]); cab.position.set(-0.2, 1.6, 0); c.add(cab); place(c, sc.carpark[0] - 14 + k * 7, sc.carpark[1] + 6, 0, 0.1); S.scene.add(c); }
    // light
    S.sun = new THREE.DirectionalLight('#fff3d6', 2.4); S.sun.castShadow = true; S.sun.shadow.mapSize.set(2048, 2048);
    const sc2 = S.sun.shadow.camera; sc2.left = -90; sc2.right = 90; sc2.top = 90; sc2.bottom = -90; sc2.near = 20; sc2.far = 600; S.sun.shadow.bias = -0.0008; S.sun.shadow.normalBias = 0.6;
    S.scene.add(S.sun); S.scene.add(S.sun.target);
    S.moon = new THREE.DirectionalLight('#9fb3e6', 0); S.moon.position.set(-300, 400, 200); S.scene.add(S.moon);
    S.hemi = new THREE.HemisphereLight('#cfe0f0', '#8d7a5c', 0.85); S.scene.add(S.hemi);
    S.fireLights = []; for (let k = 0; k < 4; k++) { const L = new THREE.PointLight('#ff9a3c', 0, 40, 1.6); L.visible = false; S.scene.add(L); S.fireLights.push(L); }
    S.skyMesh = sky(); S.scene.add(S.skyMesh);
    S.player = { x: 0, z: 0, y: 400, yaw: 0, pitch: 0, fwd: 0, side: 0, run: false, path: null, auto: false, seg: 0, u: 0, lastLook: 0 };
    S.sunT = 0; S.glow = 0; setSun(0);
    booted = true;
  })();
  return bootP;
}
function resize() { const el = document.getElementById('game-canvas'); const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; S.renderer.setSize(w, h, false); S.camera.aspect = w / h; S.camera.updateProjectionMatrix(); }

/* ---------- UI and controls ---------- */
function bindUI() {
  if (S.ui) return;
  const $ = (id) => document.getElementById(id);
  S.ui = { auto: $('game-auto'), sun: $('game-sun'), where: $('game-where'), hint: $('game-hint') };
  const el = $('game-canvas'); let drag = null;
  el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; el.setPointerCapture(e.pointerId); S.player.lastLook = performance.now(); S.ui.hint.classList.add('gone'); });
  el.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    S.player.yaw += dx * 0.0042; S.player.pitch -= dy * 0.0036; S.player.lastLook = performance.now(); });
  const up = () => { drag = null; }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  // keys
  const keys = {};
  const onKey = (e, down) => { if (!running) return; const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].indexOf(k) < 0) return;
    keys[k] = down; e.preventDefault(); const P = S.player;
    P.fwd = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0); P.side = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0); P.run = !!keys.shift;
    if (down && (P.fwd || P.side)) { P.auto = false; S.ui.auto.setAttribute('aria-pressed', 'false'); } };
  window.addEventListener('keydown', (e) => onKey(e, true)); window.addEventListener('keyup', (e) => onKey(e, false));
  // touch joystick
  const joy = $('game-joy'), knob = joy.querySelector('i'); let jd = null;
  joy.addEventListener('pointerdown', (e) => { jd = { id: e.pointerId }; joy.setPointerCapture(e.pointerId); S.player.auto = false; S.ui.auto.setAttribute('aria-pressed', 'false'); e.preventDefault(); });
  joy.addEventListener('pointermove', (e) => { if (!jd || e.pointerId !== jd.id) return; const r = joy.getBoundingClientRect(); let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } knob.style.transform = `translate(${dx * 28}px,${dy * 28}px)`; S.player.fwd = -dy; S.player.side = dx; S.player.run = l > 0.92; });
  const jup = () => { jd = null; knob.style.transform = ''; S.player.fwd = 0; S.player.side = 0; S.player.run = false; }; joy.addEventListener('pointerup', jup); joy.addEventListener('pointercancel', jup);
  // buttons
  S.ui.auto.addEventListener('click', () => { const P = S.player; if (!P.path) return; P.auto = !P.auto; S.ui.auto.setAttribute('aria-pressed', P.auto ? 'true' : 'false'); });
  S.ui.sun.addEventListener('input', (e) => { setSun(e.target.value / 100); if (window.LGGame.onSun) window.LGGame.onSun(S.sunT); });
  document.querySelectorAll('[data-spawn]').forEach(b => b.addEventListener('click', () => spawn(b.dataset.spawn)));
  $('game-x').addEventListener('click', () => window.LGGame.close());
  window.addEventListener('resize', () => { if (running) resize(); });
}
function spawn(k) {
  const sp = (SPAWN[k] || SPAWN.deck)(S.sc), P = S.player;
  P.x = sp.x; P.z = sp.z; P.yaw = sp.yaw; P.pitch = -0.02; P.path = sp.path; P.seg = 0; P.u = 0; P.auto = !!sp.path; P.lastLook = 0; P.y = groundAt(P.x, P.z) + EYE;
  if (sp.path) P.yaw = yawTo(sp.path[0], sp.path[1]);
  S.ui.auto.hidden = !sp.path; S.ui.auto.setAttribute('aria-pressed', P.auto ? 'true' : 'false');
  document.querySelectorAll('[data-spawn]').forEach(b => b.setAttribute('aria-pressed', b.dataset.spawn === k ? 'true' : 'false'));
  const name = { deck: 'A glamping deck', camp: 'Walking the camp', carpark: 'Walking in from the car park', base: 'The lift base', top: 'The top station', kids: 'The kids’ jump park', summit: 'The summit of Langi Ghiran' }[k] || '';
  document.getElementById('game-title').textContent = name;
}

window.LGGame = {
  async open(k, sunT) {
    const root = document.getElementById('game'); root.hidden = false; root.classList.add('loading');
    try { await boot(); } catch (e) { root.classList.remove('loading'); root.classList.add('failed'); console.error(e); return; }
    bindUI(); root.classList.remove('loading'); requestAnimationFrame(() => root.classList.add('on'));
    resize(); if (sunT != null) setSun(sunT); spawn(k || 'deck');
    running = true; lastT = performance.now(); requestAnimationFrame(tick);
    S.ui.hint.classList.remove('gone');
  },
  close() { running = false; const root = document.getElementById('game'); root.classList.remove('on'); setTimeout(() => { if (!running) root.hidden = true; }, 450); if (window.LGGame.onClose) window.LGGame.onClose(); },
  setSun(t) { if (booted) setSun(t); },
  isOpen() { return running; },
  _S: S
};
