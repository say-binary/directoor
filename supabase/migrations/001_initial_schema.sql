-- Directoor Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─── Users Profile ───────────────────────────────────────────────────
-- Extends Supabase auth.users with app-specific data
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  plan text default 'free' check (plan in ('free', 'pro')),
  canvas_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to auto-create profile on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Canvases ────────────────────────────────────────────────────────
create table if not exists public.canvases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text default 'Untitled Canvas',
  -- The full canvas state JSON (objects, connections, groups, timeline, viewport, metadata)
  canvas_state jsonb not null default '{}'::jsonb,
  -- Denormalized counts for quick display
  object_count integer default 0,
  connection_count integer default 0,
  -- Animation sequence (e.g., [3,1,2,5,4])
  animation_sequence integer[] default '{}',
  -- Sharing
  is_public boolean default false,
  public_slug text unique,
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for fast user canvas listing
create index if not exists idx_canvases_user_id on public.canvases(user_id);
create index if not exists idx_canvases_public_slug on public.canvases(public_slug) where public_slug is not null;

-- ─── Command Logs (Proprietary Dataset) ──────────────────────────────
create table if not exists public.command_logs (
  id uuid default gen_random_uuid() primary key,
  canvas_id uuid references public.canvases(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  -- Command data
  raw_input text not null,
  input_type text default 'text' check (input_type in ('text', 'voice')),
  -- Routing
  route text check (route in ('deterministic', 'llm')),
  confidence real,
  -- LLM details (null for deterministic route)
  llm_model text,
  llm_prompt_tokens integer,
  llm_completion_tokens integer,
  llm_latency_ms integer,
  -- Result
  actions_json jsonb,
  execution_result text check (execution_result in ('success', 'error', 'partial')),
  error_message text,
  total_latency_ms integer,
  -- User feedback
  feedback text check (feedback in ('positive', 'negative')),
  -- Context snapshot
  context_snapshot jsonb,
  -- Timestamps
  created_at timestamptz default now()
);

create index if not exists idx_command_logs_canvas_id on public.command_logs(canvas_id);
create index if not exists idx_command_logs_user_id on public.command_logs(user_id);
create index if not exists idx_command_logs_created_at on public.command_logs(created_at);

-- ─── Row Level Security ──────────────────────────────────────────────
-- CRITICAL: Users can only access their own data

alter table public.profiles enable row level security;
alter table public.canvases enable row level security;
alter table public.command_logs enable row level security;

-- Profiles: users can only read/update their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Canvases: users can CRUD their own canvases
create policy "Users can view own canvases"
  on public.canvases for select
  using (auth.uid() = user_id);

create policy "Users can create canvases"
  on public.canvases for insert
  with check (auth.uid() = user_id);

create policy "Users can update own canvases"
  on public.canvases for update
  using (auth.uid() = user_id);

create policy "Users can delete own canvases"
  on public.canvases for delete
  using (auth.uid() = user_id);

-- Public canvases: anyone can view if is_public = true
create policy "Anyone can view public canvases"
  on public.canvases for select
  using (is_public = true);

-- Command logs: users can read/write their own logs
create policy "Users can view own command logs"
  on public.command_logs for select
  using (auth.uid() = user_id);

create policy "Users can create command logs"
  on public.command_logs for insert
  with check (auth.uid() = user_id);

-- ─── Updated_at trigger ──────────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger canvases_updated_at
  before update on public.canvases
  for each row execute function public.update_updated_at();
