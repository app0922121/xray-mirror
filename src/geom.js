import * as THREE from 'three';
import { meshSDF } from './sdf.js';

export function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('ao', new THREE.BufferAttribute(m.ao || new Float32Array(m.position.length / 3).fill(1), 1));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function sdfGeometry(f, bmin, bmax, cell, opts) {
  return toGeometry(meshSDF(f, bmin, bmax, cell, opts));
}

// Mirror a geometry across the YZ plane (left <-> right body side).
export function mirrorX(geo) {
  const g = geo.clone();
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) { p[i] = -p[i]; n[i] = -n[i]; }
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function translated(geo, x, y, z) { const g = geo.clone(); g.translate(x, y, z); return g; }

/**
 * Sweep an elliptical cross-section along a smooth path.
 * pts: array of [x,y,z] control points (Catmull-Rom).
 * radius(t) -> number | [ra, rb]; ra lies along the `up`-derived binormal.
 */
export function sweep(pts, radius, { segments = 48, radial = 10, up = [0, 0, 1], closed = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), closed, 'centripetal');
  const P = [], T = [];
  for (let i = 0; i <= segments; i++) { const t = i / segments; P.push(curve.getPoint(t)); T.push(curve.getTangent(t).normalize()); }
  // parallel-transport frames seeded from the up hint
  const N = [], B = [];
  let n = new THREE.Vector3(up[0], up[1], up[2]);
  n.addScaledVector(T[0], -n.dot(T[0]));
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0).addScaledVector(T[0], -T[0].x);
  n.normalize();
  for (let i = 0; i <= segments; i++) {
    if (i > 0) { n = n.clone().addScaledVector(T[i], -n.dot(T[i])).normalize(); }
    N.push(n.clone()); B.push(new THREE.Vector3().crossVectors(T[i], n).normalize());
  }
  const rows = segments + 1, cols = radial;
  const pos = new Float32Array((rows * cols + 2) * 3), nor = new Float32Array((rows * cols + 2) * 3);
  const idx = [];
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < rows; i++) {
    const t = i / segments;
    let r = radius(t); const ra = Array.isArray(r) ? r[0] : r, rb = Array.isArray(r) ? r[1] : r;
    for (let j = 0; j < cols; j++) {
      const a = (j / cols) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      v.copy(P[i]).addScaledVector(N[i], c * ra).addScaledVector(B[i], s * rb);
      nn.set(0, 0, 0).addScaledVector(N[i], c / Math.max(ra, 1e-4)).addScaledVector(B[i], s / Math.max(rb, 1e-4)).normalize();
      const o = (i * cols + j) * 3;
      pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z; nor[o] = nn.x; nor[o + 1] = nn.y; nor[o + 2] = nn.z;
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < cols; j++) {
    const a = i * cols + j, b = i * cols + (j + 1) % cols, c = (i + 1) * cols + j, d = (i + 1) * cols + (j + 1) % cols;
    idx.push(a, b, c, b, d, c);
  }
  // end caps
  const c0 = rows * cols, c1 = c0 + 1;
  pos.set([P[0].x, P[0].y, P[0].z], c0 * 3); nor.set([-T[0].x, -T[0].y, -T[0].z], c0 * 3);
  pos.set([P[segments].x, P[segments].y, P[segments].z], c1 * 3); nor.set([T[segments].x, T[segments].y, T[segments].z], c1 * 3);
  for (let j = 0; j < cols; j++) {
    idx.push(c0, (j + 1) % cols, j);
    idx.push(c1, segments * cols + j, segments * cols + (j + 1) % cols);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('ao', new THREE.BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// Radius profile helper: rounded ends, optional modulation.
export const rounded = (r, cap = 0.08, mod = null) => (t) => {
  let k = 1;
  if (t < cap) k = Math.sqrt(1 - (1 - t / cap) ** 2);
  else if (t > 1 - cap) k = Math.sqrt(1 - (1 - (1 - t) / cap) ** 2);
  k = Math.max(k, 0.02);
  let rr = typeof r === 'function' ? r(t) : r;
  if (mod) { const m = mod(t); rr = Array.isArray(rr) ? [rr[0] * m, rr[1] * m] : rr * m; }
  return Array.isArray(rr) ? [rr[0] * k, rr[1] * k] : rr * k;
};

export function merge(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni), ao = new Float32Array(nv);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); ao.set(g.attributes.ao.array, vo);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
    vo += g.attributes.position.count; io += ix.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
