// Names and kid-friendly facts. describe(key) -> { zh, en, fact }.

const side = (k) => (k.endsWith('_L') ? '左' : k.endsWith('_R') ? '右' : '');
const sideEn = (k) => (k.endsWith('_L') ? 'Left ' : k.endsWith('_R') ? 'Right ' : '');
const strip = (k) => k.replace(/_(L|R)$/, '');

const BASE = {
  frontal: ['额骨', 'Frontal bone', '额骨像头盔的前挡板，保护着大脑里负责思考的前额叶。'],
  parietal: ['顶骨', 'Parietal bone', '左右两块顶骨拼成了头顶，像屋顶一样盖住大脑。'],
  temporal: ['颞骨', 'Temporal bone', '颞骨在耳朵旁边，里面藏着全身最小的三块骨头——听小骨。'],
  occipital: ['枕骨', 'Occipital bone', '枕骨在后脑勺，底部有一个大孔，脊髓从这里连到大脑。'],
  orbit: ['眼眶', 'Orbit', '眼眶由 7 块骨头围成，像一个小窝把眼球稳稳护在里面。'],
  nasal: ['鼻骨与鼻腔', 'Nasal bone & cavity', '鼻尖是软骨不是骨头，所以头骨上鼻子的位置是一个梨形的洞。'],
  zygomatic: ['颧骨', 'Zygomatic bone', '颧骨就是脸颊上最鼓的那块骨头，笑起来的时候最明显。'],
  maxilla: ['上颌骨', 'Maxilla', '上颌骨托着上排牙齿，同时也是鼻腔和眼眶的一部分。'],
  teeth: ['牙齿', 'Teeth', '成年人有 28–32 颗牙。牙齿表面的牙釉质是人体最硬的物质。'],
  mandible: ['下颌骨', 'Mandible', '下颌骨是头上唯一能大幅活动的骨头。张开嘴试试看！'],
  brain: ['大脑', 'Brain', '大脑约重 1.4 千克，里面有大约 860 亿个神经元。'],
  eye: ['眼球', 'Eyeball', '眼球直径约 2.4 厘米，像一台会自动对焦的照相机。'],
  cervical: ['颈椎', 'Cervical vertebra', '颈椎一共 7 块。长颈鹿的脖子那么长，颈椎也只有 7 块！'],
  thoracic: ['胸椎', 'Thoracic vertebra', '胸椎有 12 块，每一块都连着一对肋骨。'],
  lumbar: ['腰椎', 'Lumbar vertebra', '腰椎有 5 块，是脊柱里最粗壮的，撑着整个上半身。'],
  rib: ['肋骨', 'Rib', '肋骨一共 12 对，像笼子一样保护着心脏和肺。'],
  cart: ['肋软骨', 'Costal cartilage', '肋软骨有弹性，让胸腔可以随着呼吸一张一缩。'],
  sternum: ['胸骨', 'Sternum', '胸骨在胸口正中间，形状像一把短剑。'],
  clavicle: ['锁骨', 'Clavicle', '锁骨是最容易骨折的骨头之一，在肩膀前面一摸就能摸到。'],
  scapula: ['肩胛骨', 'Scapula', '肩胛骨是后背上的三角形骨头，像一对小翅膀。'],
  pelvis: ['骨盆', 'Pelvis', '骨盆像一个碗，托着肚子里的器官，也把躯干和双腿连在一起。'],
  humerus: ['肱骨', 'Humerus', '肱骨是上臂唯一的骨头。撞到手肘会发麻，是因为碰到了旁边的尺神经。'],
  radius: ['桡骨', 'Radius', '桡骨在拇指这一侧。翻转手掌时，它会绕着尺骨转动——转转手腕看看！'],
  ulna: ['尺骨', 'Ulna', '尺骨在小指这一侧，它上端的“鹰嘴”就是你的手肘尖。'],
  femur: ['股骨', 'Femur', '股骨是人体最长、最结实的骨头。'],
  patella: ['髌骨', 'Patella', '髌骨就是膝盖骨，它是人体最大的籽骨。'],
  tibia: ['胫骨', 'Tibia', '胫骨是小腿内侧的粗骨头，小腿前面摸起来硬硬的就是它。'],
  fibula: ['腓骨', 'Fibula', '腓骨细细长长，在小腿外侧，帮忙稳住脚踝。'],
  tarsals: ['跗骨', 'Tarsal bones', '每只脚有 7 块跗骨，其中最大的一块是脚后跟的跟骨。'],
  metatarsals: ['跖骨', 'Metatarsal bones', '5 根跖骨组成了脚掌，走路时像弹簧一样缓冲。'],
  toes: ['趾骨', 'Phalanges of the foot', '脚趾一共有 14 块趾骨，大脚趾只有 2 节。'],
  heart: ['心脏', 'Heart', '心脏和你的拳头差不多大，每天要跳动大约 10 万次。'],
  lung: ['肺', 'Lung', '左肺有 2 叶，右肺有 3 叶——左边要给心脏让出位置。'],
  trachea: ['气管', 'Trachea', '气管由一圈圈 C 形软骨撑着，所以不会被压扁。'],
  liver: ['肝脏', 'Liver', '肝脏是人体最大的内脏器官，要负责 500 多种工作。'],
  stomach: ['胃', 'Stomach', '胃像一个会伸缩的袋子，胃壁靠一层黏液保护自己不被胃酸伤到。'],
  colon: ['大肠', 'Large intestine', '大肠大约 1.5 米长，主要负责把水分吸收回来。'],
  intestine: ['小肠', 'Small intestine', '小肠有 6 米左右长，食物里的营养大部分在这里被吸收。'],
  kidney: ['肾脏', 'Kidney', '两个肾脏每天要过滤出大约 180 升液体，再把有用的部分收回去。'],
};

const CARPALS = {
  scaphoid: ['手舟骨', 'Scaphoid'], lunate: ['月骨', 'Lunate'], triquetrum: ['三角骨', 'Triquetrum'], pisiform: ['豌豆骨', 'Pisiform'],
  trapezium: ['大多角骨', 'Trapezium'], trapezoid: ['小多角骨', 'Trapezoid'], capitate: ['头状骨', 'Capitate'], hamate: ['钩骨', 'Hamate'],
};
const FINGERS = [['拇指', 'thumb'], ['食指', 'index finger'], ['中指', 'middle finger'], ['无名指', 'ring finger'], ['小指', 'little finger']];
const ORD = ['一', '二', '三', '四', '五'];
const PHAL = { prox: ['近节指骨', 'Proximal phalanx'], mid: ['中节指骨', 'Middle phalanx'], dist: ['远节指骨', 'Distal phalanx'] };
const HAND_FACT = '一只手有 27 块骨头，两只手加起来超过全身骨头的四分之一。';

// ---------------------------------------------------------------- cats and dogs
const ANIMAL = {
  skull: ['颅骨', 'Skull', { cat: '猫的眼眶又大又朝前，两只眼睛的视野重叠得多，所以判断距离特别准。全身大约有 230 多块骨头，比人的 206 块还多。', dog: '狗的鼻腔又长又大，里面的嗅觉细胞是人的几十倍。全身大约有 320 块骨头。' }],
  mandible: ['下颌骨', 'Mandible', '下颌只能上下开合，几乎不能左右磨动，所以吃东西是切和撕，不是嚼。'],
  C: ['颈椎', 'Cervical vertebra', '和人、长颈鹿一样，颈椎也是 7 块。'],
  T: ['胸椎', 'Thoracic vertebra', '胸椎有 13 块，比人多 1 块，所以肋骨也是 13 对。'],
  L: ['腰椎', 'Lumbar vertebra', '腰椎有 7 块，比人多 2 块。腰又长又软，所以能把身体弓成一座桥。'],
  Ca: ['尾椎', 'Tail vertebra', { cat: '猫尾巴里大约有 18–23 块尾椎，跑跳和走窄路时用来保持平衡。', dog: '狗尾巴里一般有 20 块左右的尾椎，摇尾巴是在表达心情。' }],
  rib: ['肋骨', 'Rib', '13 对肋骨围成一个又窄又深的胸腔，保护心脏和肺。'],
  sternum: ['胸骨', 'Sternum', '胸骨在胸口最下面，像船的龙骨一样把肋骨连在一起。'],
  scapula: ['肩胛骨', 'Scapula', { cat: '猫的锁骨退化成了一小块，肩胛骨只靠肌肉挂在身上，所以步子迈得大、落地又很轻。', dog: '狗没有像人那样的锁骨，肩胛骨靠肌肉连在身上，跑起来前腿能甩得很开。' }],
  humerus: ['肱骨', 'Humerus', '这是前腿最上面的一段，相当于人的上臂。真正的手肘紧贴着胸口。'],
  radius: ['桡骨', 'Radius', '桡骨和尺骨组成前臂。'],
  ulna: ['尺骨', 'Ulna', '尺骨上端的突起就是手肘尖，它贴在胸口旁边。'],
  carpal: ['腕骨', 'Carpal bones', '这里是前腿的“手腕”。它用脚趾走路，所以手腕悬在半空，就像人一直踮着脚尖。'],
  metacarpal: ['掌骨', 'Metacarpal', '掌骨相当于人的手掌，但它是竖起来的，成了腿的一部分。'],
  ftoe: ['趾骨', 'Phalanx', '只有脚趾着地，这种走路方式叫“趾行”，跑得快又安静。'],
  claw: ['爪', 'Claw bone', { cat: '猫的爪子平时缩在趾骨末端的鞘里，要用的时候才弹出来。', dog: '狗的爪子收不回去，所以走在地板上会哒哒响。' }],
  pelvis: ['骨盆', 'Pelvis', '骨盆又窄又长，把后腿的力量传给脊柱。'],
  femur: ['股骨', 'Femur', '股骨是后腿最上面的一段。真正的膝盖在它下端，藏在靠近肚子的地方。'],
  tibia: ['胫骨', 'Tibia', '胫骨是膝盖和脚后跟之间的那一段。'],
  fibula: ['腓骨', 'Fibula', '腓骨细细的，贴在胫骨外侧。'],
  tarsal: ['跗骨', 'Tarsal bones (hock)', '后腿上这个向后突出的关节不是膝盖，而是脚后跟。'],
  metatarsal: ['跖骨', 'Metatarsal', '跖骨相当于人的脚掌，它竖起来以后让后腿多了一节，跳得更高。'],
  htoe: ['趾骨', 'Phalanx', '只有脚趾着地，这种走路方式叫“趾行”，跑得快又安静。'],
};
function describeAnimal(key, kind) {
  const who = kind === 'dog' ? '狗' : '猫', whoEn = kind === 'dog' ? 'Dog' : 'Cat';
  const k = strip(key).slice(2), sd = side(key), sde = sideEn(key);
  const m = k.match(/^(Ca|C|T|L|rib)(\d+)$/);
  const b = ANIMAL[m ? m[1] : k];
  if (!b) return { zh: who, en: whoEn, fact: '' };
  const fact = typeof b[2] === 'string' ? b[2] : b[2][kind] || b[2].cat;
  const num = m ? (m[1] === 'rib' ? ` 第 ${m[2]} 对` : ` ${m[1]}${m[2]}`) : '';
  return { zh: `${who} · ${sd}${b[0]}${num}`, en: `${whoEn} · ${sde}${b[1]}${m ? ' ' + m[2] : ''}`, fact };
}

export function describe(key, kind) {
  if (key.startsWith('a_')) return describeAnimal(key, kind);
  const k = strip(key), s = side(key), se = sideEn(key);
  let m;
  if ((m = k.match(/^rib(\d+)$/))) {
    const n = +m[1];
    const kind = n <= 7 ? '真肋，直接连到胸骨' : n <= 10 ? '假肋，借上一根肋软骨连到胸骨' : '浮肋，前端是悬空的';
    return { zh: `${s}第 ${n} 肋`, en: `${se}Rib ${n}`, fact: `第 ${n} 肋属于${kind}。${BASE.rib[2]}` };
  }
  if ((m = k.match(/^cart(\d+)$/))) return { zh: `${s}第 ${m[1]} 肋软骨`, en: `${se}Costal cartilage ${m[1]}`, fact: BASE.cart[2] };
  if ((m = k.match(/^([CTL])(\d+)$/))) {
    const b = BASE[{ C: 'cervical', T: 'thoracic', L: 'lumbar' }[m[1]]];
    return { zh: `${b[0]} ${m[1]}${m[2]}`, en: `${b[1]} ${m[1]}${m[2]}`, fact: b[2] };
  }
  if ((m = k.match(/^carpal_(\w+)$/))) {
    const c = CARPALS[m[1]];
    return { zh: `${s}手 · ${c[0]}`, en: `${se}${c[1]}`, fact: '腕骨一共 8 块，排成两排，像小石子一样拼在一起，让手腕能灵活转动。' };
  }
  if ((m = k.match(/^meta_(\d)$/))) {
    const i = +m[1];
    return { zh: `${s}手 · 第${ORD[i]}掌骨`, en: `${se}Metacarpal ${i + 1}`, fact: `5 根掌骨撑起了手掌，这一根连着${FINGERS[i][0]}。握拳时凸起的指关节就是掌骨的头。` };
  }
  if ((m = k.match(/^(prox|mid|dist)_(\d)$/))) {
    const i = +m[2], p = PHAL[m[1]];
    const extra = i === 0 ? '拇指只有 2 节指骨，其他手指都有 3 节。' : HAND_FACT;
    return { zh: `${s}手${FINGERS[i][0]} · ${p[0]}`, en: `${se}${p[1]} (${FINGERS[i][1]})`, fact: extra };
  }
  const b = BASE[k];
  if (b) return { zh: s + b[0], en: se + b[1], fact: b[2] };
  return { zh: key, en: key, fact: '' };
}

// Which named bone of the skull a point (skull-local, cm) belongs to.
export function skullRegion(x, y, z) {
  const ax = Math.abs(x);
  if (y < -6.75 && y > -8.7 && z > 2.0) return 'teeth';
  if (Math.hypot(ax - 3.25, y + 0.75, (z - 7.4) * 0.6) < 2.5 && z > 4.5) return 'orbit';
  if (ax < 1.7 && y < 0.7 && y > -5.6 && z > 6.2) return 'nasal';
  if (ax > 4.3 && y < -1.3 && y > -4.8 && z > -1.5) return 'zygomatic';
  if (y < -1.6 && z > 2.5) return 'maxilla';
  if (ax > 4.8 && y < 1.8 && z < 4.5 && z > -5.5) return 'temporal';
  if (z < -4.5 && y < 3.2) return 'occipital';
  if (z > 1.5 && y > -0.5) return 'frontal';
  return 'parietal';
}
