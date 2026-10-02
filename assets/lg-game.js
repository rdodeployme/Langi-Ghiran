/* LG Recycling — walk the park. A built 3D scene of the concept (not map imagery): real terrain shape,
   textured ground coloured from the aerial, modelled tents, hut, lift and trees, day to night.
   Rendering: HDRI skies (Poly Haven, CC0) with environment lighting, cascaded shadows, MSAA + SMAA,
   bloom at night, ACES tone mapping and a light grade. Quality tiers: ?quality=high|medium|low. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const A = 'assets/';
const EYE = 1.65;
const S = { mats: [] };       // scene state
let booted = false, bootP = null, running = false, lastT = 0;

/* ---------- quality tiers ---------- */
const DPR = Math.max(1, window.devicePixelRatio || 1);
const TIERS = {
  high:   { pr: Math.min(2, DPR),   post: true,  msaa: 4, smaa: true,  csm: true,  shadow: 2048, bloom: true,  grade: true,  aniso: 8, grass: 9000 },
  medium: { pr: Math.min(1.5, DPR), post: true,  msaa: 2, smaa: false, csm: false, shadow: 2048, bloom: true,  grade: true,  aniso: 4, grass: 4500 },
  low:    { pr: 1,                  post: false, msaa: 0, smaa: false, csm: false, shadow: 0,    bloom: false, grade: false, aniso: 2, grass: 1500 }
};
const PARAMS = new URLSearchParams(location.search);
function pickQuality() {
  const q = PARAMS.get('quality'); if (q && TIERS[q]) return q;
  try { const s = localStorage.getItem('lg-quality'); if (s && TIERS[s]) return s; } catch (e) {}
  const mobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 4;
  if (mem <= 2 || cores <= 2) return 'low';
  return mobile ? 'medium' : 'high';
}
S.quality = pickQuality(); const Q = TIERS[S.quality];

/* ---------- materials registry (environment intensity + cascaded shadows) ---------- */
function reg(m) { S.mats.push(m); if (S.csm && m.isMeshStandardMaterial) S.csm.setupMaterial(m); return m; }
function std(o) { return reg(new THREE.MeshStandardMaterial(o)); }
/* a standard material with extra shader code; `key` keeps three's program cache honest */
function custom(m, obc, key) {
  reg(m); const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); obc(sh, r); m.userData.shader = sh; };
  m.customProgramCacheKey = () => key + (S.csm ? '-csm' : '');
  return m;
}

/* the ground sets are normalised to mid-grey (for macro × detail); used directly they need a gain */
function boosted(m, gain, key) { return custom(m, (sh) => { sh.uniforms.lgGain = { value: gain }; sh.fragmentShader = sh.fragmentShader.replace('uniform vec3 diffuse;', 'uniform vec3 diffuse; uniform float lgGain;').replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = min(vec3(1.0), diffuseColor.rgb * lgGain);'); }, 'boost-' + key); }

/* ---------- procedural textures (being replaced stage by stage with real materials) ---------- */
function canvasTex(w, h, draw, opts) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Q.aniso; if (opts && opts.nearest) { t.magFilter = THREE.NearestFilter; }
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

/* ---------- loaders ---------- */
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
function loadTex(src, o) { return new Promise((res, rej) => { new THREE.TextureLoader().load(src, (t) => { t.colorSpace = (o && o.linear) ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = Q.aniso; if (o && o.nomip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; } res(t); }, undefined, rej); }); }
function loadHDR(src) { return new Promise((res, rej) => { new RGBELoader().load(src, res, undefined, rej); }); }
function setLoad(txt) { const el = document.querySelector('.game-load span'); if (el) el.textContent = txt; }

/* ---------- height fields ---------- */
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
function terrainGeometry(field, size, blendTo, under) {
  const n = field.n, geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; let y = field.h[k]; const x = pos.getX(k), z = pos.getZ(k);
    if (blendTo) { // feather the near tier into the far one at its edge
      const e = Math.max(Math.abs(x), Math.abs(z)) / (size / 2), w = Math.max(0, Math.min(1, (e - 0.88) / 0.12));
      if (w > 0) y = y * (1 - w) + sampleH(blendTo.f, blendTo.size, x, z) * w;
    }
    if (under) { // the far tier must never poke up through the near tier: tuck it 3 m under the near heights
      const e = Math.max(Math.abs(x), Math.abs(z)) / (under.size / 2);
      if (e < 1) { const u = sampleH(under.f, under.size, x, z) - 3, w = Math.max(0, Math.min(1, (e - 0.86) / 0.14)); y = u * (1 - w) + y * w; }
    }
    pos.setY(k, y);
  }
  geo.computeVertexNormals(); return geo;
}
/* near tier: aerial colour as the macro tint, four tiled PBR ground sets mixed by the splat mask, normal-mapped, fading to the macro with distance */
function splatMaterial(colourTex) {
  const G = S.g;
  const m = new THREE.MeshStandardMaterial({ map: colourTex, roughness: 0.96, metalness: 0, normalMap: G.dirt.n, normalScale: new THREE.Vector2(0.9, 0.9) });
  return custom(m, (sh) => {
    Object.assign(sh.uniforms, { splatMap: { value: S.splat }, d0: { value: G.dirt.d }, d1: { value: G.gravel.d }, d2: { value: G.grass.d }, d3: { value: G.scrub.d },
      n0: { value: G.dirt.n }, n1: { value: G.gravel.n }, n2: { value: G.grass.n }, n3: { value: G.scrub.n }, detRep: { value: 1 / 3.2 }, detNear: { value: 45 }, detFar: { value: 240 } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vTPos; uniform sampler2D splatMap, d0, d1, d2, d3, n0, n1, n2, n3; uniform float detRep, detNear, detFar;
      vec4 lgW; vec2 lgUv; float lgF;`)
      .replace('#include <map_fragment>', `
        vec4 macro = texture2D(map, vMapUv);
        vec3 w3 = texture2D(splatMap, vMapUv).rgb; lgW = vec4(w3, max(0.0, 1.0 - w3.r - w3.g - w3.b)); lgW /= max(1e-3, lgW.r + lgW.g + lgW.b + lgW.a);
        lgUv = vec2(vTPos.x, -vTPos.z) * detRep;
        float lgDist = length(vTPos - cameraPosition); lgF = 1.0 - smoothstep(detNear, detFar, lgDist);
        vec3 det = texture2D(d0, lgUv).rgb * lgW.r + texture2D(d1, lgUv * 1.31).rgb * lgW.g + texture2D(d2, lgUv * 0.79).rgb * lgW.b + texture2D(d3, lgUv * 1.13).rgb * lgW.a;
        vec3 det2 = texture2D(d0, lgUv * 0.173).rgb * lgW.r + texture2D(d2, lgUv * 0.151).rgb * (lgW.b + lgW.a) + texture2D(d1, lgUv * 0.21).rgb * lgW.g;
        vec3 dmix = det * (0.55 + 0.9 * det2);
        diffuseColor.rgb *= macro.rgb * mix(vec3(1.0), dmix * 2.0, lgF);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = (texture2D(n0, lgUv).xyz * lgW.r + texture2D(n1, lgUv * 1.31).xyz * lgW.g + texture2D(n2, lgUv * 0.79).xyz * lgW.b + texture2D(n3, lgUv * 1.13).xyz * lgW.a) * 2.0 - 1.0;
        mapN.xy *= normalScale * lgF;
        normal = normalize( tbn * mapN );`);
  }, 'terrain-splat');
}
/* far tier: macro colour with a soft grass detail so the horizon hills don't read as a blurred photo */
function farMaterial(colourTex) {
  const m = new THREE.MeshStandardMaterial({ map: colourTex, roughness: 1, metalness: 0 });
  return custom(m, (sh) => {
    sh.uniforms.detailMap = { value: S.g.grass.d }; sh.uniforms.detailRepeat = { value: S.farM / 14 };
    sh.fragmentShader = sh.fragmentShader.replace('uniform vec3 diffuse;', 'uniform vec3 diffuse; uniform sampler2D detailMap; uniform float detailRepeat;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n { vec3 dt = texture2D(detailMap, vMapUv * detailRepeat).rgb; diffuseColor.rgb = min(vec3(1.0), diffuseColor.rgb * (0.7 + dt * 0.6)); }');
  }, 'terrain-far');
}

/* ---------- built ground: trails, paths, car park, pump track ---------- */
function resamplePath(pts, step, closed) {
  const v = pts.map(p => new THREE.Vector3(p[0], 0, p[1])); const curve = new THREE.CatmullRomCurve3(v, !!closed, 'centripetal', 0.5);
  const n = Math.max(8, Math.round(curve.getLength() / step)); return curve.getSpacedPoints(n).map(q => [q.x, q.z]);
}
/* a ribbon with raised shoulders that follows the ground; outer edge rises into a berm on bends */
function ribbon(path, width, mat, o) {
  o = o || {}; const pts = resamplePath(path, o.step || 1.5, o.closed); const N = pts.length, K = 5;
  const offs = [-0.78, -0.5, 0, 0.5, 0.78], lift = [0.02, 0.09, 0.045, 0.09, 0.02];
  const pos = new Float32Array(N * K * 3), uv = new Float32Array(N * K * 2), idx = [];
  const bermK = o.berm || 0; let sAcc = 0;
  for (let i = 0; i < N; i++) {
    const p = pts[i], pa = pts[Math.max(0, i - 1)], pb = pts[Math.min(N - 1, i + 1)];
    let tx = pb[0] - pa[0], tz = pb[1] - pa[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx; // right-hand normal
    // signed curvature from the heading change
    let curv = 0, cn = 0; for (let j = i - 3; j <= i + 3; j++) { if (j < 1 || j >= N - 1) continue; const q = pts[j], qa = pts[j - 1], qb = pts[j + 1]; const ax = q[0] - qa[0], az = q[1] - qa[1], bx = qb[0] - q[0], bz = qb[1] - q[1]; curv += (ax * bz - az * bx) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1); cn++; } curv = cn ? curv / cn : 0;
    if (i > 0) sAcc += Math.hypot(p[0] - pa[0], p[1] - pa[1]);
    for (let k = 0; k < K; k++) {
      const off = offs[k] * width, x = p[0] + nx * off, z = p[1] + nz * off;
      let y = groundAt(x, z) + lift[k];
      if (bermK) { const outer = curv > 0 ? (k <= 1) : (k >= 3); if (outer && k !== 2) y += Math.min(0.75, Math.max(0, Math.abs(curv) - 0.06) * bermK) * (k === 1 || k === 3 ? 1 : 0.55); }
      const j = (i * K + k) * 3; pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
      uv[(i * K + k) * 2] = sAcc / (o.texLen || 3.2); uv[(i * K + k) * 2 + 1] = (offs[k] + 0.78) / 1.56 * (o.texWide || 1);
    }
    if (i < N - 1) for (let k = 0; k < K - 1; k++) { const a = i * K + k, b = a + 1, c = a + K, d = c + 1; idx.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.getY(Math.floor(N / 2) * K + 2) < 0) { const ix = g.index.array; for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; } g.computeVertexNormals(); }
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}
/* a dirt feature (tabletop or roller) along a path: profile in metres along x, height y, full track width */
function feature(cx, cz, heading, len, h, width, flatFrac, mat) {
  const nx = 14, nz = 7, g = new THREE.PlaneGeometry(len, width, nx, nz); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position; const base = groundAt(cx, cz);
  const dir = [Math.sin(heading), -Math.cos(heading)], side = [Math.cos(heading), Math.sin(heading)];
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i), lz = pos.getZ(i); const u = lx / len + 0.5, v = Math.abs(lz / width) * 2; // 0 centre .. 1 edge
    let prof; const ramp = (1 - flatFrac) / 2;
    if (u < ramp) prof = Math.sin(u / ramp * Math.PI / 2); else if (u > 1 - ramp) prof = Math.sin((1 - u) / ramp * Math.PI / 2); else prof = 1;
    const sideFall = 1 - Math.pow(Math.max(0, v - 0.55) / 0.45, 1.6);
    const wx = cx + dir[0] * lx + side[0] * lz, wz = cz + dir[1] * lx + side[1] * lz;
    const gy = groundAt(wx, wz); pos.setXYZ(i, wx, Math.max(gy + 0.03, gy + h * prof * Math.max(0, sideFall)), wz);
  }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
function headingAt(pts, i) { const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)]; return Math.atan2(b[0] - a[0], -(b[1] - a[1])); }
function straightness(pts, i, k) { let d = 0; for (let j = i - k; j < i + k; j++) { if (j < 1 || j >= pts.length - 1) continue; const a = pts[j - 1], b = pts[j], c = pts[j + 1]; const h1 = Math.atan2(b[0] - a[0], b[1] - a[1]), h2 = Math.atan2(c[0] - b[0], c[1] - b[1]); d += Math.abs(((h2 - h1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI); } return d; }
function builtGround(sc) {
  const g = new THREE.Group(); const G = S.g;
  const trailM = boosted(new THREE.MeshStandardMaterial({ map: G.trail.d, normalMap: G.trail.n, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, color: '#d9c9b4', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 1.9, 'trail');
  const gravelM = boosted(new THREE.MeshStandardMaterial({ map: G.gravel.d, normalMap: G.gravel.n, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.9, color: '#e6e0d4', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 1.9, 'gravel');
  const dirtM = boosted(new THREE.MeshStandardMaterial({ map: G.dirt.d, normalMap: G.dirt.n, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, color: '#cdb89c' }), 1.9, 'dirt');
  [trailM, gravelM, dirtM].forEach(m => { [m.map, m.normalMap].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; }); });
  const widths = { beginner: 2.6, intermediate: 2.2, expert: 1.9 };
  S.runPts = {}; S.noGrass = new Set();
  const mark = (pts, r) => { for (const p of pts) for (let dx = -r; dx <= r; dx += 2) for (let dz = -r; dz <= r; dz += 2) S.noGrass.add((((p[0] + dx) / 2) | 0) + ':' + (((p[1] + dz) / 2) | 0)); };
  for (const k of Object.keys(sc.runs)) {
    const w = widths[k] || 2.2; const pts = resamplePath(sc.runs[k], 1.5); S.runPts[k] = pts; mark(pts, 2);
    g.add(ribbon(sc.runs[k], w, trailM, { berm: k === 'beginner' ? 2.0 : 2.8, texLen: 3.0 }));
    // features: tabletops and rollers on the straighter stretches
    const spacing = k === 'expert' ? 42 : k === 'intermediate' ? 48 : 60; let last = -spacing * 0.5, count = 0;
    for (let i = 20; i < pts.length - 20; i++) {
      const s = i * 1.5; if (s - last < spacing) continue; if (straightness(pts, i, 5) > 0.55) continue;
      const hd = headingAt(pts, i), p = pts[i];
      if (k === 'beginner') g.add(feature(p[0], p[1], hd, 4.2, 0.42, w + 0.6, 0.25, dirtM));
      else if (k === 'intermediate') g.add(feature(p[0], p[1], hd, 6.0, count % 2 ? 0.75 : 0.5, w + 0.6, 0.4, dirtM));
      else g.add(feature(p[0], p[1], hd, 7.0, count % 3 === 2 ? 1.25 : 0.95, w + 0.6, 0.42, dirtM));
      last = s; count++;
    }
  }
  // kids: pump track loop with rollers and berms, and a short jump line beside it
  g.add(ribbon(sc.kidsZone, 2.0, trailM, { closed: true, berm: 0.7, texLen: 2.6 }));
  const loop = resamplePath(sc.kidsZone, 1.5, true); mark(loop, 2);
  for (let i = 0, acc = 0; i < loop.length; i++) { acc += 1.5; if (acc >= 5.5 && straightness(loop, i, 3) < 0.5) { const hd = headingAt(loop, i); g.add(feature(loop[i][0], loop[i][1], hd, 3.0, 0.38, 2.4, 0.2, dirtM)); acc = 0; } }
  const kc = sc.kids; const jl = [[kc[0] - 24, kc[1] + 18], [kc[0] + 24, kc[1] + 18]]; const jh = Math.atan2(jl[1][0] - jl[0][0], -(jl[1][1] - jl[0][1]));
  g.add(ribbon(jl, 2.2, trailM, { texLen: 2.6 }));
  for (let t = 0; t < 3; t++) { const u = 0.2 + t * 0.28; g.add(feature(jl[0][0] + (jl[1][0] - jl[0][0]) * u, jl[0][1] + (jl[1][1] - jl[0][1]) * u, jh, 4.4, 0.6, 2.8, 0.42, dirtM)); }
  // gravel: camp path, arrival path, car park
  g.add(ribbon(sc.glampPath, 1.7, gravelM, { texLen: 2.4 })); g.add(ribbon(sc.basePath, 2.6, gravelM, { texLen: 2.4 })); mark(resamplePath(sc.glampPath, 1.5), 2); mark(resamplePath(sc.basePath, 1.5), 2); mark(jl.length ? resamplePath(jl, 1.5) : [], 2);
  { const c = sc.carpark, W = 50, H = 30, nx = 25, nz = 15; const geo = new THREE.PlaneGeometry(W, H, nx, nz); geo.rotateX(-Math.PI / 2); const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = c[0] + pos.getX(i), z = c[1] + pos.getZ(i); pos.setXYZ(i, x, groundAt(x, z) + 0.05, z); }
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 2.6, uv.getY(i) * H / 2.6);
    geo.computeVertexNormals(); const cp = new THREE.Mesh(geo, gravelM); cp.receiveShadow = true; g.add(cp);
    for (let x = -W / 2; x <= W / 2; x += 2) for (let z = -H / 2; z <= H / 2; z += 2) S.noGrass.add((((c[0] + x) / 2) | 0) + ':' + (((c[1] + z) / 2) | 0));
    const stopM = std({ color: '#5a5f63', roughness: 0.8 });
    for (let k = 0; k < 8; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.18), stopM); place(st, c[0] - 17.5 + k * 5, c[1] - 6, 0.12, 0); st.castShadow = true; g.add(st); } }
  return g;
}

/* ---------- grass tufts: a ring of instanced blade cards around the player, coloured from the aerial ---------- */
function grassTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d'); const r = rnd(31);
  g.clearRect(0, 0, 256, 192);
  for (let b = 0; b < 26; b++) {
    const x0 = 20 + r() * 216, h = 70 + r() * 110, lean = (r() - 0.5) * 90, w = 5 + r() * 6; const v = 150 + r() * 70;
    g.strokeStyle = `rgba(${v},${v - 8 - r() * 30},${v - 70},0.95)`; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, 192); g.quadraticCurveTo(x0 + lean * 0.3, 192 - h * 0.55, x0 + lean, 192 - h); g.stroke();
    g.strokeStyle = `rgba(${v - 50},${v - 60},${v - 110},0.9)`; g.lineWidth = w * 0.45; g.beginPath(); g.moveTo(x0 - w * 0.25, 192); g.quadraticCurveTo(x0 + lean * 0.3 - w * 0.25, 192 - h * 0.55, x0 + lean - w * 0.2, 192 - h); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function grassSystem(n) {
  const quad = (rot) => { const p = new THREE.PlaneGeometry(0.58, 0.44); p.translate(0, 0.22, 0); p.rotateY(rot); return p; };
  const qs = [quad(0), quad(Math.PI / 2)]; const geo = new THREE.BufferGeometry();
  const pos = [], uv = [], nor = [], idx = []; let base = 0;
  for (const q of qs) { pos.push(...q.attributes.position.array); uv.push(...q.attributes.uv.array); nor.push(...q.attributes.normal.array); for (const v of q.index.array) idx.push(v + base); base += 4; }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx);
  const mat = custom(new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, alphaToCoverage: Q.msaa > 0 }), (sh) => {
    sh.uniforms.time = { value: 0 }; sh.uniforms.fadeR = { value: 36 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time; varying float vGFade;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]); float sway = sin(time * 1.6 + ip.x * 0.7 + ip.z * 0.9) * 0.06 + sin(time * 3.1 + ip.z * 1.3) * 0.025;
          transformed.x += sway * uv.y * uv.y; transformed.z += sway * 0.5 * uv.y * uv.y; vGFade = length(ip - cameraPosition); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float fadeR; varying float vGFade;')
      .replace('#include <alphatest_fragment>', 'diffuseColor.a *= 1.0 - smoothstep(fadeR * 0.72, fadeR, vGFade);\n#include <alphatest_fragment>');
  }, 'grass');
  const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.frustumCulled = false; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, mat, n, cx: 1e9, cz: 1e9 };
}
function sampleRGB(img, x, z) { // img: {data,w} covering the near tier
  const half = S.nearM / 2; if (Math.abs(x) >= half || Math.abs(z) >= half) return null;
  const i = Math.floor((x + half) / S.nearM * (img.w - 1)), j = Math.floor((z + half) / S.nearM * (img.w - 1)); const k = (j * img.w + i) * 4; return [img.data[k], img.data[k + 1], img.data[k + 2]];
}
function grassUpdate(force) {
  const Gs = S.grass; if (!Gs) return; const P = S.player;
  if (!force && Math.hypot(P.x - Gs.cx, P.z - Gs.cz) < 7) return;
  Gs.cx = P.x; Gs.cz = P.z;
  const R = 40, cell = 8, m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let count = 0; const c0x = Math.floor((P.x - R) / cell), c1x = Math.floor((P.x + R) / cell), c0z = Math.floor((P.z - R) / cell), c1z = Math.floor((P.z + R) / cell);
  outer: for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const ccx = (cx + 0.5) * cell, ccz = (cz + 0.5) * cell; if (Math.hypot(ccx - P.x, ccz - P.z) > R + cell) continue;
    const w = sampleRGB(S.splatImg, ccx, ccz); if (!w) continue;
    const grassW = (w[2] + Math.max(0, 255 - w[0] - w[1] - w[2])) / 255, gravelW = w[1] / 255;
    const dens = Math.max(0, grassW * 1.0 + (1 - grassW - gravelW) * 0.18 - gravelW * 0.5);
    const k = Math.round(dens * 44); if (k <= 0) continue;
    const r = rnd(((cx * 73856093) ^ (cz * 19349663)) & 0x7fffffff || 7);
    for (let t = 0; t < k; t++) {
      const x = cx * cell + r() * cell, z = cz * cell + r() * cell; if (Math.hypot(x - P.x, z - P.z) > R) continue;
      if (S.noGrass.has(((x / 2) | 0) + ':' + ((z / 2) | 0))) continue;
      let onTrail = false; for (const tt of S.sc.tents) if (Math.hypot(x - tt[0], z - tt[1]) < 4.2) { onTrail = true; break; } if (onTrail) continue;
      const y = groundAt(x, z); const s = 0.65 + r() * 0.6; q.setFromAxisAngle(up, r() * 6.28); p.set(x, y - 0.02, z); sc.set(s, s * (0.75 + r() * 0.6), s);
      m.compose(p, q, sc); Gs.mesh.setMatrixAt(count, m);
      const mc = sampleRGB(S.nearImg, x, z) || [160, 140, 100]; const vv = 0.85 + r() * 0.4; col.setRGB(Math.min(1, mc[0] / 255 * 1.35 * vv), Math.min(1, mc[1] / 255 * 1.32 * vv), Math.min(1, mc[2] / 255 * 0.95 * vv)); Gs.mesh.setColorAt(count, col);
      if (++count >= Gs.n) break outer;
    }
  }
  Gs.mesh.count = count; Gs.mesh.instanceMatrix.needsUpdate = true; if (Gs.mesh.instanceColor) Gs.mesh.instanceColor.needsUpdate = true;
}
function imageData(img, w) { const c = document.createElement('canvas'); c.width = w; c.height = w; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, w); return { data: g.getImageData(0, 0, w, w).data, w }; }

/* ---------- objects ---------- */
function place(obj, x, z, yOff, rotY) { obj.position.set(x, groundAt(x, z) + (yOff || 0), z); if (rotY) obj.rotation.y = rotY; return obj; }
function shadowed(o) { o.castShadow = true; o.receiveShadow = true; return o; }
function tent(x, z, rot) {
  const g = new THREE.Group();
  const deckM = std({ map: S.tex.plank, roughness: 0.9 });
  const deck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.32, 5.8), deckM)); deck.position.y = 0.16; g.add(deck);
  for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), deckM); leg.position.set(dx, -0.3, dz); g.add(leg); }
  const canM = std({ map: S.tex.canvas, roughness: 0.95, emissive: new THREE.Color('#ffb961'), emissiveIntensity: 0 });
  S.tentMats.push(canM);
  const wall = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.4, 0.95, 18, 1, true), canM)); wall.position.y = 0.32 + 0.475; g.add(wall);
  const cone = shadowed(new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.85, 18, 1, true), canM)); cone.position.y = 0.32 + 0.95 + 1.425; g.add(cone);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6), std({ color: '#6b5236' })); pole.position.y = 0.32 + 2.2; g.add(pole);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), std({ color: '#4a3a2a', side: THREE.DoubleSide })); door.position.set(0, 0.32 + 0.95, 2.41); g.add(door);
  const ropeM = new THREE.LineBasicMaterial({ color: '#cfc4ad' }); const pts = [];
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 2.4, 0.32 + 0.95 + 0.3, Math.sin(a) * 2.4), new THREE.Vector3(Math.cos(a) * 3.6, 0, Math.sin(a) * 3.6)); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), ropeM));
  const chairM = std({ color: '#2f4a3a', roughness: 0.8 });
  for (const dx of [-1.6, 1.6]) { const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), chairM); seat.position.set(dx, 0.32 + 0.45, -1.9); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.06), chairM); back.position.set(dx, 0.32 + 0.75, -2.17); g.add(back);
    for (const [lx, lz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), chairM); l.position.set(dx + lx, 0.32 + 0.225, -1.9 + lz); g.add(l); } }
  const lampM = std({ color: '#f6e7c5', emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0 }); S.lampMats.push(lampM);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), lampM); lamp.position.set(2.3, 0.32 + 1.0, -2.3); g.add(lamp);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), chairM); post.position.set(2.3, 0.32 + 0.5, -2.3); g.add(post);
  const pit = new THREE.Group(); pit.position.set(3.9, 0, -2.6);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 8, 18), std({ map: S.tex.stone, roughness: 1 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.14; pit.add(ring);
  const emberM = std({ color: '#2a1d14', emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 0 }); S.fireMats.push(emberM);
  const ember = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), emberM); ember.rotation.x = -Math.PI / 2; ember.position.y = 0.12; pit.add(ember);
  g.add(pit);
  S.fires.push({ x: x + Math.cos(rot) * 3.9 + Math.sin(rot) * 2.6, z: z - Math.sin(rot) * 3.9 + Math.cos(rot) * 2.6 });
  return place(g, x, z, 0.1, rot);
}
function hut(x, z, rot) {
  const g = new THREE.Group(), wood = std({ color: '#4a3b2c', roughness: 0.9 });
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(9, 2.7, 5.5), wood)); body.position.y = 1.35; g.add(body);
  const roofM = std({ color: '#2b2f31', roughness: 0.7, metalness: 0.3 });
  for (const s of [-1, 1]) { const r = shadowed(new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.12, 3.3), roofM)); r.position.set(0, 2.7 + 0.72, s * 1.45); r.rotation.x = s * 0.44; g.add(r); }
  const winM = std({ color: '#c9d6d8', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 }); S.lampMats.push(winM);
  for (const dx of [-3, 0, 3]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), winM); w.position.set(dx, 1.6, 2.76); g.add(w); }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.1), std({ color: '#1f1a16' })); door.position.set(-3.2, 1.05, -2.76); door.rotation.y = Math.PI; g.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), std({ color: '#f1ead9' })); sign.position.set(1.5, 2.3, 2.76); g.add(sign);
  return place(g, x, z, 0, rot);
}
function shelter(x, z, rot) {
  const g = new THREE.Group(), steel = std({ color: '#2d3335', roughness: 0.6, metalness: 0.4 });
  for (const [dx, dz] of [[-3.2, -1.9], [3.2, -1.9], [-3.2, 1.9], [3.2, 1.9]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.1, 8), steel); p.position.set(dx, 1.55, dz); g.add(p); }
  const roof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.16, 4.6), std({ color: '#3a4042', metalness: 0.3, roughness: 0.6 }))); roof.position.y = 3.15; g.add(roof);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.5), std({ map: S.tex.plank })); bench.position.set(0, 0.5, -1.5); g.add(bench);
  const lampM = std({ color: '#f6e7c5', emissive: new THREE.Color('#ffe0a3'), emissiveIntensity: 0 }); S.lampMats.push(lampM);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.2), lampM); lamp.position.set(0, 3.0, 0); g.add(lamp);
  return place(g, x, z, 0, rot);
}
function lift(sc) {
  const g = new THREE.Group(), steel = std({ color: '#b9bec2', roughness: 0.5, metalness: 0.6 });
  const top = [];
  const chain = [sc.B, ...sc.towers, sc.T];
  chain.forEach((p, k) => {
    const y = groundAt(p[0], p[1]); const h = (k === 0 || k === chain.length - 1) ? 5.8 : 8.6;
    if (k > 0 && k < chain.length - 1) {
      const t = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, h, 10), steel)); t.position.set(p[0], y + h / 2, p[1]); g.add(t);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 3.4), std({ color: '#f0b429', roughness: 0.6 })); arm.position.set(p[0], y + h - 0.3, p[1]);
      arm.rotation.y = Math.atan2(sc.T[0] - sc.B[0], sc.T[1] - sc.B[1]); g.add(arm);
    }
    top.push(new THREE.Vector3(p[0], y + h - 0.35, p[1]));
  });
  const pts = [];
  for (let k = 0; k < top.length - 1; k++) { const a = top[k], b = top[k + 1]; for (let u = 0; u <= 1; u += 0.1) { const v = a.clone().lerp(b, u); v.y -= Math.sin(u * Math.PI) * 0.7; pts.push(v); } }
  const curve = new THREE.CatmullRomCurve3(pts); S.cable = curve;
  const ropeM = std({ color: '#dcdcd6', metalness: 0.5, roughness: 0.4 });
  const dir = new THREE.Vector3(sc.T[0] - sc.B[0], 0, sc.T[1] - sc.B[1]).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.6);
  for (const sg of [-1, 1]) { const c2 = new THREE.CatmullRomCurve3(pts.map(v => v.clone().add(side.clone().multiplyScalar(sg)))); const cable = new THREE.Mesh(new THREE.TubeGeometry(c2, 220, 0.11, 6, false), ropeM); g.add(cable); }
  S.hangers = [];
  const hm = std({ color: '#f0b429', roughness: 0.6 });
  const skin = std({ color: '#c89a76', roughness: 0.8 }), kit = [std({ color: '#2b2f33' }), std({ color: '#7a1f1f' }), std({ color: '#1f4e7a' })];
  const tyre = std({ color: '#1a1a1a', roughness: 0.9 });
  for (let k = 0; k < 6; k++) { const h = new THREE.Group(); const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), steel); rope.position.y = -1.2; h.add(rope);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), hm); bar.position.y = -2.4; h.add(bar);
    if (k % 2 === 0) {
      const r = new THREE.Group(); r.position.y = -2.4 - 1.05 - 0.1;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 4, 8), kit[(k / 2) % 3]); body.position.y = 0.95; r.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), std({ color: '#222' })); head.position.y = 1.5; r.add(head);
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
  const trunk = new THREE.InstancedMesh(trunkG, std({ color: '#6e5a48', roughness: 1 }), n); trunk.castShadow = true;
  const canG = new THREE.BufferGeometry();
  const quad = (rot) => { const p = new THREE.PlaneGeometry(6, 6); p.translate(0, 3, 0); p.rotateY(rot); return p; };
  const q1 = quad(0), q2 = quad(Math.PI / 2);
  const pos = new Float32Array([...q1.attributes.position.array, ...q2.attributes.position.array]);
  const uv = new Float32Array([...q1.attributes.uv.array, ...q2.attributes.uv.array]);
  const nor = new Float32Array([...q1.attributes.normal.array, ...q2.attributes.normal.array]);
  canG.setAttribute('position', new THREE.BufferAttribute(pos, 3)); canG.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); canG.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const idx = []; const i1 = q1.index.array, i2 = q2.index.array; for (const v of i1) idx.push(v); for (const v of i2) idx.push(v + 4); canG.setIndex(idx);
  const canM = std({ map: S.tex.canopy, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: '#d9dccf', alphaToCoverage: Q.msaa > 0 });
  const can = new THREE.InstancedMesh(canG, canM, n); can.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((t, k) => {
    const y = groundAt(t[0], t[1]); const sc = t[2]; q.setFromAxisAngle(up, (k * 0.73) % 6.28);
    p.set(t[0], y, t[1]); s.set(sc, sc, sc); m.compose(p, q, s); trunk.setMatrixAt(k, m);
    s.set(sc * 1.15, sc * 1.05, sc * 1.15); p.set(t[0], y + 1.3 * sc, t[1]); m.compose(p, q, s); can.setMatrixAt(k, m);
  });
  const g = new THREE.Group(); g.add(trunk, can); return g;
}
/* ---------- sky: three HDRI skies (noon, sunset, night) cross-faded by the sun slider ---------- */
const SKY = { day: { sunAz: 216.2, sunEl: 49.8, gain: 1.0 }, dusk: { sunAz: 216.0, sunEl: 6.0, gain: 1.05 }, night: { sunAz: 200.9, sunEl: 50.3, gain: 1.0 } };
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { tA: { value: null }, tB: { value: null }, rotA: { value: 0 }, rotB: { value: 0 }, mixAB: { value: 0 }, gainA: { value: 1 }, gainB: { value: 1 },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color('#fff3d6') }, sunGlow: { value: 1 }, fogCol: { value: new THREE.Color('#cfd6d2') } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform sampler2D tA, tB; uniform float rotA, rotB, mixAB, gainA, gainB, sunGlow; uniform vec3 sunDir, sunCol, fogCol; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir);
        float az = atan(d.x, -d.z) / 6.2831853; float el = asin(clamp(d.y, -1.0, 1.0)) / 3.14159265;
        vec3 cA = texture2D(tA, vec2(fract(az + rotA), 0.5 - el)).rgb * gainA; vec3 cB = texture2D(tB, vec2(fract(az + rotB), 0.5 - el)).rgb * gainB;
        vec3 c = mix(cA, cB, mixAB);
        float sd = max(0.0, dot(d, sunDir)); c += sunCol * (pow(sd, 500.0) * 2.0 + pow(sd, 14.0) * 0.14) * sunGlow;
        float h = smoothstep(0.035, -0.02, d.y); c = mix(c, fogCol, h * 0.7);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat); m.frustumCulled = false; m.renderOrder = -10; return m;
}
const SUNK = [ // t: 0 noon, 0.5 dusk, 1 night — sun positions match the HDRIs
  { el: 49.8, az: 335, sun: '#fff1d8', sunI: 2.5, env: 0.6, hemi: 0.12, fog: '#cfd6d2', fogN: 320, fogF: 4200, exp: 0.95, glow: 1, night: 0 },
  { el: 6.0, az: 275, sun: '#ffb270', sunI: 1.5, env: 0.55, hemi: 0.10, fog: '#dcb79a', fogN: 260, fogF: 3600, exp: 0.95, glow: 1, night: 0 },
  { el: -14, az: 300, sun: '#000000', sunI: 0.0, env: 0.4, hemi: 0.10, fog: '#0b0f1a', fogN: 180, fogF: 2600, exp: 0.85, glow: 0, night: 1 }
];
function mixC(a, b, u) { return new THREE.Color(a).lerp(new THREE.Color(b), u); }
function sunVec(elDeg, azDeg) { const el = elDeg * Math.PI / 180, az = azDeg * Math.PI / 180; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); }
function skyRot(k, azDeg) { return (SKY[k].sunAz - azDeg) / 360; }
function setSun(t) {
  t = Math.max(0, Math.min(1, t)); S.sunT = t;
  const [a, b, u] = t < 0.5 ? [SUNK[0], SUNK[1], t * 2] : [SUNK[1], SUNK[2], (t - 0.5) * 2];
  const L = (x, y) => x + (y - x) * u;
  const dir = sunVec(L(a.el, b.el), L(a.az, b.az)); S.sunDir = dir;
  const night = L(a.night, b.night);
  // sky textures
  const U = S.skyMesh.material.uniforms, sm = (x) => x * x * (3 - 2 * x);
  if (t < 0.5) { U.tA.value = S.sky.day; U.tB.value = S.sky.dusk; U.rotA.value = skyRot('day', SUNK[0].az); U.rotB.value = skyRot('dusk', SUNK[1].az); U.gainA.value = SKY.day.gain; U.gainB.value = SKY.dusk.gain; U.mixAB.value = sm(u); }
  else { U.tA.value = S.sky.dusk; U.tB.value = S.sky.night; U.rotA.value = skyRot('dusk', SUNK[1].az); U.rotB.value = skyRot('night', SUNK[2].az); U.gainA.value = SKY.dusk.gain; U.gainB.value = SKY.night.gain; U.mixAB.value = sm(u); }
  U.sunDir.value.copy(dir); U.sunCol.value = mixC(a.sun, b.sun, u); U.sunGlow.value = L(a.glow, b.glow); U.fogCol.value = mixC(a.fog, b.fog, u);
  // environment lighting
  const envK = t < 0.3 ? 'day' : t < 0.72 ? 'dusk' : 'night'; if (S.env[envK]) S.scene.environment = S.env[envK];
  const envI = L(a.env, b.env); S.mats.forEach(m => { if (m.isMeshStandardMaterial) m.envMapIntensity = envI; });
  // sun / moon
  const sunCol = mixC(a.sun, b.sun, u), sunI = Math.max(0, L(a.sunI, b.sunI));
  if (S.csm) { S.csm.lightDirection.copy(dir).negate(); S.csm.lights.forEach(l => { l.color.copy(sunCol); l.intensity = sunI; l.visible = sunI > 0.02; }); }
  if (S.sun) { S.sun.color.copy(sunCol); S.sun.intensity = sunI; S.sun.visible = sunI > 0.02; }
  S.moon.intensity = 0.55 * night; S.moonDir = sunVec(SKY.night.sunEl, SUNK[2].az); S.moon.position.copy(S.moonDir).multiplyScalar(400);
  S.hemi.intensity = L(a.hemi, b.hemi); S.hemi.color = mixC('#cfe0f0', '#6f86b8', night); S.hemi.groundColor = mixC('#8d7a5c', '#3a332c', night);
  S.scene.fog.color = mixC(a.fog, b.fog, u); S.scene.fog.near = L(a.fogN, b.fogN); S.scene.fog.far = L(a.fogF, b.fogF); S.renderer.setClearColor(S.scene.fog.color);
  S.renderer.toneMappingExposure = L(a.exp, b.exp);
  const glow = Math.max(0, Math.min(1, (t - 0.3) / 0.5));
  S.tentMats.forEach(m => { m.emissiveIntensity = glow * 0.9; }); S.lampMats.forEach(m => { m.emissiveIntensity = glow * 2.2; }); S.fireMats.forEach(m => { m.emissiveIntensity = glow * 2.6; });
  S.glow = glow;
  if (S.bloom) { S.bloom.strength = 0.12 + 0.55 * glow; S.bloom.threshold = 1.0 - 0.25 * glow; S.bloom.radius = 0.5; }
  if (S.grade) { const g = S.grade.uniforms; g.contrast.value = 1.06; g.saturation.value = 1.06 - 0.12 * night; g.warmth.value = 0.012 * (1 - Math.abs(t - 0.5) * 2) * (t < 0.5 ? u : 1 - u) + 0.0; g.vignette.value = 0.22 + 0.12 * night; }
  if (S.ui && S.ui.sun && Math.abs(S.ui.sun.value / 100 - t) > 0.01) S.ui.sun.value = Math.round(t * 100);
}

/* ---------- post-processing ---------- */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.06 }, saturation: { value: 1.06 }, vignette: { value: 0.22 }, warmth: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast, saturation, vignette, warmth; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      col = (col - 0.5) * contrast + 0.5; float l = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(l), col, saturation);
      col += vec3(warmth, warmth * 0.35, -warmth);
      float d = distance(vUv, vec2(0.5)); col *= 1.0 - vignette * smoothstep(0.42, 0.95, d);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a); }`
};
function setupPost(w, h) {
  if (!Q.post) return;
  const pr = Q.pr;
  const rt = new THREE.WebGLRenderTarget(Math.round(w * pr), Math.round(h * pr), { type: THREE.HalfFloatType, samples: Q.msaa });
  S.composer = new EffectComposer(S.renderer, rt); S.composer.setPixelRatio(pr); S.composer.setSize(w, h);
  S.composer.addPass(new RenderPass(S.scene, S.camera));
  if (Q.bloom) { S.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.5, 1.0); S.composer.addPass(S.bloom); }
  S.composer.addPass(new OutputPass());
  if (Q.smaa) { S.smaa = new SMAAPass(Math.round(w * pr), Math.round(h * pr)); S.composer.addPass(S.smaa); }
  if (Q.grade) { S.grade = new ShaderPass(GradeShader); S.composer.addPass(S.grade); }
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
let frames = 0, fpsT = 0, fps = 0;
function tick(now) {
  if (!running) return; requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  const P = S.player;
  if (P.path && P.auto) {
    const pts = P.path; let seg = P.seg; const a = pts[seg], b = pts[seg + 1];
    if (b) { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); P.u += 1.35 * dt / d;
      if (P.u >= 1) { P.seg++; P.u = 0; if (P.seg >= pts.length - 1) { P.auto = false; P.seg = pts.length - 2; P.u = 1; S.ui.auto.setAttribute('aria-pressed', 'false'); } }
      const s2 = Math.min(pts.length - 2, P.seg), u2 = Math.min(1, P.u); const a2 = pts[s2], b2 = pts[s2 + 1];
      P.x = a2[0] + (b2[0] - a2[0]) * u2; P.z = a2[1] + (b2[1] - a2[1]) * u2;
      if (now - P.lastLook > 2500) { const ty = yawTo(a2, b2); let d2 = ((ty - P.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; P.yaw += d2 * Math.min(1, dt * 1.6); P.pitch += (0 - P.pitch) * Math.min(1, dt * 1.2); }
    }
  } else {
    const sp = (P.run ? 4.6 : 2.3) * dt, f = P.fwd, r = P.side;
    if (f || r) { const dx = Math.sin(P.yaw) * f + Math.cos(P.yaw) * r, dz = -Math.cos(P.yaw) * f + Math.sin(P.yaw) * r; const l = Math.hypot(dx, dz) || 1; P.x += dx / l * sp; P.z += dz / l * sp; }
  }
  for (const t of S.sc.tents) { const dx = P.x - t[0], dz = P.z - t[1], d = Math.hypot(dx, dz); if (d < 3.4 && d > 0.001) { P.x = t[0] + dx / d * 3.4; P.z = t[1] + dz / d * 3.4; } }
  { const h = S.sc.amen, dx = P.x - h[0], dz = P.z - h[1], d = Math.hypot(dx, dz); if (d < 6 && d > 0.001) { P.x = h[0] + dx / d * 6; P.z = h[1] + dz / d * 6; } }
  const lim = S.farM / 2 - 200; P.x = Math.max(-lim, Math.min(lim, P.x)); P.z = Math.max(-lim, Math.min(lim, P.z));
  const gy = groundAt(P.x, P.z); P.y += ((gy + EYE) - P.y) * Math.min(1, dt * 8);
  const cam = S.camera; cam.position.set(P.x, P.y, P.z);
  P.pitch = Math.max(-1.2, Math.min(1.2, P.pitch));
  cam.rotation.set(0, 0, 0, 'YXZ'); cam.rotation.y = -P.yaw; cam.rotation.x = P.pitch;
  cam.updateMatrixWorld();
  if (S.csm) S.csm.update();
  if (S.sun) { S.sun.position.copy(S.sunDir).multiplyScalar(220).add(cam.position); S.sun.target.position.copy(cam.position); S.sun.target.updateMatrixWorld(); }
  S.skyMesh.position.copy(cam.position);
  grassUpdate(false); if (S.grass) { const u = S.grass.mat.userData.shader; if (u) u.uniforms.time.value = now / 1000; }
  if (S.cable) for (const h of S.hangers) { h.t = (h.t + dt * 0.011) % 1; const p = S.cable.getPointAt(h.t); h.m.position.copy(p); }
  if (S.glow > 0) { const fl = 0.85 + 0.15 * Math.sin(now / 90) * Math.sin(now / 230); S.fireMats.forEach((m, k) => { m.emissiveIntensity = S.glow * 2.2 * (fl + 0.1 * Math.sin(now / 140 + k)); });
    const near = S.fires.map(f => ({ f, d: Math.hypot(f.x - P.x, f.z - P.z) })).sort((a, b) => a.d - b.d).slice(0, S.fireLights.length);
    S.fireLights.forEach((L, k) => { const n = near[k]; if (n && n.d < 60) { L.visible = true; L.position.set(n.f.x, groundAt(n.f.x, n.f.z) + 0.6, n.f.z); L.intensity = 26 * S.glow * (fl + 0.15 * Math.sin(now / 110 + k)); } else L.visible = false; });
  } else S.fireLights.forEach(L => { L.visible = false; });
  S.renderer.info.reset(); if (S.composer) S.composer.render(dt); else S.renderer.render(S.scene, S.camera);
  frames++; if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; if (S.ui.fps) S.ui.fps.textContent = fps + ' fps · ' + S.quality + ' · ' + S.renderer.info.render.calls + ' calls · ' + Math.round(S.renderer.info.render.triangles / 1000) + 'k tris'; }
  if (S.ui.where) { S.ui.where.textContent = (P.auto ? 'Walking' : 'Standing') + ' · ' + Math.round(gy) + ' m above sea level'; }
}

/* ---------- build ---------- */
async function boot() {
  if (booted) return; if (bootP) return bootP;
  bootP = (async () => {
    setLoad('Terrain and sky');
    const gsets = ['dirt', 'gravel', 'grass', 'scrub', 'trail'];
    const [sc, hnI, hfI, nearI, farI, splatI, skyDay, skyDusk, skyNight, envDay, envDusk, envNight, ...gtex] = await Promise.all([
      fetch(A + 'lg-game-scene.json').then(r => r.json()), loadImage(A + 'lg-game-hnear.png'), loadImage(A + 'lg-game-hfar.png'), loadImage(A + 'lg-game-near.jpg'), loadImage(A + 'lg-game-far.jpg'), loadImage(A + 'lg-game-splat.jpg'),
      loadTex(A + 'lg-sky-day.jpg', { nomip: true }), loadTex(A + 'lg-sky-dusk.jpg', { nomip: true }), loadTex(A + 'lg-sky-night.jpg', { nomip: true }),
      loadHDR(A + 'lg-env-day.hdr'), loadHDR(A + 'lg-env-dusk.hdr'), loadHDR(A + 'lg-env-night.hdr'),
      ...gsets.flatMap(k => [loadTex(A + 'lg-g-' + k + '-d.jpg'), loadTex(A + 'lg-g-' + k + '-n.jpg', { linear: true })])]);
    setLoad('Tents, lift and trees');
    S.sc = sc; S.nearM = sc.near_m; S.farM = sc.far_m; S.hn = decodeHeights(hnI); S.hf = decodeHeights(hfI);
    S.g = {}; gsets.forEach((k, i) => { const d = gtex[i * 2], n = gtex[i * 2 + 1]; d.wrapS = d.wrapT = n.wrapS = n.wrapT = THREE.RepeatWrapping; S.g[k] = { d, n }; });
    S.splat = new THREE.Texture(splatI); S.splat.colorSpace = THREE.NoColorSpace; S.splat.needsUpdate = true;
    S.splatImg = imageData(splatI, 1024); S.nearImg = imageData(nearI, 1024);
    S.tex = { ground: TEX.ground(), canvas: TEX.canvas(), plank: TEX.plank(), canopy: TEX.canopy(), stone: TEX.stone(), gravel: TEX.gravel() };
    S.tentMats = []; S.lampMats = []; S.fireMats = []; S.fires = [];
    const el = document.getElementById('game-canvas');
    S.renderer = new THREE.WebGLRenderer({ canvas: el, antialias: !Q.post, powerPreference: 'high-performance' });
    S.renderer.setPixelRatio(Q.pr); S.renderer.shadowMap.enabled = Q.shadow > 0; S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    S.renderer.outputColorSpace = THREE.SRGBColorSpace; S.renderer.toneMapping = THREE.ACESFilmicToneMapping; S.renderer.toneMappingExposure = 1.0; S.renderer.info.autoReset = false;
    S.scene = new THREE.Scene(); S.scene.fog = new THREE.Fog('#cfd6d2', 320, 4200);
    S.camera = new THREE.PerspectiveCamera(66, 1, 0.3, 9000);
    // sky and environment
    S.sky = { day: skyDay, dusk: skyDusk, night: skyNight };
    const pm = new THREE.PMREMGenerator(S.renderer); pm.compileEquirectangularShader();
    S.env = {}; for (const [k, h] of [['day', envDay], ['dusk', envDusk], ['night', envNight]]) { S.env[k] = pm.fromEquirectangular(h).texture; h.dispose(); } pm.dispose();
    S.skyMesh = skyDome(); S.scene.add(S.skyMesh);
    // lights (cascaded shadows on the high tier, one following shadow light otherwise)
    if (Q.csm) {
      S.csm = new CSM({ camera: S.camera, parent: S.scene, cascades: 3, maxFar: 700, mode: 'practical', shadowMapSize: Q.shadow, lightDirection: new THREE.Vector3(0.3, -1, 0.2).normalize(), lightIntensity: 2.8, lightNear: 1, lightFar: 1600, lightMargin: 150, shadowBias: -0.00025 });
      S.csm.fade = true; S.csm.lights.forEach(l => { l.shadow.normalBias = 0.5; });
    } else {
      S.sun = new THREE.DirectionalLight('#fff3d6', 2.8); S.sun.castShadow = Q.shadow > 0; S.sun.shadow.mapSize.set(Q.shadow || 512, Q.shadow || 512);
      const sc2 = S.sun.shadow.camera; sc2.left = -90; sc2.right = 90; sc2.top = 90; sc2.bottom = -90; sc2.near = 20; sc2.far = 600; S.sun.shadow.bias = -0.0008; S.sun.shadow.normalBias = 0.6;
      S.scene.add(S.sun); S.scene.add(S.sun.target);
    }
    S.moon = new THREE.DirectionalLight('#8fa6d8', 0); S.moon.position.set(-300, 400, 200); S.scene.add(S.moon);
    S.hemi = new THREE.HemisphereLight('#cfe0f0', '#8d7a5c', 0.18); S.scene.add(S.hemi);
    S.fireLights = []; for (let k = 0; k < 4; k++) { const L = new THREE.PointLight('#ff9a3c', 0, 40, 1.6); L.visible = false; S.scene.add(L); S.fireLights.push(L); }
    // terrain
    const nearTex = new THREE.Texture(nearI); nearTex.colorSpace = THREE.SRGBColorSpace; nearTex.anisotropy = Q.aniso; nearTex.needsUpdate = true;
    const farTex = new THREE.Texture(farI); farTex.colorSpace = THREE.SRGBColorSpace; farTex.anisotropy = Math.min(4, Q.aniso); farTex.needsUpdate = true;
    const far = new THREE.Mesh(terrainGeometry(S.hf, S.farM, null, { f: S.hn, size: S.nearM }), farMaterial(farTex)); far.receiveShadow = true; S.scene.add(far);
    const near = new THREE.Mesh(terrainGeometry(S.hn, S.nearM, { f: S.hf, size: S.farM }), splatMaterial(nearTex)); near.receiveShadow = true; S.scene.add(near);
    S.scene.add(builtGround(sc));
    if (Q.grass) { S.grass = grassSystem(Q.grass); S.scene.add(S.grass.mesh); }
    // objects
    const campRot = Math.atan2(sc.T[0] - sc.tents[7][0], -(sc.T[1] - sc.tents[7][1]));
    sc.tents.forEach((t, k) => S.scene.add(tent(t[0], t[1], campRot + (k % 3 - 1) * 0.25)));
    S.scene.add(hut(sc.amen[0], sc.amen[1], 0.35));
    const liftRot = Math.atan2(sc.T[0] - sc.B[0], -(sc.T[1] - sc.B[1]));
    S.scene.add(shelter(sc.T[0], sc.T[1], liftRot)); S.scene.add(shelter(sc.B[0], sc.B[1], liftRot));
    S.scene.add(lift(sc));
    { const keep = []; const inKids = (x, z) => { const zn = sc.kidsZone; let inside = false; for (let i = 0, j = zn.length - 1; i < zn.length; j = i++) { if (((zn[i][1] > z) !== (zn[j][1] > z)) && (x < (zn[j][0] - zn[i][0]) * (z - zn[i][1]) / (zn[j][1] - zn[i][1]) + zn[i][0])) inside = !inside; } return inside; };
      const liftPts = resamplePath([sc.B, ...sc.towers, sc.T], 3);
      for (const t of sc.trees) { const x = t[0], z = t[1]; let bad = inKids(x, z) || Math.abs(x - sc.carpark[0]) < 28 && Math.abs(z - sc.carpark[1]) < 18;
        if (!bad) for (let dx = -2; dx <= 2 && !bad; dx += 2) for (let dz = -2; dz <= 2; dz += 2) if (S.noGrass.has((((x + dx) / 2) | 0) + ':' + (((z + dz) / 2) | 0))) { bad = true; break; }
        if (!bad) for (const q of liftPts) if (Math.hypot(x - q[0], z - q[1]) < 3.5) { bad = true; break; }
        if (!bad) keep.push(t); }
      sc.trees = keep; S.scene.add(trees(sc.trees)); }
    const carM = [std({ color: '#d8d8d6', metalness: 0.6, roughness: 0.4 }), std({ color: '#2f3b4a', metalness: 0.6, roughness: 0.4 })];
    for (let k = 0; k < 3; k++) { const c = new THREE.Group(); const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.0, 1.9), carM[k % 2])); b.position.y = 0.75; c.add(b); const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.7), carM[k % 2]); cab.position.set(-0.2, 1.6, 0); c.add(cab); place(c, sc.carpark[0] - 14 + k * 7, sc.carpark[1] + 6, 0, 0.1); S.scene.add(c); }
    S.player = { x: 0, z: 0, y: 400, yaw: 0, pitch: 0, fwd: 0, side: 0, run: false, path: null, auto: false, seg: 0, u: 0, lastLook: 0 };
    S.sunT = 0; S.glow = 0;
    setupPost(el.clientWidth || 1280, el.clientHeight || 720);
    setSun(0);
    booted = true;
  })();
  return bootP;
}
function resize() {
  const el = document.getElementById('game-canvas'); const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
  S.renderer.setSize(w, h, false); S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
  if (S.composer) { S.composer.setSize(w, h); if (S.smaa) S.smaa.setSize(Math.round(w * Q.pr), Math.round(h * Q.pr)); if (S.bloom) S.bloom.setSize(w, h); }
  if (S.csm) S.csm.updateFrustums();
}

/* ---------- UI and controls ---------- */
function bindUI() {
  if (S.ui) return;
  const $ = (id) => document.getElementById(id);
  S.ui = { auto: $('game-auto'), sun: $('game-sun'), where: $('game-where'), hint: $('game-hint') };
  if (PARAMS.has('fps')) { const f = document.createElement('div'); f.id = 'game-fps'; f.style.cssText = 'position:absolute;right:16px;bottom:120px;z-index:3;font:600 11px/1.2 monospace;color:#fff;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:6px;pointer-events:none'; $('game').appendChild(f); S.ui.fps = f; }
  const el = $('game-canvas'); let drag = null;
  el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; el.setPointerCapture(e.pointerId); S.player.lastLook = performance.now(); S.ui.hint.classList.add('gone'); });
  el.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    S.player.yaw += dx * 0.0042; S.player.pitch -= dy * 0.0036; S.player.lastLook = performance.now(); });
  const up = () => { drag = null; }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  const keys = {};
  const onKey = (e, down) => { if (!running) return; const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].indexOf(k) < 0) return;
    keys[k] = down; e.preventDefault(); const P = S.player;
    P.fwd = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0); P.side = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0); P.run = !!keys.shift;
    if (down && (P.fwd || P.side)) { P.auto = false; S.ui.auto.setAttribute('aria-pressed', 'false'); } };
  window.addEventListener('keydown', (e) => onKey(e, true)); window.addEventListener('keyup', (e) => onKey(e, false));
  const joy = $('game-joy'), knob = joy.querySelector('i'); let jd = null;
  joy.addEventListener('pointerdown', (e) => { jd = { id: e.pointerId }; joy.setPointerCapture(e.pointerId); S.player.auto = false; S.ui.auto.setAttribute('aria-pressed', 'false'); e.preventDefault(); });
  joy.addEventListener('pointermove', (e) => { if (!jd || e.pointerId !== jd.id) return; const r = joy.getBoundingClientRect(); let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } knob.style.transform = `translate(${dx * 28}px,${dy * 28}px)`; S.player.fwd = -dy; S.player.side = dx; S.player.run = l > 0.92; });
  const jup = () => { jd = null; knob.style.transform = ''; S.player.fwd = 0; S.player.side = 0; S.player.run = false; }; joy.addEventListener('pointerup', jup); joy.addEventListener('pointercancel', jup);
  S.ui.auto.addEventListener('click', () => { const P = S.player; if (!P.path) return; P.auto = !P.auto; S.ui.auto.setAttribute('aria-pressed', P.auto ? 'true' : 'false'); });
  S.ui.sun.addEventListener('input', (e) => { setSun(e.target.value / 100); if (window.LGGame.onSun) window.LGGame.onSun(S.sunT); });
  document.querySelectorAll('[data-spawn]').forEach(b => b.addEventListener('click', () => spawn(b.dataset.spawn)));
  $('game-x').addEventListener('click', () => window.LGGame.close());
  window.addEventListener('resize', () => { if (running) resize(); });
}
function spawn(k) {
  let sp; if (k && k.indexOf('at:') === 0) { const v = k.slice(3).split(',').map(Number); sp = { x: v[0], z: v[1], yaw: (v[2] || 0) * Math.PI / 180, path: null, pitch: (v[3] || 0) * Math.PI / 180 }; }
  else sp = (SPAWN[k] || SPAWN.deck)(S.sc);
  const P = S.player;
  P.x = sp.x; P.z = sp.z; P.yaw = sp.yaw; P.pitch = sp.pitch != null ? sp.pitch : -0.02; P.path = sp.path; P.seg = 0; P.u = 0; P.auto = !!sp.path; P.lastLook = 0; P.y = groundAt(P.x, P.z) + EYE;
  if (sp.path) P.yaw = yawTo(sp.path[0], sp.path[1]);
  S.ui.auto.hidden = !sp.path; S.ui.auto.setAttribute('aria-pressed', P.auto ? 'true' : 'false');
  document.querySelectorAll('[data-spawn]').forEach(b => b.setAttribute('aria-pressed', b.dataset.spawn === k ? 'true' : 'false'));
  const name = { deck: 'A glamping deck', camp: 'Walking the camp', carpark: 'Walking in from the car park', base: 'The lift base', top: 'The top station', kids: 'The kids’ jump park', summit: 'The summit of Langi Ghiran' }[k] || '';
  document.getElementById('game-title').textContent = name;
  grassUpdate(true);
}

window.LGGame = {
  async open(k, sunT) {
    const root = document.getElementById('game'); root.hidden = false; root.classList.add('loading');
    try { await boot(); } catch (e) { root.classList.remove('loading'); root.classList.add('failed'); console.error(e); return; }
    bindUI(); root.classList.remove('loading'); requestAnimationFrame(() => root.classList.add('on'));
    resize(); if (sunT != null) setSun(sunT); spawn(k || 'deck');
    running = true; lastT = performance.now(); fpsT = lastT; requestAnimationFrame(tick);
    S.ui.hint.classList.remove('gone');
  },
  close() { running = false; const root = document.getElementById('game'); root.classList.remove('on'); setTimeout(() => { if (!running) root.hidden = true; }, 450); if (window.LGGame.onClose) window.LGGame.onClose(); },
  setSun(t) { if (booted) setSun(t); },
  setQuality(q) { if (TIERS[q]) { try { localStorage.setItem('lg-quality', q); } catch (e) {} } },
  stats() { return { fps, quality: S.quality, calls: S.renderer && S.renderer.info.render.calls, tris: S.renderer && S.renderer.info.render.triangles }; },
  isOpen() { return running; },
  _S: S
};
