/* lg-zones.js — photo-real "walk-in" zones for the Langi Ghiran 3D tour (Gaussian splats inside the existing three.js world).
   Walk the normal stylised world with WASD; step into a zone (glamping camp, top station, kids' park) and the photo-real
   splat fades in around you. Leave the zone and it fades out again.

   import { initZones } from './assets/zones/lg-zones.js';
   const zones = await initZones({ THREE, scene, camera, renderer,
     toGame: (mgaX, mgaY, ahd) => new THREE.Vector3(...),   // the tour's existing map-grid -> scene function (MGA zone 54, metres AHD)
     onEnter: name => hideStylisedStuffIn(name),          // optional: hide the low-poly tents etc. inside that zone
     onExit:  name => showStylisedStuffIn(name) });
   // in the render loop:  zones.update(playerPositionInGameCoords);

   Splats are rendered with Spark (sparkjs.dev, MIT licence, three.js-native), loaded only when you first approach a zone. */
// Spark 2.1.0 (MIT) is shipped next to this file as spark.module.min.js. It imports bare 'three' and 'three/addons/...'
// (built for three r180): the page's importmap must map both.
const SPARK_FILE = 'spark.module.min.js';

export async function initZones({ THREE, scene, camera, renderer, toGame, base = 'assets/zones/', manifest, onEnter, onExit, fadeSeconds = 0.8, sparkUrl }) {
  sparkUrl = sparkUrl || new URL(base + SPARK_FILE, location.href).href;
  const M = manifest || await (await fetch(base + 'lg-zones.json')).json();
  const O = M.origin;                                   // splat files are in park-local metres: x east, y north, z up, relative to O
  // local -> game as an affine map, measured from the host's own toGame() so it matches the tour exactly
  const P = (x, y, z) => toGame(x + O.OX, y + O.OY, z + O.OZ);
  const o = P(0, 0, 0), ex = P(1, 0, 0).sub(o), ey = P(0, 1, 0).sub(o), ez = P(0, 0, 1).sub(o);
  const toGameMat = new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(o);
  let Spark = null, sparkRenderer = null;
  const zones = Object.entries(M.zones).map(([name, z]) => ({ name, ...z, centreGame: P(z.centre[0], z.centre[1], 0), mesh: null, loading: false, alpha: 0, inside: false }));
  async function load(z) {
    if (z.mesh || z.loading) return; z.loading = true;
    Spark = Spark || await import(sparkUrl);
    if (!sparkRenderer) {                                  // Spark 2 draws splats through one SparkRenderer in the scene
      scene.traverse(o => { if (!sparkRenderer && o instanceof Spark.SparkRenderer) sparkRenderer = o; });
      if (!sparkRenderer) { sparkRenderer = new Spark.SparkRenderer({ renderer }); scene.add(sparkRenderer); }
    }
    let m;
    if (z.parts) {                                         // big splats are stored as <splat>.part0, .part1 ... (GitHub upload size limit)
      const bufs = await Promise.all(Array.from({ length: z.parts }, (_, i) => fetch(base + z.splat + '.part' + i).then(r => r.arrayBuffer())));
      const bytes = new Uint8Array(bufs.reduce((n, b) => n + b.byteLength, 0)); let at = 0;
      for (const b of bufs) { bytes.set(new Uint8Array(b), at); at += b.byteLength; }
      m = new Spark.SplatMesh({ fileBytes: bytes, fileName: z.splat });
    } else {
      m = new Spark.SplatMesh({ url: base + z.splat });
    }
    m.matrixAutoUpdate = false; m.matrix.copy(toGameMat); m.opacity = 0; m.visible = false;
    scene.add(m); z.mesh = m; z.loading = false;
  }
  let last = performance.now();
  function update(player) {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    for (const z of zones) {
      const d = Math.hypot(player.x - z.centreGame.x, player.z - z.centreGame.z);
      const scaleXY = Math.hypot(ex.x, ex.z) || 1;            // metres -> game units
      if (d < z.radius * scaleXY * 1.6) load(z);              // pre-load as you approach
      const inside = d < z.radius * scaleXY;
      if (inside !== z.inside) { z.inside = inside; (inside ? onEnter : onExit) && (inside ? onEnter : onExit)(z.name); }
      if (!z.mesh) continue;
      z.alpha = Math.max(0, Math.min(1, z.alpha + (inside ? 1 : -1) * dt / fadeSeconds));
      z.mesh.visible = z.alpha > 0.001; z.mesh.opacity = z.alpha;
    }
  }
  return { update, zones };
}
