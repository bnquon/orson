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
	export class EventRecord {
	    topic: string;
	    key: string;
	    value: string;
	    headers: Header[];
	    partition: number;
	    offset: number;
	    timestamp: string;
	
	    static createFrom(source: any = {}) {
	        return new EventRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
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
	
	export class RunData {
	    correlationId: string;
	    rootRecord: EventRecord;
	    records: EventRecord[];
	
	    static createFrom(source: any = {}) {
	        return new RunData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.correlationId = source["correlationId"];
	        this.rootRecord = this.convertValues(source["rootRecord"], EventRecord);
	        this.records = this.convertValues(source["records"], EventRecord);
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
	export class RunResponse {
	    ok: boolean;
	    data?: RunData;
	    error?: APIError;
	
	    static createFrom(source: any = {}) {
	        return new RunResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.data = this.convertValues(source["data"], RunData);
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

