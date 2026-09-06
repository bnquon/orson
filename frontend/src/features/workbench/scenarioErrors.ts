import type { ApiError } from '../../api/result';
import type { ScenarioDescriptor } from './types';

export function invalidSelectionError(descriptor: ScenarioDescriptor): ApiError {
  const localMessages: Partial<Record<NonNullable<ScenarioDescriptor['localStatus']>, string>> = {
    changed: `${descriptor.sourceFilename} changed outside Orson. Re-import it to refresh this workspace.`,
    missing: `${descriptor.sourceFilename} is missing from disk.`,
    unreadable: `${descriptor.sourceFilename} could not be read.`,
  };
  return {
    code: descriptor.localStatus === 'available' ? 'scenario_invalid' : 'scenario_unavailable',
    message:
      (descriptor.localStatus === null ? undefined : localMessages[descriptor.localStatus]) ??
      `${descriptor.sourceFilename} is invalid.`,
    details: descriptor.diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    retryable: false,
  };
}

export function protocolError(message: string): ApiError {
  return {
    code: 'scenario_file_response_invalid',
    message,
    retryable: true,
  };
}
