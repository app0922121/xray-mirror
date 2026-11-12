// Hover inspection (ray-picking a bone) and auto call-out labels with leader lines.
import * as THREE from 'three';
import { describe, skullRegion } from './anatomy.js';
import { TMJ } from './models/skull.js';

const SVGNS = 'http://www.w3.org/2000/svg';

export class Labels {
  constructor(stage, bodies, els) {
    this.stage = stage; this.bodies = bodies;
    this.card = els.card; this.layer = els.layer; this.svg = els.svg;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.pointer = null;
    this.hover = null;
    this.frame = 0;
    this.pool = [];
    this.state = new Map();
    this.enabled = true;
    this.clip = null;              // (x, y, pad) => bool: only what can be seen (lens view) gets a label
    this.v = new THREE.Vector3(); this.s = { x: 0, y: 0 };
  }

  defs(b) {
    if (b._defs) return b._defs;
    const d = [];
    const A = (mesh, key, local, text, en, prio, min = 0) => d.push({ mesh, key, local, text, en, prio, min });
    if (b.isAnimal) { b.labelDefs(A); b._defs = d; return d; }
    A(b.cranium, 'frontal', [3.6, 8.2, 4.6], '颅骨', 'Skull', 1);
    A(b.cranium, 'orbit', [-3.25, -0.4, 7.6], '眼眶', 'Orbit', 3);
    A(b.cranium, 'zygomatic', [5.9, -3.0, 5.2], '颧骨', 'Zygomatic', 5);
    A(b.mandible, 'mandible', [-4.6, -10.6 - TMJ[1], 2.6 - TMJ[2]], '下颌骨', 'Mandible', 2);
    A(b.neck[3], 'C4', [0, 0, 0], '颈椎', 'Cervical spine', 4);
    const T = (key) => b.parts.find((m) => m.userData.key === key);
    A(T('clavicle_L'), 'clavicle_L', [9, 0.8, 4.4], '锁骨', 'Clavicle', 3);
    A(T('sternum'), 'sternum', [0, -11, 7.6], '胸骨', 'Sternum', 6);
    A(T('rib5_R'), 'rib5_R', [-12.0, -10.5, -1], '肋骨', 'Ribs', 2);
    A(T('L3'), 'L3', [0, 0, 1], '腰椎', 'Lumbar spine', 5);
    A(T('pelvis'), 'pelvis', [12.5, -40, -1], '骨盆', 'Pelvis', 4);
    A(T('heart'), 'heart', [3.6, -13, 6], '心脏', 'Heart', 1);
    A(T('lung_R'), 'lung_R', [-8, -6, 3], '肺', 'Lung', 3);
    A(T('liver'), 'liver', [-8, -26, 5], '肝脏', 'Liver', 5);
    A(T('stomach'), 'stomach', [7.4, -25, 3.5], '胃', 'Stomach', 6);
    A(T('intestine'), 'intestine', [3, -41, 4.5], '小肠', 'Small intestine', 7);
    for (const S of ['L', 'R']) {
      A(b.arm[S].humerus, 'humerus_' + S, [0, -14, 0], '肱骨', 'Humerus', 3);
      A(b.arm[S].radius, 'radius_' + S, [0, -13, 0], '桡骨', 'Radius', 4);
      A(b.arm[S].ulna, 'ulna_' + S, [0, -15, 0], '尺骨', 'Ulna', 5);
      A(b.leg[S].femur, 'femur_' + S, [2, -22, 0], '股骨', 'Femur', 3);
      A(b.leg[S].patella, 'patella_' + S, [0, 0, 0], '髌骨', 'Patella', 5);
      A(b.leg[S].tibia, 'tibia_' + S, [0, -18, 0], '胫骨', 'Tibia', 4);
    }
    b.hands.forEach((H) => {
      A(H.carpals.capitate, null, [0, 0, 0], '腕骨 ×8', 'Carpals', 2, 70);
      A(H.bones.meta_2, null, [0, 3.2, 0], '掌骨', 'Metacarpals', 3, 70);
      A(H.bones.prox_1, null, [0, 2.2, 0], '近节指骨', 'Proximal phalanx', 4, 90);
      A(H.bones.mid_3, null, [0, 1.3, 0], '中节指骨', 'Middle phalanx', 6, 110);
      A(H.bones.dist_2, null, [0, 0.9, 0], '远节指骨', 'Distal phalanx', 5, 90);
    });
    b._defs = d.filter((x) => x.mesh);
    return b._defs;
  }

  setPointer(x, y) { this.pointer = { x, y }; }
  clearPointer() { this.pointer = null; }

  pick() {
    let hit = null;
    if (this.pointer && !this.noHover && (!this.clip || this.clip(this.pointer.x, this.pointer.y, 1))) {
      this.stage.ndc(this.pointer.x, this.pointer.y, this.ndc);
      this.ray.setFromCamera(this.ndc, this.stage.camera);
      const vis = [];
      for (const b of this.bodies) for (const m of b.parts) if (m.visible) vis.push(m);
      const hits = this.ray.intersectObjects(vis, false);
      if (hits.length) hit = hits[0];
    }
    for (const b of this.bodies) for (const m of b.parts) m.userData.hiT = 0;
    if (!hit) { this.hover = null; return; }
    const m = hit.object;
    let key = m.userData.key, w = -1;
    const lp = m.worldToLocal(hit.point.clone());
    if (m.userData.baseKey === 'cranium') { key = skullRegion(lp.x, lp.y, lp.z); w = key === 'teeth' ? 2.2 : 3.4; }
    else if (m.userData.baseKey === 'mandible') { if (lp.y + TMJ[1] > -9.35 && lp.z + TMJ[2] > 2) { key = 'teeth'; w = 2.2; } }
    m.userData.hiT = 1;
    m.material.uniforms.uHiS.value.set(lp.x, lp.y, lp.z, w);
    this.hover = { key, info: describe(key, m.userData.body.kind) };
  }

  update(dt) {
    const stage = this.stage;
    this.frame++;
    if (this.frame % 2 === 0) this.pick();
    // ---- hover card ----
    const c = this.card;
    if (this.hover && this.pointer) {
      const i = this.hover.info;
      if (c.dataset.key !== this.hover.key + i.zh) {
        c.dataset.key = this.hover.key + i.zh;
        c.querySelector('.zh').textContent = i.zh;
        c.querySelector('.en').textContent = i.en;
        c.querySelector('.fact').textContent = i.fact;
      }
      const x = Math.min(stage.cw - 330, this.pointer.x + 22), y = Math.min(stage.ch - 170, Math.max(12, this.pointer.y + 18));
      c.style.transform = `translate(${Math.max(12, x)}px, ${y}px)`;
      c.classList.add('on');
    } else c.classList.remove('on');

    // ---- call-outs ----
    const chosen = [];
    if (this.enabled) {
      const ppu = stage.pxPerUnit();
      const active = this.bodies.filter((b) => Object.values(b.groups).some((g) => g.alpha > 0.5));
      const cap = active.length > 1 ? Math.ceil(18 / active.length) : 13;
      for (const b of active) {
        const mine = [];
        for (const d of this.defs(b)) {
          const m = d.mesh;
          if (!m.visible || m.material.uniforms.uAlpha.value < 0.6) continue;
          if (d.min) { const H = b.hands.find((h) => h.carpals.capitate === m || Object.values(h.bones).includes(m)); if (!H || H.hs * 9.5 * ppu < d.min) continue; }
          this.v.fromArray(d.local); m.localToWorld(this.v);
          stage.project(this.v, this.s);
          if (this.s.x < 30 || this.s.x > stage.cw - 30 || this.s.y < 40 || this.s.y > stage.ch - 110) continue;
          if (this.clip && !this.clip(this.s.x, this.s.y, 0.8)) continue;
          mine.push({ d, x: this.s.x, y: this.s.y });
        }
        if (!mine.length) continue;
        // this person's centre line decides which side each label sits on
        let cx;
        if (b.isAnimal) cx = mine.reduce((a, o) => a + o.x, 0) / mine.length;
        else if (b.groups.torso.alpha > 0.5) cx = stage.project(b.torso.getWorldPosition(this.v), this.s).x;
        else if (b.groups.head.alpha > 0.5) cx = stage.project(b.head.getWorldPosition(this.v), this.s).x;
        else cx = mine.reduce((a, o) => a + o.x, 0) / mine.length;
        mine.sort((a, c) => a.d.prio - c.d.prio);
        for (const o of mine.slice(0, cap)) {
          o.side = o.x >= cx ? 1 : -1;
          const reach = (active.length > 1 ? 46 : 70) + Math.min(120, Math.abs(o.x - cx) * 0.25);
          o.lx = Math.min(stage.cw - 150, Math.max(150, o.x + o.side * reach));
          chosen.push(o);
        }
      }
    }
    // stack labels that would collide
    chosen.sort((a, c) => a.y - c.y);
    const placed = [];
    for (const o of chosen) {
      let ly = o.y - 26;
      for (const q of placed) if (q.side === o.side && Math.abs(q.lx - o.lx) < 170 && ly < q.ly + 34 && ly > q.ly - 34) ly = q.ly + 34;
      o.ly = ly; placed.push(o);
    }
    const seen = new Set();
    for (const o of chosen) {
      let st = this.state.get(o.d);
      if (!st) {
        st = { el: this.makeLabel(o.d), x: o.lx, y: o.ly, a: 0 };
        this.state.set(o.d, st);
      }
      seen.add(o.d);
      // a label whose bone jumped far away (a person re-appeared elsewhere) restarts instead of sliding across
      if (Math.abs(o.lx - st.x) + Math.abs(o.ly - st.y) > 260) { st.x = o.lx; st.y = o.ly; st.a = 0; }
      const k = Math.min(1, dt * 9);
      st.x += (o.lx - st.x) * k; st.y += (o.ly - st.y) * k; st.a += (1 - st.a) * Math.min(1, dt * 6);
      st.ax = o.x; st.ay = o.y; st.side = o.side;
    }
    for (const [d, st] of this.state) {
      if (!seen.has(d)) { st.a -= dt * 5; if (st.a <= 0) { st.el.div.remove(); st.el.path.remove(); st.el.dot.remove(); this.state.delete(d); continue; } }
      const { div, path, dot } = st.el;
      div.style.opacity = st.a; path.style.opacity = st.a * 0.9; dot.style.opacity = st.a;
      div.style.transform = `translate(${st.x}px, ${st.y}px) translate(${st.side < 0 ? '-100%' : '0'}, -50%)`;
      div.classList.toggle('left', st.side < 0);
      const ex = st.x - st.side * 6, mx = st.ax + (ex - st.ax) * 0.45;
      path.setAttribute('d', `M${st.ax.toFixed(1)} ${st.ay.toFixed(1)} L${mx.toFixed(1)} ${st.y.toFixed(1)} L${ex.toFixed(1)} ${st.y.toFixed(1)}`);
      dot.setAttribute('cx', st.ax.toFixed(1)); dot.setAttribute('cy', st.ay.toFixed(1));
    }
  }

  makeLabel(d) {
    const div = document.createElement('div');
    div.className = 'callout';
    div.innerHTML = `<b></b><i></i>`;
    div.firstChild.textContent = d.text; div.lastChild.textContent = d.en;
    this.layer.appendChild(div);
    const path = document.createElementNS(SVGNS, 'path'); this.svg.appendChild(path);
    const dot = document.createElementNS(SVGNS, 'circle'); dot.setAttribute('r', 3); this.svg.appendChild(dot);
    return { div, path, dot };
  }
}
