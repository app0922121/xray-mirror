// Rib cage, spine, shoulder girdle, pelvis.
// Torso space (cm): origin = midpoint between the shoulder joints,
// +X = subject's left, +Y = up, +Z = chest front.
import { smin, smax, ellipsoid, capsule, rbox, cylY, torusY, torusN, sphere, triangle } from '../sdf.js';
import { sdfGeometry, sweep, rounded, mirrorX } from '../geom.js';

export const SHOULDER_X = 17.5;
export const HIP = [9.0, -50, 0];

// spine centre line: thoracic kyphosis + lumbar lordosis
export function spineZ(y) {
  if (y > -22.9) return -5.0 - 3.6 * Math.sin(Math.PI * Math.min(1, Math.max(0, (3.5 - y) / 26.4)));
  return -5.0 + 1.4 * Math.sin(Math.PI * Math.min(1, (-22.9 - y) / 19.1));
}
const spineTilt = (y) => Math.atan2(spineZ(y + 0.5) - spineZ(y - 0.5), 1.0);

export function vertebraSDF(kind) {
  // kind 0 = cervical, 1 = thoracic, 2 = lumbar
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = cylY(x, y, z, 0, 0, 0, kind === 2 ? 2.0 : 1.75, 1.0, 0.35) + 0.16 * (1 - Math.min(1, y * y));
    d = smin(d, torusY(x, y, z, 0, 0, -2.5, 1.25, 0.45), 0.35);
    if (kind === 1) {
      d = smin(d, capsule(x, y, z, 0, 0, -3.6, 0, -2.0, -6.2, 0.55, 0.38), 0.5);
      d = smin(d, capsule(ax, y, z, 1.5, 0.1, -2.4, 4.2, 0.5, -3.7, 0.62, 0.5), 0.45);
    } else if (kind === 2) {
      d = smin(d, rbox(x, y, z, 0, -0.2, -5.0, 0.35, 0.95, 1.5, 0.3), 0.5);
      d = smin(d, capsule(ax, y, z, 1.7, 0, -1.9, 5.0, 0.2, -2.5, 0.55, 0.42), 0.45);
    } else {
      d = smin(d, capsule(x, y, z, 0, 0, -3.4, 0, -0.6, -5.2, 0.45, 0.4), 0.4);
      d = smin(d, capsule(ax, y, z, 1.5, 0, -0.9, 3.3, -0.1, -1.1, 0.55, 0.45), 0.4);
    }
    d = smin(d, sphere(ax, y, z, 1.45, 1.05, -2.9, 0.55), 0.3);
    d = smin(d, sphere(ax, y, z, 1.45, -1.05, -3.1, 0.55), 0.3);
    return d;
  };
}

const zst = (y) => 5.2 + (-1.5 - y) * 0.19;      // sternum front plane
function sternumSDF(x, y, z) {
  const zz = z - zst(y);
  let d = rbox(x, y, zz, 0, -3.7, 0, 2.7, 2.3, 0.62, 0.55);
  d = smax(d, -sphere(x, y, zz, 0, -0.7, 0, 1.25), 0.3);
  d = smin(d, rbox(x, y, zz, 0, -12.2, 0, 1.75 + 0.25 * Math.sin((y + 12) * 0.5), 6.3, 0.55, 0.5), 0.5);
  d = smin(d, capsule(x, y, zz, 0, -18.4, 0, 0, -21.0, 0.2, 0.62, 0.3), 0.4);
  return d;
}

function scapulaSDF(x, y, z) {
  const A = [7.2, 1.6, -8.6], B = [9.9, -13.4, -10.3], C = [15.2, -1.3, -4.4];
  let d = triangle(x, y, z, A, B, C) - 0.3;
  d = smin(d, capsule(x, y, z, B[0], B[1], B[2], C[0], C[1], C[2], 0.5, 0.6), 0.5);       // lateral border
  d = smin(d, capsule(x, y, z, 7.8, -1.9, -9.8, 16.2, 2.0, -3.8, 0.5, 0.7), 0.6);         // spine of scapula
  d = smin(d, capsule(x, y, z, 16.2, 2.0, -3.8, 17.6, 2.4, -1.2, 0.75, 0.6) * 0.9, 0.5);  // acromion
  d = smin(d, capsule(x, y, z, 14.4, 0.2, -3.6, 14.9, -0.6, 0.6, 0.55, 0.42), 0.5);        // coracoid
  d = smin(d, ellipsoid(x, y, z, 15.6, -1.3, -3.6, 0.8, 1.7, 1.25), 0.5);                  // glenoid
  return d;
}

function pelvisSDF(x, y, z) {
  const ax = Math.abs(x);
  // sacrum + coccyx
  let d = ellipsoid(x, y, z, 0, -44.6, -6.4, 5.3, 3.4, 1.9);
  d = smin(d, capsule(x, y, z, 0, -46, -7.0, 0, -53.5, -7.6, 2.3, 0.55), 1.2);
  // iliac wing: outer ellipsoid minus an inner one leaves a curved blade
  let wing = ellipsoid(ax, y, z, 8.4, -43.2, -2.6, 6.6, 7.4, 5.6);
  wing = smax(wing, -ellipsoid(ax, y, z, 6.3, -41.6, -0.2, 6.5, 8.6, 5.9), 0.6);
  wing = smax(wing, -49.6 - y, 0.6);
  d = smin(d, wing, 1.1);
  // hip socket
  let ace = sphere(ax, y, z, 8.6, -49.8, -0.6, 3.3);
  ace = smax(ace, -sphere(ax, y, z, 10.3, -50.2, 0.5, 2.55), 0.3);
  d = smin(d, ace, 1.0);
  // pubis + ischium ring around the obturator foramen
  d = smin(d, torusN(ax, y, z, 5.0, -54.4, 2.0, 0.6, 0, 0.8, 2.45, 1.0), 0.9);
  d = smin(d, rbox(x, y, z, 0, -53.6, 5.0, 1.3, 1.7, 0.9, 0.6), 0.7);
  d = smin(d, sphere(ax, y, z, 6.3, -57.4, -0.8, 1.5), 0.9);
  return d;
}

// rib table: [half-width a, half-depth b, drop, end angle]
const RIBS = [
  [5.6, 4.2, 5.0, 2.75], [8.2, 5.7, 6.5, 2.72], [10.1, 6.9, 7.5, 2.68], [11.4, 7.8, 8.0, 2.64],
  [12.3, 8.5, 8.5, 2.6], [12.9, 9.0, 9.0, 2.55], [13.3, 9.3, 9.5, 2.48], [13.4, 9.3, 10, 2.3],
  [13.2, 9.1, 10, 2.08], [12.6, 8.7, 9.5, 1.85], [11.4, 8.0, 6.5, 1.45], [9.8, 7.2, 4.0, 1.05],
];
const STERNAL_Y = [-2.7, -6.3, -9.0, -11.6, -14.0, -16.0, -17.6];
export const thoracicY = (i) => 3.5 - i * 2.4;     // i = 0..11
export const lumbarY = (i) => -25.9 - i * 3.3;      // i = 0..4

function ribPath(i) {
  const [a, b, drop, te] = RIBS[i];
  const yT = thoracicY(i);
  const c = spineZ(yT) - 1.0 + b;
  const t0 = Math.asin(Math.min(0.9, 2.1 / a));
  const pts = [];
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const s = k / n, th = t0 + (te - t0) * s;
    pts.push([a * Math.sin(th), yT + 0.5 - drop * Math.pow(s, 1.25), c - b * Math.cos(th)]);
  }
  return pts;
}
const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];

export function buildTorso(report) {
  const parts = [];
  const add = (key, geo, tissue, xf) => parts.push({ key, geo, tissue, xf });
  const both = (key, geoL, tissue) => { add(key + '_L', geoL, tissue); add(key + '_R', mirrorX(geoL), tissue); };

  report('脊柱');
  const vT = sdfGeometry(vertebraSDF(1), [-5.2, -3.2, -7.2], [5.2, 2.2, 2.6], 0.26);
  const vL = sdfGeometry(vertebraSDF(2), [-6, -2, -7.2], [6, 2.2, 2.9], 0.28);
  const vC = sdfGeometry(vertebraSDF(0), [-4.2, -2, -6], [4.2, 2, 2.6], 0.25);
  for (let i = 0; i < 12; i++) {
    const y = thoracicY(i), s = 0.78 + i * 0.024;
    add('T' + (i + 1), vT, 'bone', { p: [0, y, spineZ(y)], r: [spineTilt(y), 0, 0], s: [s, 1.0, s] });
  }
  for (let i = 0; i < 5; i++) {
    const y = lumbarY(i), s = 1.1 + i * 0.03;
    add('L' + (i + 1), vL, 'bone', { p: [0, y, spineZ(y)], r: [spineTilt(y), 0, 0], s: [s, 1.3, s] });
  }

  report('肋骨');
  const ribEnds = [], carts = [];
  for (let i = 0; i < 12; i++) {
    const pts = ribPath(i);
    ribEnds.push(pts[pts.length - 1]);
    const h = i === 0 ? 0.75 : 0.68, w = 0.34;
    const g = sweep(pts, rounded(() => [h, w], 0.04), { segments: 44, radial: 10, up: [0, 1, 0] });
    both('rib' + (i + 1), g, 'bone');
  }
  // costal cartilage: ribs 1-7 reach the sternum, 8-10 hitch onto the one above
  for (let i = 0; i < 10; i++) {
    const E = ribEnds[i];
    let S;
    if (i < 7) S = [i === 0 ? 2.2 : 1.5, STERNAL_Y[i], zst(STERNAL_Y[i]) - 0.1];
    else { const prev = carts[i - 1]; S = lerp3(prev[0], prev[2], 0.42); }
    const M = lerp3(E, S, 0.5); M[1] -= i < 7 ? 0.5 + i * 0.12 : 0.3; M[2] += 0.5;
    carts.push([E, M, S]);
    both('cart' + (i + 1), sweep([E, M, S], rounded(() => [0.6, 0.36], 0.03), { segments: 16, radial: 8, up: [0, 1, 0] }), 'cartilage');
  }

  report('胸骨');
  add('sternum', sdfGeometry(sternumSDF, [-3.4, -22, 4], [3.4, -0.6, 10.2], 0.2), 'bone');
  both('clavicle', sweep([[1.7, -1.5, 5.3], [5.6, -0.4, 6.1], [10.6, 1.0, 3.3], [15.4, 2.4, -0.8]],
    rounded((t) => { const r = 0.6 + 0.16 * Math.abs(t - 0.45) * 2; return [r, r * 0.85]; }, 0.06),
    { segments: 28, radial: 10, up: [0, 1, 0] }), 'bone');
  report('肩胛骨');
  both('scapula', sdfGeometry(scapulaSDF, [5.8, -15, -11.6], [19, 4, 2], 0.22), 'bone');
  report('骨盆');
  add('pelvis', sdfGeometry(pelvisSDF, [-16.5, -60, -11], [16.5, -34.5, 7.5], 0.3), 'bone');

  return { parts, vC };
}
