import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/db';
import { ensureFull, useDictStatus } from '../lib/dictionary';
import { prefetchStrokes } from '../lib/cards';
import { goBack } from '../lib/router';
import { chineseVoices, speak } from '../lib/speech';
import { getSettings, replaceSettings, updateSettings, useSettings, type Settings } from '../lib/settings';
import { signInWithEmail, signInWithGoogle, signOut, syncConfigured, syncNow, useSync } from '../lib/sync';
import { toast } from '../lib/toast';
import { IconBack } from '../components/Icons';

function Seg<K extends keyof Settings>({ k, options }: { k: K; options: [Settings[K], string][] }) {
  const s = useSettings();
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={String(v)} className={s[k] === v ? 'active' : ''} onClick={() => updateSettings({ [k]: v } as Partial<Settings>)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <span className="bold">{label}</span>
        {hint && <span className="tiny muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function SettingsView() {
  const s = useSettings();
  const dict = useDictStatus();
  const [voices, setVoices] = useState(chineseVoices());
  useEffect(() => {
    const t = setTimeout(() => setVoices(chineseVoices()), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="page settings">
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('')} aria-label="Back">
          <IconBack />
        </button>
        <h1>Settings</h1>
      </div>

      <section className="section">
        <h2 className="section-title">Display</h2>
        <div className="stack">
          <Row label="Characters">
            <Seg
              k="script"
              options={[
                ['simplified', '简体 Simplified'],
                ['traditional', '繁體 Traditional'],
              ]}
            />
          </Row>
          <Row label="Pinyin" hint="Fade pinyin out as you improve — tap-to-reveal is a good middle step.">
            <Seg
              k="pinyin"
              options={[
                ['show', 'Always'],
                ['tap', 'Tap to show'],
                ['hide', 'Hidden'],
              ]}
            />
          </Row>
          <Toggle k="toneColors" label="Tone colors" hint="Color pinyin and characters by tone, Pleco-style" />
          <Row label="Theme">
            <Seg
              k="theme"
              options={[
                ['system', 'Auto'],
                ['light', 'Light'],
                ['dark', 'Dark'],
              ]}
            />
          </Row>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Study</h2>
        <div className="stack">
          <Row label={`New words per day: ${s.newPerDay}`}>
            <input type="range" min={0} max={40} step={1} value={s.newPerDay} onChange={(e) => updateSettings({ newPerDay: Number(e.target.value) })} />
          </Row>
          <Row label={`Daily XP goal: ${s.dailyGoal}`}>
            <input type="range" min={30} max={500} step={10} value={s.dailyGoal} onChange={(e) => updateSettings({ dailyGoal: Number(e.target.value) })} />
          </Row>
          <Row label={`Target retention: ${Math.round(s.retention * 100)}%`} hint="FSRS schedules reviews so you remember this share of cards. Higher = more reviews.">
            <input type="range" min={0.8} max={0.97} step={0.01} value={s.retention} onChange={(e) => updateSettings({ retention: Number(e.target.value) })} />
          </Row>
          <Row label="Writing grid">
            <Seg
              k="grid"
              options={[
                ['tian', '田字格'],
                ['mi', '米字格'],
                ['none', 'Blank'],
              ]}
            />
          </Row>
          <Row label="Default writing quiz">
            <Seg
              k="writingMode"
              options={[
                ['quiz', 'From memory'],
                ['strokes', 'Stroke check'],
              ]}
            />
          </Row>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Audio</h2>
        <div className="stack">
          <Toggle k="autoplay" label="Autoplay pronunciation" hint="Play audio when a flashcard answer is revealed" />
          <Row label="Voice" hint={voices.length ? undefined : 'No Mandarin voice found — install one in your OS speech settings.'}>
            <select className="field" value={s.voiceURI} onChange={(e) => updateSettings({ voiceURI: e.target.value })}>
              <option value="">Default Mandarin voice</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </Row>
          <Row label={`Speed: ${s.ttsRate.toFixed(2)}×`}>
            <input type="range" min={0.5} max={1.2} step={0.05} value={s.ttsRate} onChange={(e) => updateSettings({ ttsRate: Number(e.target.value) })} />
          </Row>
          <button className="btn btn-secondary btn-sm" onClick={() => speak('你好，我在学写汉字。')}>
            🔊 Test voice
          </button>
        </div>
      </section>

      <Account />

      <section className="section">
        <h2 className="section-title">Offline data</h2>
        <div className="surface stack-sm small">
          <p>
            Dictionary: <strong>{dict.level === 'full' ? 'full CC-CEDICT' : 'starter set'}</strong> · {dict.entries.toLocaleString()} entries ·{' '}
            {dict.sentences.toLocaleString()} example sentences
          </p>
          {dict.loading && <p>Downloading… {Math.round(dict.progress * 100)}%</p>}
          {dict.error && <p style={{ color: 'var(--red)' }}>{dict.error}</p>}
          <div className="row wrap">
            <button className="btn btn-secondary btn-sm" onClick={() => void ensureFull(true)}>
              Re-download dictionary
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                const cards = await db.cards.toArray();
                prefetchStrokes(cards.map((c) => c.hanzi + c.trad).join(''));
                toast('Caching stroke data for all your cards…');
              }}
            >
              Cache stroke data for my cards
            </button>
          </div>
        </div>
      </section>

      <Backup />

      <section className="section small muted stack-sm">
        <h2 className="section-title">About & data licenses</h2>
        <p>
          Dictionary: <a href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict">CC-CEDICT</a> (CC BY-SA 4.0). HSK levels: complete-hsk-vocabulary (MIT).
          Characters & strokes: Make Me a Hanzi / hanzi-writer-data (LGPL / Arphic Public License). Example sentences:{' '}
          <a href="https://tatoeba.org">Tatoeba</a> (CC BY 2.0 FR).
        </p>
      </section>
    </div>
  );
}

function Toggle({ k, label, hint }: { k: 'toneColors' | 'autoplay'; label: string; hint?: string }) {
  const s = useSettings();
  return (
    <label className="settings-row row" style={{ cursor: 'pointer' }}>
      <div className="settings-label grow">
        <span className="bold">{label}</span>
        {hint && <span className="tiny muted">{hint}</span>}
      </div>
      <span className="switch">
        <input type="checkbox" checked={s[k]} onChange={(e) => updateSettings({ [k]: e.target.checked })} />
        <span />
      </span>
    </label>
  );
}

function Account() {
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <section className="section">
      <h2 className="section-title">Account & sync</h2>
      <div className="surface stack-sm">
        {!syncConfigured ? (
          <p className="small muted">
            <strong>Guest mode.</strong> Everything is saved on this device. Cloud sync turns on when the app is deployed with Supabase keys (see README).
          </p>
        ) : sync.session ? (
          <>
            <p className="small">
              Signed in as <strong>{sync.session.user.email}</strong>
            </p>
            <p className="tiny muted">
              {sync.syncing ? 'Syncing…' : sync.lastSync ? `Last synced ${new Date(sync.lastSync).toLocaleString()}` : 'Not synced yet'}
              {sync.error && <span style={{ color: 'var(--red)' }}> · {sync.error}</span>}
            </p>
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={() => void syncNow()} disabled={sync.syncing}>
                Sync now
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="small muted">Optional: sign in to back up and sync your cards across devices. Your guest progress is uploaded on first sign-in.</p>
            <button className="btn btn-secondary btn-block" onClick={() => void signInWithGoogle().catch((e) => toast(String(e.message ?? e)))}>
              Continue with Google
            </button>
            {sent ? (
              <p className="small">Check your inbox for a sign-in link.</p>
            ) : (
              <form
                className="row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await signInWithEmail(email);
                    setSent(true);
                  } catch (err) {
                    toast(err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                <input className="field grow" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                <button className="btn btn-primary" type="submit">
                  Email link
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Backup() {
  const fileRef = useRef<HTMLInputElement>(null);
  async function exportData() {
    const data = {
      app: 'hanzi-heritage',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      decks: await db.decks.toArray(),
      cards: await db.cards.toArray(),
      srs: await db.srs.toArray(),
      reviews: await db.reviews.toArray(),
      writingAttempts: await db.writingAttempts.toArray(),
      progress: await db.progress.toArray(),
      kv: (await db.kv.toArray()).filter((k) => !k.key.startsWith('sync:')),
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hanzi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'hanzi-heritage') throw new Error('Not a backup from this app');
      await db.transaction('rw', [db.decks, db.cards, db.srs, db.reviews, db.writingAttempts, db.progress, db.kv], async () => {
        await db.decks.bulkPut(data.decks ?? []);
        await db.cards.bulkPut(data.cards ?? []);
        await db.srs.bulkPut(data.srs ?? []);
        await db.reviews.bulkPut(data.reviews ?? []);
        await db.writingAttempts.bulkPut(data.writingAttempts ?? []);
        await db.progress.bulkPut(data.progress ?? []);
        await db.kv.bulkPut(data.kv ?? []);
      });
      if (data.settings) replaceSettings(data.settings);
      toast('Backup restored');
    } catch (err) {
      toast(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return (
    <section className="section">
      <h2 className="section-title">Backup</h2>
      <div className="row wrap">
        <button className="btn btn-secondary btn-sm" onClick={() => void exportData()}>
          Export backup (.json)
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
          Restore backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importData(f);
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}
