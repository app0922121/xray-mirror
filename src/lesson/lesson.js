// Course mode · lesson 01 "X 光之手": a three-act lesson played on one hand.
// The lesson only decides which bones are lit and what the screen says; the hand
// itself is drawn by the same skeleton, shaders and styles as the showcase.
import * as THREE from 'three';
import { BONES, BONE, CARPALS, JOINTS, QUIZ, POSES, TEXT } from './hand-data.js';
import { analyse, newReading, matches, isOpen, synthHand, DemoHand } from './handmath.js';
import { makeFilm } from './film.js';

const $ = (s) => document.querySelector(s);
const _v = new THREE.Vector3(), _s = { x: 0, y: 0 };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const STYLE_NAME = ['X 光', '黏土 3D', '像素 HD-2D', 'ASCII'];
const FOLLOW = new Set(['scan', 'act1', 'act1done', 'act3intro', 'pose', 'final', 'count', 'shot']);
const SPECIMEN = new Set(['act2intro', 'quiz', 'act2done']);
const NEED_HAND = new Set(['act1', 'pose', 'final']);
const TEAL = [0.25, 1.0, 0.82], RED = [1.0, 0.36, 0.3];
const ACT1_SECS = 50, DWELL = 0.75;

export class HandLesson {
  constructor({ stage, body, labels, sound }) {
    this.stage = stage; this.body = body; this.labels = labels; this.sound = sound;
    this.rig = body.hands[0];
    this.mesh = {};
    for (const b of BONES) this.mesh[b.id] = b.id.startsWith('carpal_') ? this.rig.carpals[b.id.slice(7)] : this.rig.bones[b.id];
    this.r = newReading();
    this.sm = new Float32Array(15); this.mn = new Float32Array(15); this.mx = new Float32Array(15);
    this.spec = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.specQ = new Float32Array(15);
    this.out = { W: 1, H: 1, face: null, pose: null, hands: [] };
    this.handOut = { pts: null, label: 'R', rig: 0 };
    this.none = { W: 1, H: 1, face: null, pose: null, hands: [] };
    this.lit = new Set(); this.queue = []; this.pops = []; this.nums = [];
    this.cur = { x: -99, y: -99, on: false }; this.mouse = { x: 0, y: 0, t: -99 };
    this.focus = { k: 1, cx: 0, cy: 0, palm: 0 };
    this.st = 'off'; this.running = false; this.demo = null; this.label = 'R';
    this.el = {
      root: $('#lesson'), n: $('#l-n'), map: $('#l-map'), timer: $('#l-timer'), bk: $('#l-banner .k'), bt: $('#l-banner .t'),
      ca: $('#l-caption .a'), cb: $('#l-caption .b'), pose: $('#l-pose'), pops: $('#l-pops'), cursor: $('#l-cursor'),
      intro: $('#l-intro'), film: $('#l-film'), img: $('#l-film-img'), stats: $('#l-film-stats'), miss: $('#l-film-miss'),
    };
    this.buildMap();
    $('#l-skip').onclick = () => this.skip();
    $('#l-start').onclick = () => { this.sound.wake(); this.begin(); };
    $('#l-again').onclick = () => { this.sound.wake(); this.begin(); };
    $('#l-save').onclick = () => this.save();
    $('#l-back').onclick = $('#l-home').onclick = () => this.onExit && this.onExit();
  }

  // a little hand-shaped map of the 27 bones
  buildMap() {
    const map = this.el.map; this.dots = {};
    const dot = (id, col, row) => {
      const i = document.createElement('i'); i.style.gridColumn = col; i.style.gridRow = row; i.title = BONE[id].name;
      map.appendChild(i); this.dots[id] = i;
    };
    for (let f = 0; f < 5; f++) {
      dot('dist_' + f, f + 1, f === 0 ? 2 : 1);
      if (f > 0) dot('mid_' + f, f + 1, 2);
      dot('prox_' + f, f + 1, 3); dot('meta_' + f, f + 1, 4);
    }
    ['trapezium', 'trapezoid', 'capitate', 'hamate'].forEach((k, i) => dot('carpal_' + k, `${i + 1} / span 1`, 5));
    ['scaphoid', 'lunate', 'triquetrum', 'pisiform'].forEach((k, i) => dot('carpal_' + k, `${i + 1} / span 1`, 6));
  }

  // ---------------------------------------------------------------- entering / leaving
  open() {                                  // course mode chosen: show the lesson cover
    this.reset(); this.st = 'intro'; this.running = false;
    this.el.intro.classList.add('on'); this.el.film.classList.remove('on'); this.el.root.classList.add('hidden');
  }
  close() {
    this.reset(); this.st = 'off'; this.running = false;
    this.el.intro.classList.remove('on'); this.el.film.classList.remove('on'); this.el.root.classList.add('hidden');
  }
  reset() {
    for (const m of this.body.parts) { const d = m.userData; d.lit = 1; d.tint = 0; d.hot = 0; d.flash = 0; }
    this.lit.clear(); this.queue.length = 0;
    for (const id in this.dots) this.dots[id].className = '';
    for (const p of this.pops) p.el.remove(); this.pops.length = 0;
    for (const n of this.nums) n.el.remove(); this.nums.length = 0;
    this.el.n.textContent = '0'; this.el.timer.textContent = '';
    this.el.pose.classList.remove('on'); this.el.cursor.classList.remove('on');
    this.stage.setFocus(null); this.stage.dimT = 1;
    this.labels.noHover = false;
    this.focus.k = 1; this.focus.palm = 0;
    this.jdone = new Set(); this.hits = 0; this.poseHits = 0; this.missed = [];
    this.wantShot = false; this.shot = null;
  }
  begin() {
    this.reset();
    this.el.intro.classList.remove('on'); this.el.film.classList.remove('on'); this.el.root.classList.remove('hidden');
    for (const b of BONES) this.mesh[b.id].userData.lit = 0;
    for (const k of ['radius', 'ulna']) this.rig.stub[k].userData.lit = 0.3;
    this.running = true; this.t0 = performance.now(); this.seenFor = 0; this.lostFor = 0;
    this.go('wait');
  }

  say(k, t, a, b) {
    const E = this.el;
    if (k != null) E.bk.textContent = k;
    if (t != null) E.bt.innerHTML = t;
    if (a != null) E.ca.innerHTML = a;
    if (b != null) E.cb.textContent = b;
  }

  go(st) {
    this.st = st; this.stT = 0;
    const E = this.el;
    E.pose.classList.toggle('on', st === 'pose');
    E.cursor.classList.toggle('on', st === 'quiz');
    this.labels.noHover = SPECIMEN.has(st);
    if (SPECIMEN.has(st)) this.stage.setFocus(null);
    E.timer.textContent = '';
    switch (st) {
      case 'wait': this.say('准备', '把一只手举到镜头前', '手掌朝向屏幕，离镜头一臂远', ''); break;
      case 'scan': this.say('准备', '正在扫描你的手…', '别动，马上就好', ''); break;
      case 'act1':
        this.say('第一幕 · 显影', '哪个关节动了，它两头的骨头就亮起来', '弯弯手指、握握拳、动动拇指', '一只手通常有 27 块骨头');
        this.stage.flash = 0.5; this.hinted = -1; this.doneT = 0; break;
      case 'act1done':
        this.say(`${this.lit.size} / 27`, '亮起 20 块，还差手腕里的 7 块', TEXT.total, TEXT.both);
        for (const b of BONES) if (!b.id.startsWith('carpal_')) this.mesh[b.id].userData.tint = 0;
        this.sound.good(); break;
      case 'act2intro':
        this.say('第二幕 · 腕骨点名', '用食指指尖，把它们一块块点出来', TEXT.carpalIntro, '');
        this.stage.flash = 0.45; this.placeSpecimen(); break;
      case 'quiz': this.ask(0); break;
      case 'act2done':
        this.say('腕骨点名完成', `认出了 <em>${this.hits}</em> / ${QUIZ.length} 块`, TEXT.rhyme, '');
        this.sound.good(); break;
      case 'act3intro':
        this.say('第三幕 · 骨头手势', '摆对了，这几根手指的骨头会变色', '', '');
        this.stage.flash = 0.45; break;
      case 'pose': this.askPose(0); break;
      case 'final': this.say('最后 · 拍一张片子', '把手张开，对着镜头', '保持别动', ''); this.hold = 0; break;
      case 'count':
        this.say('最后 · 拍一张片子', '数一数：27 块', TEXT.total, TEXT.both); this.counted = 0; break;
      case 'shot':
        for (const n of this.nums) n.el.remove(); this.nums.length = 0;
        this.wantShot = true; break;
    }
  }

  skip() {
    const s = this.st;
    if (s === 'wait' || s === 'scan') this.go('act1');
    else if (s === 'act1') { for (const b of BONES) if (!QUIZ.includes(b.id.slice(7))) this.light(b.id, true); this.queue.length = 0; this.go('act1done'); }
    else if (s === 'act1done') this.go('act2intro');
    else if (s === 'act2intro') this.go('quiz');
    else if (s === 'quiz') { if (this.qState === 'ask') this.reveal(); else this.nextQuiz(); }
    else if (s === 'act2done') this.go('act3intro');
    else if (s === 'act3intro') this.go('pose');
    else if (s === 'pose') this.nextPose();
    else if (s === 'final') this.go('count');
    else if (s === 'count') this.go('shot');
  }

  // ---------------------------------------------------------------- bones lighting up
  light(id, quiet) {
    if (this.lit.has(id)) return;
    this.lit.add(id);
    const d = this.mesh[id].userData; d.lit = 1; d.tint = 0; d.flash = 1;
    this.dots[id].className = 'on';
    this.el.n.textContent = this.lit.size;
    if (!quiet) { this.sound.tick(this.lit.size); this.pop(id); }
  }
  screenOf(id, out) {
    const m = this.mesh[id];
    _v.copy(m.geometry.boundingSphere.center); m.localToWorld(_v);
    return this.stage.project(_v, out);
  }
  pop(id) {
    const el = document.createElement('div'); el.className = 'l-pop';
    el.innerHTML = '<b></b><i></i>'; el.firstChild.textContent = BONE[id].name; el.lastChild.textContent = BONE[id].note;
    this.el.pops.appendChild(el);
    this.pops.push({ el, id, age: 0 });
    while (this.pops.length > 4) this.pops.shift().el.remove();
  }

  // ---------------------------------------------------------------- act 2: the wrist on the light box
  placeSpecimen() {
    const b = this.stage.base, p = b.vh / 18;              // the view is about 18 cm tall
    const u = new THREE.Vector3(this.label === 'R' ? 1 : -1, 0, 0);
    _v.set(b.ox + b.vw / 2 - u.x * 0.4 * p, b.oy + b.vh * 0.36, 0);
    synthHand(this.spec, _v, u, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), p, this.specQ);
  }
  ask(i) {
    this.qi = i; this.qT = 0; this.wrong = 0; this.dwell = 0; this.dwellOn = null; this.qState = 'ask'; this.hintOn = false;
    this.block = this.lastHover || null;       // the pointer must leave the bone it is resting on before that bone can be picked
    const c = CARPALS[QUIZ[i]];
    this.say(`腕骨点名 ${i + 1} / ${QUIZ.length}`, `找到：<em>${c.name}</em>`, '把食指移到骨头上，停一下就算选中', '伸出食指，或者用鼠标');
  }
  nextQuiz() {
    for (const k in CARPALS) { const d = this.mesh['carpal_' + k].userData; d.tint = 0; d.hot = 0; }
    if (this.qi + 1 < QUIZ.length) this.ask(this.qi + 1); else this.go('act2done');
  }
  correct() {
    const k = QUIZ[this.qi];
    this.hits++; this.light('carpal_' + k); this.sound.good();
    this.say(null, `✓ <em>${CARPALS[k].name}</em>`, CARPALS[k].note, '');
    this.qState = 'done'; this.qT = 0;
  }
  reveal() {
    const k = QUIZ[this.qi];
    this.missed.push(CARPALS[k].name);
    const d = this.mesh['carpal_' + k].userData; d.tintC = TEAL; d.tint = 1;
    this.light('carpal_' + k);
    this.say(null, `它在这里：<em>${CARPALS[k].name}</em>`, CARPALS[k].note, '');
    this.qState = 'done'; this.qT = -0.6;
  }
  stepQuiz(dt, demo) {
    const cur = this.cur, tgt = 'carpal_' + QUIZ[this.qi];
    // where the pointer is: the mouse if it moved lately, else the index fingertip
    if (demo) {
      this.screenOf(tgt, _s);
      if (this.qState === 'ask' && this.qT > 0.7) { const k = Math.min(1, dt * 4); cur.x += (_s.x - cur.x) * k; cur.y += (_s.y - cur.y) * k; }
      if (!cur.on) { cur.x = this.stage.cw * 0.5; cur.y = this.stage.ch * 0.3; }
      cur.on = true;
    } else if (this.now - this.mouse.t < 2.5) { cur.x = this.mouse.x; cur.y = this.mouse.y; cur.on = true; }
    else if (this.hand) { this.stage.project(this.hand.pts[8], _s); cur.x = _s.x; cur.y = _s.y; cur.on = true; }
    else cur.on = false;
    // which carpal is under it
    // (distance measured in units of each bone's own size, so the little pisiform is not swallowed by its neighbour)
    let hover = null, best = 1.25;
    const cm = this.stage.pxPerUnit() * this.rig.hs;
    if (cur.on) for (const k in CARPALS) {
      this.screenOf('carpal_' + k, _s);
      const d = Math.hypot(_s.x - cur.x, _s.y - cur.y) / (cm * this.mesh['carpal_' + k].geometry.boundingSphere.radius);
      if (d < best) { best = d; hover = k; }
    }
    this.lastHover = hover;
    for (const k in CARPALS) this.mesh['carpal_' + k].userData.hot = this.qState === 'ask' && k === hover ? 1 : 0;
    this.qT += dt;
    if (this.qState === 'ask') {
      if (hover !== this.block) this.block = null;
      if (demo && hover !== QUIZ[this.qi]) hover = null;       // the demo never hesitates on the way
      if (hover && hover === this.dwellOn && hover !== this.block) this.dwell += dt; else { this.dwellOn = hover; this.dwell = 0; }
      if (this.dwell >= DWELL) {
        this.dwell = 0;
        if (hover === QUIZ[this.qi]) this.correct();
        else if (this.lit.has('carpal_' + hover)) { this.block = hover; this.say(null, null, `这块已经认过了：${CARPALS[hover].name}`, ''); }
        else {
          this.wrong++; this.block = hover; this.sound.bad();
          this.mesh['carpal_' + hover].userData.flash = 1;
          if (this.wrong >= 2) this.reveal();
          else this.say(null, null, `这是${CARPALS[hover].name}，再找找：${CARPALS[QUIZ[this.qi]].where}`, '');
        }
      } else if (this.qT > 7 && !this.wrong && !this.hintOn) { this.hintOn = true; this.say(null, null, `提示：${CARPALS[QUIZ[this.qi]].where}`, ''); }
      if (this.qState === 'ask' && this.qT > 18) this.reveal();
    } else if (this.qT > 1.9) { this.hintOn = false; this.nextQuiz(); }
    else this.dwell = 0;
    // the ring
    const c = this.el.cursor;
    c.classList.toggle('on', cur.on);
    c.style.transform = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px)`;
    c.style.setProperty('--p', clamp(this.dwell / DWELL, 0, 1));
  }

  // ---------------------------------------------------------------- act 3: gestures
  askPose(i) {
    this.pi = i; this.pT = 0; this.hold = 0; this.pState = 'ask';
    const P = POSES[i], E = this.el.pose;
    E.querySelector('.e').textContent = P.emoji; E.querySelector('.nm').textContent = P.name; E.querySelector('.i').textContent = `${i + 1} / ${POSES.length}`;
    this.say('第三幕 · 骨头手势', `摆出「<em>${P.name}</em>」`, '', '');
  }
  fingerBones(f) { return f === 0 ? ['meta_0', 'prox_0', 'dist_0'] : ['meta_' + f, 'prox_' + f, 'mid_' + f, 'dist_' + f]; }
  nextPose() {
    for (const b of BONES) this.mesh[b.id].userData.tint = 0;
    if (this.pi + 1 < POSES.length) this.askPose(this.pi + 1); else this.go('final');
  }
  stepPose(dt) {
    const P = POSES[this.pi];
    this.pT += dt;
    if (this.pState === 'ask') {
      this.hold = matches(this.r, P) ? this.hold + dt : Math.max(0, this.hold - dt * 2);
      if (this.hold >= 0.55) {
        this.poseHits++; this.pState = 'done'; this.pT = 0; this.sound.good();
        for (const f of P.show) for (const id of this.fingerBones(f)) { const d = this.mesh[id].userData; d.tintC = TEAL; d.tint = 1; d.flash = 0.7; }
        this.say(null, `✓ <em>${P.name}</em>`, P.fact, '');
      } else if (this.pT > 14) { this.pState = 'skip'; this.pT = 0; this.say(null, null, '没关系，下一个', ''); }
    } else if (this.pT > (this.pState === 'done' ? 3.6 : 1.4)) this.nextPose();
    this.el.pose.style.setProperty('--p', this.pState === 'done' ? 1 : clamp(this.hold / 0.55, 0, 1));
  }

  // ---------------------------------------------------------------- per frame
  pick(hands) {
    if (!hands || !hands.length) return null;
    let best = hands.find((h) => h.slot === this.slot);
    if (!best) { let s = 0; for (const h of hands) { const p = h.pts[9].distanceTo(h.pts[0]); if (p > s) { s = p; best = h; } } }
    this.slot = best.slot;
    return best;
  }
  want() {
    const s = this.st;
    if (s === 'act1') return { kind: 'wiggle', t: Math.max(0, this.stT - 1.2) };
    if (s === 'pose') return { kind: 'pose', pose: POSES[this.pi], t: this.pState === 'ask' ? this.pT : 9 };
    return { kind: 'open', t: this.stT };
  }

  // hands: the tracked hands of this frame (ignored in the demo). Returns what skeleton 0 should draw.
  update(hands, time, dt, demo) {
    const stage = this.stage, st = this.st;
    this.now = time;
    if (demo && !this.demo) this.demo = new DemoHand(stage.W, stage.H);
    const hand = this.hand = demo ? this.demo.frame(time, dt, this.want()) : this.pick(hands);
    if (hand) { analyse(hand.pts, this.r); this.label = hand.label; this.seenFor += dt; this.lostFor = 0; }
    else { this.seenFor = 0; this.lostFor += dt; }
    const lost = NEED_HAND.has(st) && this.lostFor > 0.8;
    this.el.root.classList.toggle('lost', lost);
    if (!lost) this.stT += dt;

    // bones that were queued light one after another
    if (this.queue.length && (this.qGap = (this.qGap || 0) - dt) <= 0) { this.light(this.queue.shift()); this.qGap = 0.11; }

    if (!lost) switch (st) {
      case 'wait': if (this.seenFor > 0.5) this.go('scan'); break;
      case 'scan': if (this.stT > 1.7) this.go('act1'); break;
      case 'act1': this.stepAct1(dt); break;
      case 'act1done': if (this.stT > 4.6) this.go('act2intro'); break;
      case 'act2intro': if (this.stT > 6) this.go('quiz'); break;
      case 'quiz': this.stepQuiz(dt, demo); break;
      case 'act2done': if (this.stT > 3.4) this.go('act3intro'); break;
      case 'act3intro': if (this.stT > 2.6) this.go('pose'); break;
      case 'pose': this.stepPose(dt); break;
      case 'final':
        this.hold = hand && isOpen(this.r) ? this.hold + dt : 0;
        if (this.hold > 0.8 || this.stT > 7) this.go('count');
        break;
      case 'count': {
        const n = Math.min(27, Math.floor(this.stT / 0.11));
        while (this.counted < n) {
          const el = document.createElement('div'); el.className = 'l-num'; el.textContent = this.counted + 1;
          this.el.pops.appendChild(el); this.nums.push({ el, id: BONES[this.counted].id });
          this.mesh[BONES[this.counted].id].userData.flash = 0.8; this.sound.tick(this.counted);
          this.counted++;
        }
        if (this.stT > 27 * 0.11 + 1.6) this.go('shot');
        break;
      }
      case 'shot': if (this.stT > 0.9 && !this.wantShot) this.finish(); break;
    }

    // on the light box the wrist is the subject: fingers step back, unnamed carpals stay faint
    const spec = SPECIMEN.has(this.st);
    stage.dimT = spec ? (stage.style === 1 ? 0.62 : 0.3) : 1;      // the live picture steps back too
    for (const b of BONES) {
      const on = this.lit.has(b.id);
      this.mesh[b.id].userData.lit = spec ? (b.id.startsWith('carpal_') ? (on ? 1 : 0.12) : 0.4) : on ? 1 : 0;
    }
    for (const k of ['radius', 'ulna']) this.rig.stub[k].userData.lit = spec ? 0.12 : 0.3;

    // camera: close in on the hand, gently
    if (FOLLOW.has(this.st) && hand) {
      const P = hand.pts, F = this.focus, b = stage.base;
      const palm = P[9].distanceTo(P[0]);
      const a = 1 - Math.exp(-dt * 1.6);
      F.palm = F.palm ? F.palm + (palm - F.palm) * a : palm;
      const cx = P[0].x + (P[9].x - P[0].x) * 0.9, cy = P[0].y + (P[9].y - P[0].y) * 0.9;
      if (F.k === 1 && !this.focused) { F.cx = cx; F.cy = cy; }
      F.cx += (cx - F.cx) * a * 1.6; F.cy += (cy - F.cy) * a * 1.6;
      F.k = clamp((0.29 * b.vh) / Math.max(F.palm, 1), 1, 2.4);
      this.focused = true;
      stage.setFocus(F);
    } else if (!FOLLOW.has(this.st)) { stage.setFocus(null); this.focused = false; }

    // what the skeleton draws: the live hand, or the specimen on the light box
    const o = this.out; o.W = stage.W; o.H = stage.H; o.hands.length = 0;
    const src = SPECIMEN.has(this.st) ? { pts: this.spec, label: this.label } : hand;
    if (src) { this.handOut.pts = src.pts; this.handOut.label = src.label; o.hands.push(this.handOut); }
    this.none.W = stage.W; this.none.H = stage.H;
    return o;
  }

  stepAct1(dt) {
    const A = this.r.ang, sm = this.sm, mn = this.mn, mx = this.mx;
    if (this.stT < 0.6) for (let i = 0; i < 15; i++) sm[i] = mn[i] = mx[i] = A[i];
    else if (this.hand) for (let i = 0; i < 15; i++) {
      sm[i] += (A[i] - sm[i]) * Math.min(1, dt * 9);
      if (sm[i] < mn[i]) mn[i] = sm[i]; if (sm[i] > mx[i]) mx[i] = sm[i];
    }
    for (const j of JOINTS) if (!this.jdone.has(j.i) && mx[j.i] - mn[j.i] > j.thr) {
      this.jdone.add(j.i);
      for (const id of j.bones) if (!this.lit.has(id) && !this.queue.includes(id)) this.queue.push(id);
    }
    const left = ACT1_SECS - this.stT, todo = 20 - this.lit.size - this.queue.length;
    this.el.timer.textContent = todo > 0 ? `剩余 ${Math.max(0, Math.ceil(left))} 秒` : '';
    if (this.stT > 16 && todo > 0 && todo <= 12) {
      // point out the stragglers
      for (const b of BONES) if (!this.lit.has(b.id) && !QUIZ.includes(b.id.slice(7))) { const d = this.mesh[b.id].userData; d.tintC = RED; d.tint = 0.85; }
      if (this.hinted !== todo) { this.hinted = todo; this.say(null, null, `还有 ${todo} 块没亮`, '红色的那几块：把那根手指的每一节都弯一弯'); }
    }
    if (left <= 0 && todo > 0) for (const b of BONES) if (!QUIZ.includes(b.id.slice(7)) && !this.lit.has(b.id) && !this.queue.includes(b.id)) this.queue.push(b.id);
    if (this.lit.size >= 20 && !this.queue.length) { this.doneT = (this.doneT || 0) + dt; if (this.doneT > 0.9) { this.doneT = 0; this.go('act1done'); } }
  }

  // after the scene matrices are up to date: place the floating labels
  draw(dt) {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.age += dt;
      if (p.age > 2.1) { p.el.remove(); this.pops.splice(i, 1); continue; }
      this.screenOf(p.id, _s);
      p.x = _s.x + 18; p.y = _s.y - 12;
      p.el.style.opacity = clamp(Math.min(p.age * 6, (2.1 - p.age) * 2.5), 0, 1);
    }
    // labels that would sit on top of each other are stacked
    const live = this.pops.slice().sort((a, b) => a.y - b.y);
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      for (let j = 0; j < i; j++) if (Math.abs(live[j].x - p.x) < 200 && p.y < live[j].y + 42) p.y = live[j].y + 42;
      p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
    for (const n of this.nums) {
      this.screenOf(n.id, _s);
      n.el.style.transform = `translate(${_s.x.toFixed(1)}px, ${_s.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  // right after the frame was drawn: copy the hand out of the canvas for the film card
  afterRender() {
    if (!this.wantShot) return;
    this.wantShot = false;
    const stage = this.stage, cv = stage.canvas, dpr = cv.width / stage.cw;
    let cx = stage.cw / 2, cy = stage.ch / 2, side = Math.min(stage.cw, stage.ch) * 0.9;
    if (this.hand) {
      const P = this.hand.pts;
      _v.copy(P[0]).lerp(P[9], 0.9); stage.project(_v, _s);
      cx = _s.x; cy = _s.y;
      side = clamp(P[9].distanceTo(P[0]) * stage.pxPerUnit() * 3.1, 240, Math.min(stage.cw, stage.ch));
    }
    const x0 = clamp(cx - side / 2, 0, stage.cw - side), y0 = clamp(cy - side / 2, 0, stage.ch - side);
    const c = document.createElement('canvas'); c.width = c.height = 972;
    c.getContext('2d').drawImage(cv, x0 * dpr, y0 * dpr, side * dpr, side * dpr, 0, 0, 972, 972);
    this.shot = c;
    stage.flash = 1.2; this.sound.shutter();
  }
  finish() {
    const secs = Math.round((performance.now() - this.t0) / 1000);
    const stats = { carpal: this.hits, carpalN: QUIZ.length, poses: this.poseHits, posesN: POSES.length, secs, style: `风格：${STYLE_NAME[this.stage.style]}` };
    this.card = makeFilm(this.shot, stats);
    this.el.img.src = this.card.toDataURL('image/png');
    this.el.stats.innerHTML = `腕骨点名 <b>${stats.carpal}/${stats.carpalN}</b>　骨头手势 <b>${stats.poses}/${stats.posesN}</b>　用时 <b>${secs}</b> 秒`;
    this.el.miss.textContent = this.missed.length ? `下次再认认：${this.missed.join('、')}` : TEXT.rhyme;
    this.st = 'film'; this.stT = 0;
    this.el.film.classList.add('on'); this.el.root.classList.add('hidden');
    this.stage.setFocus(null);
  }
  save() {
    if (!this.card) return;
    this.card.toBlob((b) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'X光之手.png';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }
  pointer(x, y) { this.mouse.x = x; this.mouse.y = y; this.mouse.t = this.now || 0; }
}
