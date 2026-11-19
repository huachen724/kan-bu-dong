import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ensureFull, ensureSeed } from './lib/dictionary'
import { ensureDefaultDeck, migrateLegacySets } from './lib/cards'
import { applyTheme } from './lib/settings'
import { initSync } from './lib/sync'

applyTheme()
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)

async function boot() {
  // the starter dictionary is bundled, so this is fast and works offline
  await ensureSeed()
  await ensureDefaultDeck()
  const migrated = await migrateLegacySets()
  if (migrated) console.info(`Imported ${migrated} study set(s) from the original flashcard app`)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // full CC-CEDICT bundle: from IndexedDB if cached, otherwise downloaded once in the background
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb) : setTimeout(cb, 300))
  idle(() => void ensureFull())
  void initSync().catch((err) => console.warn('sync unavailable', err))
}

void boot()
