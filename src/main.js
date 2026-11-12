import * as THREE from 'three';
THREE.ColorManagement.enabled = false;

import { Body } from './rig.js';
import { Stage } from './render.js';
import { Labels } from './labels.js';
import { Demo } from './demo.js';
import { STYLES } from './materials.js';
import { Crowd } from './people.js';
import { Quadruped } from './animalrig.js';
import { buildQuadruped } from './models/quadruped.js';
import { HandLesson } from './lesson/lesson.js';
import { Sound } from './lesson/film.js';
import { Lens } from './lens.js';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const canvas = $('#stage'), video = $('#cam');
const stage = new Stage(canvas);
stage.contain = q.get('fit') === 'contain';
if (q.get('zoom')) stage.debugView = { k: +q.get('zoom'), cx: +(q.get('cx') || 640), cy: +(q.get('cy') || 360) };
const MAX = 3;                               // up to three people at once
const bodies = Array.from({ length: MAX }, () => new Body());
const body = bodies[0];
const scene = new THREE.Scene(); for (const b of bodies) scene.add(b.root);
const labels = new Labels(stage, bodies, { card: $('#card'), layer: $('#labels'), svg: $('#leaders') });
const demo = new Demo();
const crowd = new Crowd(MAX);
const quads = [new Quadruped(), new Quadruped()];     // up to two cats / dogs
for (const qd of quads) { scene.add(qd.root); labels.bodies.push(qd); }
let people = Math.min(MAX, Math.max(1, +q.get('people') || MAX));
let tracker = null, trackerReady = null;
let animalTracker = null, animalsReady = null, animalsOn = true, animals = [];
let mode = 'idle', image = null, lastVT = -1, frame = null;
// 'show' = the free-play mirror (default); 'lesson' = course mode
let appMode = q.get('mode') === 'lesson' ? 'lesson' : 'show', lesson = null;
const sound = new Sound();
// how the picture is seen (inside showcase mode): 'full' = everyone, 'lens' = a round lens that follows your palm
let view = q.get('view') === 'lens' ? 'lens' : 'full';
const lens = new Lens(stage);
window.__app = { stage, body, bodies, crowd, labels, get tracker() { return tracker; }, get animalTracker() { return animalTracker; }, get animals() { return animals; }, get frame() { return frame; }, get mode() { return mode; }, get lesson() { return lesson; }, lens };

// ---------------------------------------------------------------- boot
const status = $('#status'), bar = $('#bar');
const steps = ['颅骨', '脊柱与肋骨', '心脏、肺与内脏', '四肢长骨', '手骨 27 × 2'];
async function boot() {
  const t0 = performance.now();
  await body.build((name) => {
    status.textContent = `正在用代码生成 · ${name}`;
    bar.style.width = `${((steps.indexOf(name) + 1) / (steps.length + 1)) * 100}%`;
  });
  // the other skeletons reuse the same geometry, so extra people cost no modelling time
  for (let i = 1; i < MAX; i++) await bodies[i].build(() => {}, body);
  status.textContent = '正在用代码生成 · 猫与狗的骨骼';
  await new Promise((r) => setTimeout(r, 0));
  const Q = buildQuadruped();
  quads.forEach((qd, i) => { qd.buildAnimal(body.geos, Q); qd.root.position.z = 5200 + i * 900; });
  lesson = new HandLesson({ stage, body, labels, sound });
  lesson.onExit = () => setAppMode('show');
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  $('#tris').textContent = (body.stats.tris / 1e4).toFixed(1) + ' 万';
  bar.style.width = '100%';
  status.textContent = `${body.stats.meshes} 个模型 · ${(body.stats.tris / 1e4).toFixed(1)} 万三角面 · 生成用时 ${secs} 秒`;
  $('#go').disabled = false; $('#demo').disabled = false;
  if (q.has('demo')) start('demo');
  else if (q.get('img')) start('image');
  else if (q.get('fakecam')) start('camera');
}

function loadTracker() {
  if (!trackerReady) {
    trackerReady = import('./tracker.js').then(async ({ Tracker }) => {
      const t = new Tracker();
      await t.init((m) => { $('#status2').textContent = m + '…'; }, people);
      $('#status2').textContent = '视觉追踪模型已就绪';
      tracker = t;
      if (t.people !== people) t.setPeople(people);
    });
  }
  return trackerReady;
}

// cats and dogs: a second, heavier model pair, loaded in the background once tracking is up
function loadAnimals() {
  if (!animalsReady) {
    animalsReady = loadTracker().then(async () => {
      const { AnimalTracker } = await import('./animals.js');
      const a = new AnimalTracker();
      await a.init(tracker.fileset);
      animalTracker = a;
    }).catch((e) => console.warn('animal tracking unavailable', e));
  }
  return animalsReady;
}

async function start(kind) {
  const go = $('#go');
  sound.wake();
  try {
    if (kind === 'camera') {
      go.disabled = true; go.textContent = '正在连接…';
      const stream = q.get('fakecam') ? await fakeCamera(q.get('fakecam'))
        : await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      video.srcObject = stream;
      await video.play();
      await loadTracker();
      stage.setSource(video, video.videoWidth, video.videoHeight);
    } else if (kind === 'image') {
      await loadTracker();
      image = new Image(); image.src = q.get('img');
      await image.decode();
      stage.setSource(image, image.naturalWidth, image.naturalHeight);
    } else {
      if (!q.get('people')) setPeople(1);
      stage.setSource(null, demo.W, demo.H);
    }
  } catch (e) {
    console.error(e);
    go.disabled = false; go.textContent = '开启摄像头';
    $('#status2').textContent = kind === 'camera' ? '没能打开摄像头（请在浏览器里允许访问），也可以先看演示。' : '加载失败：' + e.message;
    return;
  }
  mode = kind;
  setAppMode(appMode);
  if (kind !== 'demo' && animalsOn) loadAnimals();
  if (q.has('demo') || q.get('img') || q.get('fakecam')) $('#start').style.transition = 'none';
  $('#start').classList.add('gone');
  for (const id of ['#hud', '#dock', '#hint']) $(id).classList.remove('hidden');
  setTimeout(() => $('#hint').classList.add('hidden'), 9000);
}
$('#go').onclick = () => start('camera');

// test hook (?fakecam=photo.jpg): a slowly drifting photo served as a live video stream,
// so the whole camera path can be exercised where no real camera is available
async function fakeCamera(src) {
  const imgs = await Promise.all(src.split(',').map(async (u) => { const im = new Image(); im.src = u; await im.decode(); return im; }));
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
  const cx = cv.getContext('2d');
  const cw = 1280 / imgs.length;
  const draw = () => {
    const t = performance.now() / 1000;
    cx.fillStyle = '#223'; cx.fillRect(0, 0, 1280, 720);
    imgs.forEach((img, i) => {
      const sc = Math.max(cw / img.naturalWidth, 720 / img.naturalHeight) * 1.08;
      cx.save(); cx.beginPath(); cx.rect(i * cw, 0, cw, 720); cx.clip();
      cx.translate(cw * (i + 0.5) + 14 * Math.sin(t * 0.8 + i * 2), 360 + 10 * Math.sin(t * 1.3 + i)); cx.rotate(0.04 * Math.sin(t * 0.6 + i));
      cx.drawImage(img, -img.naturalWidth * sc / 2, -img.naturalHeight * sc * (+q.get('fy') || 0.3), img.naturalWidth * sc, img.naturalHeight * sc);
      cx.restore();
    });
  };
  draw(); setInterval(draw, 33);
  return cv.captureStream(30);
}
$('#demo').onclick = () => start('demo');

// ---------------------------------------------------------------- controls
function setStyle(i) {
  stage.style = i; for (const b of [...bodies, ...quads]) b.setStyle(i); stage.flash = 0.3;
  document.body.dataset.style = STYLES[i];
  const c = getComputedStyle(document.body).getPropertyValue('--accent').trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) stage.U.uLensC.value.set(...[1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16) / 255));
  document.querySelectorAll('#styles button').forEach((b) => b.classList.toggle('on', +b.dataset.s === i));
}
document.querySelectorAll('#styles button').forEach((b) => (b.onclick = () => setStyle(+b.dataset.s)));
const toggle = (id, fn) => { const el = $(id); el.onclick = () => { el.classList.toggle('on'); fn(el.classList.contains('on')); }; return el; };
const layerT = { bone: 1, organ: 1 };
const tb = toggle('#t-bone', (on) => (layerT.bone = on ? 1 : 0));
const to = toggle('#t-organ', (on) => (layerT.organ = on ? 1 : 0));
const tl = toggle('#t-label', (on) => (labels.enabled = on));
const tm = toggle('#t-mirror', (on) => (stage.mirror = on));
const ta = toggle('#t-animal', (on) => { animalsOn = on; if (on && mode !== 'idle' && mode !== 'demo') loadAnimals(); if (!on) animals = []; });
toggle('#t-sound', (on) => (sound.on = on));
$('#real').oninput = (e) => (stage.real = e.target.value / 100);
// showcase <-> course mode
function setAppMode(m) {
  appMode = m; document.body.dataset.mode = m;
  document.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  if (!lesson || mode === 'idle') return;
  if (m === 'lesson') { labels.enabled = false; lesson.open(); if (q.get('lesson') === 'auto') lesson.begin(); }
  else { lesson.close(); labels.enabled = tl.classList.contains('on'); }
}
document.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => setAppMode(b.dataset.m)));
setAppMode(appMode);
// full picture <-> lens (a viewing option of showcase mode, like the four styles)
let hintT = 0;
function setView(v) {
  view = v; document.body.dataset.view = v;
  document.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  labels.clip = v === 'lens' ? (x, y, pad) => lens.contains(x, y, pad) : null;
  if (v === 'lens' && mode !== 'idle') {
    const h = $('#hint'); h.textContent = '张开手掌对着镜头，它就是你的透镜；也可以移动鼠标';
    h.classList.remove('hidden'); clearTimeout(hintT); hintT = setTimeout(() => h.classList.add('hidden'), 6000);
  }
}
document.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => setView(b.dataset.v)));
setView(view);
function setPeople(n) {
  people = n;
  document.querySelectorAll('#people button').forEach((b) => b.classList.toggle('on', +b.dataset.n === n));
  if (tracker) tracker.setPeople(n).catch((e) => console.warn(e));
}
document.querySelectorAll('#people button').forEach((b) => (b.onclick = () => setPeople(+b.dataset.n)));
setPeople(people);
addEventListener('keydown', (e) => {
  if (appMode === 'lesson') { if (e.key === 'Escape') setAppMode('show'); if ('bolpa'.includes(e.key)) return; }
  if (e.key >= '1' && e.key <= '4') setStyle(+e.key - 1);
  else if (e.key === 'b') tb.click(); else if (e.key === 'o') to.click();
  else if (e.key === 'l') tl.click(); else if (e.key === 'm') tm.click();
  else if (e.key === 'p') setPeople((people % MAX) + 1);
  else if (e.key === 'a') ta.click();
  else if (e.key === 'v') setView(view === 'lens' ? 'full' : 'lens');
  else if (e.key === 'f') document.documentElement.requestFullscreen?.();
});
addEventListener('resize', () => stage.resize());
new ResizeObserver(() => { if (canvas.clientWidth !== stage.cw || canvas.clientHeight !== stage.ch) stage.resize(); }).observe(canvas);
canvas.addEventListener('pointermove', (e) => { labels.setPointer(e.clientX, e.clientY); lens.pointer(e.clientX, e.clientY, performance.now() / 1000); if (lesson) lesson.pointer(e.clientX, e.clientY); });
canvas.addEventListener('pointerleave', () => labels.clearPointer());
if (q.get('style')) setStyle(+q.get('style'));
if (q.has('nolabels')) tl.click();
if (q.has('noanimals')) ta.click();
if (q.get('layers') === 'organ') tb.click();
if (q.get('layers') === 'bone') to.click();

// debug (?akp=1): draw the raw animal keypoints with their index numbers
const dbg = q.has('akp') ? document.body.appendChild(Object.assign(document.createElement('canvas'), { style: 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:3' })) : null;
function drawKeypoints() {
  const c = dbg.getContext('2d'), o = { x: 0, y: 0 };
  dbg.width = stage.cw; dbg.height = stage.ch;
  c.font = '11px monospace';
  for (const a of animals) a.pts.forEach((p, i) => {
    stage.project(p, o);
    c.fillStyle = a.score[i] > 0.4 ? '#ffe14d' : '#ff4d6a';
    c.beginPath(); c.arc(o.x, o.y, 4, 0, 7); c.fill();
    c.fillText(i + ':' + a.score[i].toFixed(1), o.x + 6, o.y - 4);
  });
  if (animalTracker) { c.fillStyle = '#fff'; c.fillText(`animals ${animals.map((a) => a.kind).join(',')} | ${animalTracker.ep} ${animalTracker.ms.toFixed(0)}ms | tracks ${animalTracker.tracks.length}`, 12, stage.ch - 100); }
}

// ---------------------------------------------------------------- loop
const chips = { face: $('#c-face'), hand: $('#c-hand'), body: $('#c-body'), animal: $('#c-animal') };
let last = performance.now(), fpsT = 0, fpsN = 0, emptyFor = 0, lost = false;
const freeze = q.get('t');
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const t = freeze ? +freeze : now / 1000;
  const inLesson = !!lesson && lesson.running;
  if (tracker) tracker.handsOnly = inLesson;
  if (mode === 'camera' && tracker) {
    if (video.readyState >= 2 && video.currentTime !== lastVT) {
      lastVT = video.currentTime; frame = tracker.detect(video, video.videoWidth, video.videoHeight, now);
      animals = animalTracker && animalsOn && !inLesson ? animalTracker.update(video, video.videoWidth, video.videoHeight, now) : [];
    }
  } else if (mode === 'image' && tracker) {
    frame = tracker.detect(image, image.naturalWidth, image.naturalHeight, now);
    animals = animalTracker && animalsOn && !inLesson ? animalTracker.update(image, image.naturalWidth, image.naturalHeight, now) : [];
  } else if (mode === 'demo') frame = demo.frame(t, people);
  if (inLesson) {
    // course mode: the lesson decides what skeleton 0 draws (one hand); everyone else steps aside
    const lf = lesson.update(frame ? frame.hands : null, t, dt, mode === 'demo');
    for (let i = 0; i < MAX; i++) {
      const b = bodies[i];
      b.layers.bone = 1; b.size = 0; b.root.position.z = 0;
      b.update(i === 0 ? lf : lesson.none, t, dt);
    }
    animals = [];
  } else if (frame) {
    // the human face / pose models sometimes fire on a pet's face: drop anything sitting on an animal's head
    if (animals.length && mode !== 'demo') {
      const heads = [];
      for (const a of animals) if (a.score[0] > 0.35 && a.score[1] > 0.35) {
        const e0 = a.pts[0], e1 = a.pts[1], n = a.pts[2];
        heads.push({ x: (e0.x + e1.x) / 2, y: (e0.y + e1.y) / 2, r: Math.max(Math.hypot(e0.x - e1.x, e0.y - e1.y), Math.hypot(n.x - (e0.x + e1.x) / 2, n.y - (e0.y + e1.y) / 2)) * 1.6 });
      }
      const onPet = (x, y, w) => heads.some((h) => Math.hypot(x - h.x, y - h.y) < Math.max(h.r, w * 0.6));
      frame.faces = frame.faces.filter((f) => { const a = f.pts[234], b = f.pts[454]; return !onPet((a.x + b.x) / 2, (a.y + b.y) / 2, Math.hypot(a.x - b.x, a.y - b.y)); });
      frame.poses = frame.poses.filter((p) => !onPet(p.pts[0].x, p.pts[0].y, 0));
    }
    // sort what was found into people; each person drives their own skeleton
    const persons = crowd.assign(frame);
    let nBody = 0;
    for (let i = 0; i < MAX; i++) {
      const b = bodies[i];
      for (const k in layerT) b.layers[k] += (layerT[k] - b.layers[k]) * Math.min(1, dt * 8);
      b.size = 0;
      b.update(persons[i], t, freeze ? 1 : dt);
      if (b.groups.torso.target > 0) nBody++;
    }
    // whoever looks biggest is nearest the camera, so their bones go in front
    const order = bodies.map((b, i) => i).sort((a, c) => bodies[a].size - bodies[c].size);
    order.forEach((bi, rank) => { bodies[bi].root.position.z = rank * 1600; });
    const nf = frame.faces.length, nh = frame.hands.length;
    chips.face.classList.toggle('on', nf > 0); chips.face.textContent = nf > 1 ? `面部 ×${nf}` : '面部';
    chips.hand.classList.toggle('on', nh > 0); chips.hand.textContent = nh > 1 ? `手 ×${nh}` : '手';
    chips.body.classList.toggle('on', nBody > 0); chips.body.textContent = nBody > 1 ? `身体 ×${nBody}` : '身体';
    // nobody in view for a while: say so
    const any = crowd.count > 0 || animals.length > 0;
    emptyFor = any ? 0 : emptyFor + dt;
    if (mode === 'camera') {
      const h = $('#hint');
      if (emptyFor > 2.5) { h.textContent = '没找到人 · 请面向摄像头，或把手伸到镜头前'; h.classList.remove('hidden'); lost = true; }
      else if (lost && any) { h.classList.add('hidden'); lost = false; }
    }
  }
  // cats and dogs
  if (mode === 'demo') animals = animalsOn && !inLesson ? [demo.animal(t)] : [];
  for (let i = 0; i < quads.length; i++) {
    const qd = quads[i];
    if (!qd.parts.length) continue;
    for (const k in layerT) qd.layers[k] += (layerT[k] - qd.layers[k]) * Math.min(1, dt * 8);
    qd.update(animals.find((a) => a.slot === i) || null, t, freeze ? 1 : dt);
  }
  chips.animal.classList.toggle('on', animals.length > 0);
  chips.animal.textContent = animals.length ? animals.map((a) => (a.kind === 'dog' ? '狗' : '猫')).join(' · ') : '猫 / 狗';
  if (dbg) drawKeypoints();
  lens.update(inLesson ? null : frame, now / 1000, dt, view === 'lens' && !inLesson && mode !== 'idle');
  scene.updateMatrixWorld();
  if (inLesson) lesson.draw(dt);
  if (mode !== 'idle') labels.update(dt);
  stage.flash *= Math.exp(-dt * 7);
  stage.tick(dt);
  stage.render(scene, t);
  if (inLesson) lesson.afterRender();
  fpsN++; fpsT += dt;
  if (fpsT > 0.5) { $('#fps').textContent = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
}
requestAnimationFrame(loop);
boot();
// warm the vision models while the visitor reads the start screen
if (!q.has('demo')) setTimeout(() => loadTracker().catch((e) => console.warn('tracker', e)), 300);
