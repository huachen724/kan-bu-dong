/**
 * Short graded texts. Pinyin is generated word-by-word from the dictionary at runtime, so the
 * Chinese here is the only source of truth. Tap any word in the reader to look it up.
 */
export interface ReadingLine {
  zh: string;
  en: string;
  /** speaker name (dialogue / chat) */
  who?: string;
  /** chat bubble from "me" (right-aligned) */
  me?: boolean;
  /** menu price */
  price?: string;
  /** context-specific pinyin for polyphones the dictionary default gets wrong, e.g. { 长: 'zhang3' } */
  fix?: Record<string, string>;
}

export interface Reading {
  id: string;
  title: string;
  zh: string;
  level: 1 | 2 | 3 | 4;
  kind: 'chat' | 'dialogue' | 'story' | 'menu' | 'sign' | 'note';
  packId?: string;
  intro: string;
  lines: ReadingLine[];
}

export const READINGS: Reading[] = [
  {
    id: 'about-me',
    title: "I'm an ABC",
    zh: '我是ABC',
    level: 1,
    kind: 'story',
    intro: 'A short self-introduction — the one relatives always ask for.',
    lines: [
      { zh: '我叫小美。', en: 'My name is Xiaomei.' },
      { zh: '我是在美国出生的。', en: 'I was born in America.' },
      { zh: '我的爸爸妈妈是中国人。', en: 'My mom and dad are Chinese.' },
      { zh: '在家里，我们说中文。', en: 'At home, we speak Chinese.' },
      { zh: '我会说，可是不会看，也不会写。', en: "I can speak, but I can't read or write." },
      { zh: '现在我想学写汉字。', en: 'Now I want to learn to write characters.' },
      { zh: '我想给外婆写一封信。', en: 'I want to write a letter to Grandma.' },
    ],
  },
  {
    id: 'mom-chat',
    title: 'Texting Mom',
    zh: '妈妈的微信',
    level: 1,
    kind: 'chat',
    packId: 'family',
    intro: 'A typical evening text thread with Mom.',
    lines: [
      { who: '妈妈', zh: '你今天几点回家？', en: 'What time are you coming home today?' },
      { who: '我', me: true, zh: '大概七点。', en: 'Around seven.' },
      { who: '妈妈', zh: '外婆来了，晚上一起吃饭。', en: "Grandma's here — we're having dinner together tonight." },
      { who: '我', me: true, zh: '好的！要我买什么吗？', en: 'OK! Do you want me to buy anything?' },
      { who: '妈妈', zh: '买一点水果吧。外婆喜欢吃橙子。', en: 'Buy some fruit. Grandma likes oranges.' },
      { who: '我', me: true, zh: '没问题。', en: 'No problem.' },
      { who: '妈妈', zh: '路上小心，别太晚。', en: "Be careful on the way, don't be too late." },
      { who: '我', me: true, zh: '知道了，妈。', en: 'Got it, Mom.' },
    ],
  },
  {
    id: 'family-dinner',
    title: 'Sunday Dinner',
    zh: '星期天的晚饭',
    level: 2,
    kind: 'story',
    packId: 'family',
    intro: 'The whole family around one table.',
    lines: [
      { zh: '今天是星期天，我们全家一起吃晚饭。', en: "It's Sunday, and the whole family is having dinner together." },
      { zh: '奶奶做了红烧肉，爸爸做了一条鱼。', en: 'Grandma made red-braised pork, and Dad made a fish.' },
      { zh: '妈妈说：“多吃一点菜！”', en: 'Mom says, "Eat more vegetables!"' },
      { zh: '弟弟只想吃肉。', en: 'My little brother only wants meat.' },
      { zh: '爷爷笑着说：“小孩子要多吃青菜。”', en: 'Grandpa laughs: "Kids should eat more greens."' },
      { zh: '吃完饭，我帮妈妈洗碗。', en: 'After dinner, I help Mom wash the dishes.' },
      { zh: '妈妈说我长大了。', en: "Mom says I've grown up." },
    ],
  },
  {
    id: 'dimsum-menu',
    title: 'Dim Sum Menu',
    zh: '点心菜单',
    level: 2,
    kind: 'menu',
    packId: 'food',
    intro: 'The order sheet at a Cantonese tea house. Find the 饣 radical!',
    lines: [
      { zh: '虾饺', en: 'Shrimp dumplings (har gow)', price: '$6.50' },
      { zh: '烧卖', en: 'Pork siu mai', price: '$6.00' },
      { zh: '叉烧包', en: 'BBQ pork buns', price: '$5.50' },
      { zh: '凤爪', en: 'Chicken feet ("phoenix claws")', price: '$5.50' },
      { zh: '肠粉', en: 'Rice noodle rolls', price: '$7.00' },
      { zh: '萝卜糕', en: 'Turnip cake', price: '$5.00' },
      { zh: '蛋挞', en: 'Egg tarts', price: '$4.50' },
      { zh: '春卷', en: 'Spring rolls', price: '$5.00' },
      { zh: '白粥', en: 'Plain congee', price: '$3.50' },
      { zh: '茶位每位一块五', en: 'Tea charge: $1.50 per person', price: '' },
    ],
  },
  {
    id: 'dimsum-talk',
    title: 'At Yum Cha',
    zh: '去饮茶',
    level: 2,
    kind: 'dialogue',
    packId: 'food',
    intro: 'Ordering with your family on a Sunday morning.',
    lines: [
      { who: '服务员', zh: '几位？', en: 'How many?' },
      { who: '我', zh: '五位。', en: 'Five.' },
      { who: '服务员', zh: '喝什么茶？', en: 'What tea would you like?' },
      { who: '外婆', zh: '普洱，谢谢。', en: 'Pu-erh, thanks.' },
      { who: '我', zh: '我们要一笼虾饺、一笼烧卖，还有两个叉烧包。', en: "We'd like a basket of har gow, a basket of siu mai, and two char siu bao." },
      { who: '妈妈', zh: '再来一份肠粉。', en: 'And one order of rice noodle rolls.' },
      { who: '外婆', zh: '你点菜点得很好！', en: 'You ordered really well!' },
      { who: '我', zh: '吃不完可以打包。服务员，买单！', en: "We can take what's left to go. Excuse me — check, please!" },
    ],
  },
  {
    id: 'heart-to-heart',
    title: 'A Talk with Mom',
    zh: '跟妈妈谈心',
    level: 3,
    kind: 'dialogue',
    packId: 'feelings',
    intro: 'Saying how you really feel — harder than it sounds.',
    lines: [
      { who: '妈妈', zh: '你这几天怎么不太说话？', en: "Why haven't you been talking much these past few days?" },
      { who: '我', zh: '没什么，就是有点累。', en: "It's nothing, I'm just a bit tired." },
      { who: '妈妈', zh: '是不是学校压力太大了？', en: 'Is school too stressful?' },
      { who: '我', zh: '嗯，考试很多，我很紧张。', en: "Yeah, there are lots of exams and I'm nervous." },
      { who: '妈妈', zh: '别担心，尽力就好。', en: "Don't worry. Just do your best." },
      { who: '我', zh: '我怕你们会失望。', en: "I'm afraid you'll be disappointed." },
      { who: '妈妈', zh: '傻孩子，我们永远为你骄傲。', en: "Silly kid, we'll always be proud of you." },
      { who: '我', zh: '谢谢妈，我感觉好多了。', en: 'Thanks, Mom. I feel much better.' },
    ],
  },
  {
    id: 'grandma-call',
    title: 'Video Call with Grandma',
    zh: '跟外婆视频',
    level: 2,
    kind: 'dialogue',
    packId: 'school',
    intro: 'The questions every grandparent asks.',
    lines: [
      { who: '外婆', zh: '你听得见吗？', en: 'Can you hear me?' },
      { who: '我', zh: '听得见！外婆好！', en: 'I can hear you! Hi, Grandma!' },
      { who: '外婆', zh: '最近学习忙不忙？', en: 'Have you been busy with school lately?' },
      { who: '我', zh: '很忙，下个星期有考试。', en: "Very busy — I have exams next week." },
      { who: '外婆', zh: '成绩怎么样？', en: 'How are your grades?' },
      { who: '我', zh: '还不错，数学考了九十五分。', en: 'Pretty good — I got a 95 in math.' },
      { who: '外婆', zh: '真厉害！中文也要好好学啊。', en: "Wonderful! Study your Chinese well, too." },
      { who: '我', zh: '我在学写汉字，下次写给您看。', en: "I'm learning to write characters — next time I'll write something for you." },
    ],
  },
  {
    id: 'doctor-visit',
    title: "Interpreting at Mom's Doctor",
    zh: '陪妈妈看病',
    level: 3,
    kind: 'dialogue',
    packId: 'health',
    intro: 'You translate between the doctor (in English) and Mom (in Chinese).',
    lines: [
      { who: '我', zh: '妈，医生问你哪里不舒服。', en: "Mom, the doctor is asking what's wrong." },
      { who: '妈妈', zh: '我头疼，嗓子也疼，晚上还咳嗽。', en: 'My head hurts, my throat hurts, and I cough at night.' },
      { who: '我', zh: '医生问你发烧了没有。', en: 'The doctor asks if you have a fever.' },
      { who: '妈妈', zh: '昨天有一点，今天好了。', en: 'A little yesterday, but it\'s gone today.' },
      { who: '我', zh: '医生说是感冒，不是大问题。', en: "The doctor says it's a cold — nothing serious." },
      { who: '我', zh: '这个药一天吃三次，饭后吃。', en: 'Take this medicine three times a day, after meals.' },
      { who: '妈妈', zh: '我对青霉素过敏，你跟医生说一下。', en: "I'm allergic to penicillin — tell the doctor." },
      { who: '我', zh: '好，我告诉他了。你回家好好休息。', en: "OK, I told him. Go home and get some rest." },
    ],
  },
  {
    id: 'sale-signs',
    title: 'Supermarket Signs',
    zh: '超市标语',
    level: 2,
    kind: 'sign',
    packId: 'money',
    intro: 'Signs you\'ll see at the Chinese supermarket.',
    lines: [
      { zh: '全场八折', en: 'Everything 20% off' },
      { zh: '买一送一', en: 'Buy one, get one free' },
      { zh: '特价', en: 'Special price' },
      { zh: '收银台', en: 'Checkout' },
      { zh: '只收现金', en: 'Cash only' },
      { zh: '欢迎刷卡', en: 'Cards welcome' },
      { zh: '海鲜区', en: 'Seafood section' },
      { zh: '营业时间：早上九点到晚上九点', en: 'Open 9 a.m. to 9 p.m.' },
      { zh: '谢谢光临', en: 'Thank you for visiting' },
    ],
  },
  {
    id: 'airport-signs',
    title: 'Airport & Subway Signs',
    zh: '机场和地铁',
    level: 2,
    kind: 'sign',
    packId: 'travel',
    intro: 'Landing in China: what the signs say.',
    lines: [
      { zh: '国际到达', en: 'International arrivals' },
      { zh: '行李提取', en: 'Baggage claim' },
      { zh: '出口', en: 'Exit' },
      { zh: '入口', en: 'Entrance' },
      { zh: '地铁站', en: 'Subway station' },
      { zh: '出租车上车点', en: 'Taxi pickup' },
      { zh: '洗手间', en: 'Restrooms' },
      { zh: '禁止吸烟', en: 'No smoking' },
      { zh: '小心台阶', en: 'Mind the step' },
      { zh: '请排队', en: 'Please line up' },
    ],
  },
  {
    id: 'asking-directions',
    title: 'Asking for Directions',
    zh: '问路',
    level: 2,
    kind: 'dialogue',
    packId: 'travel',
    intro: 'Lost near a subway station.',
    lines: [
      { who: '我', zh: '不好意思，请问地铁站怎么走？', en: 'Excuse me, how do I get to the subway station?' },
      { who: '阿姨', zh: '一直走，到红绿灯往右拐。', en: 'Go straight, and turn right at the traffic light.' },
      { who: '我', zh: '远不远？', en: 'Is it far?' },
      { who: '阿姨', zh: '不远，走路五分钟。', en: "Not far — five minutes on foot." },
      { who: '我', zh: '附近有洗手间吗？', en: 'Is there a restroom nearby?' },
      { who: '阿姨', zh: '地铁站里面就有。', en: "There's one right inside the station." },
      { who: '我', zh: '太好了，谢谢阿姨！', en: 'Great, thank you!' },
    ],
  },
  {
    id: 'work-chat',
    title: 'Explaining My Job',
    zh: '跟爸爸聊工作',
    level: 3,
    kind: 'chat',
    packId: 'work',
    intro: 'Dad wants to know what you actually do all day.',
    lines: [
      { who: '爸爸', zh: '新工作怎么样？', en: "How's the new job?" },
      { who: '我', me: true, zh: '挺好的，同事都很好。', en: 'Pretty good, my coworkers are all nice.' },
      { who: '爸爸', zh: '你们公司是做什么的？', en: 'What does your company do?' },
      { who: '我', me: true, zh: '我们做手机软件。我每天开会、写代码。', en: 'We make phone apps. Every day I have meetings and write code.' },
      { who: '爸爸', zh: '加班多吗？', en: 'Do you work a lot of overtime?' },
      { who: '我', me: true, zh: '项目忙的时候要加班。', en: 'When projects get busy I have to work late.' },
      { who: '爸爸', zh: '工作别太累，记得吃饭。', en: "Don't work too hard, and remember to eat." },
      { who: '我', me: true, zh: '收到！周末回家吃饭。', en: "Got it! I'll come home for dinner this weekend." },
    ],
  },
  {
    id: 'family-group',
    title: 'The Family Group Chat',
    zh: '相亲相爱一家人',
    level: 3,
    kind: 'chat',
    packId: 'texting',
    intro: 'Every family has one. (The group name means "One Loving Family".)',
    lines: [
      { who: '舅舅', zh: '大家早上好！', en: 'Good morning, everyone!' },
      { who: '外婆', zh: '[语音 0:47]', en: '[voice message 0:47]' },
      { who: '妈妈', zh: '外婆说：今天降温，大家多穿衣服。', en: 'Grandma says: it\'s getting cold today, everyone dress warmly.' },
      { who: '表哥', zh: '收到！', en: 'Got it!' },
      { who: '舅舅', zh: '[红包] 恭喜发财', en: '[red envelope] Wishing you prosperity' },
      { who: '我', me: true, zh: '谢谢舅舅！', en: 'Thanks, Uncle!' },
      { who: '表哥', zh: '你手太快了哈哈', en: 'You grabbed that so fast haha' },
      { who: '妈妈', zh: '你们吃饭了吗？', en: 'Have you all eaten?' },
      { who: '我', me: true, zh: '吃了，晚安！', en: 'Yes, good night!' },
    ],
  },
  {
    id: 'new-year-visit',
    title: 'New Year Visit',
    zh: '拜年',
    level: 3,
    kind: 'dialogue',
    packId: 'idioms',
    intro: 'Visiting relatives at Lunar New Year — blessings required.',
    lines: [
      { who: '我', zh: '舅舅舅妈，新年快乐！恭喜发财！', en: 'Uncle, Auntie, Happy New Year! Wishing you prosperity!' },
      { who: '舅妈', zh: '好久不见，你长这么高了！', en: "Long time no see — you've grown so tall!", fix: { 长: 'zhang3' } },
      { who: '舅舅', zh: '来，给你红包。', en: 'Here, a red envelope for you.' },
      { who: '我', zh: '谢谢舅舅！祝您身体健康，万事如意！', en: 'Thank you, Uncle! Wishing you good health and all the best!' },
      { who: '舅妈', zh: '你的中文说得真好。', en: 'Your Chinese is really good.' },
      { who: '我', zh: '马马虎虎啦，我现在在学写字。', en: "It's so-so — I'm learning to write characters now." },
      { who: '舅舅', zh: '慢慢来，不要半途而废。', en: "Take your time, and don't give up halfway." },
    ],
  },
];

export function getReading(id: string): Reading | undefined {
  return READINGS.find((r) => r.id === id);
}
