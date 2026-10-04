/* lg-360.js v2 — photo-real 360° stops and Street-View-style walking for the Langi Ghiran tour.
   Plain WebGL, no dependencies.

   import { open360 } from './assets/360/lg-360.js';
   open360({ stop: 'glamping' });                 // a tour stop (day / golden hour / dusk chips)
   open360({ hop: 'glamp_walk_03', light: 'dusk' }); // a walking point (arrows to the next points)

   Options: base ('assets/360/'), manifest (object, or URL — default base + 'lg-360-manifest.json'), light ('day'|'golden'|'dusk'),
            note, onClose(), onMove({ hop, stop, lon, lat, compass }) — fires on every step so the 3D map can follow.
   Drag / swipe to look, wheel / pinch to zoom, arrow keys turn, W / ↑ walks to the point you are facing, Esc closes. */
const CSS = `
.lg360{position:fixed;inset:0;z-index:9999;background:#171E21;touch-action:none;opacity:0;transition:opacity .35s;user-select:none}
.lg360.on{opacity:1}.lg360 canvas{display:block;width:100%;height:100%;cursor:grab}.lg360 canvas:active{cursor:grabbing}
.lg360 button{font:600 14px/1 system-ui,sans-serif;cursor:pointer;border:0}
.lg360 .x{position:absolute;top:calc(14px + env(safe-area-inset-top));right:14px;width:44px;height:44px;border-radius:50%;
 background:rgba(23,30,33,.72);color:#f4efe4;font-size:22px}
.lg360 .x:focus-visible,.lg360 .chip:focus-visible,.lg360 .arw:focus-visible{outline:2px solid #FCC830;outline-offset:2px}
.lg360 .cap{position:absolute;left:14px;bottom:calc(14px + env(safe-area-inset-bottom));max-width:calc(100% - 28px);color:#f4efe4;
 background:rgba(23,30,33,.72);padding:10px 14px;border-radius:10px;font:14px/1.35 system-ui,sans-serif}
.lg360 .cap b{color:#FCC830;font-weight:600}.lg360 .cap span{opacity:.8}
.lg360 .chips{position:absolute;top:calc(14px + env(safe-area-inset-top));left:14px;display:flex;gap:6px;background:rgba(23,30,33,.72);padding:5px;border-radius:999px}
.lg360 .chip{background:transparent;color:#f4efe4;padding:9px 13px;border-radius:999px}.lg360 .chip[aria-pressed=true]{background:#FCC830;color:#171E21}
.lg360 .arw{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(23,30,33,.55);
 color:#FCC830;display:flex;align-items:center;justify-content:center;transition:transform .15s,background .15s}
.lg360 .arw:hover{background:rgba(23,30,33,.85);transform:scale(1.1)}.lg360 .arw svg{width:34px;height:34px}
.lg360 .ld{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#f4efe4;font:14px system-ui,sans-serif;
 background:rgba(23,30,33,.6);padding:10px 16px;border-radius:999px;pointer-events:none;transition:opacity .4s}`;
let styled = false;
const VS = 'attribute vec2 p;varying vec2 q;void main(){q=p;gl_Position=vec4(p,0.,1.);}';
const FS = 'precision highp float;varying vec2 q;uniform sampler2D t,t2;uniform float yaw,pitch,fov,aspect,mixv,yaw2;' +
  'vec2 uv(vec3 d,float y){float cy=cos(y),sy=sin(y);d=vec3(d.x*cy-d.z*sy,d.y,d.x*sy+d.z*cy);' +
  'return vec2(atan(d.x,-d.z)/6.2831853+.5,acos(clamp(d.y,-1.,1.))/3.1415927);}' +
  'void main(){float k=tan(fov*.5);vec3 d=normalize(vec3(q.x*k*aspect,q.y*k,-1.));' +
  'float cp=cos(pitch),sp=sin(pitch);d=vec3(d.x,d.y*cp-d.z*sp,d.y*sp+d.z*cp);' +
  'vec4 a=texture2D(t,uv(d,yaw));vec4 b=texture2D(t2,uv(d,yaw2));gl_FragColor=mix(b,a,mixv);}';
const LIGHT_NAMES = { day: 'Day', golden: 'Golden hour', dusk: 'Dusk' };
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const mobile = () => matchMedia('(max-width: 820px)').matches || (navigator.connection && navigator.connection.saveData);
const cache = {};

export async function open360(opts = {}) {
  const base = opts.base || 'assets/360/';
  let M = opts.manifest;
  if (!M || typeof M === 'string') M = cache[base] || (cache[base] = await (await fetch(M || base + 'lg-360-manifest.json')).json());
  if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
  let light = opts.light || 'day', place = opts.hop ? { hop: opts.hop } : { stop: opts.stop || 'glamping' };
  const info = () => place.hop ? M.hops[place.hop] : M.stops[place.stop];
  const src = () => place.hop ? `${base}hops/${place.hop}${mobile() ? '-m' : ''}.jpg`
    : `${base}lg-360-${place.stop}-${(info().lights || ['day']).includes(light) ? light : 'day'}${mobile() ? '-m' : ''}.jpg`;
  const root = document.createElement('div'); root.className = 'lg360'; root.setAttribute('role', 'dialog');
  root.innerHTML = '<canvas></canvas><div class="arrows"></div><div class="chips" role="group" aria-label="Time of day"></div>' +
    '<div class="ld">Loading 360°…</div><button class="x" aria-label="Close 360 view">×</button><div class="cap"><b></b><br><span></span></div>';
  document.body.appendChild(root); requestAnimationFrame(() => root.classList.add('on'));
  const cv = root.querySelector('canvas'), ld = root.querySelector('.ld'), arrowsEl = root.querySelector('.arrows'), chips = root.querySelector('.chips');
  const gl = cv.getContext('webgl');
  let yaw = 0, pitch = -0.08, fov = 75, cur = 75, drag = null, pinch = null, alive = true, raf = 0, mixv = 1, yaw2 = 0, busy = false;
  const close = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); removeEventListener('keydown', key); removeEventListener('resize', size);
    root.classList.remove('on'); setTimeout(() => root.remove(), 350); opts.onClose && opts.onClose(); };
  root.querySelector('.x').onclick = close;
  if (!gl) { ld.textContent = '360 view needs WebGL'; return { close }; }
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(pr, n);
  const mkTex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(w => gl.texParameteri(gl.TEXTURE_2D, w, gl.CLAMP_TO_EDGE));
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(f => gl.texParameteri(gl.TEXTURE_2D, f, gl.LINEAR)); return t; };
  let tA = mkTex(), tB = mkTex();
  gl.uniform1i(U('t'), 0); gl.uniform1i(U('t2'), 1);
  const size = () => { const r = devicePixelRatio || 1; cv.width = innerWidth * r; cv.height = innerHeight * r; gl.viewport(0, 0, cv.width, cv.height); };
  size(); addEventListener('resize', size);
  const loadImg = url => new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = no; im.src = url; });
  const compass = () => (((info().centre_compass_deg + yaw * 180 / Math.PI) % 360) + 360) % 360;
  // swap in a new image: keep the compass heading you were looking at, crossfade from the old view
  async function show(next, keepCompass) {
    if (busy) return; busy = true; ld.style.opacity = 1;
    const oldYaw = yaw, oldInfo = info(), heading = keepCompass ?? null;
    try {
      const prev = place; place = next;
      const im = await loadImg(src()).catch(e => { place = prev; throw e; });
      [tA, tB] = [tB, tA];
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tA); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tB);
      yaw2 = oldYaw;
      yaw = heading == null ? (opts.yawDeg || 0) * Math.PI / 180 : (heading - info().centre_compass_deg) * Math.PI / 180;
      mixv = oldInfo === info() && heading == null ? 1 : 0;
      ld.style.opacity = 0; render_ui(); report();
    } catch (e) { ld.textContent = 'Could not load this view'; }
    busy = false;
  }
  function render_ui() {
    const i = info();
    root.querySelector('.cap b').textContent = place.hop ? 'Walking: ' + (i.route || '').replace(/_/g, ' ') : i.title;
    root.querySelector('.cap span').textContent = opts.note || 'Concept render on the real terrain — not yet built';
    root.setAttribute('aria-label', (place.hop ? 'Walking point' : i.title) + ' — drag to look around');
    chips.innerHTML = ''; const L = place.hop ? ['day'] : (i.lights || ['day']);
    chips.style.display = L.length > 1 ? 'flex' : 'none';
    L.forEach(l => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = LIGHT_NAMES[l] || l;
      b.setAttribute('aria-pressed', String(l === light)); b.onclick = () => { if (l !== light) { light = l; show(place, compass()); } }; chips.appendChild(b); });
    arrowsEl.innerHTML = '';
    (place.hop ? i.arrows || [] : []).forEach(a => { const b = document.createElement('button'); b.className = 'arw'; b.innerHTML = ARROW;
      b.setAttribute('aria-label', `Walk ${Math.round(a.dist_m)} m`); b.dataset.c = a.compass_deg;
      b.onclick = e => { e.stopPropagation(); show({ hop: a.to }, a.compass_deg); }; arrowsEl.appendChild(b); });
  }
  const report = () => opts.onMove && opts.onMove({ ...place, lon: info().lon, lat: info().lat, compass: compass() });
  // arrows sit on the ground, 25° below the horizon, in the direction of the next point
  function place_arrows() {
    const k = Math.tan(cur * Math.PI / 360), asp = cv.width / cv.height;
    arrowsEl.querySelectorAll('.arw').forEach(b => {
      const rel = (+b.dataset.c - compass()) * Math.PI / 180, el = -25 * Math.PI / 180;
      let x = Math.sin(rel) * Math.cos(el), y = Math.sin(el), z = -Math.cos(rel) * Math.cos(el);
      const cp = Math.cos(-pitch), sp = Math.sin(-pitch); [y, z] = [y * cp - z * sp, y * sp + z * cp];
      if (z > -0.15) { b.style.display = 'none'; return; }
      b.style.display = 'flex';
      b.style.left = (50 + (x / -z) / (k * asp) * 50) + '%'; b.style.top = (50 - (y / -z) / k * 50) + '%';
      b.firstChild.style.transform = `rotate(${Math.atan2(x, -z) * 0.6}rad)`;
    });
  }
  function frame() {
    if (!alive) return; cur += (fov - cur) * 0.15; mixv = Math.min(1, mixv + 0.06);
    gl.uniform1f(U('yaw'), yaw); gl.uniform1f(U('yaw2'), yaw2); gl.uniform1f(U('pitch'), pitch); gl.uniform1f(U('fov'), cur * Math.PI / 180);
    gl.uniform1f(U('aspect'), cv.width / cv.height); gl.uniform1f(U('mixv'), mixv);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); place_arrows(); raf = requestAnimationFrame(frame);
  }
  const walkAhead = () => { const a = [...arrowsEl.querySelectorAll('.arw')].map(b => ({ b, d: Math.abs(((+b.dataset.c - compass() + 540) % 360) - 180) }))
    .sort((p, q) => p.d - q.d)[0]; if (a && a.d < 50) a.b.click(); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft' || e.key === 'a') yaw -= .12; if (e.key === 'ArrowRight' || e.key === 'd') yaw += .12;
    if (e.key === 'ArrowUp' || e.key === 'w') walkAhead(); if (e.key === 'ArrowDown') pitch = Math.max(-1.45, pitch - .1); };
  addEventListener('keydown', key);
  cv.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (!drag || pinch) return; const s = cur / innerHeight * Math.PI / 180;
    yaw = drag.yaw - (e.clientX - drag.x) * s; pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * s)); };
  cv.onpointerup = () => { drag = null; };
  cv.onwheel = e => { e.preventDefault(); fov = Math.max(35, Math.min(100, fov + e.deltaY * 0.05)); };
  cv.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), f: fov }; }, { passive: true });
  cv.addEventListener('touchmove', e => { if (pinch && e.touches.length === 2) fov = Math.max(35, Math.min(100, pinch.f * pinch.d / Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY))); }, { passive: true });
  cv.addEventListener('touchend', () => { pinch = null; });
  await show(place, null); frame(); root.querySelector('.x').focus();
  return { close, go: (p, l) => { if (l) light = l; show(p, compass()); } };
}
