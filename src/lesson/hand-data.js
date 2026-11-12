// Lesson 01 · "X 光之手": everything the lesson says and asks for, kept as data.
// Lesson design after a colleague's "X 光之手" mini-course; rebuilt on this site's own engine.

export const FINGER = ['拇指', '食指', '中指', '无名指', '小指'];
const ORD = ['一', '二', '三', '四', '五'];

// the 27 bones, in the order they are counted on the film: fingertips first, wrist last
export const BONES = [];
for (let f = 0; f < 5; f++) BONES.push({ id: 'dist_' + f, name: `${FINGER[f]} · 远节指骨`, note: '指尖那一节，最小' });
for (let f = 1; f < 5; f++) BONES.push({ id: 'mid_' + f, name: `${FINGER[f]} · 中节指骨`, note: '中间一节，拇指没有' });
for (let f = 0; f < 5; f++) BONES.push({ id: 'prox_' + f, name: `${FINGER[f]} · 近节指骨`, note: '靠手掌的一节，最长' });
for (let f = 0; f < 5; f++) BONES.push({ id: 'meta_' + f, name: `第${ORD[f]}掌骨`, note: f === 0 ? '拇指的掌骨，从拇指一侧数是第一根' : '撑起手掌的 5 根骨头之一' });
export const CARPALS = {
  scaphoid: { name: '手舟骨', note: '像一条小船，腕骨里最容易骨折', where: '近排、靠拇指这一侧的那块' },
  lunate: { name: '月骨', note: '像一弯月牙，夹在手舟骨和三角骨之间', where: '近排正中间的那块' },
  triquetrum: { name: '三角骨', note: '锥形的小骨头，托着豌豆骨', where: '近排、靠小指这一侧的那块' },
  pisiform: { name: '豌豆骨', note: '最小的腕骨，长在肌腱里', where: '最小的那块，叠在三角骨上面' },
  trapezium: { name: '大多角骨', note: '和拇指的掌骨组成「马鞍」关节', where: '远排、紧挨拇指掌骨的那块' },
  trapezoid: { name: '小多角骨', note: '远排里最小的一块，像个楔子', where: '远排、大多角骨旁边最小的那块' },
  capitate: { name: '头状骨', note: '最大的腕骨，坐在正中央', where: '最大的那块，在手腕正中间' },
  hamate: { name: '钩骨', note: '掌心一面带个小钩', where: '远排、靠小指这一侧的那块' },
};
for (const k in CARPALS) BONES.push({ id: 'carpal_' + k, name: CARPALS[k].name, note: CARPALS[k].note });
export const BONE = Object.fromEntries(BONES.map((b) => [b.id, b]));

// act 1: a joint that moves lights the bone on each side of it.
// index = finger * 3 + joint (see handmath.analyse); thr = how far it must swing, in degrees
export const JOINTS = [];
JOINTS.push({ i: 0, name: '拇指腕掌关节', bones: ['carpal_trapezium', 'meta_0'], thr: 13 });
JOINTS.push({ i: 1, name: '拇指掌指关节', bones: ['meta_0', 'prox_0'], thr: 16 });
JOINTS.push({ i: 2, name: '拇指指间关节', bones: ['prox_0', 'dist_0'], thr: 22 });
for (let f = 1; f < 5; f++) {
  JOINTS.push({ i: f * 3, name: `${FINGER[f]} · 掌指关节`, bones: ['meta_' + f, 'prox_' + f], thr: 24 });
  JOINTS.push({ i: f * 3 + 1, name: `${FINGER[f]} · 近指间关节`, bones: ['prox_' + f, 'mid_' + f], thr: 30 });
  JOINTS.push({ i: f * 3 + 2, name: `${FINGER[f]} · 远指间关节`, bones: ['mid_' + f, 'dist_' + f], thr: 20 });
}

// act 2: the seven carpals nobody can light by moving, in asking order
export const QUIZ = ['capitate', 'scaphoid', 'lunate', 'triquetrum', 'pisiform', 'hamate', 'trapezoid'];

// act 3: bone gestures. `need`: per finger 1 = straight, 0 = curled, null = either; `pinch`: thumb tip on index tip
export const POSES = [
  { id: 'victory', emoji: '✌️', name: '比个耶', need: [null, 1, 1, 0, 0], show: [1, 2],
    fact: '食指到小指每根有 3 节指骨；拇指只有 2 节，没有中节。' },
  { id: 'ok', emoji: '👌', name: '比个 OK', need: [null, null, 1, 1, 1], pinch: true, show: [0, 1],
    fact: '拇指能和其他手指指腹相对，叫「对掌」。靠的是拇指根部那个马鞍形的腕掌关节。' },
  { id: 'six', emoji: '🤙', name: '数字六', need: [1, 0, 0, 0, 1], show: [0, 4],
    fact: '握拳时手背上鼓起的「拳峰」，其实是掌骨的头。' },
  { id: 'fist', emoji: '✊', name: '握拳', need: [null, 0, 0, 0, 0], show: [0, 1, 2, 3, 4],
    fact: '一只手里，指骨有 14 块；指间关节 9 个，掌指关节 5 个。' },
];

export const TEXT = {
  title: 'X 光之手',
  lead: '把手举到镜头前，看你的 27 块骨头怎么动。',
  note: '示意用的骨骼模型，根据手的姿势推算后叠加，不是你本人的 X 光片，不能用来看伤病。',
  why: '骨头含钙多，挡住的 X 线多，所以在片子上发白；肌肉和皮肤挡得少，显得发灰。',
  total: '一只手通常有 27 块骨：8 块腕骨、5 块掌骨、14 块指骨。',
  both: '两只手一共 54 块，占成人全身约 206 块骨头的四分之一还多。',
  rhyme: '记忆口诀：舟月三角豆，大小头状钩',
  carpalIntro: '手腕里藏着 8 块腕骨，排成近、远两排。它们挤在一起，摄像头分辨不出各自的动作，剩下 7 块由你来点名。',
};
