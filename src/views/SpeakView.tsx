import { useEffect, useRef, useState } from 'react';
import { segment, shortDefinition, useDictStatus, pinyinForText } from '../lib/dictionary';
import { entryToCard } from '../lib/cards';
import { createRecognizer, recognitionSupported } from '../lib/speech';
import { goBack, wordHref } from '../lib/router';
import { toMarked } from '../lib/pinyin';
import { AddButton } from '../components/AddButton';
import { AudioButton } from '../components/AudioButton';
import { Hz, Pinyin } from '../components/Hanzi';
import { IconBack, IconMic } from '../components/Icons';
import { TapText } from '../components/TapText';
import './ToolsViews.css';

/**
 * Speak → Characters — the heritage-learner bridge: say something you already know how to say,
 * see exactly how it's written, word by word.
 */
export function SpeakView() {
  useDictStatus();
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const supported = recognitionSupported();

  useEffect(() => () => recRef.current?.abort(), []);

  function start() {
    setError('');
    const rec = createRecognizer();
    if (!rec) return;
    recRef.current = rec;
    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finalText += r[0]!.transcript;
        else interimText += r[0]!.transcript;
      }
      setInterim(interimText);
      if (finalText) setText(finalText.trim());
    };
    rec.onerror = (e) => {
      setError(
        e.error === 'not-allowed'
          ? 'Microphone permission was denied.'
          : e.error === 'no-speech'
            ? "Didn't catch that — try again."
            : e.error === 'network'
              ? 'Speech recognition needs an internet connection in this browser.'
              : `Speech recognition error: ${e.error}`,
      );
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    setText('');
    setListening(true);
    rec.start();
  }

  function stop() {
    recRef.current?.stop();
  }

  const words = text ? segment(text).filter((t) => t.cjk) : [];

  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('')} aria-label="Back">
          <IconBack />
        </button>
        <h1>Speak → Characters</h1>
      </div>
      <p className="page-sub">You already know how to say it. Say it in Mandarin and see how it's written.</p>

      <div className="speak-stage">
        {supported ? (
          <button className={`speak-mic ${listening ? 'on' : ''}`} onClick={listening ? stop : start} aria-label={listening ? 'Stop listening' : 'Start listening'}>
            <IconMic />
          </button>
        ) : (
          <p className="banner">Speech recognition isn't available in this browser — try Chrome, Edge or Safari. You can type below instead.</p>
        )}
        <p className="small muted center">{listening ? interim || 'Listening… speak Mandarin' : supported ? 'Tap and say a phrase, e.g. “我今天很累”' : ''}</p>
        {error && <p className="small center" style={{ color: 'var(--red)' }}>{error}</p>}
      </div>

      <form
        className="row"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          setText(typed.trim());
        }}
      >
        <input className="field grow" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or paste / type Chinese text" />
        <button className="btn btn-secondary" type="submit">
          Go
        </button>
      </form>

      {text && (
        <section className="card stack">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <TapText text={text} ruby className="speak-text" />
              <p className="small muted" style={{ marginTop: 4 }}>
                {toMarked(pinyinForText(text))}
              </p>
            </div>
            <AudioButton text={text} />
          </div>
          <AddButton
            card={{ hanzi: text.replace(/[，。！？、\s]/g, ''), pinyin: toMarked(pinyinForText(text)), definition: '', source: 'speak' }}
          />
          <h3 className="section-title" style={{ marginTop: 6 }}>
            Word by word
          </h3>
          <div className="list">
            {words.map((t, i) => (
              <div key={i} className="list-item">
                <a href={wordHref(t.text, t.entry?.p)} className="row grow" style={{ textDecoration: 'none', color: 'inherit', gap: 12 }}>
                  <Hz s={t.text} t={t.entry?.t} className="speak-word-hz" />
                  <div className="grow">
                    {t.entry && <Pinyin p={t.entry.p} force />}
                    <div className="small muted">{t.entry ? shortDefinition(t.entry, 2) : 'not in dictionary'}</div>
                  </div>
                </a>
                {t.entry && <AddButton compact card={entryToCard(t.entry, 'speak')} />}
              </div>
            ))}
          </div>
          <a className="btn btn-secondary" href={`#/write/${encodeURIComponent(text.replace(/[，。！？、\s]/g, ''))}`}>
            ✍️ Practice writing it
          </a>
        </section>
      )}
    </div>
  );
}
