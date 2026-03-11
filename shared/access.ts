import type { NodeContext } from './context';
import { getRuntimeConfig, runtimePaths } from './context';
import { ensureDir } from './fs';
import { listRecords, saveRecords } from './store';
import type { DedupRecord, DiscoveredTarget, LinkedTarget, SessionRecord } from './types';

export async function buildAccess(context: NodeContext) {
  const config = await getRuntimeConfig(context);
  const paths = runtimePaths(config);
  await ensureDir(paths.root);
  await ensureDir(paths.authRoot);

  return {
    config,
    paths,
    listSessions: () => listRecords(context, config, 'sessions') as Promise<SessionRecord[]>,
    saveSessions: (data: SessionRecord[]) => saveRecords(context, config, 'sessions', data),
    listLinkedTargets: () =>
      listRecords(context, config, 'linked_targets') as Promise<LinkedTarget[]>,
    saveLinkedTargets: (data: LinkedTarget[]) =>
      saveRecords(context, config, 'linked_targets', data),
    listDiscoveredTargets: () =>
      listRecords(context, config, 'discovered_targets') as Promise<DiscoveredTarget[]>,
    saveDiscoveredTargets: (data: DiscoveredTarget[]) =>
      saveRecords(context, config, 'discovered_targets', data),
    listDedup: () => listRecords(context, config, 'dedup') as Promise<DedupRecord[]>,
    saveDedup: (data: DedupRecord[]) => saveRecords(context, config, 'dedup', data),
  };
}
