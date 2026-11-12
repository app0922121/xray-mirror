// Soft organs, in torso space (cm). +X = subject's left, so the heart leans +X
// and the liver sits on -X, exactly as in a real body.
import { smin, smax, ellipsoid, capsule, sphere } from '../sdf.js';
import { sdfGeometry, sweep, rounded, merge, mirrorX } from '../geom.js';

export const HEART_C = [2.4, -12.2, 3.2];

function heart(x, y, z) {
  // ventricles: a blunt cone pointing down-left-forward
  let d = capsule(x, y, z, 1.2, -10.2, 3.0, 6.6, -16.6, 5.2, 4.1, 1.7);
  d = smin(d, sphere(x, y, z, -1.9, -9.2, 3.4, 2.7), 1.2);                 // right atrium
  d = smin(d, sphere(x, y, z, 2.6, -7.9, 1.0, 2.6), 1.2);                  // left atrium
  d = smin(d, sphere(x, y, z, 5.0, -8.4, 3.6, 1.3), 0.7);                  // left auricle
  // groove between the ventricles
  d = smax(d, -capsule(x, y, z, 2.4, -8.6, 6.6, 6.2, -16.6, 7.4, 0.55), 0.7);
  // great vessels
  let v = capsule(x, y, z, 0.6, -8.4, 3.4, 0.2, -3.6, 3.0, 1.35, 1.25);    // ascending aorta
  v = smin(v, capsule(x, y, z, 0.2, -3.6, 3.0, 2.2, -2.2, -0.4, 1.25, 1.2), 0.9);
  v = smin(v, capsule(x, y, z, 2.2, -2.2, -0.4, 3.0, -5.0, -3.4, 1.2, 1.15), 0.9);
  v = smin(v, capsule(x, y, z, 3.0, -5.0, -3.4, 2.6, -12.5, -4.4, 1.15, 1.1), 0.6);
  v = Math.min(v, capsule(x, y, z, 0.6, -1.9, 2.2, 0.2, 1.0, 2.0, 0.55, 0.5));   // arch branches
  v = Math.min(v, capsule(x, y, z, 1.9, -1.4, 0.6, 2.4, 1.0, 0.8, 0.5, 0.45));
  v = smin(v, capsule(x, y, z, 2.2, -8.6, 5.0, 3.6, -5.2, 3.4, 1.3, 1.15), 0.6);  // pulmonary trunk
  v = smin(v, capsule(x, y, z, 3.6, -5.2, 3.4, 6.0, -5.6, 0.8, 1.0, 0.8), 0.6);
  v = smin(v, capsule(x, y, z, -2.6, -8.0, 3.0, -2.9, -1.4, 2.4, 1.0, 0.9), 0.6);  // vena cava
  return smin(d, v, 0.6);
}

function lung(left) {
  const s = left ? 1 : -1;
  return (px, y, z) => {
    const x = px * s;     // work on the +X side
    let d = ellipsoid(x, y, z, 6.9, -13.0, -0.8, 4.5, 8.2, 6.3);
    d = smin(d, ellipsoid(x, y, z, 5.6, -4.2, -1.6, 3.0, 5.6, 4.2), 3.0);
    d = smax(d, 2.0 - x, 1.4);                                              // flat inner face
    d = smax(d, -sphere(x, y, z, 6.0, -29.0, 0.5, 9.6), 1.0);               // diaphragm dome
    const hr = left ? 6.6 : 5.0;
    d = smax(d, -sphere(x * s, y, z, 2.4, -12.4, 3.6, hr), 0.9);            // cardiac notch
    // fissures split the lung into lobes
    const f1 = Math.abs((y + 11.0) * 0.72 - (z + 1.0) * 0.69) - 0.2;
    d = smax(d, -f1, 0.35);
    if (!left) { const f2 = Math.abs(y + 9.6 + (z - 4) * 0.15) - 0.2; if (z > -0.5) d = smax(d, -f2, 0.35); }
    return d;
  };
}

function liver(x, y, z) {
  let d = ellipsoid(x, y, z, -5.6, -25.0, 1.4, 8.0, 5.4, 6.4);
  d = smin(d, ellipsoid(x, y, z, 1.8, -23.8, 3.4, 4.6, 3.1, 3.4), 2.0);
  // sloping underside, tucked under the right dome of the diaphragm
  d = smax(d, (-26.4 - y) + (x + 5) * 0.42 - (z - 1) * 0.12, 1.4);
  d = smax(d, -capsule(x, y, z, -0.6, -30, 5.6, -0.2, -22.5, 5.4, 0.7), 0.8);
  return d;
}

function kidney(x, y, z) {
  let d = ellipsoid(x, y, z, 6.6, -29.5, -5.6, 2.5, 4.7, 2.0);
  d = smax(d, -sphere(x, y, z, 3.3, -29.5, -5.2, 2.1), 0.7);
  d = smin(d, capsule(x, y, z, 5.0, -29.6, -5.3, 2.4, -33.5, -5.0, 0.42, 0.34), 0.4);
  return d;
}

export function buildOrgans(report) {
  report('心脏与肺');
  const parts = [];
  const add = (key, geo, tissue) => parts.push({ key, geo, tissue });
  add('heart', sdfGeometry(heart, [-5.4, -19.4, -6.4], [9.4, 2.4, 9.4], 0.2), 'heart');
  add('lung_L', sdfGeometry(lung(true), [1.2, -23.5, -9.4], [13.6, 3, 7.4], 0.33), 'lung');
  add('lung_R', sdfGeometry(lung(false), [-13.6, -23.5, -9.4], [-1.2, 3, 7.4], 0.33), 'lung');

  // windpipe with cartilage rings, forking into the two bronchi
  const ring = (t) => 1 + 0.13 * Math.pow(Math.abs(Math.sin(t * Math.PI * 17)), 0.6);
  const tr = sweep([[0, 7.5, 1.6], [0, 2, 0.8], [0, -3, -0.4], [0, -6.2, -1.0]], rounded(0.95, 0.03, ring), { segments: 70, radial: 12 });
  const bl = sweep([[0, -5.6, -1.0], [2.2, -7.6, -1.2], [4.6, -9.2, -1.6]], rounded((t) => 0.78 - 0.2 * t, 0.06), { segments: 18, radial: 10 });
  add('trachea', merge([tr, bl, mirrorX(bl)]), 'cartilage');

  report('消化系统');
  add('liver', sdfGeometry(liver, [-14.5, -31.5, -6], [7.4, -18.4, 8.6], 0.3), 'liver');
  add('stomach', sweep([[1.6, -19.2, -0.6], [3.4, -21.2, 0.6], [6.6, -22.0, 1.6], [8.0, -25.0, 2.6], [6.6, -28.6, 3.6], [3.4, -30.2, 4.2], [0.4, -29.6, 4.0]],
    rounded((t) => 0.85 + 2.7 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8) * (1 - 0.35 * t), 0.05), { segments: 48, radial: 16 }), 'stomach');
  const haustra = (t) => 1 + 0.2 * Math.pow(Math.abs(Math.sin(t * Math.PI * 30)), 0.7);
  add('colon', sweep([[-8.6, -45.6, 2.0], [-9.8, -42, 2.2], [-10.2, -36, 2.0], [-9.4, -32.6, 2.4], [-5, -33.6, 4.4], [0, -34.8, 5.2], [5, -33.2, 4.4], [9.4, -31.4, 1.6], [10.2, -35, 1.2], [9.9, -41, 1.4], [8.2, -45.4, 1.0], [4.6, -47.2, -0.6], [1.6, -46.2, -2.6], [0, -50.5, -4.4]],
    rounded(1.75, 0.02, haustra), { segments: 150, radial: 12 }), 'colon');
  const coil = [];
  for (let i = 0; i <= 140; i++) {
    const t = i / 140;
    coil.push([6.4 * Math.sin(t * Math.PI * 15) * (0.75 + 0.25 * Math.sin(t * 9)), -36.6 - 8.6 * t + 0.9 * Math.sin(t * Math.PI * 30 + 1), 3.2 + 1.9 * Math.cos(t * Math.PI * 15 + 0.8)]);
  }
  add('intestine', sweep(coil, rounded(1.0, 0.01), { segments: 520, radial: 9 }), 'intestine');
  const k = sdfGeometry(kidney, [3, -35, -8.2], [9.8, -24, -3], 0.22);
  add('kidney_L', k, 'kidney'); add('kidney_R', mirrorX(k), 'kidney');
  return { parts };
}
