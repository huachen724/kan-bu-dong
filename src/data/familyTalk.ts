/** Family Talk: practical, respectful phrases for talking with parents and grandparents. */
export interface Phrase {
  zh: string;
  en: string;
  note?: string;
}

export interface PhraseGroup {
  id: string;
  title: string;
  zh: string;
  icon: string;
  phrases: Phrase[];
}

export const FAMILY_TALK: PhraseGroup[] = [
  {
    id: 'respect',
    title: 'Respectful forms',
    zh: '尊称和礼貌',
    icon: '🙇',
    phrases: [
      { zh: '您好', en: 'Hello (respectful)', note: '您 is the polite "you". Use it with grandparents, parents\' friends, teachers.' },
      { zh: '您先吃', en: 'Please, you eat first', note: 'Elders start eating first — saying this is good manners.' },
      { zh: '您辛苦了', en: "Thank you for all your hard work", note: 'Said to someone who cooked, worked, or took care of you.' },
      { zh: '麻烦您了', en: 'Sorry to trouble you / thanks for the trouble' },
      { zh: '请慢用', en: 'Please enjoy (your meal)' },
      { zh: '您请坐', en: 'Please have a seat' },
      { zh: '请问您贵姓？', en: 'May I ask your (honorable) surname?', note: 'The polite way to ask someone\'s name.' },
    ],
  },
  {
    id: 'daily',
    title: 'Everyday at home',
    zh: '日常用语',
    icon: '🏡',
    phrases: [
      { zh: '我回来了！', en: "I'm home!" },
      { zh: '我出门了！', en: "I'm heading out!" },
      { zh: '饭好了吗？', en: 'Is the food ready?' },
      { zh: '我吃饱了。', en: "I'm full." },
      { zh: '今天晚上吃什么？', en: "What's for dinner tonight?" },
      { zh: '我自己来。', en: "I'll do it myself.", note: 'Useful when someone keeps putting food in your bowl.' },
      { zh: '我去睡觉了，晚安。', en: "I'm going to bed, good night." },
      { zh: '我晚点回来，不用等我吃饭。', en: "I'll be back late — don't wait for me to eat." },
    ],
  },
  {
    id: 'care',
    title: 'Caring for parents',
    zh: '关心父母',
    icon: '❤️',
    phrases: [
      { zh: '您早点休息。', en: 'Get some rest early.' },
      { zh: '别太累了。', en: "Don't wear yourself out." },
      { zh: '记得吃药。', en: 'Remember to take your medicine.' },
      { zh: '天冷了，多穿点衣服。', en: "It's cold now, wear more layers.", note: 'Turn the classic parent line around on them.' },
      { zh: '您身体怎么样？', en: 'How is your health?' },
      { zh: '我帮您拿。', en: 'Let me carry that for you.' },
      { zh: '有什么需要帮忙的吗？', en: 'Is there anything I can help with?' },
    ],
  },
  {
    id: 'phone',
    title: 'Calls with grandparents',
    zh: '打电话、视频',
    icon: '📞',
    phrases: [
      { zh: '外婆，您听得见吗？', en: 'Grandma, can you hear me?' },
      { zh: '视频卡了。', en: 'The video froze.' },
      { zh: '我们这边是晚上。', en: "It's nighttime here." },
      { zh: '我很想您。', en: 'I miss you a lot.' },
      { zh: '我最近很好，别担心。', en: "I've been good lately, don't worry." },
      { zh: '下次放假回去看您。', en: "I'll come back to see you next break." },
    ],
  },
  {
    id: 'holidays',
    title: 'Holidays & blessings',
    zh: '节日祝福',
    icon: '🧧',
    phrases: [
      { zh: '新年快乐！', en: 'Happy New Year!' },
      { zh: '恭喜发财！', en: 'Wishing you prosperity!' },
      { zh: '祝您身体健康！', en: 'Wishing you good health!', note: 'The go-to blessing for elders.' },
      { zh: '生日快乐！', en: 'Happy birthday!' },
      { zh: '中秋节快乐！', en: 'Happy Mid-Autumn Festival!' },
      { zh: '祝您长命百岁！', en: 'May you live to a hundred!', note: 'For a grandparent\'s birthday.' },
    ],
  },
  {
    id: 'thanks',
    title: 'Thanks & apologies',
    zh: '感谢和道歉',
    icon: '🤝',
    phrases: [
      { zh: '谢谢妈。', en: 'Thanks, Mom.' },
      { zh: '对不起，让您担心了。', en: "I'm sorry I made you worry." },
      { zh: '是我不好。', en: 'It was my fault.' },
      { zh: '我知道错了。', en: 'I know I was wrong.' },
      { zh: '谢谢你们为我做的一切。', en: "Thank you for everything you've done for me." },
      { zh: '妈，我爱你。', en: 'Mom, I love you.', note: 'Rarely said out loud in many Chinese families — which makes it hit harder.' },
    ],
  },
];
