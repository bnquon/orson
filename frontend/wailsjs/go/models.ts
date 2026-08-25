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
	export class ConnectionState {
	    active?: ConnectionInfo;
	    latestAttempt: ConnectionAttempt;

	    static createFrom(source: any = {}) {
	        return new ConnectionState(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = this.convertValues(source["active"], ConnectionInfo);
	        this.latestAttempt = this.convertValues(source["latestAttempt"], ConnectionAttempt);
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
	export class RunRequest {
	    rootTopic: string;
	    messageKey: string;
	    payload: string;
	    headers: Header[];
	    correlationHeader: string;
	    watchedTopics: string[];
	    captureTimeoutSeconds: number;

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
	        this.message = source["message"];
	        this.sourceFilename = source["sourceFilename"];
	        this.line = source["line"];
	        this.column = source["column"];
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
	export class ScenarioData {
	    id: string;
	    relativePath: string;
	    folderPath?: string;
	    name: string;
	    sourceFilename: string;
	    publishTopic: string;
	    publishPayload: string;
	    watchedTopics: string[];
	    correlationHeader: string;
	    captureTimeoutSeconds: number;
	    topology: ScenarioTopologyEdge[];
	    warnings?: ScenarioWarning[];

	    static createFrom(source: any = {}) {
	        return new ScenarioData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.relativePath = source["relativePath"];
	        this.folderPath = source["folderPath"];
	        this.name = source["name"];
	        this.sourceFilename = source["sourceFilename"];
	        this.publishTopic = source["publishTopic"];
	        this.publishPayload = source["publishPayload"];
	        this.watchedTopics = source["watchedTopics"];
	        this.correlationHeader = source["correlationHeader"];
	        this.captureTimeoutSeconds = source["captureTimeoutSeconds"];
	        this.topology = this.convertValues(source["topology"], ScenarioTopologyEdge);
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
	    sourceFilename: string;
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
	        this.sourceFilename = source["sourceFilename"];
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


}
