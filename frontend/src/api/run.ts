import { StartRun, StopRun } from '../../wailsjs/go/main/App';
import type { api } from '../../wailsjs/go/models';

import { call } from './client';
import type { Result } from './result';

export function startRun(request: api.RunRequest): Promise<Result<api.RunStartData>> {
  return call(() => StartRun(request));
}

export function stopRun(runId: string): Promise<Result<api.RunControlResponse>> {
  return call(() => StopRun(runId));
}
