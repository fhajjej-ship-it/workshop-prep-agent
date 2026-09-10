import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { getStorageConfig } from './config';
import { validRunId } from './store';

export interface GenerationAllowanceStore {
  reserve(runId: string, limit: number): Promise<{ allowed: boolean; resetsAt: string }>;
}

function validateReservation(runId: string, limit: number) {
  if (typeof runId !== 'string' || !validRunId(runId)) throw new Error('Invalid run ID.');
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Daily generation limit must be a nonnegative safe integer.');
}

// Like LocalRunStore, this adapter supports one Node server process. The lock is
// shared across store instances; atomic rename preserves the last complete day.
const localWrites = new Map<string, Promise<void>>();

async function withLocalWrite<T>(directory: string, operation: () => Promise<T>): Promise<T> {
  const previous = localWrites.get(directory) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  localWrites.set(directory, current);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (localWrites.get(directory) === current) localWrites.delete(directory);
  }
}

async function readReservations(filename: string): Promise<string[]> {
  let raw: string;
  try { raw = await readFile(filename, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const stored: unknown = JSON.parse(raw);
  if (!stored || typeof stored !== 'object' || !('runIds' in stored)
    || !Array.isArray(stored.runIds)
    || !stored.runIds.every(id => typeof id === 'string' && validRunId(id))) {
    throw new Error('Daily generation allowance ledger is invalid.');
  }
  const runIds = stored.runIds.map(id => id.toLowerCase());
  if (new Set(runIds).size !== runIds.length) throw new Error('Daily generation allowance ledger is invalid.');
  return runIds;
}

export class LocalGenerationAllowanceStore implements GenerationAllowanceStore {
  private directory: string;
  constructor(directory = path.join(process.cwd(), '.local', 'generation-allowance'), private clock = () => new Date()) {
    this.directory = path.resolve(directory);
  }

  async reserve(runId: string, limit: number) {
    validateReservation(runId, limit);
    const id = runId.toLowerCase();
    return withLocalWrite(this.directory, async () => {
      const now = this.clock();
      const day = now.toISOString().slice(0, 10);
      const resetsAt = new Date(`${day}T00:00:00.000Z`);
      resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);
      const result = { allowed: true, resetsAt: resetsAt.toISOString() };
      const filename = path.join(this.directory, `${day}.json`);
      const runIds = await readReservations(filename);
      if (runIds.includes(id)) return result;
      if (runIds.length >= limit) return { ...result, allowed: false };

      await mkdir(this.directory, { recursive: true });
      const temp = `${filename}.${randomUUID()}.tmp`;
      try {
        const handle = await open(temp, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify({ runIds: [...runIds, id] })); }
        finally { await handle.close(); }
        await rename(temp, filename);
      } finally { await unlink(temp).catch(() => undefined); }
      return result;
    });
  }
}

export class PostgresGenerationAllowanceStore implements GenerationAllowanceStore {
  private sql;
  constructor(connectionString: string) { this.sql = neon(connectionString); }

  async reserve(runId: string, limit: number) {
    validateReservation(runId, limit);
    const [, rows] = await this.sql.transaction([
      this.sql`
        INSERT INTO workshop_generation_allowance (allowance_date, run_ids)
        VALUES ((now() AT TIME ZONE 'UTC')::date, ARRAY[]::uuid[])
        ON CONFLICT (allowance_date) DO NOTHING
      `,
      this.sql`
        WITH reservation AS (
          UPDATE workshop_generation_allowance
          SET run_ids = CASE
            WHEN ${runId}::uuid = ANY(run_ids) THEN run_ids
            ELSE array_append(run_ids, ${runId}::uuid)
          END
          WHERE allowance_date = (now() AT TIME ZONE 'UTC')::date
            AND (${runId}::uuid = ANY(run_ids) OR cardinality(run_ids) < ${limit}::bigint)
          RETURNING allowance_date
        )
        SELECT EXISTS (SELECT 1 FROM reservation) AS allowed,
          ((now() AT TIME ZONE 'UTC')::date + 1)::text || 'T00:00:00.000Z' AS "resetsAt"
      `,
    ]);
    const result = rows?.[0];
    if (typeof result?.allowed !== 'boolean' || typeof result?.resetsAt !== 'string') {
      throw new Error('Daily generation allowance storage returned an invalid response.');
    }
    return { allowed: result.allowed, resetsAt: result.resetsAt };
  }
}

export function getGenerationAllowanceStore(): GenerationAllowanceStore {
  const config = getStorageConfig();
  if (!config.ready) throw new Error(config.blockers.join(' '));
  return config.storage === 'postgres'
    ? new PostgresGenerationAllowanceStore(process.env.DATABASE_URL!)
    : new LocalGenerationAllowanceStore();
}
