// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  vi.useRealTimers();
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
  it('closes node menus on outside presses while preserving menu and trigger interactions', () => {
    const { host } = renderEditableFlow(initialScenario);
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Edit order.created"]')!;
    const press = (target: Element) => {
      act(() => {
        target.dispatchEvent(pointerEvent('pointerdown', 1, 0, 0));
      });
    };

    act(() => trigger.click());
    const connect = buttonWithText(host, 'Connect to…');
    press(connect);
    act(() => connect.click());
    expect(host.querySelector('.flow-node__connect-targets')).not.toBeNull();

    press(host.querySelector('.flow-map__surface')!);
    expect(host.querySelector('.flow-node__menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    act(() => trigger.click());
    expect(host.querySelector('.flow-node__connect-targets')).toBeNull();
    press(trigger);
    expect(host.querySelector('.flow-node__menu')).not.toBeNull();
    act(() => trigger.click());
    expect(host.querySelector('.flow-node__menu')).toBeNull();

    act(() => trigger.click());
    press(document.body);
    expect(host.querySelector('.flow-node__menu')).toBeNull();
  });

  it('keeps an empty graph until a valid root topic is created', () => {
    const { host, getDraft } = renderEditableFlow(createUnsavedScenario());

    expect(host.textContent).toContain('No root topic yet');
    expect(host.querySelector('.flow-map__surface')?.textContent).not.toContain(
      'No root topic yet',
    );
    act(() => buttonWithText(host, 'Add root topic').click());
    act(() => document.body.querySelector<HTMLFormElement>('form')?.requestSubmit());
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'Enter a root topic name.',
    );

    submitTopicName('orders.created');
    expect(getDraft().rootTopic).toBe('orders.created');
    expect(host.textContent).not.toContain('No root topic yet');
    expect(host.textContent).toContain('orders.created');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
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
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="alert"]')).toBeNull();

    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="Edit payments.completed"]')?.click(),
    );
    act(() => buttonWithText(host, 'Rename').click());
    submitTopicName('payments.settled');

    expect(getDraft().watchedTopics[0]?.name).toBe('payments.settled');
    expect(host.textContent).toContain('payments.settled');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
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
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('.flow-node__menu')).toBeNull();

    const edge = host.querySelector<SVGElement>(
      '[aria-label="Connection from orders.created to payments.completed"]',
    );
    act(() => {
      edge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.textContent).toContain('orders.created → payments.completed');
    act(() => buttonWithText(host, 'Delete connection').click());

    expect(getDraft().configuredTopology).toEqual([]);
    expect(host.querySelector('[aria-label^="Connection from"]')).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
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
      sourceHandle.dispatchEvent(pointerEvent('pointerup', 1, 690, 60));
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(getDraft().configuredTopology).toEqual([]);

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
    expect(host.querySelector('[role="alert"]')).toBeNull();
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
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('dismisses errors manually or four seconds after the latest failed action', () => {
    vi.useFakeTimers();
    const draft = {
      ...createUnsavedScenario(),
      rootTopic: 'orders.created',
      watchedTopics: [{ id: 'payments', name: 'payments.completed' }],
      configuredTopology: [
        {
          id: 'edge:orders.created->payments.completed',
          from: 'orders.created',
          to: 'payments.completed',
        },
      ],
    };
    const { host, getDraft } = renderEditableFlow(draft);

    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Edit orders.created"]')?.click());
    act(() => buttonWithText(host, 'Connect to…').click());
    act(() => buttonWithText(host, 'payments.completed').click());

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'That topology connection already exists.',
    );
    const dismiss = host.querySelector<HTMLButtonElement>('[aria-label="Dismiss error"]');
    expect(dismiss).not.toBeNull();
    act(() => dismiss?.click());

    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(areScenarioDraftsEqual(getDraft(), draft)).toBe(true);

    act(() => buttonWithText(host, 'payments.completed').click());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    act(() => buttonWithText(host, 'payments.completed').click());
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
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
