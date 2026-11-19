import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type HanziWriter from 'hanzi-writer';
import { useSettings } from '../lib/settings';
import { CharStroke } from './StrokeOrder';
import { IconBulb, IconCheck, IconClose, IconRedo, IconTrash, IconUndo } from './Icons';
import './WritingPad.css';

export type PadMode = 'trace' | 'quiz' | 'strokes' | 'free';

export interface CharResult {
  char: string;
  passed: boolean;
  mistakes: number;
  strokes: number;
  hinted: boolean;
  image?: string;
}

export interface WritingResult {
  passed: boolean;
  mistakes: number;
  strokes: number;
  hinted: boolean;
  image?: string;
  perChar: CharResult[];
}

interface Props {
  chars: string[];
  mode: PadMode;
  onDone?: (r: WritingResult) => void;
  /** fraction of the viewport height the square pad may use */
  maxHeight?: number;
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** 田字格 / 米字格 guide lines */
function Grid({ kind }: { kind: 'tian' | 'mi' | 'none' }) {
  if (kind === 'none') return null;
  return (
    <svg className="wp-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <rect x="0.5" y="0.5" width="99" height="99" fill="none" strokeWidth="1" />
      <line x1="50" y1="0" x2="50" y2="100" strokeDasharray="3 3" />
      <line x1="0" y1="50" x2="100" y2="50" strokeDasharray="3 3" />
      {kind === 'mi' && (
        <>
          <line x1="0" y1="0" x2="100" y2="100" strokeDasharray="3 3" />
          <line x1="100" y1="0" x2="0" y2="100" strokeDasharray="3 3" />
        </>
      )}
    </svg>
  );
}

function combineImages(images: (string | undefined)[]): Promise<string | undefined> {
  const srcs = images.filter((x): x is string => !!x);
  if (!srcs.length) return Promise.resolve(undefined);
  return Promise.all(
    srcs.map(
      (src) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = src;
        }),
    ),
  )
    .then((imgs) => {
      const s = 96;
      const c = document.createElement('canvas');
      c.width = s * imgs.length;
      c.height = s;
      const ctx = c.getContext('2d')!;
      imgs.forEach((img, i) => ctx.drawImage(img, i * s, 0, s, s));
      return c.toDataURL('image/png');
    })
    .catch(() => srcs[0]);
}

export function WritingPad({ chars, mode, onDone, maxHeight = 0.52 }: Props) {
  const { grid } = useSettings();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(300);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<CharResult[]>([]);
  const char = chars[index] ?? '';

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = window.innerHeight * maxHeight;
      setSize(Math.max(200, Math.floor(Math.min(w, h, 480))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [maxHeight]);

  // reset when the word changes
  useEffect(() => {
    setIndex(0);
    setResults([]);
  }, [chars.join(''), mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishChar = useCallback(
    (r: CharResult) => {
      const next = [...results, r];
      setResults(next);
      if (index + 1 < chars.length) setIndex(index + 1);
      else if (onDone) {
        void combineImages(next.map((x) => x.image)).then((image) =>
          onDone({
            passed: next.every((x) => x.passed),
            mistakes: next.reduce((a, x) => a + x.mistakes, 0),
            strokes: next.reduce((a, x) => a + x.strokes, 0),
            hinted: next.some((x) => x.hinted),
            image,
            perChar: next,
          }),
        );
      }
    },
    [results, index, chars.length, onDone],
  );

  const done = results.length >= chars.length;

  return (
    <div className="wp" ref={wrapRef}>
      {chars.length > 1 && (
        <div className="wp-progress" aria-label={`Character ${Math.min(index + 1, chars.length)} of ${chars.length}`}>
          {chars.map((c, i) => {
            const r = results[i];
            return (
              <span key={i} className={`wp-dot ${i === index && !done ? 'current' : ''} ${r ? (r.passed ? 'pass' : 'fail') : ''}`}>
                {r ? <span className="hz">{c}</span> : i + 1}
              </span>
            );
          })}
        </div>
      )}
      {!done &&
        (mode === 'trace' || mode === 'strokes' ? (
          <HanziQuiz key={`${char}-${index}-${mode}`} char={char} size={size} grid={grid} outline={mode === 'trace'} onComplete={finishChar} />
        ) : (
          <FreehandPad key={`${char}-${index}-${mode}`} char={char} size={size} grid={grid} grade={mode === 'quiz'} onComplete={finishChar} />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------- hanzi-writer quiz (trace / stroke check)
function HanziQuiz({
  char,
  size,
  grid,
  outline,
  onComplete,
}: {
  char: string;
  size: number;
  grid: 'tian' | 'mi' | 'none';
  outline: boolean;
  onComplete: (r: CharResult) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [strokeInfo, setStrokeInfo] = useState({ done: 0, total: 0 });
  const [hinted, setHinted] = useState(false);
  const [failed, setFailed] = useState(false);
  const hintedRef = useRef(false);
  const strokeInfoRef = useRef(strokeInfo);
  strokeInfoRef.current = strokeInfo;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    let alive = true;
    import('hanzi-writer').then(({ default: HW }) => {
      if (!alive) return;
      const writer = HW.create(el, char, {
        width: size,
        height: size,
        padding: Math.round(size * 0.06),
        showCharacter: false,
        showOutline: outline,
        strokeColor: cssVar('--text', '#1a1917'),
        outlineColor: cssVar('--border', '#dddddd'),
        highlightColor: cssVar('--accent', '#b91c1c'),
        drawingColor: cssVar('--text', '#1a1917'),
        drawingWidth: Math.max(14, size / 18),
        highlightOnComplete: true,
        onLoadCharDataSuccess: (data) => alive && setStrokeInfo({ done: 0, total: data.strokes.length }),
        onLoadCharDataError: () => alive && setFailed(true),
      });
      writerRef.current = writer;
      void writer.quiz({
        leniency: outline ? 1.2 : 1,
        showHintAfterMisses: outline ? 1 : 3,
        markStrokeCorrectAfterMisses: outline ? false : 5,
        onMistake: (s) => alive && setMistakes(s.totalMistakes),
        onCorrectStroke: (s) => alive && setStrokeInfo((x) => ({ ...x, done: s.strokeNum + 1 })),
        onComplete: (summary) => {
          if (!alive) return;
          setTimeout(() => {
            if (!alive) return;
            const strokes = strokeInfoRef.current.total || 1;
            const allowed = outline ? Infinity : Math.max(1, Math.ceil(strokes * 0.25));
            onComplete({
              char,
              passed: summary.totalMistakes <= allowed && !(hintedRef.current && !outline),
              mistakes: summary.totalMistakes,
              strokes,
              hinted: hintedRef.current,
            });
          }, 700);
        },
      });
    });
    return () => {
      alive = false;
      writerRef.current?.cancelQuiz();
      writerRef.current = null;
      el.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, size, outline]);

  function hint() {
    const w = writerRef.current;
    if (!w) return;
    hintedRef.current = true;
    setHinted(true);
    void w.showOutline();
    setTimeout(() => !outline && void writerRef.current?.hideOutline(), 1500);
  }

  if (failed) {
    return (
      <div className="wp-fallback">
        <p className="muted small">Stroke data for this character couldn't be loaded (offline?). Use the freehand pad instead.</p>
        <FreehandPad char={char} size={size} grid={grid} grade onComplete={onComplete} />
      </div>
    );
  }

  return (
    <>
      <div className="wp-surface" style={{ width: size, height: size }}>
        <Grid kind={grid} />
        <div ref={ref} className="wp-hw" />
      </div>
      <div className="wp-toolbar">
        <span className="small muted">
          {strokeInfo.total ? `Stroke ${Math.min(strokeInfo.done + 1, strokeInfo.total)} / ${strokeInfo.total}` : 'Loading…'}
          {mistakes > 0 && <span className="wp-miss"> · {mistakes} miss{mistakes === 1 ? '' : 'es'}</span>}
        </span>
        {!outline && (
          <button className="btn btn-secondary btn-sm" onClick={hint} disabled={!strokeInfo.total}>
            <IconBulb /> {hinted ? 'Hint again' : 'Hint'}
          </button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- freehand canvas (quiz-from-memory / free write)
interface Pt {
  x: number;
  y: number;
  p: number;
}

function FreehandPad({
  char,
  size,
  grid,
  grade,
  onComplete,
}: {
  char: string;
  size: number;
  grid: 'tian' | 'mi' | 'none';
  /** quiz mode: check → compare → self-grade; otherwise free write */
  grade: boolean;
  onComplete: (r: CharResult) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const redo = useRef<Pt[][]>([]);
  const current = useRef<Pt[] | null>(null);
  const [, force] = useState(0);
  const [hint, setHint] = useState(false);
  const [hinted, setHinted] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [model, setModel] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = cssVar('--text', '#1a1917');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = current.current ? [...strokes.current, current.current] : strokes.current;
    for (const s of all) drawStroke(ctx, s, size);
  }, [size]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    draw();
  }, [size, draw]);

  // iOS Safari still scrolls on touchmove unless a non-passive listener cancels it
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    c.addEventListener('touchstart', stop, { passive: false });
    c.addEventListener('touchmove', stop, { passive: false });
    return () => {
      c.removeEventListener('touchstart', stop);
      c.removeEventListener('touchmove', stop);
    };
  }, []);

  function point(e: React.PointerEvent | PointerEvent): Pt {
    const r = canvasRef.current!.getBoundingClientRect();
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p: pressure };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (checking) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = [point(e)];
    redo.current = [];
    draw();
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!current.current) return;
    const events = 'getCoalescedEvents' in e.nativeEvent ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) current.current.push(point(ev));
    draw();
  }

  function onUp() {
    if (!current.current) return;
    if (current.current.length === 1) current.current.push({ ...current.current[0]!, x: current.current[0]!.x + 0.002 });
    strokes.current.push(current.current);
    current.current = null;
    draw();
    force((n) => n + 1);
  }

  function undo() {
    const s = strokes.current.pop();
    if (s) redo.current.push(s);
    draw();
    force((n) => n + 1);
  }
  function redoStroke() {
    const s = redo.current.pop();
    if (s) strokes.current.push(s);
    draw();
    force((n) => n + 1);
  }
  function clear() {
    redo.current = [...strokes.current].reverse();
    strokes.current = [];
    draw();
    force((n) => n + 1);
  }

  function snapshot(): string | undefined {
    if (!strokes.current.length) return undefined;
    const s = 96;
    const c = document.createElement('canvas');
    c.width = s;
    c.height = s;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#1a1917';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of strokes.current) drawStroke(ctx, st, s);
    return c.toDataURL('image/png');
  }

  function showHint() {
    setHint(true);
    setHinted(true);
    setTimeout(() => setHint(false), 1500);
  }

  const empty = strokes.current.length === 0;

  if (checking !== null) {
    return (
      <div className="wp-compare">
        <div className="wp-compare-row">
          <figure>
            {checking ? <img src={checking} alt="Your writing" className="wp-attempt" /> : <div className="wp-attempt" />}
            <figcaption>You wrote</figcaption>
          </figure>
          <figure>
            <CharStroke character={char} size={132} autoplay onStrokeCount={setStrokeCount} />
            <figcaption>Correct stroke order</figcaption>
          </figure>
        </div>
        <p className="center muted small">Did you write it correctly — including stroke order?</p>
        <div className="grid-2">
          <button
            className="btn btn-danger btn-lg"
            onClick={() => onComplete({ char, passed: false, mistakes: 1, strokes: strokeCount, hinted, image: checking || undefined })}
          >
            <IconClose /> Missed
          </button>
          <button
            className="btn btn-lg wp-pass"
            onClick={() => onComplete({ char, passed: true, mistakes: hinted ? 1 : 0, strokes: strokeCount, hinted, image: checking || undefined })}
          >
            <IconCheck /> Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="wp-surface" style={{ width: size, height: size }}>
        <Grid kind={grid} />
        {(hint || model) && (
          <span className="wp-ghost hz-kai" style={{ fontSize: size * 0.82, lineHeight: `${size}px` }} aria-hidden>
            {char}
          </span>
        )}
        <canvas
          ref={canvasRef}
          className="wp-canvas"
          style={{ width: size, height: size }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label={grade ? 'Write the character from memory' : 'Free writing canvas'}
        />
      </div>
      <div className="wp-toolbar">
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" onClick={undo} disabled={empty} aria-label="Undo stroke">
            <IconUndo />
          </button>
          <button className="icon-btn" onClick={redoStroke} disabled={!redo.current.length} aria-label="Redo stroke">
            <IconRedo />
          </button>
          <button className="icon-btn" onClick={clear} disabled={empty} aria-label="Clear">
            <IconTrash />
          </button>
        </div>
        {grade ? (
          <div className="row">
            <button className="btn btn-secondary btn-sm" onClick={showHint}>
              <IconBulb /> Hint
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setChecking(snapshot() ?? '')}>
              Check
            </button>
          </div>
        ) : (
          <div className="row">
            <button className={`btn btn-sm ${model ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModel((m) => !m)}>
              Model
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onComplete({ char, passed: true, mistakes: 0, strokes: 0, hinted: model, image: snapshot() })}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, pts: Pt[], size: number) {
  if (pts.length < 2) return;
  const base = size * 0.034;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    ctx.lineWidth = base * (0.55 + b.p * 0.9);
    ctx.beginPath();
    if (i === 1) ctx.moveTo(a.x * size, a.y * size);
    else {
      const prev = pts[i - 2]!;
      ctx.moveTo(((prev.x + a.x) / 2) * size, ((prev.y + a.y) / 2) * size);
    }
    ctx.quadraticCurveTo(a.x * size, a.y * size, ((a.x + b.x) / 2) * size, ((a.y + b.y) / 2) * size);
    ctx.stroke();
  }
}
