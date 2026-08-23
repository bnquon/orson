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
  position: 'root' | 'payment' | 'inventory' | 'notification';
}

export interface ObservedRun {
  id: string;
  duration: string;
  events: ObservedEvent[];
}
