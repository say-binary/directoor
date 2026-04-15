-- Canvas version history for crash/bug recovery.
-- Keeps the last N snapshots of every canvas so we can roll back if needed.

create table if not exists public.canvas_versions (
  id uuid default gen_random_uuid() primary key,
  canvas_id uuid references public.canvases(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  canvas_state jsonb not null,
  object_count integer default 0,
  connection_count integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_canvas_versions_canvas_id_created_at
  on public.canvas_versions(canvas_id, created_at desc);

-- RLS — users can only access their own versions
alter table public.canvas_versions enable row level security;

create policy "Users can view own canvas versions"
  on public.canvas_versions for select
  using (auth.uid() = user_id);

create policy "Users can create own canvas versions"
  on public.canvas_versions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own canvas versions"
  on public.canvas_versions for delete
  using (auth.uid() = user_id);

-- Trigger: every successful UPDATE to canvases that changed object_count
-- should snapshot the OLD state into canvas_versions, then trim to last 5.
create or replace function public.snapshot_canvas_version()
returns trigger as $$
declare
  version_count integer;
begin
  -- Only snapshot if there's meaningful state to preserve
  if old.canvas_state is not null
     and old.canvas_state::text != '{}'::text
     and (old.object_count > 0 or old.connection_count > 0) then

    insert into public.canvas_versions (canvas_id, user_id, canvas_state, object_count, connection_count)
    values (old.id, old.user_id, old.canvas_state, old.object_count, old.connection_count);

    -- Trim to last 5 versions per canvas
    select count(*) into version_count from public.canvas_versions where canvas_id = old.id;
    if version_count > 5 then
      delete from public.canvas_versions
      where id in (
        select id from public.canvas_versions
        where canvas_id = old.id
        order by created_at desc
        offset 5
      );
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists canvas_version_snapshot on public.canvases;
create trigger canvas_version_snapshot
  before update of canvas_state on public.canvases
  for each row execute function public.snapshot_canvas_version();
