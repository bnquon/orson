import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  Dispatch,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react';
import type {
  ComposeEditorTab,
  KafkaConnection,
  ScenarioDraft,
  TouchedState,
  ValidatableField,
  ValidationResult,
} from '../types';
import { ComposeConfigSection } from './ComposeConfigSection';
import { ComposeEditorSection } from './ComposeEditorSection';
import '../styles/compose.css';

interface ComposePanelProps {
  connection: KafkaConnection;
  draft: ScenarioDraft;
  setDraft: Dispatch<SetStateAction<ScenarioDraft>>;
  rootTopicEditRef: MutableRefObject<string | null>;
  activeEditorTab: ComposeEditorTab;
  onEditorTabChange: (tab: ComposeEditorTab) => void;
  touched: TouchedState;
  validation: ValidationResult;
  jsonError: string | null;
  jsonValidationPending: boolean;
  configHeight: number | null;
  onConfigHeightChange: (height: number | null) => void;
  onTouchField: (field: ValidatableField) => void;
  onTouchWatchedTopic: (topicId: string) => void;
  onTouchHeader: (headerId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

interface SplitterMetrics {
  maximum: number;
  value: number;
}

const minimumConfigHeight = 190;
const minimumEditorHeight = 170;
const splitterHeight = 1;
const keyboardResizeStep = 16;

export function ComposePanel({
  connection,
  draft,
  setDraft,
  rootTopicEditRef,
  activeEditorTab,
  onEditorTabChange,
  touched,
  validation,
  jsonError,
  jsonValidationPending,
  configHeight,
  onConfigHeightChange,
  onTouchField,
  onTouchWatchedTopic,
  onTouchHeader,
  onSubmit,
}: ComposePanelProps) {
  const panelRef = useRef<HTMLFormElement>(null);
  const [splitterMetrics, setSplitterMetrics] = useState<SplitterMetrics | null>(null);

  const clampConfigHeight = (requestedHeight: number) => {
    const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
    const maximumConfigHeight = Math.max(
      minimumConfigHeight,
      panelHeight - minimumEditorHeight - splitterHeight,
    );
    return Math.min(maximumConfigHeight, Math.max(minimumConfigHeight, requestedHeight));
  };

  const resizeFromPointer = (clientY: number) => {
    const panelTop = panelRef.current?.getBoundingClientRect().top;
    if (panelTop !== undefined) {
      onConfigHeightChange(clampConfigHeight(clientY - panelTop));
    }
  };

  const handleSplitterPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeFromPointer(event.clientY);
  };

  const handleSplitterPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      resizeFromPointer(event.clientY);
    }
  };

  const handleSplitterKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const currentHeight = splitterMetrics?.value ?? minimumConfigHeight;
    const direction = event.key === 'ArrowUp' ? -1 : 1;
    onConfigHeightChange(clampConfigHeight(currentHeight + direction * keyboardResizeStep));
  };

  useEffect(() => {
    const panel = panelRef.current;
    const config = panel?.querySelector<HTMLElement>('.compose-config');
    if (panel === null || config === undefined || config === null) {
      return;
    }

    const updateMetrics = () => {
      const maximum = Math.max(
        minimumConfigHeight,
        Math.floor(panel.getBoundingClientRect().height - minimumEditorHeight - splitterHeight),
      );
      const value = Math.round(config.getBoundingClientRect().height);
      setSplitterMetrics((current) =>
        current?.maximum === maximum && current.value === value ? current : { maximum, value },
      );
    };

    const observer = new ResizeObserver(updateMetrics);
    observer.observe(panel);
    observer.observe(config);
    updateMetrics();
    return () => observer.disconnect();
  }, []);

  const panelStyle =
    configHeight === null
      ? undefined
      : ({
          '--compose-config-height': `clamp(${minimumConfigHeight}px, ${configHeight}px, calc(100% - ${minimumEditorHeight + splitterHeight}px))`,
        } as CSSProperties);

  return (
    <form
      id="compose-form"
      className="compose-panel"
      ref={panelRef}
      style={panelStyle}
      noValidate
      onSubmit={onSubmit}
    >
      <ComposeConfigSection
        connection={connection}
        draft={draft}
        setDraft={setDraft}
        rootTopicEditRef={rootTopicEditRef}
        touched={touched}
        validation={validation}
        onTouchField={onTouchField}
        onTouchWatchedTopic={onTouchWatchedTopic}
      />

      <div
        className="compose-splitter"
        role="separator"
        tabIndex={0}
        aria-label="Resize scenario configuration and message editor"
        aria-orientation="horizontal"
        aria-valuemin={minimumConfigHeight}
        aria-valuemax={splitterMetrics?.maximum}
        aria-valuenow={splitterMetrics?.value}
        title="Drag to resize. Double-click to reset."
        onPointerDown={handleSplitterPointerDown}
        onPointerMove={handleSplitterPointerMove}
        onDoubleClick={() => onConfigHeightChange(null)}
        onKeyDown={handleSplitterKeyDown}
      />

      <ComposeEditorSection
        draft={draft}
        setDraft={setDraft}
        activeTab={activeEditorTab}
        onTabChange={onEditorTabChange}
        touched={touched}
        validation={validation}
        jsonError={jsonError}
        jsonValidationPending={jsonValidationPending}
        onTouchField={onTouchField}
        onTouchHeader={onTouchHeader}
      />
    </form>
  );
}
