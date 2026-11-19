import { useEffect, useRef, useState } from 'react';
import type HanziWriter from 'hanzi-writer';
import './StrokeOrder.css';

/* CJK Unified Ideographs + Extension A */
const CJK = /[一-鿿㐀-䶿]/;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

interface CharStrokeProps {
  character: string;
  size?: number;
  autoplay?: boolean;
  loop?: boolean;
  onStrokeCount?: (n: number) => void;
}

export function CharStroke({ character, size = 80, autoplay = false, loop = false, onStrokeCount }: CharStrokeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);
  const [available, setAvailable] = useState(true);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';
    let alive = true;

    /* Dynamic import keeps hanzi-writer out of the initial bundle parse */
    import('hanzi-writer').then(({ default: HanziWriter }) => {
      if (!alive || !el) return;
      try {
        const writer = HanziWriter.create(el, character, {
          width: size,
          height: size,
          padding: Math.round(size / 10),
          showOutline: true,
          strokeColor: cssVar('--text', '#1a1917'),
          radicalColor: cssVar('--accent', '#b91c1c'),
          outlineColor: cssVar('--border', '#cccccc'),
          drawingWidth: 3,
          strokeAnimationSpeed: 1.4,
          delayBetweenStrokes: 180,
          onLoadCharDataSuccess: (data) => {
            if (alive) onStrokeCount?.(data.strokes.length);
          },
          onLoadCharDataError: () => {
            if (alive) setAvailable(false);
          },
        });
        writerRef.current = writer;
        if (autoplay) {
          setAnimating(true);
          if (loop) void writer.loopCharacterAnimation();
          else writer.animateCharacter({ onComplete: () => alive && setAnimating(false) });
        }
      } catch {
        if (alive) setAvailable(false);
      }
    });

    return () => {
      alive = false;
      writerRef.current = null;
      if (el) el.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, size, autoplay, loop]);

  function handlePlay() {
    const writer = writerRef.current;
    if (!writer || animating) return;
    setAnimating(true);
    writer.animateCharacter({ onComplete: () => setAnimating(false) });
  }

  if (!available) {
    return (
      <span className="cs-fallback hz" style={{ fontSize: size * 0.7 }}>
        {character}
      </span>
    );
  }

  return (
    <div className="cs">
      <div ref={containerRef} className="cs-canvas" style={{ width: size, height: size }} />
      {!loop && (
        <button
          className="cs-play"
          onClick={handlePlay}
          disabled={animating}
          title="Animate stroke order"
          aria-label={`Animate stroke order for ${character}`}
        >
          {animating ? '⏸' : '▶'}
        </button>
      )}
    </div>
  );
}

interface Props {
  answer: string;
  size?: number;
  label?: string;
}

export function StrokeOrder({ answer, size = 80, label = 'Stroke order' }: Props) {
  const chars = [...answer].filter((c) => CJK.test(c));
  if (chars.length === 0) return null;

  return (
    <div className="stroke-order">
      {label && <span className="so-label">{label}</span>}
      <div className="so-chars">
        {chars.map((char, i) => (
          <CharStroke key={`${char}-${i}`} character={char} size={size} />
        ))}
      </div>
    </div>
  );
}
