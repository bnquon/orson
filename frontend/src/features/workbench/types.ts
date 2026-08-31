export type WorkspaceMode = 'compose' | 'flow';

export type ComposeEditorTab = 'headers' | 'payload';

export interface KafkaConnection {
  name: string;
  brokers: string[];
  clientId: string;
  dialTimeoutSeconds: number;
  status: 'connected' | 'disconnected';
}

interface WatchedTopic {
  id: string;
  name: string;
}

export interface ScenarioTopologyEdge {
  id: string;
  from: string;
  to: string;
}

interface KafkaHeader {
  id: string;
  name: string;
  value: string;
  protected: boolean;
}

export interface ScenarioDraft {
  name: string;
  rootTopic: string;
  watchedTopics: WatchedTopic[];
  topology: ScenarioTopologyEdge[];
  configuredTopology: ScenarioTopologyEdge[];
  messageKey: string;
  headers: KafkaHeader[];
  correlationHeader: string;
  payload: string;
  captureTimeoutSeconds: string;
}

export type ScenarioSource = 'example' | 'local' | 'unsaved';

type LocalScenarioStatus = 'available' | 'changed' | 'missing' | 'unreadable';

export interface ScenarioWarning {
  code: string;
  path?: string;
  message: string;
  sourceFilename: string;
  line: number;
  column: number;
}

type ScenarioDescriptorStatus = 'valid' | 'valid_with_warnings' | 'invalid';

export interface ScenarioDiagnostic {
  code: string;
  path: string;
  message: string;
  details: string;
  sourceFilename: string;
  line: number;
  column: number;
}

export interface ScenarioDescriptor {
  id: string;
  displayName: string;
  relativePath: string;
  folderPath: string;
  folderId?: string;
  siblingOrder?: number;
  sourceFilename: string;
  source: ScenarioSource;
  sourcePath: string;
  localStatus: LocalScenarioStatus | null;
  status: ScenarioDescriptorStatus;
  warnings: ScenarioWarning[];
  diagnostics: ScenarioDiagnostic[];
}

export interface ScenarioFolder {
  id: string;
  name: string;
  parentId: string;
  siblingOrder: number;
}

export interface ScenarioFolderDeletionSummary {
  removedScenarioCount: number;
}

export interface ScenarioFolderFeedback {
  successMessage: string | null;
  deletionSummary: ScenarioFolderDeletionSummary | null;
}

export interface LoadedScenario {
  id: string;
  relativePath: string;
  folderPath: string;
  name: string;
  sourceFilename: string;
  source: ScenarioSource;
  sourcePath: string;
  localStatus: LocalScenarioStatus | null;
  draft: ScenarioDraft;
  warnings: ScenarioWarning[];
}

export type ScenarioFileOperation = 'idle' | 'importing' | 'removing' | 'saving' | 'saving_as';

export type ScenarioFileOperationOutcome = 'succeeded' | 'cancelled' | 'failed';

export interface ScenarioFileFeedback {
  operation: ScenarioFileOperation;
  error: ApiError | null;
  errorOperation: Exclude<ScenarioFileOperation, 'idle'> | null;
  diagnostics: ScenarioDiagnostic[];
  successMessage: string | null;
}

export type ValidatableField =
  | 'connection'
  | 'name'
  | 'rootTopic'
  | 'watchedTopics'
  | 'headers'
  | 'payload'
  | 'captureTimeoutSeconds';

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
  offset: string;
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
  offset: string;
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
