// The take-away: a film card drawn on a 2D canvas from a snapshot of the stage.
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';

// shot: square canvas with the hand; stats: { carpal, carpalN, poses, posesN, secs, style }
export function makeFilm(shot, stats) {
  const W = 1080, H = 1440, m = 54, top = 112, S = W - 2 * m;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#6fd3ff';
  x.fillStyle = '#04070c'; x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, top + S / 2, 80, W / 2, top + S / 2, H * 0.7);
  g.addColorStop(0, 'rgba(40, 90, 130, 0.22)'); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // header strip
  x.textBaseline = 'alphabetic';
  x.fillStyle = accent; x.font = `600 22px ${MONO}`; x.textAlign = 'left';
  x.fillText('X-RAY MIRROR', m, 74);
  x.fillStyle = 'rgba(220, 238, 250, 0.6)'; x.font = `500 22px ${FONT}`;
  x.fillText('透视镜 · 课程 01', m + 190, 74);
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  x.textAlign = 'right'; x.font = `500 22px ${MONO}`;
  x.fillText(`${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`, W - m, 74);

  // the plate
  x.save();
  x.beginPath(); x.roundRect(m, top, S, S, 18); x.clip();
  x.drawImage(shot, m, top, S, S);
  const v = x.createRadialGradient(W / 2, top + S / 2, S * 0.35, W / 2, top + S / 2, S * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  x.fillStyle = v; x.fillRect(m, top, S, S);
  x.restore();
  x.strokeStyle = 'rgba(200, 230, 250, 0.28)'; x.lineWidth = 2;
  x.beginPath(); x.roundRect(m, top, S, S, 18); x.stroke();
  // corner ticks, like registration marks on a film
  x.strokeStyle = accent; x.lineWidth = 3;
  for (const [cx, cy, sx, sy] of [[m + 26, top + 26, 1, 1], [W - m - 26, top + 26, -1, 1], [m + 26, top + S - 26, 1, -1], [W - m - 26, top + S - 26, -1, -1]]) {
    x.beginPath(); x.moveTo(cx + 30 * sx, cy); x.lineTo(cx, cy); x.lineTo(cx, cy + 30 * sy); x.stroke();
  }

  // words
  let y = top + S + 86;
  x.textAlign = 'left'; x.fillStyle = '#f2f9ff'; x.font = `800 66px ${FONT}`;
  x.fillText('X 光之手', m, y);
  x.textAlign = 'right'; x.fillStyle = accent; x.font = `700 66px ${MONO}`;
  x.fillText('27', W - m, y);
  y += 52;
  x.textAlign = 'left'; x.fillStyle = 'rgba(232, 244, 252, 0.92)'; x.font = `600 32px ${FONT}`;
  x.fillText('我的一只手：27 块骨头', m, y);
  x.textAlign = 'right'; x.fillStyle = 'rgba(220, 238, 250, 0.55)'; x.font = `500 24px ${FONT}`;
  x.fillText('8 块腕骨 · 5 块掌骨 · 14 块指骨', W - m, y);
  y += 30;
  x.strokeStyle = 'rgba(200, 230, 250, 0.2)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(m, y); x.lineTo(W - m, y); x.stroke();
  y += 46;
  x.textAlign = 'left'; x.fillStyle = 'rgba(232, 244, 252, 0.85)'; x.font = `500 27px ${FONT}`;
  x.fillText(`腕骨点名 ${stats.carpal}/${stats.carpalN}　·　骨头手势 ${stats.poses}/${stats.posesN}　·　用时 ${stats.secs} 秒`, m, y);
  x.textAlign = 'right'; x.fillStyle = 'rgba(220, 238, 250, 0.55)'; x.font = `500 24px ${FONT}`;
  x.fillText(stats.style, W - m, y);
  y += 44;
  x.textAlign = 'left'; x.fillStyle = 'rgba(220, 238, 250, 0.42)'; x.font = `400 20px ${FONT}`;
  x.fillText('示意骨骼模型，根据手势推算后叠加，不是本人的 X 光片。', m, y);
  return c;
}

// Short synthesised sounds; no audio files.
export class Sound {
  constructor() { this.on = true; this.ac = null; }
  wake() {
    try { if (!this.ac) this.ac = new (window.AudioContext || window.webkitAudioContext)(); if (this.ac.state === 'suspended') this.ac.resume(); } catch (e) { this.ac = null; }
  }
  tone(freq, dur, type = 'sine', vol = 0.07, delay = 0) {
    const ac = this.ac; if (!this.on || !ac || ac.state !== 'running') return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  tick(n) { this.tone(392 * Math.pow(2, (n % 14) / 12), 0.16, 'triangle', 0.06); }
  good() { this.tone(660, 0.14); this.tone(990, 0.26, 'sine', 0.07, 0.1); }
  bad() { this.tone(196, 0.2, 'triangle', 0.05); }
  shutter() { this.tone(1400, 0.05, 'square', 0.04); this.tone(180, 0.22, 'sine', 0.1, 0.03); }
}
