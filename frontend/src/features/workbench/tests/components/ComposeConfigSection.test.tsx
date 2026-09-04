// @vitest-environment jsdom

import { act, useState } from 'react';
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
        rootTopicEditRef={{ current: null }}
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
