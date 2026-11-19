-- 看不懂 (kan-bu-dong) — Supabase schema (free tier). Run in the Supabase SQL editor.
-- The app is local-first (IndexedDB via Dexie); these tables mirror the local tables for sync.
-- Every user table is protected by row-level security: users only ever see their own rows.

-- ---------------------------------------------------------------- users
-- Supabase Auth owns auth.users; profiles holds app-level user data.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------- decks & cards
create table if not exists public.decks (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  kind text not null default 'custom',          -- default | custom | legacy | pack | hsk
  pack_id text,
  modes text[] not null default '{reading,writing}',
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.cards (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_id text not null,
  character text not null,                       -- simplified
  traditional text,
  pinyin text,                                   -- tone marks
  definition text,
  hsk_level smallint,
  part_of_speech text,
  source text,                                   -- dictionary | pack:<id> | hsk:<n> | import | legacy | speak …
  legacy_question text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- current FSRS state per (card, quiz mode)
create table if not exists public.card_srs (
  id text primary key,                           -- "<card_id>|<mode>"
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null,
  deck_id text not null,
  mode text not null,                            -- reading | writing | listening | meaning
  state smallint not null default 0,             -- 0 new, 1 learning, 2 review, 3 relearning
  fsrs_state jsonb not null,
  due_date timestamptz,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- review log (one row per grade)
create table if not exists public.reviews (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null,
  srs_id text,
  mode text,
  grade smallint not null,                       -- 1 again, 2 hard, 3 good, 4 easy
  fsrs_state jsonb,
  due_date timestamptz,
  reviewed_at timestamptz not null,
  duration_ms integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.writing_attempts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text,
  character text not null,
  mode text not null,                            -- trace | quiz | strokes | free | review
  passed boolean,
  mistakes integer default 0,
  image text,                                    -- small PNG data URL of the attempt
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  xp integer not null default 0,
  reviews integer not null default 0,
  new_cards integer not null default 0,
  writing integer not null default 0,
  readings integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ---------------------------------------------------------------- shared reference data (read-only for users)
-- Optional: the app ships these as an offline bundle; `npm run data:supabase` fills them.
create table if not exists public.dictionary_entries (
  id integer primary key,                        -- == frequency rank
  simplified text not null,
  traditional text not null,
  pinyin text not null,                          -- CC-CEDICT numbered pinyin
  definitions text[] not null,
  hsk_level smallint,
  hsk3_level smallint,
  part_of_speech text,
  frequency_rank integer
);
create index if not exists dictionary_entries_simplified on public.dictionary_entries (simplified);
create index if not exists dictionary_entries_traditional on public.dictionary_entries (traditional);

create table if not exists public.example_sentences (
  id integer primary key,                        -- Tatoeba sentence id
  chinese text not null,
  english text not null,
  source text default 'tatoeba'
);

create table if not exists public.vocab_packs (
  id text primary key,
  title text not null,
  title_zh text,
  description text,
  sort_order integer
);

create table if not exists public.pack_items (
  pack_id text references public.vocab_packs (id) on delete cascade,
  position integer,
  character text not null,
  pinyin text,
  definition text,
  example_zh text,
  example_en text,
  primary key (pack_id, position)
);

-- ---------------------------------------------------------------- indexes for sync (pull by updated_at)
create index if not exists decks_sync on public.decks (user_id, updated_at);
create index if not exists cards_sync on public.cards (user_id, updated_at);
create index if not exists card_srs_sync on public.card_srs (user_id, updated_at);
create index if not exists reviews_sync on public.reviews (user_id, updated_at);
create index if not exists writing_sync on public.writing_attempts (user_id, updated_at);
create index if not exists progress_sync on public.user_progress (user_id, updated_at);

-- ---------------------------------------------------------------- row-level security
alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.card_srs enable row level security;
alter table public.reviews enable row level security;
alter table public.writing_attempts enable row level security;
alter table public.user_progress enable row level security;
alter table public.dictionary_entries enable row level security;
alter table public.example_sentences enable row level security;
alter table public.vocab_packs enable row level security;
alter table public.pack_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['decks','cards','card_srs','reviews','writing_attempts','user_progress'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
  foreach t in array array['dictionary_entries','example_sentences','vocab_packs','pack_items'] loop
    execute format('drop policy if exists "read reference data" on public.%I', t);
    execute format('create policy "read reference data" on public.%I for select using (true)', t);
  end loop;
end $$;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- create a profile row automatically on sign-up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
