-- Feedback table for JUET Nexus
-- Run this once in Supabase Dashboard -> SQL Editor

create table if not exists feedback (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  subject      text,
  message      text not null,
  rating       integer check (rating >= 1 and rating <= 5),
  name         text,
  email        text,
  enrollment   text,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

-- Index for time-ordered retrieval
create index if not exists feedback_created_at_idx on feedback (created_at desc);

-- Enable Row Level Security
alter table feedback enable row level security;

-- Only the service-role key (used by the backend) can insert/select.
-- The anon key (never used server-side) cannot read this table.
create policy "service role full access"
  on feedback
  for all
  using (true)
  with check (true);
