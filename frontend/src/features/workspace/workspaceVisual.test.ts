import { describe, expect, it } from 'vitest';
import { workspaceAccent, workspaceInitials } from './workspaceVisual';

describe('workspace visual identity', () => {
  it.each([
    ['random', 'RA'],
    ['Order Platform', 'OP'],
    ['Payment Processing', 'PP'],
    ['My workspace', 'MW'],
  ])('creates initials for %s', (name, expected) => {
    expect(workspaceInitials(name)).toBe(expected);
  });

  it('creates a stable accent from a workspace name', () => {
    expect(workspaceAccent('Order Platform')).toBe(workspaceAccent('Order Platform'));
    expect(workspaceAccent('Order Platform')).not.toBe(workspaceAccent('Payment Processing'));
  });
});
