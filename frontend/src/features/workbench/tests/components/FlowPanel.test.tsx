// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { FlowPanel } from '../../components/FlowPanel';
import { areScenarioDraftsEqual } from '../../draftEditing';
import { buildFlowViewModel } from '../../flowModel';
import { initialScenario } from '../../fixtures';
import { initialRunState } from '../../runReducer';
import { createUnsavedScenario } from '../../scenarioFactory';
import type { ScenarioDraft } from '../../types';
import { useTopologyEditing } from '../../useTopologyEditing';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverStub,
});

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

function renderEditableFlow(initialDraft: ScenarioDraft, editingDisabled = false) {
  let latestDraft = initialDraft;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);

  function Harness() {
    const [draft, setDraft] = useState(initialDraft);
    latestDraft = draft;
    const editing = useTopologyEditing(draft, setDraft);
    return (
      <FlowPanel
        model={buildFlowViewModel(draft, initialRunState)}
        selectedRecordId={null}
        onSelectRecord={() => undefined}
        editingDisabled={editingDisabled}
        editingDisabledReason={editingDisabled ? 'Editing is unavailable' : ''}
        onAddRootTopic={editing.addRoot}
        onAddWatchedTopic={editing.addWatched}
        onRenameTopic={editing.renameTopic}
        onRemoveTopic={editing.removeTopic}
        onCreateEdge={editing.createEdge}
        onRemoveEdge={editing.removeEdge}
      />
    );
  }

  act(() => root.render(<Harness />));
  return { host, getDraft: () => latestDraft };
}

function buttonWithText(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (button === undefined) throw new Error(`Missing button: ${label}`);
  return button;
}

function submitTopicName(name: string) {
  const dialog = document.body.querySelector('[role="dialog"]');
  const input = dialog?.querySelector<HTMLInputElement>('input');
  const form = dialog?.querySelector<HTMLFormElement>('form');
  if (input === null || input === undefined || form === null || form === undefined) {
    throw new Error('Missing topic dialog controls');
  }
  act(() => {
    Object.defineProperty(input, 'value', { configurable: true, value: name, writable: true });
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => form.requestSubmit());
}

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

describe('FlowPanel topology editing', () => {
  it('keeps an empty graph until a valid root topic is created', () => {
    const { host, getDraft } = renderEditableFlow(createUnsavedScenario());

    expect(host.textContent).toContain('No root topic yet');
    act(() => buttonWithText(host, 'Add root topic').click());
    act(() => document.body.querySelector<HTMLFormElement>('form')?.requestSubmit());
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'Enter a root topic name.',
    );

    submitTopicName('orders.created');
    expect(getDraft().rootTopic).toBe('orders.created');
    expect(host.textContent).not.toContain('No root topic yet');
    expect(host.textContent).toContain('orders.created');
  });

  it('adds and renames watched topics without creating blank graph nodes', () => {
    const draft = { ...createUnsavedScenario(), rootTopic: 'orders.created' };
    const { host, getDraft } = renderEditableFlow(draft);

    act(() => buttonWithText(host, 'Add topic').click());
    expect(host.querySelectorAll('.flow-node-shell')).toHaveLength(1);
    submitTopicName('payments.completed');

    expect(getDraft().watchedTopics.map((topic) => topic.name)).toEqual(['payments.completed']);
    expect(areScenarioDraftsEqual(getDraft(), draft)).toBe(false);
    expect(host.querySelectorAll('.flow-node-shell')).toHaveLength(2);

    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="Edit payments.completed"]')?.click(),
    );
    act(() => buttonWithText(host, 'Rename').click());
    submitTopicName('payments.settled');

    expect(getDraft().watchedTopics[0]?.name).toBe('payments.settled');
    expect(host.textContent).toContain('payments.settled');
  });

  it('creates a connection through the accessible fallback and deletes the selected edge', () => {
    const draft = {
      ...createUnsavedScenario(),
      rootTopic: 'orders.created',
      watchedTopics: [{ id: 'payments', name: 'payments.completed' }],
    };
    const { host, getDraft } = renderEditableFlow(draft);

    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Edit orders.created"]')?.click());
    act(() => buttonWithText(host, 'Connect to…').click());
    act(() => buttonWithText(host, 'payments.completed').click());

    expect(getDraft().configuredTopology).toEqual([
      {
        id: 'edge:orders.created->payments.completed',
        from: 'orders.created',
        to: 'payments.completed',
      },
    ]);

    const edge = host.querySelector<SVGElement>(
      '[aria-label="Connection from orders.created to payments.completed"]',
    );
    act(() => {
      edge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.textContent).toContain('orders.created → payments.completed');
    act(() => buttonWithText(host, 'Delete').click());

    expect(getDraft().configuredTopology).toEqual([]);
    expect(host.querySelector('[aria-label^="Connection from"]')).toBeNull();
  });

  it('creates a connection by dragging from a source handle to a watched node', () => {
    const draft = {
      ...createUnsavedScenario(),
      rootTopic: 'orders.created',
      watchedTopics: [{ id: 'payments', name: 'payments.completed' }],
    };
    const { host, getDraft } = renderEditableFlow(draft);
    const canvas = host.querySelector<HTMLElement>('.flow-map');
    const sourceHandle = host.querySelector<HTMLButtonElement>(
      '[aria-label="Drag a connection from orders.created"]',
    );
    if (canvas === null || sourceHandle === null) throw new Error('Missing graph drag controls');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 100, top: 50, right: 700, bottom: 255, width: 600, height: 205 }),
    });
    Object.defineProperties(sourceHandle, {
      setPointerCapture: { configurable: true, value: () => undefined },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: () => undefined },
    });

    act(() => {
      sourceHandle.dispatchEvent(pointerEvent('pointerdown', 1, 255, 124.5));
    });
    act(() => {
      sourceHandle.dispatchEvent(pointerEvent('pointerup', 1, 175, 222.5));
    });

    expect(getDraft().configuredTopology).toEqual([
      {
        id: 'edge:orders.created->payments.completed',
        from: 'orders.created',
        to: 'payments.completed',
      },
    ]);
  });

  it('removes a watched node and all of its connected edges', () => {
    const { host, getDraft } = renderEditableFlow(initialScenario);
    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="Edit payment.charged"]')?.click(),
    );
    act(() => buttonWithText(host, 'Delete topic').click());

    expect(getDraft().watchedTopics.some((topic) => topic.name === 'payment.charged')).toBe(false);
    expect(
      getDraft().configuredTopology.some(
        (edge) => edge.from === 'payment.charged' || edge.to === 'payment.charged',
      ),
    ).toBe(false);
  });

  it('disables graph mutations while retaining the read-only flow', () => {
    const { host, getDraft } = renderEditableFlow(initialScenario, true);

    expect(host.querySelector<HTMLButtonElement>('#flow-add-topic')?.disabled).toBe(true);
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Edit order.created"]')?.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Drag a connection from order.created"]')
        ?.disabled,
    ).toBe(true);
    expect(areScenarioDraftsEqual(getDraft(), initialScenario)).toBe(true);
  });

  it('renders historical-style flows without topology authoring controls', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() =>
      root.render(
        <FlowPanel
          model={buildFlowViewModel(initialScenario, initialRunState)}
          selectedRecordId={null}
          onSelectRecord={() => undefined}
        />,
      ),
    );

    expect(host.querySelector('#flow-add-topic')).toBeNull();
    expect(host.querySelector('[aria-label^="Edit "]')).toBeNull();
    expect(host.querySelector('[aria-label^="Drag a connection"]')).toBeNull();
  });
});
