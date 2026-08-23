export type WorkspaceMode = 'compose' | 'flow';

export type ComposeEditorTab = 'headers' | 'payload';

export interface KafkaConnection {
  name: string;
  brokers: string[];
  clientId: string;
  dialTimeoutSeconds: number;
  status: 'connected';
}

interface WatchedTopic {
  id: string;
  name: string;
}

interface KafkaHeader {
  id: string;
  name: string;
  value: string;
  protected: boolean;
}

export interface ScenarioDraft {
  rootTopic: string;
  watchedTopics: WatchedTopic[];
  messageKey: string;
  headers: KafkaHeader[];
  payload: string;
  captureTimeoutSeconds: string;
}

export type ValidatableField =
  'connection' | 'rootTopic' | 'watchedTopics' | 'headers' | 'payload' | 'captureTimeoutSeconds';

export interface TouchedState {
  fields: Partial<Record<ValidatableField, boolean>>;
  watchedTopicIds: string[];
  headerIds: string[];
}

export interface ValidationResult {
  fieldErrors: Partial<Record<ValidatableField, string>>;
  watchedTopicErrors: Record<string, string>;
  headerErrors: Record<string, string>;
  issueCount: number;
  firstInvalidControlId: string | null;
}

export interface ObservedEvent {
  id: string;
  name: string;
  topic: string;
  kind: 'root' | 'downstream';
  timestamp: string;
  elapsed: string;
  partition: number;
  offset: number;
  metadata: string;
  headers: ReadonlyArray<Readonly<{ name: string; value: string }>>;
  payload: string;
}

export interface ObservedRun {
  id: string;
  status: RunStatus;
  events: ObservedEvent[];
  trackedEvents: TrackedEvent[];
  error: ApiError | null;
}

interface EventRecordHeader {
  key: string;
  value: string;
}

export interface EventRecord {
  topic: string;
  key: string;
  value: string;
  headers: EventRecordHeader[];
  partition: number;
  offset: number;
  timestamp: string;
}

export type RunStatus =
  'idle' | 'starting' | 'in_progress' | 'completed' | 'timed_out' | 'cancelled' | 'failed';

type TrackedEventStatus = 'in_progress' | 'completed' | 'unwitnessed' | 'failed';

export interface TrackedEvent {
  topic: string;
  status: TrackedEventStatus;
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
  retryable: boolean;
}

type RunEventKind = 'started' | 'ready' | 'root_published' | 'message' | 'finished';

export interface RunEvent {
  runId: string;
  sequence: number;
  kind: RunEventKind;
  status?: RunStatus;
  record?: EventRecord;
  error?: ApiError;
}

export interface RunState {
  runId: string | null;
  status: RunStatus;
  rootRecord: EventRecord | null;
  records: EventRecord[];
  trackedEvents: TrackedEvent[];
  selectedRecordId: string | null;
  error: ApiError | null;
  lastSequence: number;
}
