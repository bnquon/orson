// @vitest-environment jsdom

import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ComposeConfigSection } from '../../components/ComposeConfigSection';
import { initialScenario } from '../../fixtures';
import type { ScenarioDraft, TouchedState, ValidationResult } from '../../types';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

const touched: TouchedState = { fields: {}, watchedTopicIds: [], headerIds: [] };
const validation: ValidationResult = {
  fieldErrors: {},
  watchedTopicErrors: {},
  headerErrors: {},
  issueCount: 0,
  firstInvalidControlId: null,
};
const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

function renderConfig(initialDraft: ScenarioDraft) {
  let latestDraft = initialDraft;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);

  function Harness() {
    const [draft, setDraft] = useState(initialDraft);
    const rootTopicEditRef = useRef<string | null>(null);
    latestDraft = draft;
    return (
      <ComposeConfigSection
        connection={{
          name: 'Local',
          brokers: ['localhost:9092'],
          clientId: 'orson',
          dialTimeoutSeconds: 5,
          status: 'connected',
        }}
        draft={draft}
        setDraft={setDraft}
        rootTopicEditRef={rootTopicEditRef}
        touched={touched}
        validation={validation}
        onReviewConnection={() => undefined}
        onTouchField={() => undefined}
        onTouchWatchedTopic={() => undefined}
      />
    );
  }

  act(() => root.render(<Harness />));
  return { host, getDraft: () => latestDraft };
}

function watchedTopicRow(host: HTMLElement, topicName: string) {
  const input = [
    ...host.querySelectorAll<HTMLInputElement>('[aria-label="Watched downstream topic"]'),
  ].find((candidate) => candidate.value === topicName);
  const row = input?.closest<HTMLElement>('.watched-topic-row');
  if (row === undefined || row === null) throw new Error(`Missing watched topic row: ${topicName}`);
  return row;
}

function clickMenuOption(label: string) {
  const option = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (candidate) => candidate.textContent === label,
  );
  if (option === undefined) throw new Error(`Missing source option: ${label}`);
  act(() => option.click());
}

describe('ComposeConfigSection topology sources', () => {
  it.each(['root', 'watched'])('restores a rejected %s rename and allows a valid retry', (kind) => {
    const validEdge = {
      id: 'valid',
      from: kind === 'root' ? 'a' : 'b',
      to: kind === 'root' ? 'b' : 'c',
    };
    const warningEdge = { id: 'warning', from: kind === 'root' ? 'b' : 'c', to: 'missing' };
    const original: ScenarioDraft = {
      ...initialScenario,
      rootTopic: 'a',
      watchedTopics: [
        { id: 'b', name: 'b' },
        { id: 'c', name: 'c' },
      ],
      topology: [validEdge],
      configuredTopology: [validEdge, warningEdge],
    };
    const { host, getDraft } = renderConfig(original);
    const input = host.querySelector<HTMLInputElement>(
      kind === 'root' ? '#compose-root-topic' : '#watched-topic-b',
    );
    if (input === null) throw new Error('Missing topic input');
    const typeName = (name: string) => {
      act(() => input.focus());
      act(() => {
        Object.defineProperty(input, 'value', { configurable: true, value: name, writable: true });
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };

    typeName('missing');
    act(() => input.blur());

    expect(getDraft()).toEqual(original);
    expect(input.value).toBe(kind === 'root' ? 'a' : 'b');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'That rename would create a topology cycle.',
    );

    typeName('renamed');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    act(() => input.blur());

    expect(input.value).toBe('renamed');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(getDraft().configuredTopology).toEqual([{ ...validEdge, from: 'renamed' }, warningEdge]);
    expect(getDraft().topology).toEqual([{ ...validEdge, from: 'renamed' }]);
  });

  it('shows every incoming source in configured order with root and source labels', () => {
    const extraEdge = {
      id: 'edge-order-notification',
      from: 'order.created',
      to: 'notification.sent',
    };
    const existingEdge = initialScenario.configuredTopology.find(
      (edge) => edge.id === 'edge-payment-notification',
    );
    if (existingEdge === undefined) throw new Error('Missing notification fixture edge');
    const draft = {
      ...initialScenario,
      topology: [...initialScenario.topology, extraEdge],
      configuredTopology: [
        ...initialScenario.configuredTopology.filter(
          (edge) => edge.id !== 'edge-payment-notification',
        ),
        extraEdge,
        existingEdge,
      ],
    };
    const { host } = renderConfig(draft);
    const row = watchedTopicRow(host, 'notification.sent');
    const labels = [...row.querySelectorAll('.watched-topic-row__connection > span')].map(
      (element) => element.textContent,
    );

    expect(labels).toEqual(['order.created (root)', 'payment.charged (source)']);
    expect(
      row.querySelector('[aria-label="Remove order.created as a source for notification.sent"]'),
    ).not.toBeNull();
    expect(
      row.querySelector('[aria-label="Remove payment.charged as a source for notification.sent"]'),
    ).not.toBeNull();
  });

  it('shows an explicit disconnected state and can add and remove one source', () => {
    const disconnectedDraft = {
      ...initialScenario,
      topology: initialScenario.topology.filter((edge) => edge.to !== 'notification.sent'),
      configuredTopology: initialScenario.configuredTopology.filter(
        (edge) => edge.to !== 'notification.sent',
      ),
    };
    const { host, getDraft } = renderConfig(disconnectedDraft);
    const row = watchedTopicRow(host, 'notification.sent');

    expect(row.textContent).toContain('Not connected');
    act(() =>
      row
        .querySelector<HTMLButtonElement>('[aria-label="Add source to notification.sent"]')
        ?.click(),
    );
    clickMenuOption('order.created (root)');

    expect(getDraft().configuredTopology.filter((edge) => edge.to === 'notification.sent')).toEqual(
      [
        {
          id: 'edge:order.created->notification.sent',
          from: 'order.created',
          to: 'notification.sent',
        },
      ],
    );

    const connectedRow = watchedTopicRow(host, 'notification.sent');
    act(() =>
      connectedRow
        .querySelector<HTMLButtonElement>(
          '[aria-label="Remove order.created as a source for notification.sent"]',
        )
        ?.click(),
    );

    expect(getDraft().configuredTopology.filter((edge) => edge.to === 'notification.sent')).toEqual(
      [],
    );
    expect(watchedTopicRow(host, 'notification.sent').textContent).toContain('Not connected');
  });

  it('blocks a source that would create a cycle and announces why', () => {
    const { host, getDraft } = renderConfig(initialScenario);
    const row = watchedTopicRow(host, 'payment.charged');
    const before = getDraft();

    act(() =>
      row.querySelector<HTMLButtonElement>('[aria-label="Add source to payment.charged"]')?.click(),
    );
    clickMenuOption('inventory.reserved (source)');

    expect(getDraft()).toBe(before);
    expect(
      watchedTopicRow(host, 'payment.charged').querySelector('[role="alert"]')?.textContent,
    ).toBe('That connection would create a topology cycle.');
  });

  it('keeps an invalid blank target unchanged and announces why it was rejected', () => {
    const invalidDraft = {
      ...initialScenario,
      watchedTopics: initialScenario.watchedTopics.map((topic, index) =>
        index === 0 ? { ...topic, name: '' } : topic,
      ),
    };
    const { host, getDraft } = renderConfig(invalidDraft);
    const row = watchedTopicRow(host, '');
    const before = getDraft();

    act(() =>
      row.querySelector<HTMLButtonElement>('[aria-label="Add source to watched topic"]')?.click(),
    );
    clickMenuOption('order.created (root)');

    expect(getDraft()).toBe(before);
    expect(row.querySelector('[role="alert"]')?.textContent).toBe(
      'Choose a watched topic as the target.',
    );
  });

  it('keeps topic names raw while editing and updates endpoints when editing commits', () => {
    const { host, getDraft } = renderConfig(initialScenario);
    const input = watchedTopicRow(host, 'payment.charged').querySelector<HTMLInputElement>(
      '[aria-label="Watched downstream topic"]',
    );
    if (input === null) throw new Error('Missing watched topic input');

    act(() => input.focus());
    act(() => {
      Object.defineProperty(input, 'value', {
        configurable: true,
        value: 'payment.completed',
        writable: true,
      });
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(getDraft().watchedTopics[0]?.name).toBe('payment.completed');
    expect(getDraft().configuredTopology.some((edge) => edge.to === 'payment.charged')).toBe(true);

    act(() => input.blur());

    expect(getDraft().configuredTopology.some((edge) => edge.to === 'payment.completed')).toBe(
      true,
    );
    expect(getDraft().configuredTopology.some((edge) => edge.from === 'payment.completed')).toBe(
      true,
    );
  });
});
