import { useState, type CSSProperties } from 'react';
import { syllables, toMarked } from '../lib/pinyin';
import { useSettings } from '../lib/settings';
import { toTraditional } from '../lib/dictionary';

/** Chinese text in the user's chosen script, with the right font/lang for that script. */
export function Hz({
  s,
  t,
  className = '',
  style,
}: {
  s: string;
  /** traditional form if known; otherwise derived from the dictionary */
  t?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { script } = useSettings();
  const trad = script === 'traditional';
  const text = trad ? t || toTraditional(s) : s;
  return (
    <span className={`hz ${className}`} lang={trad ? 'zh-Hant' : 'zh-Hans'} style={style}>
      {text}
    </span>
  );
}

/** Tone-colored pinyin. `force` shows it even when the user has pinyin hidden (e.g. as a quiz answer). */
export function Pinyin({
  p,
  force = false,
  className = '',
}: {
  p: string;
  force?: boolean;
  className?: string;
}) {
  const s = useSettings();
  const [revealed, setRevealed] = useState(false);
  if (!p) return null;
  if (!force && s.pinyin === 'hide') return null;
  const hidden = !force && s.pinyin === 'tap' && !revealed;
  const parts = /[0-5]/.test(p) || p.includes(' ') ? syllables(p) : [{ text: toMarked(p), tone: 0 }];
  return (
    <span
      className={`py ${hidden ? 'py-hidden' : ''} ${className}`}
      onClick={hidden ? (e) => (e.stopPropagation(), setRevealed(true)) : undefined}
      title={hidden ? 'Tap to show pinyin' : undefined}
    >
      {parts.map((syl, i) => (
        <span key={i} className={s.toneColors && syl.tone ? `tone-${syl.tone}` : undefined}>
          {i > 0 ? ' ' : ''}
          {syl.text}
        </span>
      ))}
    </span>
  );
}

/** Characters colored by tone, Pleco-style (used for the big headword) */
export function ToneHanzi({ s, t, p, className = '' }: { s: string; t?: string; p: string; className?: string }) {
  const settings = useSettings();
  const trad = settings.script === 'traditional';
  const text = [...(trad ? t || toTraditional(s) : s)];
  const tones = syllables(p).map((x) => x.tone);
  const colored = settings.toneColors && tones.length === text.length;
  return (
    <span className={`hz ${className}`} lang={trad ? 'zh-Hant' : 'zh-Hans'}>
      {text.map((ch, i) => (
        <span key={i} className={colored ? `tone-${tones[i]}` : undefined}>
          {ch}
        </span>
      ))}
    </span>
  );
}
