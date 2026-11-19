import { useSyncExternalStore } from 'react';

export interface Settings {
  script: 'simplified' | 'traditional';
  /** show = always, tap = blurred until tapped, hide = only where pinyin is the answer */
  pinyin: 'show' | 'tap' | 'hide';
  toneColors: boolean;
  newPerDay: number;
  dailyGoal: number;
  grid: 'tian' | 'mi' | 'none';
  theme: 'system' | 'light' | 'dark';
  ttsRate: number;
  voiceURI: string;
  autoplay: boolean;
  retention: number;
  lastDeckId: string;
  writingMode: 'quiz' | 'strokes' | 'trace';
}

const KEY = 'hz_settings_v1';

const DEFAULTS: Settings = {
  script: 'simplified',
  pinyin: 'show',
  toneColors: true,
  newPerDay: 10,
  dailyGoal: 100,
  grid: 'tian',
  theme: 'system',
  ttsRate: 0.85,
  voiceURI: '',
  autoplay: true,
  retention: 0.9,
  lastDeckId: 'default',
  writingMode: 'quiz',
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage unavailable — settings stay in memory for this session
  }
  applyTheme();
  listeners.forEach((l) => l());
}

export function replaceSettings(next: Partial<Settings>): void {
  updateSettings({ ...DEFAULTS, ...next });
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function applyTheme(): void {
  const root = document.documentElement;
  if (current.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = current.theme;
  const dark =
    current.theme === 'dark' || (current.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f0f0e' : '#ffffff');
}
