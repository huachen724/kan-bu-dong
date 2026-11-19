import { useState } from 'react';
import { speak, ttsSupported } from '../lib/speech';
import { toast } from '../lib/toast';
import { IconSpeaker } from './Icons';

export function AudioButton({ text, size = 'md', label }: { text: string; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const dim = size === 'lg' ? 64 : size === 'sm' ? 34 : 44;
  return (
    <button
      type="button"
      className="audio-btn"
      style={{ width: label ? 'auto' : dim, height: dim, padding: label ? '0 14px' : 0 }}
      aria-label={`Play pronunciation of ${text}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!ttsSupported()) {
          toast('Audio needs a browser with speech synthesis (Chrome, Safari, Edge).');
          return;
        }
        setPlaying(true);
        speak(text, { onEnd: () => setPlaying(false) });
        setTimeout(() => setPlaying(false), 4000);
      }}
      data-playing={playing || undefined}
    >
      <IconSpeaker style={{ width: dim * 0.45, height: dim * 0.45 }} />
      {label && <span>{label}</span>}
    </button>
  );
}
