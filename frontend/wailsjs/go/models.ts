export namespace api {

	export class APIError {
	    code: string;
	    message: string;
	    details?: string;
	    fieldErrors?: Record<string, string>;
	    retryable: boolean;

	    static createFrom(source: any = {}) {
	        return new APIError(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.message = source["message"];
	        this.details = source["details"];
	        this.fieldErrors = source["fieldErrors"];
	        this.retryable = source["retryable"];
	    }
	}
	export class ConnectionAttempt {
	    status: string;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new ConnectionAttempt(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConnectionInfo {
	    name: string;
	    brokers: string[];
	    clientId: string;
	    dialTimeoutSeconds: number;

	    static createFrom(source: any = {}) {
	        return new ConnectionInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.brokers = source["brokers"];
	        this.clientId = source["clientId"];
	        this.dialTimeoutSeconds = source["dialTimeoutSeconds"];
	    }
	}
	export class ConnectionRequest {
	    name: string;
	    brokers: string[];
	    clientId: string;
	    dialTimeoutSeconds: number;

	    static createFrom(source: any = {}) {
	        return new ConnectionRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.brokers = source["brokers"];
	        this.clientId = source["clientId"];
	        this.dialTimeoutSeconds = source["dialTimeoutSeconds"];
	    }
	}
	export class WorkspacePersistenceStatus {
	    mode: string;
	    warning?: string;
	    recoveryAvailable: boolean;
	    sessionDirty: boolean;

	    static createFrom(source: any = {}) {
	        return new WorkspacePersistenceStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.warning = source["warning"];
	        this.recoveryAvailable = source["recoveryAvailable"];
	        this.sessionDirty = source["sessionDirty"];
	    }
	}
	export class ConnectionState {
	    active?: ConnectionInfo;
	    latestAttempt: ConnectionAttempt;
	    persistence?: WorkspacePersistenceStatus;

	    static createFrom(source: any = {}) {
	        return new ConnectionState(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = this.convertValues(source["active"], ConnectionInfo);
	        this.latestAttempt = this.convertValues(source["latestAttempt"], ConnectionAttempt);
	        this.persistence = this.convertValues(source["persistence"], WorkspacePersistenceStatus);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConnectionResponse {
	    ok: boolean;
	    data?: ConnectionState;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new ConnectionResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], ConnectionState);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class ConnectionStatusResponse {
	    ok: boolean;
	    data?: ConnectionState;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new ConnectionStatusResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], ConnectionState);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FolderMutationSummary {
	    removedScenarioCount: number;
	    sharedFileCount: number;

	    static createFrom(source: any = {}) {
	        return new FolderMutationSummary(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.removedScenarioCount = source["removedScenarioCount"];
	        this.sharedFileCount = source["sharedFileCount"];
	    }
	}
	export class Header {
	    key: string;
	    value: string;

	    static createFrom(source: any = {}) {
	        return new Header(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class MoveLocalScenarioRequest {
	    scenarioId: string;
	    folderId: string;
	    siblingIndex: number;

	    static createFrom(source: any = {}) {
	        return new MoveLocalScenarioRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scenarioId = source["scenarioId"];
	        this.folderId = source["folderId"];
	        this.siblingIndex = source["siblingIndex"];
	    }
	}
	export class MoveScenarioFolderRequest {
	    folderId: string;
	    parentId: string;

	    static createFrom(source: any = {}) {
	        return new MoveScenarioFolderRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folderId = source["folderId"];
	        this.parentId = source["parentId"];
	    }
	}
	export class ReorderScenarioFolderRequest {
	    folderId: string;
	    siblingIndex: number;

	    static createFrom(source: any = {}) {
	        return new ReorderScenarioFolderRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folderId = source["folderId"];
	        this.siblingIndex = source["siblingIndex"];
	    }
	}
	export class RunControlResponse {
	    ok: boolean;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new RunControlResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RunHistoryActionResponse {
	    ok: boolean;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new RunHistoryActionResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RunHistoryTopicStatus {
	    topic: string;
	    status: string;

	    static createFrom(source: any = {}) {
	        return new RunHistoryTopicStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.topic = source["topic"];
	        this.status = source["status"];
	    }
	}
	export class RunHistoryRecord {
	    sequence: number;
	    kind: string;
	    isRoot: boolean;
	    topic: string;
	    key: string;
	    value: string;
	    headers: Header[];
	    partition: number;
	    offset: string;
	    timestamp: string;

	    static createFrom(source: any = {}) {
	        return new RunHistoryRecord(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sequence = source["sequence"];
	        this.kind = source["kind"];
	        this.isRoot = source["isRoot"];
	        this.topic = source["topic"];
	        this.key = source["key"];
	        this.value = source["value"];
	        this.headers = this.convertValues(source["headers"], Header);
	        this.partition = source["partition"];
	        this.offset = source["offset"];
	        this.timestamp = source["timestamp"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioTopologyEdge {
	    id: string;
	    from: string;
	    to: string;

	    static createFrom(source: any = {}) {
	        return new ScenarioTopologyEdge(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.from = source["from"];
	        this.to = source["to"];
	    }
	}
	export class RunHistoryScenarioSnapshot {
	    version: number;
	    id?: string;
	    source: string;
	    reference: string;
	    displayName: string;
	    sourceFilename?: string;
	    rootTopic: string;
	    messageKey: string;
	    payload: string;
	    headers: Header[];
	    watchedTopics: string[];
	    correlationHeader: string;
	    captureTimeoutSeconds: number;
	    topology: ScenarioTopologyEdge[];
	    configuredTopology?: ScenarioTopologyEdge[];

	    static createFrom(source: any = {}) {
	        return new RunHistoryScenarioSnapshot(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.id = source["id"];
	        this.source = source["source"];
	        this.reference = source["reference"];
	        this.displayName = source["displayName"];
	        this.sourceFilename = source["sourceFilename"];
	        this.rootTopic = source["rootTopic"];
	        this.messageKey = source["messageKey"];
	        this.payload = source["payload"];
	        this.headers = this.convertValues(source["headers"], Header);
	        this.watchedTopics = source["watchedTopics"];
	        this.correlationHeader = source["correlationHeader"];
	        this.captureTimeoutSeconds = source["captureTimeoutSeconds"];
	        this.topology = this.convertValues(source["topology"], ScenarioTopologyEdge);
	        this.configuredTopology = this.convertValues(source["configuredTopology"], ScenarioTopologyEdge);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RunHistorySummary {
	    runId: string;
	    scenarioId?: string;
	    scenarioSource: string;
	    scenarioReference: string;
	    scenarioName: string;
	    rootTopic: string;
	    status: string;
	    startedAt: string;
	    finishedAt: string;
	    durationMs: number;
	    eventCount: number;
	    failureStage?: string;
	    failureMessage?: string;
	    connectionName?: string;
	    outcome: string;

	    static createFrom(source: any = {}) {
	        return new RunHistorySummary(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.runId = source["runId"];
	        this.scenarioId = source["scenarioId"];
	        this.scenarioSource = source["scenarioSource"];
	        this.scenarioReference = source["scenarioReference"];
	        this.scenarioName = source["scenarioName"];
	        this.rootTopic = source["rootTopic"];
	        this.status = source["status"];
	        this.startedAt = source["startedAt"];
	        this.finishedAt = source["finishedAt"];
	        this.durationMs = source["durationMs"];
	        this.eventCount = source["eventCount"];
	        this.failureStage = source["failureStage"];
	        this.failureMessage = source["failureMessage"];
	        this.connectionName = source["connectionName"];
	        this.outcome = source["outcome"];
	    }
	}
	export class RunHistoryData {
	    summary: RunHistorySummary;
	    scenario: RunHistoryScenarioSnapshot;
	    records: RunHistoryRecord[];
	    trackedTopics: RunHistoryTopicStatus[];

	    static createFrom(source: any = {}) {
	        return new RunHistoryData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.summary = this.convertValues(source["summary"], RunHistorySummary);
	        this.scenario = this.convertValues(source["scenario"], RunHistoryScenarioSnapshot);
	        this.records = this.convertValues(source["records"], RunHistoryRecord);
	        this.trackedTopics = this.convertValues(source["trackedTopics"], RunHistoryTopicStatus);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RunHistoryListData {
	    runs: RunHistorySummary[];

	    static createFrom(source: any = {}) {
	        return new RunHistoryListData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.runs = this.convertValues(source["runs"], RunHistorySummary);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RunHistoryListResponse {
	    ok: boolean;
	    data?: RunHistoryListData;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new RunHistoryListResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], RunHistoryListData);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class RunHistoryResponse {
	    ok: boolean;
	    data?: RunHistoryData;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new RunHistoryResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], RunHistoryData);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}



	export class RunScenarioSnapshot {
	    version: number;
	    source: string;
	    scenarioId: string;
	    sourcePath: string;
	    sourceFilename: string;
	    displayName: string;
	    rootTopic: string;
	    watchedTopics: string[];
	    topology: ScenarioTopologyEdge[];
	    configuredTopology: ScenarioTopologyEdge[];
	    messageKey: string;
	    headers: Header[];
	    correlationHeader: string;
	    payload: string;
	    captureTimeoutSeconds: number;

	    static createFrom(source: any = {}) {
	        return new RunScenarioSnapshot(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.source = source["source"];
	        this.scenarioId = source["scenarioId"];
	        this.sourcePath = source["sourcePath"];
	        this.sourceFilename = source["sourceFilename"];
	        this.displayName = source["displayName"];
	        this.rootTopic = source["rootTopic"];
	        this.watchedTopics = source["watchedTopics"];
	        this.topology = this.convertValues(source["topology"], ScenarioTopologyEdge);
	        this.configuredTopology = this.convertValues(source["configuredTopology"], ScenarioTopologyEdge);
	        this.messageKey = source["messageKey"];
	        this.headers = this.convertValues(source["headers"], Header);
	        this.correlationHeader = source["correlationHeader"];
	        this.payload = source["payload"];
	        this.captureTimeoutSeconds = source["captureTimeoutSeconds"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RunRequest {
	    rootTopic: string;
	    messageKey: string;
	    payload: string;
	    headers: Header[];
	    correlationHeader: string;
	    watchedTopics: string[];
	    captureTimeoutSeconds: number;
	    scenarioSnapshot?: RunScenarioSnapshot;

	    static createFrom(source: any = {}) {
	        return new RunRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rootTopic = source["rootTopic"];
	        this.messageKey = source["messageKey"];
	        this.payload = source["payload"];
	        this.headers = this.convertValues(source["headers"], Header);
	        this.correlationHeader = source["correlationHeader"];
	        this.watchedTopics = source["watchedTopics"];
	        this.captureTimeoutSeconds = source["captureTimeoutSeconds"];
	        this.scenarioSnapshot = this.convertValues(source["scenarioSnapshot"], RunScenarioSnapshot);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class RunStartData {
	    runId: string;

	    static createFrom(source: any = {}) {
	        return new RunStartData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.runId = source["runId"];
	    }
	}
	export class RunStartResponse {
	    ok: boolean;
	    data?: RunStartData;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new RunStartResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], RunStartData);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioWarning {
	    code: string;
	    path?: string;
	    message: string;
	    sourceFilename?: string;
	    line?: number;
	    column?: number;

	    static createFrom(source: any = {}) {
	        return new ScenarioWarning(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.path = source["path"];
	        this.message = source["message"];
	        this.sourceFilename = source["sourceFilename"];
	        this.line = source["line"];
	        this.column = source["column"];
	    }
	}
	export class ScenarioData {
	    id: string;
	    relativePath: string;
	    folderPath?: string;
	    folderId?: string;
	    name: string;
	    sourceFilename: string;
	    source: string;
	    sourcePath?: string;
	    localStatus?: string;
	    publishTopic: string;
	    publishPayload: string;
	    messageKey: string;
	    headers: Header[];
	    watchedTopics: string[];
	    correlationHeader: string;
	    captureTimeoutSeconds: number;
	    topology: ScenarioTopologyEdge[];
	    configuredTopology: ScenarioTopologyEdge[];
	    warnings?: ScenarioWarning[];

	    static createFrom(source: any = {}) {
	        return new ScenarioData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.relativePath = source["relativePath"];
	        this.folderPath = source["folderPath"];
	        this.folderId = source["folderId"];
	        this.name = source["name"];
	        this.sourceFilename = source["sourceFilename"];
	        this.source = source["source"];
	        this.sourcePath = source["sourcePath"];
	        this.localStatus = source["localStatus"];
	        this.publishTopic = source["publishTopic"];
	        this.publishPayload = source["publishPayload"];
	        this.messageKey = source["messageKey"];
	        this.headers = this.convertValues(source["headers"], Header);
	        this.watchedTopics = source["watchedTopics"];
	        this.correlationHeader = source["correlationHeader"];
	        this.captureTimeoutSeconds = source["captureTimeoutSeconds"];
	        this.topology = this.convertValues(source["topology"], ScenarioTopologyEdge);
	        this.configuredTopology = this.convertValues(source["configuredTopology"], ScenarioTopologyEdge);
	        this.warnings = this.convertValues(source["warnings"], ScenarioWarning);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioDiagnostic {
	    code: string;
	    path?: string;
	    message: string;
	    details?: string;
	    sourceFilename: string;
	    line?: number;
	    column?: number;

	    static createFrom(source: any = {}) {
	        return new ScenarioDiagnostic(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.path = source["path"];
	        this.message = source["message"];
	        this.details = source["details"];
	        this.sourceFilename = source["sourceFilename"];
	        this.line = source["line"];
	        this.column = source["column"];
	    }
	}
	export class ScenarioDescriptor {
	    id: string;
	    displayName: string;
	    relativePath: string;
	    folderPath?: string;
	    folderId?: string;
	    siblingOrder: number;
	    sourceFilename: string;
	    source: string;
	    sourcePath?: string;
	    localStatus?: string;
	    status: string;
	    warnings?: ScenarioWarning[];
	    diagnostics?: ScenarioDiagnostic[];

	    static createFrom(source: any = {}) {
	        return new ScenarioDescriptor(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.displayName = source["displayName"];
	        this.relativePath = source["relativePath"];
	        this.folderPath = source["folderPath"];
	        this.folderId = source["folderId"];
	        this.siblingOrder = source["siblingOrder"];
	        this.sourceFilename = source["sourceFilename"];
	        this.source = source["source"];
	        this.sourcePath = source["sourcePath"];
	        this.localStatus = source["localStatus"];
	        this.status = source["status"];
	        this.warnings = this.convertValues(source["warnings"], ScenarioWarning);
	        this.diagnostics = this.convertValues(source["diagnostics"], ScenarioDiagnostic);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class ScenarioDraft {
	    name: string;
	    publishTopic: string;
	    publishPayload: string;
	    messageKey: string;
	    headers: Header[];
	    watchedTopics: string[];
	    correlationHeader: string;
	    captureTimeoutSeconds: number;
	    topology: ScenarioTopologyEdge[];

	    static createFrom(source: any = {}) {
	        return new ScenarioDraft(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.publishTopic = source["publishTopic"];
	        this.publishPayload = source["publishPayload"];
	        this.messageKey = source["messageKey"];
	        this.headers = this.convertValues(source["headers"], Header);
	        this.watchedTopics = source["watchedTopics"];
	        this.correlationHeader = source["correlationHeader"];
	        this.captureTimeoutSeconds = source["captureTimeoutSeconds"];
	        this.topology = this.convertValues(source["topology"], ScenarioTopologyEdge);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioFileData {
	    cancelled: boolean;
	    descriptor?: ScenarioDescriptor;
	    scenario?: ScenarioData;
	    diagnostics?: ScenarioDiagnostic[];
	    persistence?: WorkspacePersistenceStatus;

	    static createFrom(source: any = {}) {
	        return new ScenarioFileData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cancelled = source["cancelled"];
	        this.descriptor = this.convertValues(source["descriptor"], ScenarioDescriptor);
	        this.scenario = this.convertValues(source["scenario"], ScenarioData);
	        this.diagnostics = this.convertValues(source["diagnostics"], ScenarioDiagnostic);
	        this.persistence = this.convertValues(source["persistence"], WorkspacePersistenceStatus);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioFileResponse {
	    ok: boolean;
	    data?: ScenarioFileData;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new ScenarioFileResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], ScenarioFileData);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioFolder {
	    id: string;
	    name: string;
	    parentId?: string;
	    siblingOrder: number;

	    static createFrom(source: any = {}) {
	        return new ScenarioFolder(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.parentId = source["parentId"];
	        this.siblingOrder = source["siblingOrder"];
	    }
	}
	export class ScenarioFolderData {
	    folders: ScenarioFolder[];
	    scenarios: ScenarioDescriptor[];
	    persistence: WorkspacePersistenceStatus;
	    summary?: FolderMutationSummary;

	    static createFrom(source: any = {}) {
	        return new ScenarioFolderData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folders = this.convertValues(source["folders"], ScenarioFolder);
	        this.scenarios = this.convertValues(source["scenarios"], ScenarioDescriptor);
	        this.persistence = this.convertValues(source["persistence"], WorkspacePersistenceStatus);
	        this.summary = this.convertValues(source["summary"], FolderMutationSummary);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioFolderResponse {
	    ok: boolean;
	    data?: ScenarioFolderData;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new ScenarioFolderResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], ScenarioFolderData);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioListData {
	    scenarios: ScenarioDescriptor[];

	    static createFrom(source: any = {}) {
	        return new ScenarioListData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scenarios = this.convertValues(source["scenarios"], ScenarioDescriptor);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioListResponse {
	    ok: boolean;
	    data?: ScenarioListData;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new ScenarioListResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], ScenarioListData);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScenarioResponse {
	    ok: boolean;
	    data?: ScenarioData;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new ScenarioResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], ScenarioData);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}


	export class Workspace {
	    id: string;
	    name: string;
	    createdAt: string;
	    updatedAt: string;
	    lastOpenedAt: string;
	    scenarioCount: number;
	    hasRememberedConnection: boolean;

	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.lastOpenedAt = source["lastOpenedAt"];
	        this.scenarioCount = source["scenarioCount"];
	        this.hasRememberedConnection = source["hasRememberedConnection"];
	    }
	}
	export class WorkspaceActionResponse {
	    ok: boolean;
	    persistence?: WorkspacePersistenceStatus;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new WorkspaceActionResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.persistence = this.convertValues(source["persistence"], WorkspacePersistenceStatus);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WorkspaceBootstrapData {
	    workspaces: Workspace[];
	    activeWorkspace: Workspace;
	    bundledScenarios: ScenarioDescriptor[];
	    localScenarios: ScenarioDescriptor[];
	    localFolders: ScenarioFolder[];
	    selectedScenarioId?: string;
	    selectedScenario?: ScenarioData;
	    rememberedConnection?: ConnectionInfo;
	    connection: ConnectionState;
	    persistence: WorkspacePersistenceStatus;

	    static createFrom(source: any = {}) {
	        return new WorkspaceBootstrapData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.workspaces = this.convertValues(source["workspaces"], Workspace);
	        this.activeWorkspace = this.convertValues(source["activeWorkspace"], Workspace);
	        this.bundledScenarios = this.convertValues(source["bundledScenarios"], ScenarioDescriptor);
	        this.localScenarios = this.convertValues(source["localScenarios"], ScenarioDescriptor);
	        this.localFolders = this.convertValues(source["localFolders"], ScenarioFolder);
	        this.selectedScenarioId = source["selectedScenarioId"];
	        this.selectedScenario = this.convertValues(source["selectedScenario"], ScenarioData);
	        this.rememberedConnection = this.convertValues(source["rememberedConnection"], ConnectionInfo);
	        this.connection = this.convertValues(source["connection"], ConnectionState);
	        this.persistence = this.convertValues(source["persistence"], WorkspacePersistenceStatus);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WorkspaceBootstrapResponse {
	    ok: boolean;
	    data?: WorkspaceBootstrapData;
	    error?: APIError;

	    static createFrom(source: any = {}) {
	        return new WorkspaceBootstrapResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], WorkspaceBootstrapData);
	        this.error = this.convertValues(source["error"], APIError);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class WorkspaceSelectionRequest {
	    workspaceId: string;
	    source: string;
	    scenarioId: string;

	    static createFrom(source: any = {}) {
	        return new WorkspaceSelectionRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.workspaceId = source["workspaceId"];
	        this.source = source["source"];
	        this.scenarioId = source["scenarioId"];
	    }
	}

}

