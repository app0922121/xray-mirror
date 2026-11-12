// Skull, mandible, brain. Units: cm. +X = subject's left, +Y = up, +Z = face front.
// Origin sits on the mid-line at eye level (sellion height), near the ear axis.
import { smin, smax, ellipsoid, capsule, rbox, polyline2, sphere } from '../sdf.js';
import { sdfGeometry } from '../geom.js';

export const TMJ = [5.35, -2.9, 0.4];          // jaw hinge (per side, +x)
export const EYE = [3.25, -0.75, 7.2];         // orbit centre
export const SKULL_BASE = [0, -4.6, -1.6];     // where the spine meets the skull

// 7 teeth per side: [width, crown depth]
const TEETH = [[0.86, 0.34], [0.68, 0.32], [0.78, 0.42], [0.72, 0.46], [0.70, 0.48], [1.02, 0.52], [0.98, 0.52]];

function buildArch(rx, z0, rz) {
  // place teeth by arc length along a half-ellipse x = rx sin(a), z = z0 + rz cos(a)
  const out = [];
  let a = 0, acc = 0;
  const step = 0.002;
  for (let i = 0; i < TEETH.length; i++) {
    const w = TEETH[i][0];
    const target = acc + w / 2;
    let s = acc;
    let aa = a;
    while (s < target) { aa += step; s += Math.hypot(rx * Math.cos(aa), rz * Math.sin(aa)) * step; }
    const tx = rx * Math.cos(aa), tz = -rz * Math.sin(aa);
    const tl = Math.hypot(tx, tz);
    out.push({ x: rx * Math.sin(aa), z: z0 + rz * Math.cos(aa), cx: tx / tl, cz: tz / tl, hw: w / 2 * 0.9, hd: TEETH[i][1] });
    // advance to tooth end
    while (s < acc + w) { aa += step; s += Math.hypot(rx * Math.cos(aa), rz * Math.sin(aa)) * step; }
    a = aa; acc += w + 0.02;
  }
  return out;
}
const UPPER = buildArch(2.95, 4.5, 3.75);
const LOWER = buildArch(2.72, 4.45, 3.5);

function teeth(ax, y, z, arch, yc, hh) {
  let d = 1e9;
  for (let i = 0; i < arch.length; i++) {
    const t = arch[i];
    const dx = ax - t.x, dz = z - t.z;
    const lx = dx * t.cx + dz * t.cz;      // along the arch
    const lz = -dx * t.cz + dz * t.cx;     // through the arch
    // crowns taper slightly toward the biting edge
    const k = i < 3 ? 1 - 0.18 * Math.max(0, Math.min(1, Math.abs(y - yc) / hh)) : 1;
    const dd = rbox(lx, y, lz, 0, yc, 0, t.hw * k, hh, t.hd, 0.16);
    if (dd < d) d = dd;
  }
  return d;
}

export function craniumSDF(x, y, z) {
  const ax = Math.abs(x);
  // brain case
  let d = ellipsoid(x, y, z, 0, 3.7, -1.0, 7.25, 6.6, 9.3);
  d = smin(d, ellipsoid(x, y, z, 0, 4.5, -3.9, 7.6, 5.9, 6.5), 1.6);
  d = smin(d, ellipsoid(x, y, z, 0, 2.6, 4.2, 6.1, 4.9, 4.4), 1.6);
  // occipital bun + skull base
  d = smin(d, ellipsoid(x, y, z, 0, -0.6, -6.6, 5.2, 3.4, 3.6), 1.4);
  d = smin(d, rbox(x, y, z, 0, -2.4, -1.2, 4.6, 1.6, 4.6, 1.4), 1.2);
  // upper face
  d = smin(d, rbox(x, y, z, 0, -3.4, 5.1, 4.3, 3.5, 3.1, 1.7), 1.1);
  // alveolar ridge (horseshoe that carries the upper teeth)
  const arch = polyline2(ax, z, [0, 8.05, 1.5, 7.8, 2.6, 6.6, 3.05, 5.0, 3.1, 3.2]);
  const ay = Math.max(Math.abs(y + 6.3) - 0.55, 0), aq = Math.max(arch - 0.15, 0);
  d = smin(d, Math.sqrt(aq * aq + ay * ay) - 0.55, 0.7);
  // brow ridges, nasal bones, cheek bones
  d = smin(d, capsule(ax, y, z, 0.9, 1.05, 8.0, 5.4, 0.85, 6.5, 0.78, 0.6), 0.9);
  d = smin(d, capsule(x, y, z, 0, 0.5, 8.3, 0, -2.2, 9.35, 0.7, 0.42), 0.55);
  d = smin(d, ellipsoid(ax, y, z, 5.25, -3.0, 5.7, 1.75, 1.5, 1.7), 0.9);
  d = smin(d, capsule(ax, y, z, 5.7, -2.3, 5.9, 5.55, 0.9, 6.3, 0.62), 0.5);
  d = smin(d, capsule(ax, y, z, 6.1, -3.05, 4.9, 6.6, -2.6, -0.2, 0.46, 0.5), 0.55);
  d = smin(d, capsule(ax, y, z, 6.6, -2.6, -0.2, 6.1, -2.2, -1.6, 0.52), 0.7);
  // mastoid process
  d = smin(d, capsule(ax, y, z, 5.7, -2.6, -2.4, 5.3, -5.1, -1.7, 1.15, 0.65), 0.8);
  // --- carving ---
  // temporal fossa (the hollow behind the cheek bone)
  d = smax(d, -ellipsoid(ax, y, z, 7.3, -1.0, 2.9, 1.7, 2.9, 2.9), 0.9);
  // eye sockets: tall rounded cone, wider at the rim
  const orb = smin(ellipsoid(ax, y, z, 3.25, -0.75, 7.6, 2.05, 1.82, 2.6), ellipsoid(ax, y, z, 2.9, -0.6, 5.2, 1.5, 1.35, 3.4), 0.6);
  d = smax(d, -orb, 0.34);
  // nasal aperture (pear shaped) and inner nose cavity
  const nas = smin(ellipsoid(x, y, z, 0, -4.05, 8.3, 1.32, 1.3, 3.2), ellipsoid(x, y, z, 0, -2.7, 8.5, 0.78, 1.7, 2.8), 0.5);
  d = smax(d, -nas, 0.22);
  d = smin(d, rbox(x, y, z, 0, -3.5, 5.7, 0.07, 1.2, 0.9, 0.06), 0.12);   // septum
  // hollow under the cheeks and behind the upper jaw
  d = smax(d, -ellipsoid(ax, y, z, 5.0, -6.2, 4.4, 1.9, 2.3, 2.6), 0.8);
  d = smax(d, -rbox(x, y, z, 0, -8.6, -2.6, 9, 3.6, 5.6, 1.0), 0.9);
  // palate vault
  d = smax(d, -ellipsoid(x, y, z, 0, -7.3, 4.3, 2.25, 1.7, 3.3), 0.4);
  // teeth
  if (y < -5.8 && y > -8.6 && z > 2.0 && ax < 4.4) d = Math.min(d, teeth(ax, y, z, UPPER, -7.45, 0.6));
  return d;
}

export function mandibleSDF(x, y, z) {
  const ax = Math.abs(x);
  // body: a rounded wall following the dental arch
  const arch = polyline2(ax, z, [0, 7.55, 1.6, 7.3, 2.9, 6.1, 3.8, 4.2, 4.6, 1.6, 4.95, 0.7]);
  // the lower border sweeps upward toward the jaw angle
  const back = Math.pow(Math.min(1, Math.max(0, (7.4 - z) / 6.8)), 1.6);
  const wy = Math.max(Math.abs(y + 10.55 - 0.75 * back) - (0.85 - 0.12 * back), 0), wq = Math.max(arch - 0.1, 0);
  let d = Math.sqrt(wq * wq + wy * wy) - 0.54;
  // chin
  d = smin(d, ellipsoid(x, y, z, 0, -11.2, 7.75, 1.45, 0.85, 0.75), 0.9);
  // ramus: a flattened plate that rises to the joint
  const xr = 4.9 + (y + 10.9) * 0.055;
  const xs = 5.15 + (ax - xr) * 1.75;
  let ram = capsule(xs, y, z, 5.15, -10.2, 0.9, 5.15, -3.9, 0.45, 0.95, 0.62);
  ram = smin(ram, capsule(xs, y, z, 5.15, -9.6, 2.7, 5.15, -3.6, 3.0, 0.75, 0.42), 1.5);
  ram = smin(ram, capsule(xs, y, z, 5.15, -10.2, 0.4, 5.15, -9.6, 2.6, 0.8), 0.9);
  d = smin(d, ram * 0.62, 0.6);
  // condyle head
  d = smin(d, ellipsoid(ax, y, z, 5.35, -2.95, 0.4, 0.98, 0.6, 0.56), 0.35);
  // lower teeth
  if (y < -7.6 && y > -10.2 && z > 2.0 && ax < 4.2) d = Math.min(d, teeth(ax, y, z, LOWER, -8.72, 0.6));
  return d;
}

export function brainSDF(x, y, z) {
  const ax = Math.abs(x);
  // two hemispheres with a longitudinal fissure
  let c = ellipsoid(ax, y, z, 3.15, 4.3, -1.0, 3.25, 5.0, 7.9);
  c = smin(c, ellipsoid(ax, y, z, 4.2, 1.1, 1.2, 2.2, 1.9, 4.2), 1.2);   // temporal lobe
  c = smax(c, -(ax - 0.16), 0.3);
  // folded cortex
  const wx = x + 0.75 * Math.sin(1.25 * y + 0.8 * z), wy = y + 0.75 * Math.sin(1.15 * z + 1.3 * x), wz = z + 0.75 * Math.sin(1.2 * x + 0.9 * y);
  const g = Math.abs(Math.sin(2.1 * wx) + Math.sin(2.3 * wy) + Math.sin(1.9 * wz)) / 3;
  c += 0.26 * (0.42 - g);
  // cerebellum with fine striations, brain stem
  let cb = ellipsoid(ax, y, z, 2.1, -0.9, -5.6, 2.7, 2.0, 2.7) + 0.06 * Math.sin(8.5 * y + 2.0 * Math.sin(1.5 * x));
  let d = smin(c, cb, 0.25);
  d = smin(d, capsule(x, y, z, 0, 0.6, -2.6, 0, -4.8, -2.9, 1.15, 0.8), 0.5);
  return d;
}

export function eyeSDF(x, y, z) { return sphere(x, y, z, 0, 0, 0, 1.2); }

export function buildSkull(report) {
  const out = {};
  report('颅骨');
  out.cranium = sdfGeometry(craniumSDF, [-8.6, -9.2, -11.6], [8.6, 11.4, 10.6], 0.17, { aoDist: 2.2 });
  report('下颌骨');
  // mandible geometry is expressed relative to the jaw hinge so it can rotate
  out.mandible = sdfGeometry((x, y, z) => mandibleSDF(x, y + TMJ[1], z + TMJ[2]), [-7.2, -10.2, -1.6], [7.2, 1.4, 9.4], 0.15, { aoDist: 1.3 });
  report('大脑');
  out.brain = sdfGeometry(brainSDF, [-7.6, -6.2, -9.8], [7.6, 10.2, 7.9], 0.24);
  out.eye = sdfGeometry(eyeSDF, [-1.5, -1.5, -1.5], [1.5, 1.5, 1.5], 0.15);
  return out;
}
