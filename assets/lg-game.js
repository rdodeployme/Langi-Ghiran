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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
function surfaceAt(x, z) { let y = groundAt(x, z); if (S.tentFrames) for (const f of S.tentFrames) { const dx = x - f.x, dz = z - f.z; if (Math.abs(dx) > 3.4 || Math.abs(dz) > 3.4) continue; const lx = Math.cos(f.rot) * dx - Math.sin(f.rot) * dz, lz = Math.sin(f.rot) * dx + Math.cos(f.rot) * dz; if (Math.abs(lx) < 3.1 && Math.abs(lz) < 3.1) y = Math.max(y, f.y); } return y; }
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
  const gravelM = boosted(new THREE.MeshStandardMaterial({ map: G.gravel.d, normalMap: G.gravel.n, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.9, color: '#d9d2c4', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 1.45, 'gravel');
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
/* ---------- built assets: geometry kit ---------- */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
function xf(geo, x, y, z, rx, ry, rz, sx, sy, sz) { const e = new THREE.Euler(rx || 0, ry || 0, rz || 0); _q.setFromEuler(e); _v.set(x || 0, y || 0, z || 0); _s.set(sx || 1, sy || 1, sz || 1); _m4.compose(_v, _q, _s); geo.applyMatrix4(_m4); return geo; }
function box(w, h, d, x, y, z, ry, rx, rz) { return xf(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); }
function cyl(rt, rb, h, seg, x, y, z, rx, ry, rz) { return xf(new THREE.CylinderGeometry(rt, rb, h, seg || 8), x, y, z, rx, ry, rz); }
function rod(a, b, r, seg) { // a cylinder from point a to point b
  const d = new THREE.Vector3().subVectors(b, a), l = d.length(); const g = new THREE.CylinderGeometry(r, r, l, seg || 6); g.translate(0, l / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize()); g.applyQuaternion(q); g.translate(a.x, a.y, a.z); return g;
}
/* planar "triplanar" UVs in local metres so tiled textures read at the right scale on any box */
function worldUV(geo, tile) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
  for (let i = 0; i < p.count; i++) { const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i)); let u, v;
    if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); } else if (nx >= nz) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / tile, v / tile); }
  geo.setAttribute('uv', uv); return geo;
}
function merge(list) { const g = mergeGeometries(list.filter(Boolean), false); list.forEach(x => x && x.dispose && x.dispose()); return g; }
function mesh(geo, mat, cast) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast !== false; m.receiveShadow = true; return m; }
function texMat(key, o) { const t = S.m[key]; return std(Object.assign({ map: t.d, normalMap: t.n, roughness: 0.9, metalness: 0 }, o || {})); }
function canvasTexture(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso; return t; }

/* ----- tent kit: deck, railing, steps, bell tent, furniture; instanced 16 times ----- */
function tentKit() {
  const K = {}; const D = 3.1; // deck half size
  // deck boards and rim
  const deck = [box(6.2, 0.12, 6.2, 0, -0.06, 0)]; for (const s of [-1, 1]) { deck.push(box(6.3, 0.22, 0.06, 0, -0.11, s * 3.13)); deck.push(box(0.06, 0.22, 6.3, s * 3.13, -0.11, 0)); }
  // bearers under the deck
  for (let x = -2.6; x <= 2.6; x += 1.3) deck.push(box(0.09, 0.19, 6.0, x, -0.22, 0));
  // steps at the front (+z)
  deck.push(box(1.4, 0.04, 0.32, 0, -0.2, 3.3)); deck.push(box(1.4, 0.04, 0.32, 0, -0.4, 3.62)); deck.push(box(1.4, 0.16, 0.05, 0, -0.14, 3.15));
  K.deck = worldUV(merge(deck), 1.1);
  // railing on three sides: posts, top rail, balusters
  const rail = []; const sides = [[-1, 0, 0, 1], [1, 0, 0, 1], [0, -1, 1, 0]]; // [x sign, z sign, run axis]
  for (const [sx, sz, ax, az] of sides) {
    for (let t = -D + 0.05; t <= D - 0.04; t += 1.53) rail.push(box(0.09, 1.0, 0.09, sx * D + ax * t, 0.5, sz * D + az * t));
    rail.push(box(ax ? 6.3 : 0.1, 0.05, az ? 6.3 : 0.1, sx * D, 1.0, sz * D)); rail.push(box(ax ? 6.3 : 0.05, 0.03, az ? 6.3 : 0.05, sx * D, 0.12, sz * D));
    for (let t = -D + 0.2; t < D - 0.1; t += 0.13) rail.push(box(0.025, 0.86, 0.025, sx * D + ax * t, 0.55, sz * D + az * t));
  }
  // front: short rails either side of the steps
  for (const s of [-1, 1]) { rail.push(box(0.09, 1.0, 0.09, s * 0.9, 0.5, D)); rail.push(box(0.09, 1.0, 0.09, s * D, 0.5, D)); rail.push(box(2.2, 0.05, 0.1, s * 2.0, 1.0, D)); for (let t = 1.0; t < D - 0.05; t += 0.13) rail.push(box(0.025, 0.86, 0.025, s * t, 0.55, D)); }
  K.rail = worldUV(merge(rail), 0.6);
  // bell tent: lathe profile with a slight catenary to the peak
  const prof = [new THREE.Vector2(2.45, 0.0), new THREE.Vector2(2.5, 0.02), new THREE.Vector2(2.5, 1.0)];
  for (let i = 1; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(2.5 * (1 - t) + 0.05 * t, 1.0 + 2.5 * t - 0.28 * Math.sin(Math.PI * t))); }
  prof.push(new THREE.Vector2(0.09, 3.55), new THREE.Vector2(0.0, 3.6));
  const tentG = new THREE.LatheGeometry(prof, 36); { const uv = tentG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 3.2); }
  K.canvas = tentG;
  // door flap (open) and a dark interior behind it
  const flap = new THREE.PlaneGeometry(1.1, 1.75); flap.translate(0, 0.875, 0); xf(flap, 0.62, 0.04, 2.42, 0, -0.95, 0); K.flap = flap;
  const inner = new THREE.PlaneGeometry(1.0, 1.75); inner.translate(0, 0.9, 0); xf(inner, 0, 0.0, 2.3, 0, 0, 0); K.inner = inner;
  // pole, pegs, guy ropes
  K.timber = [cyl(0.045, 0.05, 3.55, 8, 0, 1.78, 0)];
  const ropes = []; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + 0.15; if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI - Math.PI / 2) < 0.25) continue;
    const r0 = 2.5, r1 = 3.0; ropes.push(rod(new THREE.Vector3(Math.cos(a) * r0, 1.05, Math.sin(a) * r0), new THREE.Vector3(Math.cos(a) * r1, 0.04, Math.sin(a) * r1), 0.012, 5));
    K.timber.push(cyl(0.02, 0.02, 0.26, 5, Math.cos(a) * r1, 0.1, Math.sin(a) * r1, 0.4 * -Math.sin(a), 0, 0.4 * Math.cos(a))); }
  K.rope = merge(ropes);
  // furniture: two camp chairs, a side table, a lantern post, a mat
  const chairFrame = [], chairCloth = [];
  for (const dx of [-1.55, 1.55]) { const z = -2.05;
    chairCloth.push(box(0.56, 0.05, 0.5, dx, 0.44, z)); chairCloth.push(xf(new THREE.BoxGeometry(0.56, 0.62, 0.04), dx, 0.76, z - 0.26, -0.18, 0, 0));
    for (const [lx, lz] of [[-0.25, -0.22], [0.25, -0.22], [-0.25, 0.22], [0.25, 0.22]]) chairFrame.push(box(0.035, 0.44, 0.035, dx + lx, 0.22, z + lz));
    for (const s of [-1, 1]) { chairFrame.push(box(0.035, 0.035, 0.5, dx + s * 0.29, 0.62, z)); chairFrame.push(box(0.035, 0.2, 0.035, dx + s * 0.29, 0.53, z + 0.2)); } }
  chairFrame.push(cyl(0.3, 0.3, 0.03, 16, 0, 0.58, -2.05)); chairFrame.push(cyl(0.03, 0.03, 0.56, 6, 0, 0.3, -2.05)); chairFrame.push(cyl(0.22, 0.22, 0.03, 12, 0, 0.02, -2.05));
  chairFrame.push(cyl(0.03, 0.03, 1.15, 6, 2.6, 0.57, -2.6)); // lantern post
  K.dark = merge(chairFrame); K.cloth = merge(chairCloth);
  K.lamp = cyl(0.11, 0.09, 0.22, 10, 2.6, 1.22, -2.6); // lantern head (emissive at night)
  const mat = new THREE.PlaneGeometry(1.2, 0.7); mat.rotateX(-Math.PI / 2); mat.translate(0, 0.005, 2.75); K.mat = mat;
  K.timber = merge(K.timber);
  return K;
}
function tents(sc) {
  const K = tentKit(), n = sc.tents.length, g = new THREE.Group();
  const campRot = Math.atan2(sc.T[0] - sc.tents[7][0], -(sc.T[1] - sc.tents[7][1]));
  const canvasM = texMat('canvas', { color: '#f1e9d8', roughness: 0.95, side: THREE.DoubleSide, emissive: new THREE.Color('#ffb961'), emissiveIntensity: 0 }); S.tentMats.push(canvasM);
  const deckM = texMat('deck', { color: '#e6d8c4', roughness: 0.85 }), railM = texMat('clad', { color: '#c9b89e', roughness: 0.9 });
  const darkM = std({ color: '#2a2d30', roughness: 0.6, metalness: 0.5 }), clothM = std({ color: '#2f4a3a', roughness: 0.9 }), ropeM = std({ color: '#d8ceb8', roughness: 1 });
  const innerM = std({ color: '#1a1511', roughness: 1 }), timberM = std({ color: '#6b5236', roughness: 0.9 }), matM = std({ color: '#5a4a3a', roughness: 1 });
  const lampM = std({ color: '#f6e7c5', emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0 }); S.lampMats.push(lampM);
  const parts = [[K.deck, deckM], [K.rail, railM], [K.canvas, canvasM], [K.flap, canvasM], [K.inner, innerM], [K.timber, timberM], [K.rope, ropeM], [K.dark, darkM], [K.cloth, clothM], [K.lamp, lampM], [K.mat, matM]];
  const posts = [], pits = []; S.tentFrames = [];
  const tf = sc.tents.map((t, k) => { const rot = campRot + (k % 3 - 1) * 0.25; const c = [t[0], t[1]];
    // deck level: highest of the four corner grounds + 0.35 so no corner sinks
    let top = -1e9; for (const [dx, dz] of [[-3.1, -3.1], [3.1, -3.1], [-3.1, 3.1], [3.1, 3.1]]) { const x = c[0] + Math.cos(rot) * dx + Math.sin(rot) * dz, z = c[1] - Math.sin(rot) * dx + Math.cos(rot) * dz; top = Math.max(top, groundAt(x, z)); }
    const y = top + 0.42; S.tentFrames.push({ x: c[0], z: c[1], y, rot });
    for (const [dx, dz] of [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9], [0, -2.9], [0, 2.9], [-2.9, 0], [2.9, 0]]) { const x = c[0] + Math.cos(rot) * dx + Math.sin(rot) * dz, z = c[1] - Math.sin(rot) * dx + Math.cos(rot) * dz; const gy = groundAt(x, z) - 0.3; posts.push(box(0.14, y - 0.3 - gy, 0.14, x, (y - 0.3 + gy) / 2, z)); }
    // fire pit on the ground beside the deck
    const px = c[0] + Math.cos(rot) * 4.3 + Math.sin(rot) * -2.4, pz = c[1] - Math.sin(rot) * 4.3 + Math.cos(rot) * -2.4; const py = groundAt(px, pz); pits.push([px, py, pz]); S.fires.push({ x: px, z: pz });
    return { c, y, rot }; });
  for (const [geo, m] of parts) { const im = new THREE.InstancedMesh(geo, m, n); im.castShadow = m !== innerM && m !== matM; im.receiveShadow = true;
    tf.forEach((f, k) => { _q.setFromAxisAngle(_up, f.rot); _v.set(f.c[0], f.y, f.c[1]); _s.set(1, 1, 1); _m4.compose(_v, _q, _s); im.setMatrixAt(k, _m4); }); g.add(im); }
  g.add(mesh(merge(posts), timberM));
  // fire pits: stone ring, logs, embers
  const ring = [], logs = [], embers = [];
  for (const [x, y, z] of pits) { const t = new THREE.TorusGeometry(0.6, 0.16, 8, 20); t.rotateX(Math.PI / 2); t.translate(x, y + 0.14, z); ring.push(t);
    for (let k = 0; k < 3; k++) logs.push(cyl(0.06, 0.07, 0.8, 6, x, y + 0.2, z, 0.6 + k * 0.5, k * 2.1, 1.2)); const e = new THREE.CircleGeometry(0.45, 14); e.rotateX(-Math.PI / 2); e.translate(x, y + 0.1, z); embers.push(e); }
  g.add(mesh(merge(ring), std({ map: S.g.dirt.d, color: '#8a8278', roughness: 1 })));
  g.add(mesh(merge(logs), std({ color: '#3a2a1c', roughness: 1 })));
  const emberM = std({ color: '#2a1d14', emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 0 }); S.fireMats.push(emberM); g.add(mesh(merge(embers), emberM, false));
  return g;
}

/* ----- amenities hut: timber-clad, gable iron roof, verandah, tank ----- */
function hut(x, z, rot) {
  const g = new THREE.Group(); const W = 9, Dp = 5.5, H = 2.7;
  const cladM = texMat('clad', { color: '#e8dcc8', roughness: 0.9 }), ironM = texMat('iron', { color: '#d4d8da', roughness: 0.5, metalness: 0.25 });
  const dark = std({ color: '#2b2f31', roughness: 0.7 }), frameM = std({ color: '#f1ead9', roughness: 0.6 });
  const walls = worldUV(merge([box(W, H, Dp, 0, H / 2, 0), box(W + 0.1, 0.25, Dp + 0.1, 0, 0.12, 0)]), 1.4);
  { const uv = walls.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i)); } // boards run vertically
  g.add(mesh(walls, cladM));
  const roof = []; const pitch = 0.42, half = Dp / 2 + 0.55, rl = Math.hypot(half, half * Math.tan(pitch));
  for (const s of [-1, 1]) roof.push(xf(new THREE.BoxGeometry(W + 1.2, 0.08, rl), 0, H + Math.sin(pitch) * rl / 2 + 0.02, s * half / 2 * 1.0, s * pitch, 0, 0));
  roof.push(box(W + 1.25, 0.1, 0.3, 0, H + Math.sin(pitch) * rl + 0.02, 0));
  // verandah roof and posts on the front (+z)
  roof.push(xf(new THREE.BoxGeometry(W + 1.2, 0.07, 2.3), 0, H - 0.12, Dp / 2 + 1.1, 0.12, 0, 0));
  g.add(mesh(worldUV(merge(roof), 0.9), ironM));
  const posts = []; for (const px of [-W / 2 + 0.3, 0, W / 2 - 0.3]) posts.push(box(0.12, H - 0.3, 0.12, px, (H - 0.3) / 2, Dp / 2 + 2.1));
  posts.push(box(W + 0.4, 0.06, 2.4, 0, 0.1, Dp / 2 + 1.2)); // verandah deck
  // gable ends (triangles) as thin boxes stepped
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const hh = Math.tan(pitch) * (Dp / 2) * (1 - k / 6); posts.push(box(0.1, Math.max(0.05, hh / 6 * 6 / 6 + 0.05), Dp * (1 - k / 6), s * (W / 2 - 0.05), H + (k + 0.5) / 6 * Math.tan(pitch) * Dp / 2 * 0.5, 0)); }
  g.add(mesh(worldUV(merge(posts), 1.4), cladM));
  // door, windows, sign
  const winM = std({ color: '#9fb4bb', roughness: 0.2, metalness: 0.1, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 }); S.lampMats.push(winM);
  const wins = [], frames = []; for (const wx of [-2.6, 0.4, 2.6]) { wins.push(box(1.1, 0.8, 0.04, wx, 1.65, Dp / 2 + 0.02)); frames.push(box(1.22, 0.92, 0.06, wx, 1.65, Dp / 2 + 0.01)); }
  g.add(mesh(merge(wins), winM, false)); g.add(mesh(merge(frames), frameM, false));
  g.add(mesh(merge([box(0.95, 2.05, 0.06, -1.3, 1.03, Dp / 2 + 0.02), box(1.1, 2.15, 0.04, -1.3, 1.08, Dp / 2 + 0.0)]), dark, false));
  const sign = new THREE.PlaneGeometry(2.0, 0.42); sign.translate(1.6, 2.35, Dp / 2 + 0.05);
  g.add(mesh(sign, std({ map: signTexture('AMENITIES', '#f1ead9', '#1b1b1b', 2.0 / 0.42), roughness: 0.7 }), false));
  // water tank at the side
  g.add(mesh(worldUV(cyl(1.15, 1.15, 2.1, 20, -W / 2 - 1.5, 1.05, -0.5), 0.9), ironM)); g.add(mesh(cyl(1.2, 1.15, 0.12, 20, -W / 2 - 1.5, 2.16, -0.5), dark));
  // concrete pad + steps
  g.add(mesh(box(W + 0.6, 0.12, Dp + 2.6, 0, 0.0, 1.1), std({ color: '#9a9690', roughness: 0.95 }), false));
  return place(g, x, z, 0.05, rot);
}

/* ----- lift stations: shelter roof on galvanised posts, bull wheel, bench ----- */
function station(x, z, rot, top) {
  const g = new THREE.Group(); const steel = std({ color: '#b4bcc0', roughness: 0.4, metalness: 0.6 }), ironM = texMat('iron', { color: '#d4d8da', roughness: 0.5, metalness: 0.25 });
  const dark = std({ color: '#2b2f31', roughness: 0.7, metalness: 0.3 });
  const posts = []; for (const [dx, dz] of [[-3.4, -2.0], [3.4, -2.0], [-3.4, 2.0], [3.4, 2.0]]) posts.push(cyl(0.08, 0.08, 3.2, 10, dx, 1.6, dz)); posts.push(box(7.6, 0.12, 0.12, 0, 3.15, -2.0)); posts.push(box(7.6, 0.12, 0.12, 0, 3.15, 2.0));
  g.add(mesh(merge(posts), steel));
  g.add(mesh(worldUV(xf(new THREE.BoxGeometry(7.8, 0.06, 4.8), 0, 3.35, 0, 0.1, 0, 0), 0.9), ironM));
  // bull wheel assembly on the lift axis (local z), housing and wheel
  const bw = new THREE.Group(); bw.position.set(0, 0, 0);
  const guard = new THREE.TorusGeometry(1.42, 0.1, 6, 20, Math.PI); guard.rotateZ(0); guard.translate(0, 5.95, 0);
  const housing = merge([cyl(0.2, 0.26, 6.6, 10, 0, 3.3, -1.1), cyl(0.2, 0.26, 6.6, 10, 0, 3.3, 1.1), box(0.3, 0.3, 2.5, 0, 6.65, 0), box(0.3, 0.3, 2.5, 0, 5.25, 0), cyl(0.12, 0.12, 2.3, 8, 0, 5.95, 0, Math.PI / 2, 0, 0), guard, box(0.5, 0.5, 2.2, 0, 7.0, 0)]);
  bw.add(mesh(housing, steel)); const wheel = new THREE.CylinderGeometry(1.25, 1.25, 0.14, 28); wheel.translate(0, 5.95, 0); bw.add(mesh(wheel, dark)); g.add(bw);
  if (!top) g.add(mesh(merge([box(1.4, 1.0, 0.9, 2.6, 0.5, -2.4), box(0.5, 0.5, 0.5, 2.6, 1.25, -2.4)]), dark));
  // bench and a bin
  g.add(mesh(worldUV(merge([box(2.6, 0.08, 0.42, 0, 0.48, -1.5), box(2.6, 0.08, 0.1, 0, 0.78, -1.72), box(0.1, 0.46, 0.4, -1.1, 0.24, -1.5), box(0.1, 0.46, 0.4, 1.1, 0.24, -1.5)]), 0.6), texMat('deck', { color: '#d8c8b0' })));
  const lampM = std({ color: '#f6e7c5', emissive: new THREE.Color('#ffe0a3'), emissiveIntensity: 0 }); S.lampMats.push(lampM);
  g.add(mesh(box(0.9, 0.07, 0.18, 0, 3.22, 0.3), lampM, false));
  g.add(mesh(box(8.4, 0.1, 5.4, 0, -0.02, 0), std({ color: '#9a9690', roughness: 0.95 }), false));
  if (top) { const sg = new THREE.PlaneGeometry(1.8, 0.5); sg.translate(-2.2, 2.5, 2.42); g.add(mesh(sg, std({ map: signTexture('TOP STATION · RIDE DOWN', '#1b1b1b', '#f1ead9', 3.6), roughness: 0.7 }), false)); }
  return place(g, x, z, 0, rot);
}

/* ----- the lift: galvanised tube towers with crossarms and sheave sets, two ropes, hangers down to riders towed on the ground ----- */
function lift(sc) {
  const g = new THREE.Group(); const steel = std({ color: '#b4bcc0', roughness: 0.4, metalness: 0.6 }), yellow = std({ color: '#f0b429', roughness: 0.6 }), dark = std({ color: '#2b2f31', roughness: 0.7, metalness: 0.3 });
  const dir = new THREE.Vector3(sc.T[0] - sc.B[0], 0, sc.T[1] - sc.B[1]).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
  const yaw = Math.atan2(dir.x, dir.z);
  const towerG = merge([cyl(0.22, 0.3, 7.0, 12, 0, 3.5, 0), cyl(0.7, 0.75, 0.3, 12, 0, 0.15, 0), box(0.28, 0.28, 3.2, 0, 7.0, 0), box(0.3, 0.3, 0.3, 0, 7.15, 0)]);
  const sheaveG = merge([box(0.7, 0.26, 0.26, 0, 6.72, -1.3), box(0.7, 0.26, 0.26, 0, 6.72, 1.3), cyl(0.17, 0.17, 0.12, 12, -0.22, 6.6, -1.3, Math.PI / 2, 0, 0), cyl(0.17, 0.17, 0.12, 12, 0.22, 6.6, -1.3, Math.PI / 2, 0, 0), cyl(0.17, 0.17, 0.12, 12, -0.22, 6.6, 1.3, Math.PI / 2, 0, 0), cyl(0.17, 0.17, 0.12, 12, 0.22, 6.6, 1.3, Math.PI / 2, 0, 0)]);
  const ladderG = []; for (let y = 0.8; y < 6.6; y += 0.32) ladderG.push(box(0.4, 0.03, 0.03, 0.34, y, 0)); ladderG.push(box(0.03, 6.0, 0.03, 0.16, 3.8, 0)); ladderG.push(box(0.03, 6.0, 0.03, 0.52, 3.8, 0));
  const towers = new THREE.InstancedMesh(towerG, steel, sc.towers.length), sheaves = new THREE.InstancedMesh(sheaveG, dark, sc.towers.length), ladders = new THREE.InstancedMesh(merge(ladderG), yellow, sc.towers.length);
  towers.castShadow = sheaves.castShadow = true;
  const ropePts = [[], []]; const chain = [sc.B, ...sc.towers, sc.T];
  chain.forEach((p, k) => {
    const y = groundAt(p[0], p[1]); const isTower = k > 0 && k < chain.length - 1; const ropeY = isTower ? y + 6.6 : y + 5.95;
    if (isTower) { _q.setFromAxisAngle(_up, yaw + Math.PI / 2); _v.set(p[0], y, p[1]); _s.set(1, 1, 1); _m4.compose(_v, _q, _s); towers.setMatrixAt(k - 1, _m4); sheaves.setMatrixAt(k - 1, _m4); ladders.setMatrixAt(k - 1, _m4); }
    for (const sg of [-1, 1]) ropePts[sg < 0 ? 0 : 1].push(new THREE.Vector3(p[0] + side.x * sg * 1.3, ropeY, p[1] + side.z * sg * 1.3));
  });
  g.add(towers, sheaves, ladders);
  const ropeM = std({ color: '#c9cdd0', metalness: 0.7, roughness: 0.4 }); S.ropes = [];
  for (const pts of ropePts) { const dense = []; for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; for (let u = 0; u < 1; u += 0.05) { const v = a.clone().lerp(b, u); v.y -= Math.sin(u * Math.PI) * 0.45; dense.push(v); } } dense.push(pts[pts.length - 1]);
    const curve = new THREE.CatmullRomCurve3(dense); S.ropes.push(curve); g.add(mesh(new THREE.TubeGeometry(curve, 260, 0.045, 6, false), ropeM, false)); }
  S.cable = S.ropes[1]; S.returnCable = S.ropes[0];
  // hangers: a rod from the rope to a T-bar; riders are towed on the ground below (built in riders())
  S.hangers = []; const hangerM = std({ color: '#f0b429', roughness: 0.5, metalness: 0.4 });
  for (let k = 0; k < 7; k++) { const h = new THREE.Group(); const rodM = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), steel); rodM.position.y = -0.5; h.add(rodM);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), hangerM); bar.position.y = -1.0; h.add(bar); const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), hangerM); grip.position.y = -0.75; h.add(grip);
    h.rotation.y = yaw; g.add(h); S.hangers.push({ m: h, rod: rodM, bar, grip, t: (k / 7 + 0.05) % 1, rider: -1 }); }
  // empty hangers on the return rope
  S.returnHangers = []; for (let k = 0; k < 5; k++) { const h = new THREE.Group(); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), steel); r.position.y = -0.8; h.add(r); const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), hangerM); bar.position.y = -1.6; h.add(bar); h.rotation.y = yaw; g.add(h); S.returnHangers.push({ m: h, t: (k / 5 + 0.1) % 1 }); }
  return g;
}

/* ----- rider on a bike: one geometry per material, instanced for every rider in the park ----- */
function riderKit() {
  const black = [], frame = [], body = [], skin = [];
  // wheels: tyre, rim, hub, spokes
  for (const wz of [-0.52, 0.52]) { const t = new THREE.TorusGeometry(0.34, 0.03, 6, 20); t.rotateY(Math.PI / 2); t.translate(0, 0.34, wz); black.push(t);
    const r = new THREE.TorusGeometry(0.3, 0.012, 4, 20); r.rotateY(Math.PI / 2); r.translate(0, 0.34, wz); frame.push(r); black.push(cyl(0.035, 0.035, 0.08, 8, 0, 0.34, wz, Math.PI / 2, 0, 0));
    for (let s = 0; s < 6; s++) black.push(cyl(0.004, 0.004, 0.58, 3, 0, 0.34, wz, 0, 0, s / 6 * Math.PI)); }
  // frame tubes
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const bb = P(0, 0.3, 0.05), head = P(0, 0.95, 0.42), seatTop = P(0, 0.98, -0.2), rearHub = P(0, 0.34, -0.52), frontHub = P(0, 0.34, 0.52);
  frame.push(rod(bb, head, 0.028)); frame.push(rod(seatTop, head, 0.025)); frame.push(rod(bb, seatTop, 0.026)); frame.push(rod(bb, rearHub, 0.018)); frame.push(rod(seatTop, rearHub, 0.018));
  black.push(rod(head, frontHub, 0.02)); black.push(rod(P(0, 0.95, 0.42), P(0, 1.12, 0.46), 0.02)); black.push(rod(P(-0.32, 1.12, 0.46), P(0.32, 1.12, 0.46), 0.018)); // fork, stem, bars
  black.push(box(0.1, 0.05, 0.26, 0, 1.02, -0.2)); black.push(rod(P(0, 0.3, 0.05), P(0.1, 0.3, 0.05), 0.02)); black.push(cyl(0.09, 0.09, 0.02, 10, 0, 0.3, 0.05, Math.PI / 2, 0, 0));
  black.push(box(0.1, 0.02, 0.08, 0.16, 0.14, 0.12)); black.push(box(0.1, 0.02, 0.08, -0.16, 0.46, -0.02)); // pedals
  // rider: legs, torso leaning forward, arms to the bars, head with helmet
  const hipL = P(-0.12, 1.0, -0.15), hipR = P(0.12, 1.0, -0.15), kneeL = P(-0.16, 0.62, 0.18), kneeR = P(0.16, 0.45, -0.1), footL = P(-0.16, 0.16, 0.12), footR = P(0.16, 0.48, -0.02);
  body.push(rod(hipL, kneeL, 0.07)); body.push(rod(hipR, kneeR, 0.07)); body.push(rod(kneeL, footL, 0.055)); body.push(rod(kneeR, footR, 0.055));
  black.push(box(0.1, 0.07, 0.24, -0.16, 0.14, 0.14)); black.push(box(0.1, 0.07, 0.24, 0.16, 0.47, 0.0));
  const torso = new THREE.CapsuleGeometry(0.16, 0.42, 4, 10); xf(torso, 0, 1.22, 0.05, 0.95, 0, 0); body.push(torso);
  const shL = P(-0.2, 1.42, 0.2), shR = P(0.2, 1.42, 0.2), elL = P(-0.3, 1.25, 0.36), elR = P(0.3, 1.25, 0.36), handL = P(-0.3, 1.13, 0.46), handR = P(0.3, 1.13, 0.46);
  body.push(rod(shL, elL, 0.05)); body.push(rod(shR, elR, 0.05)); skin.push(rod(elL, handL, 0.042)); skin.push(rod(elR, handR, 0.042));
  skin.push(xf(new THREE.SphereGeometry(0.11, 10, 8), 0, 1.5, 0.3)); const helmet = new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6); xf(helmet, 0, 1.52, 0.3, 0.3, 0, 0); frame.push(helmet);
  return { black: merge(black), frame: merge(frame), body: merge(body), skin: merge(skin) };
}
function riders(count) {
  const K = riderKit(); const g = new THREE.Group();
  const mats = { black: std({ color: '#1f2224', roughness: 0.8 }), frame: std({ color: '#c0392b', roughness: 0.4, metalness: 0.3 }), body: std({ color: '#2d3f63', roughness: 0.9 }), skin: std({ color: '#c89a76', roughness: 0.8 }) };
  const ims = {}; for (const k of Object.keys(K)) { const im = new THREE.InstancedMesh(K[k], mats[k], count); im.castShadow = true; im.frustumCulled = false; ims[k] = im; g.add(im); }
  const cols = ['#c0392b', '#2e86c1', '#1f1f1f', '#e67e22', '#7d3c98', '#27ae60'];
  for (let i = 0; i < count; i++) { ims.frame.setColorAt(i, new THREE.Color(cols[i % cols.length])); ims.body.setColorAt(i, new THREE.Color(['#2d3f63', '#3b3b3b', '#7a1f1f', '#1f5a3a', '#5a4a2a'][i % 5])); }
  S.riderIM = ims; S.riderCount = count; return g;
}
function setRider(i, x, y, z, yaw, lean, scale) { _q.setFromEuler(new THREE.Euler(0, yaw, lean || 0, 'YXZ')); _v.set(x, y, z); const s = scale || 1; _s.set(s, s, s); _m4.compose(_v, _q, _s); for (const k in S.riderIM) S.riderIM[k].setMatrixAt(i, _m4); }
function ridersDirty() { for (const k in S.riderIM) S.riderIM[k].instanceMatrix.needsUpdate = true; }

/* ----- signage: trailhead board, run markers, kids' park, glamping, car park ----- */
function signTexture(text, bg, fg, aspect, sub) {
  return canvasTexture(1024, Math.round(1024 / aspect), (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(h * (sub ? 0.4 : 0.52))}px "Public Sans", system-ui, sans-serif`; g.fillText(text, w / 2, sub ? h * 0.36 : h / 2);
    if (sub) { g.font = `500 ${Math.round(h * 0.22)}px "Public Sans", system-ui, sans-serif`; g.fillText(sub, w / 2, h * 0.74); } });
}
function boardTexture(logo) {
  return canvasTexture(1024, 680, (g, w, h) => { g.fillStyle = '#f3eee2'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, w, 150);
    if (logo) g.drawImage(logo, 28, 22, 106 * logo.width / logo.height, 106);
    g.fillStyle = '#f3eee2'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = '700 54px "Fraunces", Georgia, serif'; g.fillText('Langi Ghiran Bike Park', 200, 62); g.font = '500 26px "Public Sans", system-ui, sans-serif'; g.fillText('Concept · Langi Ghiran Recycling · Grampians region', 200, 112);
    const rows = [['#2e8b57', 'circle', 'Beginner', 'Cruisy · 1.5 km · 41 m drop'], ['#2e6fbf', 'square', 'Intermediate', 'Flow · 670 m · 35 m drop'], ['#1b1b1b', 'diamond', 'Expert', 'Tech · 520 m · 26 m drop'], ['#e0a800', 'circle', 'Kids’ park', 'Pump track and small jumps'], ['#6a4b2b', 'square', 'Glamping', '16 sites · off to the side']];
    rows.forEach(([c, sh, t, d], i) => { const y = 215 + i * 92; g.fillStyle = c; g.beginPath(); if (sh === 'circle') g.arc(80, y, 26, 0, 7); else if (sh === 'square') g.rect(54, y - 26, 52, 52); else { g.moveTo(80, y - 32); g.lineTo(112, y); g.lineTo(80, y + 32); g.lineTo(48, y); } g.fill();
      g.fillStyle = '#1b1b1b'; g.font = '700 40px "Public Sans", system-ui, sans-serif'; g.fillText(t, 140, y - 12); g.fillStyle = '#4a4a4a'; g.font = '400 28px "Public Sans", system-ui, sans-serif'; g.fillText(d, 140, y + 26); });
    g.fillStyle = '#4a4a4a'; g.font = '400 24px "Public Sans", system-ui, sans-serif'; g.fillText('Lift: 437 m pulley lift back to the top · Helmets on · Ride within your limits', 54, 650); });
}
function markerTexture(kind, name) {
  return canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#f3eee2'; g.fillRect(0, 0, w, h); const c = kind === 'beginner' ? '#2e8b57' : kind === 'intermediate' ? '#2e6fbf' : '#1b1b1b'; g.fillStyle = c; g.beginPath();
    if (kind === 'beginner') g.arc(128, 100, 60, 0, 7); else if (kind === 'intermediate') g.rect(68, 40, 120, 120); else { g.moveTo(128, 30); g.lineTo(198, 100); g.lineTo(128, 170); g.lineTo(58, 100); } g.fill();
    g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 40px "Public Sans", system-ui, sans-serif'; g.fillText(name, 128, 212); });
}
function signs(sc, logo) {
  const g = new THREE.Group(); const postM = texMat('clad', { color: '#c0ad92', roughness: 0.9 }); const posts = []; const panels = [];
  const panel = (tex, w, h, x, z, yaw, lift) => { const y = groundAt(x, z); const p = new THREE.PlaneGeometry(w, h); p.translate(0, lift + h / 2, 0.05); xf(p, x, y, z, 0, yaw, 0); panels.push([p, tex]);
    const back = box(w + 0.08, h + 0.08, 0.06, 0, lift + h / 2, 0.0); xf(back, x, y, z, 0, yaw, 0); posts.push(back);
    for (const s of [-1, 1]) { const b = box(0.1, lift + h + 0.1, 0.1, s * (w / 2 - 0.1), (lift + h + 0.1) / 2, -0.05); xf(b, x, y - 0.1, z, 0, yaw, 0); posts.push(b); } };
  // trailhead board at the base, facing the arrival path
  const bp = sc.basePath[sc.basePath.length - 2]; panel(boardTexture(logo), 1.9, 1.26, bp[0] + 4, bp[1] + 3, Math.PI * 0.95, 0.9);
  // run markers at each run's start
  for (const k of ['beginner', 'intermediate', 'expert']) { const pts = S.runPts[k]; const p = pts[6], q = pts[12]; const yaw = Math.atan2(q[0] - p[0], -(q[1] - p[1])) + Math.PI; const nx = Math.cos(yaw), nz = Math.sin(yaw);
    panel(markerTexture(k, k[0].toUpperCase() + k.slice(1)), 0.5, 0.5, p[0] + nx * 2.2, p[1] + nz * 2.2, yaw, 1.3); }
  const kc = sc.kids; panel(signTexture('KIDS’ PARK', '#e0a800', '#1b1b1b', 3, 'Pump track · small jumps'), 1.6, 0.55, kc[0] - 30, kc[1] - 24, Math.PI * 0.75, 1.2);
  const gp = sc.glampPath[1]; panel(signTexture('GLAMPING', '#1b1b1b', '#f1ead9', 3, '16 sites · quiet after 10pm'), 1.6, 0.55, gp[0] + 2.5, gp[1] - 1.5, Math.PI * 0.2, 1.2);
  const cp = sc.carpark; panel(signTexture('LANGI GHIRAN BIKE PARK', '#1b1b1b', '#f1ead9', 3.6, 'Car park · lift · trails · glamping'), 2.6, 0.72, cp[0] + 10, cp[1] + 17, Math.PI, 1.3);
  const B = sc.B; panel(signTexture('LIFT', '#f0b429', '#1b1b1b', 2.5, 'Hold the bar · ride it up'), 1.2, 0.5, B[0] + 6, B[1] + 2, Math.PI * 0.5, 1.4);
  g.add(mesh(worldUV(merge(posts), 0.5), postM));
  for (const [p, tex] of panels) g.add(mesh(p, std({ map: tex, roughness: 0.75 }), false));
  return g;
}

/* ----- furniture: picnic tables, bins, bike racks, bollard lights ----- */
function furniture(sc) {
  const g = new THREE.Group(); const timberM = texMat('deck', { color: '#d8c8b0' }), green = std({ color: '#2f4a3a', roughness: 0.8 }), steel = std({ color: '#b4bcc0', roughness: 0.4, metalness: 0.6 });
  const tables = [], bins = [], racks = [], bollards = [];
  const table = (x, z, yaw) => { const y = groundAt(x, z); const parts = [box(1.8, 0.05, 0.8, 0, 0.75, 0), box(1.8, 0.05, 0.3, 0, 0.45, 0.65), box(1.8, 0.05, 0.3, 0, 0.45, -0.65)];
    for (const s of [-0.7, 0.7]) { parts.push(xf(new THREE.BoxGeometry(0.08, 0.95, 0.08), s, 0.4, 0.42, -0.5, 0, 0)); parts.push(xf(new THREE.BoxGeometry(0.08, 0.95, 0.08), s, 0.4, -0.42, 0.5, 0, 0)); parts.push(box(0.06, 0.05, 1.7, s, 0.42, 0)); }
    const m = merge(parts); xf(m, x, y, z, 0, yaw, 0); tables.push(m); };
  const bin = (x, z) => { const y = groundAt(x, z); bins.push(cyl(0.3, 0.28, 0.9, 12, x, y + 0.45, z)); bins.push(cyl(0.33, 0.33, 0.06, 12, x, y + 0.93, z)); };
  const rack = (x, z, yaw) => { const y = groundAt(x, z); for (let k = 0; k < 3; k++) { const t = new THREE.TorusGeometry(0.4, 0.03, 6, 16, Math.PI); t.translate(0, 0.4, 0); xf(t, x + Math.cos(yaw) * k * 0.9, y, z - Math.sin(yaw) * k * 0.9, 0, yaw, 0); racks.push(t); } };
  const B = sc.B, kc = sc.kids, cp = sc.carpark;
  table(B[0] - 9, B[1] + 6, 0.4); table(B[0] - 12, B[1] + 9.5, 0.3); table(kc[0] - 24, kc[1] + 30, 1.2); table(sc.tents[3][0] + 9, sc.tents[3][1] - 6, 0.8); table(sc.tents[10][0] - 7, sc.tents[10][1] + 7, -0.4);
  bin(B[0] - 7, B[1] + 2); bin(kc[0] - 28, kc[1] - 20); bin(cp[0] + 8, cp[1] + 15); bin(sc.amen[0] + 6, sc.amen[1] + 2);
  rack(B[0] - 6, B[1] - 6, 0.2); rack(sc.amen[0] - 6, sc.amen[1] + 4, 1.1); rack(kc[0] - 30, kc[1] - 16, 0.9);
  // bollard lights along the camp path and the arrival path
  const lampM = std({ color: '#f6e7c5', emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0 }); S.lampMats.push(lampM); const heads = [];
  for (const path of [sc.glampPath, sc.basePath]) { const pts = resamplePath(path, 14); pts.forEach((p, i) => { if (i === 0) return; const a = pts[i - 1]; const nx = -(p[1] - a[1]), nz = (p[0] - a[0]); const l = Math.hypot(nx, nz) || 1; const x = p[0] + nx / l * 1.6, z = p[1] + nz / l * 1.6; const y = groundAt(x, z);
    bollards.push(box(0.12, 0.85, 0.12, x, y + 0.42, z)); heads.push(box(0.14, 0.08, 0.14, x, y + 0.88, z)); }); }
  g.add(mesh(worldUV(merge(tables), 0.6), timberM)); g.add(mesh(merge(bins), green)); g.add(mesh(merge(racks), steel)); g.add(mesh(merge(bollards), std({ color: '#2b2f31', roughness: 0.7 }))); g.add(mesh(merge(heads), lampM, false));
  return g;
}

/* ----- cars: a shaped body from a side profile, wheels, glass ----- */
function carKit() {
  const shape = new THREE.Shape(); const pts = [[-2.2, 0.35], [-2.25, 0.75], [-2.0, 0.8], [-1.3, 0.85], [-0.9, 1.35], [0.6, 1.4], [1.3, 0.95], [2.2, 0.85], [2.3, 0.5], [2.2, 0.35]];
  shape.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) shape.lineTo(x, y); shape.closePath();
  const body = new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 }); body.translate(0, 0, -0.9); body.computeVertexNormals();
  const glass = new THREE.Shape(); for (const [i, [x, y]] of [[0, [-1.25, 0.9]], [1, [-0.85, 1.32]], [2, [0.55, 1.36]], [3, [1.2, 0.95]]]) i === 0 ? glass.moveTo(x, y) : glass.lineTo(x, y); glass.closePath();
  const glassG = new THREE.ExtrudeGeometry(glass, { depth: 1.84, bevelEnabled: false }); glassG.translate(0, 0.01, -0.92);
  const wheels = []; for (const [x, z] of [[-1.45, -0.85], [1.45, -0.85], [-1.45, 0.85], [1.45, 0.85]]) { wheels.push(cyl(0.34, 0.34, 0.22, 16, x, 0.34, z, Math.PI / 2, 0, 0)); wheels.push(cyl(0.2, 0.2, 0.24, 10, x, 0.34, z, Math.PI / 2, 0, 0)); }
  return { body, glass: glassG, wheels: merge(wheels) };
}
function cars(sc) {
  const K = carKit(), g = new THREE.Group(); const cols = ['#d8d8d6', '#2f3b4a', '#8a1c1c', '#3a3a3a', '#f0f0ee', '#4a5a3a'];
  const n = 6; const bodyM = std({ color: '#ffffff', roughness: 0.35, metalness: 0.6 }), glassM = std({ color: '#223038', roughness: 0.1, metalness: 0.4 }), wheelM = std({ color: '#1a1a1a', roughness: 0.8 });
  const ims = [new THREE.InstancedMesh(K.body, bodyM, n), new THREE.InstancedMesh(K.glass, glassM, n), new THREE.InstancedMesh(K.wheels, wheelM, n)]; ims.forEach(m => { m.castShadow = true; g.add(m); });
  const c = sc.carpark; for (let k = 0; k < n; k++) { const x = c[0] - 17.5 + k * 5 + (k % 2) * 0.3, z = c[1] - 3 + (k % 3) * 0.4; const y = groundAt(x, z); _q.setFromAxisAngle(_up, Math.PI / 2 + (k % 2 ? 0.05 : -0.04)); _v.set(x, y + 0.02, z); _s.set(1, 1, 1); _m4.compose(_v, _q, _s); ims.forEach(m => m.setMatrixAt(k, _m4)); ims[0].setColorAt(k, new THREE.Color(cols[k % cols.length])); }
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
const SKY = { day: { sunAz: 216.2, sunEl: 49.8, gain: 1.0 }, dusk: { sunAz: 216.0, sunEl: 6.0, gain: 1.05 }, night: { sunAz: 215.6, sunEl: 17.0, gain: 1.0 } };
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
  { el: 49.8, az: 335, sun: '#fff1d8', sunI: 2.5, env: 0.6, hemi: 0.3, fog: '#cfd6d2', fogN: 320, fogF: 4200, exp: 0.95, glow: 1, night: 0 },
  { el: 6.0, az: 275, sun: '#ffb270', sunI: 1.5, env: 0.55, hemi: 0.2, fog: '#dcb79a', fogN: 260, fogF: 3600, exp: 0.95, glow: 1, night: 0 },
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
  S.moon.intensity = 0.7 * night; S.moonDir = sunVec(SKY.night.sunEl, SUNK[2].az); S.moon.position.copy(S.moonDir).multiplyScalar(400);
  S.hemi.intensity = L(a.hemi, b.hemi); S.hemi.color = mixC('#cfe0f0', '#6f86b8', night); S.hemi.groundColor = mixC('#a08a68', '#3a332c', night);
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
  deck: (sc) => { const f = S.tentFrames[1], c = sc.tents[14]; const lx = 1.9, lz = 2.3; const x = f.x + Math.cos(f.rot) * lx + Math.sin(f.rot) * lz, z = f.z - Math.sin(f.rot) * lx + Math.cos(f.rot) * lz; return { x, z, yaw: yawTo([f.x, f.z], [x, z]) + 0.95, pitch: -0.1, path: null }; },
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
  for (const t of S.sc.tents) { const dx = P.x - t[0], dz = P.z - t[1], d = Math.hypot(dx, dz); if (d < 2.65 && d > 0.001) { P.x = t[0] + dx / d * 2.65; P.z = t[1] + dz / d * 2.65; } }
  { const h = S.sc.amen, dx = P.x - h[0], dz = P.z - h[1], d = Math.hypot(dx, dz); if (d < 6 && d > 0.001) { P.x = h[0] + dx / d * 6; P.z = h[1] + dz / d * 6; } }
  const lim = S.farM / 2 - 200; P.x = Math.max(-lim, Math.min(lim, P.x)); P.z = Math.max(-lim, Math.min(lim, P.z));
  const gy = surfaceAt(P.x, P.z); P.y += ((gy + EYE) - P.y) * Math.min(1, dt * 8);
  const cam = S.camera; cam.position.set(P.x, P.y, P.z);
  P.pitch = Math.max(-1.2, Math.min(1.2, P.pitch));
  cam.rotation.set(0, 0, 0, 'YXZ'); cam.rotation.y = -P.yaw; cam.rotation.x = P.pitch;
  cam.updateMatrixWorld();
  if (S.csm) S.csm.update();
  if (S.sun) { S.sun.position.copy(S.sunDir).multiplyScalar(220).add(cam.position); S.sun.target.position.copy(cam.position); S.sun.target.updateMatrixWorld(); }
  S.skyMesh.position.copy(cam.position);
  grassUpdate(false); if (S.grass) { const u = S.grass.mat.userData.shader; if (u) u.uniforms.time.value = now / 1000; }
  if (S.cable) { let dirty = false;
    for (const h of S.hangers) { h.t = (h.t + dt * 0.011) % 1; const p = S.cable.getPointAt(h.t); h.m.position.copy(p); const gy = groundAt(p.x, p.z); const len = Math.max(1.2, p.y - gy - 1.2);
      h.rod.scale.y = len; h.rod.position.y = -len / 2; h.bar.position.y = -len; h.grip.position.y = -len + 0.25;
      if (h.rider >= 0) { setRider(h.rider, p.x, gy, p.z, S.liftYaw, 0, 1); dirty = true; } }
    for (const h of S.returnHangers) { h.t = (h.t + dt * 0.011) % 1; const p = S.returnCable.getPointAt(1 - h.t); h.m.position.copy(p); }
    if (dirty) ridersDirty(); }
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
    const gsets = ['dirt', 'gravel', 'grass', 'scrub', 'trail'], msets = ['deck', 'clad', 'iron', 'canvas', 'bark1', 'bark2'];
    const [sc, hnI, hfI, nearI, farI, splatI, skyDay, skyDusk, skyNight, envDay, envDusk, envNight, ...gtex] = await Promise.all([
      fetch(A + 'lg-game-scene.json').then(r => r.json()), loadImage(A + 'lg-game-hnear.png'), loadImage(A + 'lg-game-hfar.png'), loadImage(A + 'lg-game-near.jpg'), loadImage(A + 'lg-game-far.jpg'), loadImage(A + 'lg-game-splat.jpg'),
      loadTex(A + 'lg-sky-day.jpg', { nomip: true }), loadTex(A + 'lg-sky-dusk.jpg', { nomip: true }), loadTex(A + 'lg-sky-night.jpg', { nomip: true }),
      loadHDR(A + 'lg-env-day.hdr'), loadHDR(A + 'lg-env-dusk.hdr'), loadHDR(A + 'lg-env-night.hdr'),
      ...gsets.flatMap(k => [loadTex(A + 'lg-g-' + k + '-d.jpg'), loadTex(A + 'lg-g-' + k + '-n.jpg', { linear: true })]),
      ...msets.flatMap(k => [loadTex(A + 'lg-m-' + k + '-d.jpg'), loadTex(A + 'lg-m-' + k + '-n.jpg', { linear: true })]), loadImage(A + 'lg-logo.png').catch(() => null)]);
    setLoad('Tents, lift and trees');
    S.sc = sc; S.nearM = sc.near_m; S.farM = sc.far_m; S.hn = decodeHeights(hnI); S.hf = decodeHeights(hfI);
    S.g = {}; gsets.forEach((k, i) => { const d = gtex[i * 2], n = gtex[i * 2 + 1]; d.wrapS = d.wrapT = n.wrapS = n.wrapT = THREE.RepeatWrapping; S.g[k] = { d, n }; });
    S.m = {}; msets.forEach((k, i) => { const d = gtex[gsets.length * 2 + i * 2], n = gtex[gsets.length * 2 + i * 2 + 1]; d.wrapS = d.wrapT = n.wrapS = n.wrapT = THREE.RepeatWrapping; S.m[k] = { d, n }; }); S.logo = gtex[gsets.length * 2 + msets.length * 2];
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
    S.scene.add(tents(sc));
    S.scene.add(hut(sc.amen[0], sc.amen[1], 0.35));
    const liftYaw = Math.atan2(sc.T[0] - sc.B[0], sc.T[1] - sc.B[1]);
    S.scene.add(station(sc.T[0], sc.T[1], liftYaw, true)); S.scene.add(station(sc.B[0], sc.B[1], liftYaw, false));
    S.scene.add(lift(sc)); S.liftYaw = liftYaw;
    S.scene.add(riders(24)); for (let i = 0; i < 24; i++) setRider(i, 0, -100, 0, 0, 0, 0.001);
    S.hangers.forEach((h, k) => { h.rider = k % 2 === 0 ? k / 2 : -1; });
    S.scene.add(signs(sc, S.logo)); S.scene.add(furniture(sc)); S.scene.add(cars(sc));
    { const keep = []; const inKids = (x, z) => { const zn = sc.kidsZone; let inside = false; for (let i = 0, j = zn.length - 1; i < zn.length; j = i++) { if (((zn[i][1] > z) !== (zn[j][1] > z)) && (x < (zn[j][0] - zn[i][0]) * (z - zn[i][1]) / (zn[j][1] - zn[i][1]) + zn[i][0])) inside = !inside; } return inside; };
      const liftPts = resamplePath([sc.B, ...sc.towers, sc.T], 3);
      for (const t of sc.trees) { const x = t[0], z = t[1]; let bad = inKids(x, z) || Math.abs(x - sc.carpark[0]) < 28 && Math.abs(z - sc.carpark[1]) < 18;
        if (!bad) for (let dx = -2; dx <= 2 && !bad; dx += 2) for (let dz = -2; dz <= 2; dz += 2) if (S.noGrass.has((((x + dx) / 2) | 0) + ':' + (((z + dz) / 2) | 0))) { bad = true; break; }
        if (!bad) for (const q of liftPts) if (Math.hypot(x - q[0], z - q[1]) < 3.5) { bad = true; break; }
        if (!bad) keep.push(t); }
      sc.trees = keep; S.scene.add(trees(sc.trees)); }
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
  P.x = sp.x; P.z = sp.z; P.yaw = sp.yaw; P.pitch = sp.pitch != null ? sp.pitch : -0.02; P.path = sp.path; P.seg = 0; P.u = 0; P.auto = !!sp.path; P.lastLook = 0; P.y = surfaceAt(P.x, P.z) + EYE;
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
