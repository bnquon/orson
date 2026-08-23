import { describe, expect, it } from 'vitest';
import { removeTopologyTopic, renameTopologyTopic } from './draftEditing';
import type { ScenarioTopologyEdge } from './types';

const topology: ScenarioTopologyEdge[] = [
  { id: 'order-payment', from: 'order.created', to: 'payment.charged' },
  { id: 'order-cancelled', from: 'order.created', to: 'order.cancelled' },
  { id: 'payment-inventory', from: 'payment.charged', to: 'inventory.reserved' },
];

describe('scenario draft topology editing', () => {
  it('renames both incoming and outgoing topology endpoints', () => {
    expect(renameTopologyTopic(topology, 'order.created', 'order.updated')).toEqual([
      { id: 'order-payment', from: 'order.updated', to: 'payment.charged' },
      { id: 'order-cancelled', from: 'order.updated', to: 'order.cancelled' },
      { id: 'payment-inventory', from: 'payment.charged', to: 'inventory.reserved' },
    ]);
  });

  it('trims topic names when matching and renaming endpoints', () => {
    expect(renameTopologyTopic(topology, ' order.created ', ' order.submitted ')).toEqual([
      { id: 'order-payment', from: 'order.submitted', to: 'payment.charged' },
      { id: 'order-cancelled', from: 'order.submitted', to: 'order.cancelled' },
      { id: 'payment-inventory', from: 'payment.charged', to: 'inventory.reserved' },
    ]);
  });

  it('renames a watched topic across all of its relationships', () => {
    expect(renameTopologyTopic(topology, 'payment.charged', 'payment.failed')).toEqual([
      { id: 'order-payment', from: 'order.created', to: 'payment.failed' },
      { id: 'order-cancelled', from: 'order.created', to: 'order.cancelled' },
      { id: 'payment-inventory', from: 'payment.failed', to: 'inventory.reserved' },
    ]);
  });

  it('does not change topology when a topic is temporarily empty', () => {
    expect(renameTopologyTopic(topology, 'order.created', '   ')).toEqual(topology);
  });

  it('removes edges connected to a deleted watched topic', () => {
    expect(removeTopologyTopic(topology, 'payment.charged')).toEqual([
      { id: 'order-cancelled', from: 'order.created', to: 'order.cancelled' },
    ]);
  });

  it('does not remove edges for an empty topic name', () => {
    expect(removeTopologyTopic(topology, '   ')).toEqual(topology);
  });
});
