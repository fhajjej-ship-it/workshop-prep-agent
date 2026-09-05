import { randomUUID } from 'node:crypto';
import { MockLanguageModelV4 } from 'ai/test';
import { getRunMaterials } from './materials';
import { createTestPack } from './test-pack';
import type { Run } from './types';

/** Scripted adapter, not an LLM. It drives the real SDK loop and real tools. */
export function createTestModel(run: Run) {
  const materials = getRunMaterials(run);
  return new MockLanguageModelV4({
    provider: 'deterministic-test-adapter',
    modelId: 'scripted-workshop-fixture-v1',
    doGenerate: async () => {
      let name: string;
      let input: unknown = {};
      const unread = materials.find(source => !run.readSourceIds.includes(source.id));
      if (!run.brief.format) name = 'ask_missing_info';
      else if (!run.events.some(event => event.tool === 'search_materials')) {
        name = 'search_materials'; input = { query: 'workshop' };
      } else if (unread) {
        name = 'read_material'; input = { id: unread.id };
      } else if (!run.pack) {
        name = 'draft_pack'; input = { pack: createTestPack(run.brief, { invalid: true, materials, feedback: run.feedback }) };
      } else if (!run.validation) name = 'validate_pack';
      else if (!run.validation.valid || run.contentReview?.status === 'needs_revision') {
        // The fixed correction is triggered by actual validator feedback.
        name = 'draft_pack'; input = { pack: createTestPack(run.brief, { materials, feedback: run.feedback }) };
      } else name = 'save_for_review';
      return {
        content: [{ type: 'tool-call', toolCallId: randomUUID(), toolName: name, input: JSON.stringify(input) }],
        finishReason: { unified: 'tool-calls', raw: undefined },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 0, text: 0, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}
