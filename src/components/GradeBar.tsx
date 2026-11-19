import { useEffect } from 'react';
import { previewIntervals, Rating, type Grade } from '../lib/srs';
import type { SrsItem } from '../lib/db';

const GRADES: { g: Grade; label: string; cls: string; key: string }[] = [
  { g: Rating.Again as Grade, label: 'Again', cls: 'g-again', key: '1' },
  { g: Rating.Hard as Grade, label: 'Hard', cls: 'g-hard', key: '2' },
  { g: Rating.Good as Grade, label: 'Good', cls: 'g-good', key: '3' },
  { g: Rating.Easy as Grade, label: 'Easy', cls: 'g-easy', key: '4' },
];

export function GradeBar({ item, suggested, onGrade }: { item: SrsItem; suggested?: Grade; onGrade: (g: Grade) => void }) {
  const preview = previewIntervals(item);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const hit = GRADES.find((x) => x.key === e.key);
      if (hit) onGrade(hit.g);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onGrade]);
  return (
    <div className="grade-bar" role="group" aria-label="How well did you remember?">
      {GRADES.map(({ g, label, cls }) => (
        <button key={g} className={`grade-btn ${cls} ${suggested === g ? 'suggested' : ''}`} onClick={() => onGrade(g)}>
          <span className="grade-label">{label}</span>
          <span className="grade-ivl">{preview[g]}</span>
        </button>
      ))}
    </div>
  );
}
