-- Apply manually to an existing workshop database after separate approval.
-- Independent of workshop_runs: deleting a workshop never restores allowance.
CREATE TABLE IF NOT EXISTS workshop_generation_allowance (
  allowance_date date PRIMARY KEY,
  run_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[]
);
