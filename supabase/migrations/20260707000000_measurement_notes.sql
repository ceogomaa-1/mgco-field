-- MG&CO Field — Measurement Notes: annotated photos attached to a job.
-- Stored as jsonb on the jobs row (same pattern as photos/materials), so it
-- rides the existing whole-row sync machinery for free — no new table, no
-- new RLS policies (existing jobs_select/insert/update/delete already cover it).

alter table public.jobs
  add column if not exists measurement_notes jsonb not null default '[]'::jsonb;
