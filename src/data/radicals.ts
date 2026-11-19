/** The 40 radicals that cover the most everyday characters — learn these and new characters become guessable. */
export interface Radical {
  r: string;
  /** standalone / full form, if different */
  full?: string;
  p: string;
  meaning: string;
  examples: string[];
  tip: string;
}

export const RADICALS: Radical[] = [
  { r: '亻', full: '人', p: 'rén', meaning: 'person', examples: ['你', '他', '们', '住', '休'], tip: 'People and what they do. 休 = a person leaning on a tree: rest.' },
  { r: '口', p: 'kǒu', meaning: 'mouth', examples: ['吃', '喝', '叫', '唱', '吗'], tip: 'Eating, speaking — and many sentence particles (吗, 吧, 呢).' },
  { r: '氵', full: '水', p: 'shuǐ', meaning: 'water', examples: ['洗', '河', '海', '汤', '酒'], tip: 'Three drops: liquids, rivers, washing.' },
  { r: '扌', full: '手', p: 'shǒu', meaning: 'hand', examples: ['打', '找', '拿', '推', '拉'], tip: 'Actions you do with your hands.' },
  { r: '木', p: 'mù', meaning: 'tree; wood', examples: ['树', '林', '桌', '椅', '板'], tip: 'Trees and wooden things like tables and chairs.' },
  { r: '艹', p: 'cǎo', meaning: 'grass; plant', examples: ['花', '草', '茶', '菜', '药'], tip: 'Plants on top: flowers, tea, vegetables, (herbal) medicine.' },
  { r: '女', p: 'nǚ', meaning: 'woman', examples: ['妈', '姐', '妹', '奶', '好'], tip: 'Female family members. 好 = woman + child: good.' },
  { r: '忄', full: '心', p: 'xīn', meaning: 'heart; feelings', examples: ['想', '忙', '快', '情', '怕'], tip: 'Emotions and thoughts — at the side (忄) or bottom (心).' },
  { r: '日', p: 'rì', meaning: 'sun; day', examples: ['明', '早', '晚', '时', '春'], tip: 'Time of day and brightness. 明 = sun + moon: bright.' },
  { r: '土', p: 'tǔ', meaning: 'earth; soil', examples: ['地', '场', '城', '坐', '块'], tip: 'Ground, places, earth.' },
  { r: '钅', full: '金', p: 'jīn', meaning: 'metal; gold', examples: ['钱', '银', '铁', '错', '钟'], tip: 'Metals, money and tools.' },
  { r: '讠', full: '言', p: 'yán', meaning: 'speech; words', examples: ['说', '话', '语', '请', '谢'], tip: 'Talking and language.' },
  { r: '纟', full: '糸', p: 'sī', meaning: 'silk; thread', examples: ['红', '绿', '线', '级', '给'], tip: 'Thread, textiles — and colors (dyed silk).' },
  { r: '辶', p: 'chuò', meaning: 'walk; movement', examples: ['这', '还', '进', '远', '送'], tip: 'Going, coming, distance.' },
  { r: '月', p: 'yuè / ròu', meaning: 'moon; flesh (body)', examples: ['脑', '肚', '脸', '腿', '朋'], tip: 'Also the squeezed form of 肉 (meat): body parts like 脸, 腿, 肚.' },
  { r: '火', full: '灬', p: 'huǒ', meaning: 'fire', examples: ['烧', '炒', '灯', '热', '点'], tip: 'Cooking and heat. At the bottom it becomes four dots 灬.' },
  { r: '阝', p: 'fù / yì', meaning: 'hill (left) / city (right)', examples: ['院', '阶', '那', '都', '部'], tip: 'On the left = hill/steps; on the right = town.' },
  { r: '宀', p: 'mián', meaning: 'roof', examples: ['家', '安', '室', '字', '客'], tip: 'Houses and shelter. 安 = woman under a roof: peaceful.' },
  { r: '⺮', full: '竹', p: 'zhú', meaning: 'bamboo', examples: ['笔', '筷', '第', '答', '等'], tip: 'Bamboo things: brushes, chopsticks.' },
  { r: '王', full: '玉', p: 'yù', meaning: 'jade', examples: ['玩', '球', '现', '理', '珠'], tip: 'As a radical, 王 usually means jade, not king.' },
  { r: '礻', full: '示', p: 'shì', meaning: 'spirit; altar', examples: ['礼', '祝', '福', '神', '社'], tip: 'Blessings and rituals — 福 on your door at New Year.' },
  { r: '衤', full: '衣', p: 'yī', meaning: 'clothing', examples: ['衬', '裤', '被', '袜', '裙'], tip: 'One more stroke than 礻 — clothes!' },
  { r: '⻊', full: '足', p: 'zú', meaning: 'foot', examples: ['跑', '跳', '路', '踢', '跟'], tip: 'Running, jumping, roads.' },
  { r: '目', p: 'mù', meaning: 'eye', examples: ['眼', '睡', '看', '睛', '盯'], tip: 'Seeing — 看 is a hand over the eye.' },
  { r: '饣', full: '食', p: 'shí', meaning: 'food', examples: ['饭', '饺', '饿', '饱', '馆'], tip: 'Food, hunger and restaurants (饭馆).' },
  { r: '贝', p: 'bèi', meaning: 'shell; money', examples: ['贵', '买', '卖', '费', '货'], tip: 'Shells were ancient money: buying, selling, cost.' },
  { r: '力', p: 'lì', meaning: 'strength', examples: ['加', '动', '办', '男', '努'], tip: 'Effort. 男 = field + strength: man.' },
  { r: '刂', full: '刀', p: 'dāo', meaning: 'knife', examples: ['到', '别', '刻', '前', '利'], tip: 'Cutting and sharpness.' },
  { r: '山', p: 'shān', meaning: 'mountain', examples: ['岛', '岁', '峰', '岸', '岩'], tip: 'Mountains, islands, cliffs.' },
  { r: '石', p: 'shí', meaning: 'stone', examples: ['碗', '码', '破', '研', '砖'], tip: 'Rocks — and stone things like bowls.' },
  { r: '田', p: 'tián', meaning: 'field', examples: ['男', '界', '留', '画', '累'], tip: 'Farmland, borders.' },
  { r: '雨', p: 'yǔ', meaning: 'rain', examples: ['雪', '雷', '雾', '零', '霜'], tip: 'Weather from the sky.' },
  { r: '门', p: 'mén', meaning: 'door; gate', examples: ['问', '间', '闻', '闹', '闭'], tip: '问 = a mouth at the door: asking.' },
  { r: '车', p: 'chē', meaning: 'vehicle', examples: ['辆', '转', '轮', '软', '输'], tip: 'Cars, wheels, turning.' },
  { r: '马', p: 'mǎ', meaning: 'horse', examples: ['妈', '吗', '骑', '骂', '驾'], tip: 'Often a sound hint: 妈 mā, 吗 ma, 骂 mà all sound like mǎ.' },
  { r: '鸟', p: 'niǎo', meaning: 'bird', examples: ['鸡', '鸭', '鹅', '鸽', '鸣'], tip: 'Birds — chicken, duck, goose.' },
  { r: '虫', p: 'chóng', meaning: 'insect; creature', examples: ['蛇', '蚊', '虾', '蛋', '蜂'], tip: 'Bugs and small creatures (even shrimp 虾).' },
  { r: '疒', p: 'nè', meaning: 'sickness', examples: ['病', '疼', '痛', '瘦', '疯'], tip: 'A sickbed: illness and pain.' },
  { r: '犭', p: 'quǎn', meaning: 'animal (dog)', examples: ['狗', '猫', '猪', '狮', '猴'], tip: 'Four-legged animals.' },
  { r: '页', p: 'yè', meaning: 'head; page', examples: ['题', '颜', '顾', '领', '顺'], tip: 'Originally a head — faces, necks, topics.' },
];
