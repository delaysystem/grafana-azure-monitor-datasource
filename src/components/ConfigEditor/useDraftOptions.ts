import { useRef } from 'react';

import { getBackendSrv } from '@grafana/runtime';

import { type AzureMonitorDataSourceSettings } from '../../types/types';

type Options = AzureMonitorDataSourceSettings;

// The editor saves the data source itself before loading subscriptions, so the backend sees unsaved
// credentials. Every write and save goes through here so that callbacks from earlier renders, and
// saves that resolve later, build on the newest options and version rather than the ones they closed over.
export function useDraftOptions(options: Options, onOptionsChange: (options: Options) => void) {
  const latest = useRef(options);
  const seen = useRef(options);
  if (options !== seen.current) {
    seen.current = options;
    latest.current = options;
  }

  // Counting edits, rather than keeping a flag, means an edit made while a save is in flight stays unsaved.
  const edits = useRef(0);
  const savedEdits = useRef(0);
  const pending = useRef<Promise<void> | undefined>(undefined);

  function update(optionsFunc: (options: Options) => Options, isEdit = true): void {
    latest.current = optionsFunc(latest.current);
    if (isEdit) {
      edits.current++;
    }
    onOptionsChange(latest.current);
  }

  async function put(): Promise<void> {
    if (edits.current === savedEdits.current) {
      return;
    }
    const sentEdits = edits.current;
    const result: { datasource: Options } = await getBackendSrv().put(
      `/api/datasources/uid/${latest.current.uid}`,
      latest.current
    );
    update((current) => ({ ...current, version: result.datasource.version }), false);
    savedEdits.current = sentEdits;
  }

  // Saves run one at a time, so each PUT carries the version the previous one returned.
  function save(): Promise<void> {
    const run = pending.current ? pending.current.then(put, put) : put();
    pending.current = run;
    run
      .finally(() => {
        if (pending.current === run) {
          pending.current = undefined;
        }
      })
      .catch(() => {});
    return run;
  }

  return { latest, update, save };
}
