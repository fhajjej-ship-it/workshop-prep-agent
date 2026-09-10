import { RequestError } from './http';
import { getGenerationAllowanceStore, type GenerationAllowanceStore } from './generation-allowance-store';
import type { AppConfig, Run } from './types';
import type { RunStore } from './store';

/** Admission is independent of workshop history and survives a later failed run. */
export async function admitLiveGeneration(run: Run, config: AppConfig, allowance?: GenerationAllowanceStore): Promise<boolean> {
  if (run.mode !== 'live' || config.dailyGenerationLimit === undefined || run.dailyGenerationReserved) return false;
  if (!config.ready) throw new RequestError(config.blockers.join(' '), 503);
  let admission;
  try { admission = await (allowance ?? getGenerationAllowanceStore()).reserve(run.id, config.dailyGenerationLimit); }
  catch { throw new RequestError('New preparations are temporarily unavailable because the demo allowance could not be checked. Your brief and saved workshops are unchanged. Please try again later.', 503); }
  if (!admission.allowed) {
    const message = config.dailyGenerationLimit === 0
      ? 'New preparations are currently paused for this demo. You can still explore the example, open saved workshops and download them.'
      : `The demo has reached its shared daily limit of ${config.dailyGenerationLimit} preparations. Please try again after ${admission.resetsAt.slice(0, 10)} at 00:00 UTC. You can still explore the example, open saved workshops and download them.`;
    throw new RequestError(message, 429, Math.max(1, Math.ceil((Date.parse(admission.resetsAt) - Date.now()) / 1000)));
  }
  run.dailyGenerationReserved = true;
  return true;
}

/** Both new preparations and revisions pass the same gate before a run is saved. */
export function withGenerationAllowance(store: RunStore, config: AppConfig): RunStore {
  return {
    read: id => store.read(id),
    save: run => store.save(run),
    delete: (id, version) => store.delete(id, version),
    create: async run => {
      await admitLiveGeneration(run, config);
      await store.create(run);
    },
  };
}
