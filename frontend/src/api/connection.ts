import { Connect, Disconnect, GetConnectionStatus } from '../../wailsjs/go/main/App';
import type { api } from '../../wailsjs/go/models';

import { call } from './client';
import type { Result } from './result';

export function connect(request: api.ConnectionRequest): Promise<Result<api.ConnectionState>> {
  return call(() => Connect(request));
}

export function disconnect(): Promise<Result<api.ConnectionState>> {
  return call(() => Disconnect());
}

export function getConnectionStatus(): Promise<Result<api.ConnectionState>> {
  return call(() => GetConnectionStatus());
}
