import { describe, expect, it } from 'vitest';
import { api } from '../../../wailsjs/go/models';
import { validateWorkspaceName } from './validation';

const workspaces = [
  new api.Workspace({ id: 'one', name: 'My workspace' }),
  new api.Workspace({ id: 'two', name: 'Second' }),
];

describe('workspace name validation', () => {
  it('rejects blank and case-insensitive duplicate names', () => {
    expect(validateWorkspaceName('   ', workspaces)).toBe('Enter a workspace name.');
    expect(validateWorkspaceName('  my WORKSPACE ', workspaces)).toBe(
      'A workspace with that name already exists.',
    );
  });

  it('allows a workspace to retain its own normalized name', () => {
    expect(validateWorkspaceName(' My workspace ', workspaces, 'one')).toBeNull();
  });
});
