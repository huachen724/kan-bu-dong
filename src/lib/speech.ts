import { getSettings } from './settings';

/** Free text-to-speech via the Web Speech API (voices come from the OS / browser). */
export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function chineseVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => /^(zh|cmn)/i.test(v.lang) && !/HK|yue/i.test(v.lang))
    .sort((a, b) => Number(/CN/i.test(b.lang)) - Number(/CN/i.test(a.lang)));
}

if (ttsSupported()) {
  // some browsers populate voices lazily
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices());
}

export function speak(text: string, opts: { rate?: number; onEnd?: () => void } = {}): boolean {
  if (!ttsSupported() || !text) return false;
  const s = getSettings();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = chineseVoices();
  const voice = voices.find((v) => v.voiceURI === s.voiceURI) ?? voices[0];
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'zh-CN';
  u.rate = opts.rate ?? s.ttsRate;
  if (opts.onEnd) {
    u.onend = opts.onEnd;
    u.onerror = opts.onEnd;
  }
  speechSynthesis.speak(u);
  return true;
}

// ---------------------------------------------------------------- speech recognition
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function recognitionSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function createRecognizer(): RecognitionLike | null {
  const w = window as unknown as Record<string, new () => RecognitionLike>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = 'zh-CN';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  return r;
}
