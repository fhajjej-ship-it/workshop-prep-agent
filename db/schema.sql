-- Apply manually to a separately approved empty database. The app never provisions or migrates.
CREATE TABLE IF NOT EXISTS workshop_runs (
  id uuid PRIMARY KEY,
  version integer NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Independent of workshop_runs: deleting a workshop never restores allowance.
CREATE TABLE IF NOT EXISTS workshop_generation_allowance (
  allowance_date date PRIMARY KEY,
  run_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[]
);
