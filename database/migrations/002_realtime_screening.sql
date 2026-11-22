-- ----------------------------------------------------------------------------
-- Real-time screening + freshness
-- Run after 001_initial_schema.sql.
-- ----------------------------------------------------------------------------

alter table public.jobs
  add column if not exists screening_status text not null default 'pending'
    check (screening_status in ('pending', 'passed', 'review', 'failed')),
  add column if not exists screening_outcome text,
  add column if not exists screening_message text,
  add column if not exists link_checked_at timestamptz,
  add column if not exists link_http_status integer;

comment on column public.jobs.screening_status is
  'Automated link screening result. Only passed listings are shown in the portal; verified_active still requires a committee decision unless AUTO_VERIFY_SCREENED is enabled.';

create index if not exists jobs_screening_status_idx on public.jobs (screening_status);
create index if not exists jobs_link_checked_at_idx on public.jobs (link_checked_at);
