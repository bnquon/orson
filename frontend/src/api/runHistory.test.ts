import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClearRunHistory, DeleteRunHistory } from '../../wailsjs/go/main/App';
import { clearRunHistory, deleteRunHistory } from './runHistory';

vi.mock('../../wailsjs/go/main/App', () => ({
  ClearRunHistory: vi.fn(),
  DeleteRunHistory: vi.fn(),
  GetRunHistory: vi.fn(),
  ListRunHistory: vi.fn(),
}));

describe('run history actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('treats a successful delete response without data as success', async () => {
    vi.mocked(DeleteRunHistory).mockResolvedValue({ ok: true } as never);

    await expect(deleteRunHistory('run-1', 'workspace-1')).resolves.toEqual({
      ok: true,
      data: {},
    });
    expect(DeleteRunHistory).toHaveBeenCalledWith('run-1', 'workspace-1');
  });

  it('treats a successful clear response without data as success', async () => {
    vi.mocked(ClearRunHistory).mockResolvedValue({ ok: true } as never);

    await expect(clearRunHistory('workspace-1')).resolves.toEqual({ ok: true, data: {} });
    expect(ClearRunHistory).toHaveBeenCalledWith('workspace-1');
  });
});
