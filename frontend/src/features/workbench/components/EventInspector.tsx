import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'iconoir-react';
import type { ObservedEvent } from '../types';
import { handleTabListKeyDown } from './tabKeyboard';
import '../styles/inspector.css';

interface EventInspectorProps {
  event: ObservedEvent | null;
}

type InspectorTab = 'overview' | 'headers' | 'payload';

const inspectorTabs: InspectorTab[] = ['overview', 'headers', 'payload'];

function formatJson(payload: string): string {
  try {
    JSON.parse(payload);
  } catch {
    return payload;
  }

  let formatted = '';
  let indentation = 0;
  let inString = false;
  let escaped = false;
  const expandedContainers: boolean[] = [];
  const indent = () => '  '.repeat(indentation);
  const nextToken = (start: number) => payload.slice(start).match(/\S/)?.[0];

  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    if (character === undefined) {
      continue;
    }

    if (inString) {
      formatted += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      formatted += character;
    } else if (character === '{' || character === '[') {
      const expanded = nextToken(index + 1) !== (character === '{' ? '}' : ']');
      expandedContainers.push(expanded);
      formatted += character;
      if (expanded) {
        indentation += 1;
        formatted += `\n${indent()}`;
      }
    } else if (character === '}' || character === ']') {
      if (expandedContainers.pop() === true) {
        indentation -= 1;
        formatted += `\n${indent()}`;
      }
      formatted += character;
    } else if (character === ',') {
      formatted += expandedContainers.at(-1) === true ? `,\n${indent()}` : ',';
    } else if (character === ':') {
      formatted += ': ';
    } else if (!/\s/.test(character)) {
      formatted += character;
    }
  }

  return formatted;
}

export function EventInspector({ event }: EventInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview');
  const [copiedPayload, setCopiedPayload] = useState<string | null>(null);
  const copyResetTimeout = useRef<number | null>(null);
  const formattedPayload = useMemo(
    () => (event === null ? '' : formatJson(event.payload)),
    [event],
  );
  const isCopied = copiedPayload === formattedPayload;

  useEffect(
    () => () => {
      if (copyResetTimeout.current !== null) {
        window.clearTimeout(copyResetTimeout.current);
      }
    },
    [],
  );

  const handleCopyPayload = async () => {
    try {
      await navigator.clipboard.writeText(event?.payload ?? '');
      setCopiedPayload(formattedPayload);

      if (copyResetTimeout.current !== null) {
        window.clearTimeout(copyResetTimeout.current);
      }

      copyResetTimeout.current = window.setTimeout(() => {
        setCopiedPayload(null);
        copyResetTimeout.current = null;
      }, 1600);
    } catch {
      setCopiedPayload(null);
    }
  };

  return (
    <section className="event-inspector" aria-label="Selected event inspector">
      <header className="event-inspector__header">Selected event</header>
      {event === null ? (
        <p className="event-inspector__empty">Select an event to inspect</p>
      ) : (
        <>
          <div className="event-inspector__tabs" role="tablist" aria-label="Event details">
            {inspectorTabs.map((tab) => (
              <button
                className={
                  activeTab === tab
                    ? 'event-inspector__tab event-inspector__tab--active'
                    : 'event-inspector__tab'
                }
                type="button"
                role="tab"
                key={tab}
                id={`event-inspector-tab-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                aria-selected={activeTab === tab}
                aria-controls="event-inspector-panel"
                onClick={() => setActiveTab(tab)}
                onKeyDown={handleTabListKeyDown}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div
            className="event-inspector__content workbench-scroll-region"
            id="event-inspector-panel"
            role="tabpanel"
            aria-labelledby={`event-inspector-tab-${activeTab}`}
          >
            {activeTab === 'overview' ? (
              <dl className="event-inspector__overview">
                <div>
                  <dt>Topic</dt>
                  <dd>{event.topic}</dd>
                </div>
                <div>
                  <dt>Timestamp</dt>
                  <dd>{event.timestamp}</dd>
                </div>
                <div>
                  <dt>Partition</dt>
                  <dd>{event.partition}</dd>
                </div>
                <div>
                  <dt>Offset</dt>
                  <dd>{event.offset}</dd>
                </div>
                <div>
                  <dt>Metadata</dt>
                  <dd>{event.metadata}</dd>
                </div>
              </dl>
            ) : null}
            {activeTab === 'headers' ? (
              <pre className="event-inspector__code">
                {event.headers.map((header) => `${header.name}: ${header.value}`).join('\n')}
              </pre>
            ) : null}
            {activeTab === 'payload' ? (
              <div className="event-inspector__payload">
                <button
                  className={
                    isCopied
                      ? 'event-inspector__copy event-inspector__copy--copied'
                      : 'event-inspector__copy'
                  }
                  type="button"
                  aria-label={isCopied ? 'Payload copied' : 'Copy payload'}
                  title={isCopied ? 'Copied' : 'Copy payload'}
                  onClick={() => void handleCopyPayload()}
                >
                  {isCopied ? (
                    <Check width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Copy width={16} height={16} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span className="sr-only" aria-live="polite">
                    {isCopied ? 'Copied' : ''}
                  </span>
                </button>
                <pre className="event-inspector__code event-inspector__code--payload">
                  {formattedPayload}
                </pre>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
