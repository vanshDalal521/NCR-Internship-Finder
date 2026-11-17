-- ============================================================================
-- NCR Tech Internship Finder
-- Initial Supabase PostgreSQL schema
--
-- Run this file in the Supabase SQL editor (or via the Supabase CLI) before
-- starting the backend with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
--
-- Security model:
--   • All application traffic reaches the database through the Express backend
--     using the service role key. The key is never sent to the browser.
--   • RLS is enabled on every table. Authenticated Supabase users receive
--     read-only policies; anonymous users receive no access.
--   • There are deliberately no direct write policies. Writes happen only
--     through the backend service role.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- Utility: updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Committee members
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text unique,
  full_name text not null,
  role text not null default 'Committee Member'
    check (role in ('Placement Officer', 'Faculty Coordinator', 'Student Coordinator', 'Committee Member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Companies
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  industry text,
  website text,
  careers_url text,
  location text,
  city text,
  contact_email text,
  contact_phone text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_name_trgm_idx
  on public.companies using gin (name gin_trgm_ops);
create index if not exists companies_city_idx on public.companies (city);

-- ----------------------------------------------------------------------------
-- Opportunities
-- ----------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  company_name text not null,
  job_title text not null,
  category text
    check (category is null or category in (
      'Web Development',
      'Data Analytics',
      'AI / ML / GenAI',
      'Cybersecurity',
      'Software Engineering',
      'Cloud / DevOps',
      'Technical Operations',
      'Business Operations'
    )),
  location text,
  city text not null
    check (city in ('Gurugram', 'Noida', 'Delhi', 'Faridabad')),
  work_mode text
    check (work_mode is null or work_mode in ('On-site', 'Hybrid', 'Remote', 'Not specified')),
  employment_type text,
  job_description text,
  required_skills text[] not null default '{}',
  stipend text,
  stipend_min numeric(12, 2) check (stipend_min is null or stipend_min >= 0),
  stipend_max numeric(12, 2) check (stipend_max is null or stipend_max >= 0),
  stipend_monthly_min numeric(12, 2) check (stipend_monthly_min is null or stipend_monthly_min >= 0),
  stipend_monthly_max numeric(12, 2) check (stipend_monthly_max is null or stipend_monthly_max >= 0),
  stipend_currency text not null default 'INR',
  stipend_period text,
  stipend_note text,
  duration text,
  eligibility text,
  experience_required text,
  application_url text not null,
  source text not null check (source in ('jsearch', 'adzuna', 'manual')),
  source_job_id text not null,
  source_url text,
  fingerprint text,
  posted_at timestamptz,
  deadline timestamptz,
  last_seen_at timestamptz,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified_active', 'needs_review', 'expired', 'rejected')),
  last_verified_at timestamptz,
  verified_by text,
  is_active boolean not null default true,
  relevance_score integer check (relevance_score is null or relevance_score between 0 and 100),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_source_identifier_unique unique (source, source_job_id)
);

comment on column public.jobs.verification_status is
  'Only verified_active + is_active = true counts towards the placement target. API imports always start as pending.';

create index if not exists jobs_status_idx on public.jobs (verification_status);
create index if not exists jobs_city_idx on public.jobs (city);
create index if not exists jobs_category_idx on public.jobs (category);
create index if not exists jobs_source_idx on public.jobs (source);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists jobs_posted_at_idx on public.jobs (posted_at desc);
create index if not exists jobs_deadline_idx on public.jobs (deadline);
create index if not exists jobs_application_url_idx on public.jobs (application_url);
create index if not exists jobs_fingerprint_idx on public.jobs (fingerprint);
create index if not exists jobs_company_id_idx on public.jobs (company_id);
create index if not exists jobs_title_trgm_idx
  on public.jobs using gin (job_title gin_trgm_ops);
create index if not exists jobs_company_name_trgm_idx
  on public.jobs using gin (company_name gin_trgm_ops);
create index if not exists jobs_skills_gin_idx on public.jobs using gin (required_skills);

-- ----------------------------------------------------------------------------
-- AI analysis output
-- ----------------------------------------------------------------------------
create table if not exists public.job_analysis (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  category text,
  skills text[] not null default '{}',
  eligibility_notes text,
  relevance_score integer check (relevance_score is null or relevance_score between 0 and 100),
  summary text,
  red_flags text[] not null default '{}',
  ai_model text,
  analysis_source text not null default 'gemini' check (analysis_source in ('gemini', 'rules')),
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_analysis_job_id_idx on public.job_analysis (job_id);

-- ----------------------------------------------------------------------------
-- Immutable verification audit trail
-- ----------------------------------------------------------------------------
create table if not exists public.verification_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  previous_status text,
  new_status text not null
    check (new_status in ('pending', 'verified_active', 'needs_review', 'expired', 'rejected')),
  reviewer text not null,
  notes text,
  checked_url text,
  link_http_status integer,
  created_at timestamptz not null default now()
);

create index if not exists verification_logs_job_id_idx on public.verification_logs (job_id);
create index if not exists verification_logs_created_at_idx on public.verification_logs (created_at desc);

-- ----------------------------------------------------------------------------
-- Committee shortlist (shared across the committee; saved_by records the actor)
-- ----------------------------------------------------------------------------
create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  saved_by text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists saved_jobs_created_at_idx on public.saved_jobs (created_at desc);

-- ----------------------------------------------------------------------------
-- Discovery audit log and quota accounting
-- ----------------------------------------------------------------------------
create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  location text,
  category text,
  sources text[] not null default '{}',
  results_count integer not null default 0,
  inserted_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  status text not null default 'completed'
    check (status in ('completed', 'partial', 'failed')),
  message text,
  searched_by text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists search_history_created_at_idx on public.search_history (created_at desc);

-- ----------------------------------------------------------------------------
-- Generated reports
-- ----------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null default 'verified_opportunities'
    check (report_type in ('verified_opportunities', 'full_directory')),
  format text not null check (format in ('xlsx', 'pdf')),
  scope text,
  record_count integer not null default 0 check (record_count >= 0),
  generated_by text not null,
  filters jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

drop trigger if exists job_analysis_set_updated_at on public.job_analysis;
create trigger job_analysis_set_updated_at
  before update on public.job_analysis
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.job_analysis enable row level security;
alter table public.verification_logs enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.search_history enable row level security;
alter table public.reports enable row level security;

-- Committee members can read their own profile when Supabase Auth is added.
drop policy if exists "users_can_read_own_profile" on public.users;
create policy "users_can_read_own_profile"
  on public.users
  for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "authenticated_read_companies" on public.companies;
create policy "authenticated_read_companies"
  on public.companies for select to authenticated using (true);

drop policy if exists "authenticated_read_jobs" on public.jobs;
create policy "authenticated_read_jobs"
  on public.jobs for select to authenticated using (true);

drop policy if exists "authenticated_read_job_analysis" on public.job_analysis;
create policy "authenticated_read_job_analysis"
  on public.job_analysis for select to authenticated using (true);

drop policy if exists "authenticated_read_verification_logs" on public.verification_logs;
create policy "authenticated_read_verification_logs"
  on public.verification_logs for select to authenticated using (true);

drop policy if exists "authenticated_read_saved_jobs" on public.saved_jobs;
create policy "authenticated_read_saved_jobs"
  on public.saved_jobs for select to authenticated using (true);

drop policy if exists "authenticated_read_search_history" on public.search_history;
create policy "authenticated_read_search_history"
  on public.search_history for select to authenticated using (true);

drop policy if exists "authenticated_read_reports" on public.reports;
create policy "authenticated_read_reports"
  on public.reports for select to authenticated using (true);

-- No anonymous policies and no direct write policies exist by design.
-- The Express backend authenticates committee access and writes with the
-- service role key, which bypasses RLS inside the trusted server.
