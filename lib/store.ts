import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { getStorageConfig } from './config';
import type { Run } from './types';

export class RunConflict extends Error {}
export interface RunStore {
  read(id: string): Promise<Run | null>;
  create(run: Run): Promise<void>;
  save(run: Run): Promise<void>;
  delete(id: string, version: number): Promise<void>;
}

// The local adapter supports one Node server process. Hosting uses Postgres CAS.
// In-memory locks disappear on process exit; atomic rename keeps the last snapshot intact.
const localWrites = new Map<string, Promise<void>>();

async function withLocalWrite<T>(filename: string, operation: () => Promise<T>): Promise<T> {
  const previous = localWrites.get(filename) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  localWrites.set(filename, current);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (localWrites.get(filename) === current) localWrites.delete(filename);
  }
}

export function validRunId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export class LocalRunStore implements RunStore {
  constructor(private directory = path.join(process.cwd(), '.local', 'runs')) {}
  private file(id: string) {
    if (!validRunId(id)) throw new Error('Invalid run ID.');
    return path.join(this.directory, `${id}.json`);
  }
  async read(id: string): Promise<Run | null> {
    try { return JSON.parse(await readFile(this.file(id), 'utf8')) as Run; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async create(run: Run) {
    await mkdir(this.directory, { recursive: true });
    const handle = await open(this.file(run.id), 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(run)); } finally { await handle.close(); }
  }
  async save(run: Run) {
    const filename = this.file(run.id);
    await withLocalWrite(filename, async () => {
      const temp = `${filename}.${randomUUID()}.tmp`;
      try {
        const stored = await this.read(run.id);
        if (!stored || stored.version !== run.version) throw new RunConflict('This run has changed. Reload before continuing.');
        const next = { ...run, version: run.version + 1, updatedAt: new Date().toISOString() };
        const handle = await open(temp, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify(next)); } finally { await handle.close(); }
        await rename(temp, filename);
        Object.assign(run, next);
      } finally { await unlink(temp).catch(() => undefined); }
    });
  }
  async delete(id: string, version: number) {
    const filename = this.file(id);
    await withLocalWrite(filename, async () => {
      const stored = await this.read(id);
      if (!stored || stored.version !== version) throw new RunConflict('This run has changed. Reload before deleting it.');
      await unlink(filename);
    });
  }
}

export class PostgresRunStore implements RunStore {
  private sql;
  constructor(connectionString: string) { this.sql = neon(connectionString); }
  async read(id: string): Promise<Run | null> {
    if (!validRunId(id)) throw new Error('Invalid run ID.');
    const rows = await this.sql`SELECT data FROM workshop_runs WHERE id = ${id}::uuid`;
    return rows.length ? rows[0].data as Run : null;
  }
  async create(run: Run) {
    await this.sql`INSERT INTO workshop_runs (id, version, data) VALUES (${run.id}::uuid, ${run.version}, ${JSON.stringify(run)}::jsonb)`;
  }
  async save(run: Run) {
    const next = { ...run, version: run.version + 1, updatedAt: new Date().toISOString() };
    const rows = await this.sql`UPDATE workshop_runs SET data = ${JSON.stringify(next)}::jsonb, version = ${next.version}, updated_at = now() WHERE id = ${run.id}::uuid AND version = ${run.version} RETURNING id`;
    if (!rows.length) throw new RunConflict('This run has changed. Reload before continuing.');
    Object.assign(run, next);
  }
  async delete(id: string, version: number) {
    if (!validRunId(id)) throw new Error('Invalid run ID.');
    const rows = await this.sql`DELETE FROM workshop_runs WHERE id = ${id}::uuid AND version = ${version} RETURNING id`;
    if (!rows.length) throw new RunConflict('This run has changed. Reload before deleting it.');
  }
}

export function getStore(): RunStore {
  const config = getStorageConfig();
  if (!config.ready) throw new Error(config.blockers.join(' '));
  return config.storage === 'postgres' ? new PostgresRunStore(process.env.DATABASE_URL!) : new LocalRunStore();
}
