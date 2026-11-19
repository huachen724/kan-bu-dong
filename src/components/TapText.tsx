import { Fragment, useMemo, useState } from 'react';
import { segment, type Token } from '../lib/dictionary';
import { syllables, toMarked } from '../lib/pinyin';
import { useSettings } from '../lib/settings';
import { EntrySheet } from './EntrySheet';
import './TapText.css';

/**
 * Chinese text where every word is tappable (opens the dictionary popup in place),
 * with optional pinyin ruby above each character.
 */
export function TapText({
  text,
  ruby = false,
  fix,
  className = '',
  onWord,
}: {
  text: string;
  ruby?: boolean;
  fix?: Record<string, string>;
  className?: string;
  onWord?: (t: Token) => void;
}) {
  const { script, toneColors } = useSettings();
  const trad = script === 'traditional';
  const tokens = useMemo(() => segment(text), [text]);
  const [open, setOpen] = useState<Token | null>(null);

  return (
    <>
      <span className={`tap-text hz ${className}`} lang={trad ? 'zh-Hant' : 'zh-Hans'}>
        {tokens.map((tok, i) => {
          if (!tok.cjk) return <Fragment key={i}>{tok.text}</Fragment>;
          const e = tok.entry;
          const shown = e && (e.s === tok.text || e.t === tok.text) ? (trad ? e.t : e.s) : tok.text;
          const chars = [...shown];
          const py = fix?.[tok.text] ?? tok.entry?.p ?? '';
          const syl = syllables(py);
          const aligned = syl.length === chars.length;
          return (
            <button
              key={i}
              type="button"
              className="tap-word"
              onClick={() => (onWord ? onWord(tok) : setOpen(tok))}
            >
              {ruby && aligned
                ? chars.map((ch, k) => (
                    <ruby key={k}>
                      {ch}
                      <rt className={toneColors ? `tone-${syl[k]!.tone}` : undefined}>{syl[k]!.text.toLowerCase()}</rt>
                    </ruby>
                  ))
                : ruby && py
                  ? (
                      <ruby>
                        {shown}
                        <rt>{toMarked(py)}</rt>
                      </ruby>
                    )
                  : shown}
            </button>
          );
        })}
      </span>
      {open && <EntrySheet word={open.text} pinyin={open.entry?.p} onClose={() => setOpen(null)} />}
    </>
  );
}
