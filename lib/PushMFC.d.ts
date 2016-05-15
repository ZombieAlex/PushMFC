declare const https: any;
declare const countdown: any;
declare enum Events {
    All = 0,
    OnOff = 1,
    VideoStates = 2,
    Rank = 3,
    Topic = 4,
    CountdownStart = 5,
    CountdownComplete = 6,
}
interface Options {
    [index: string]: {
        [index: number]: Events[];
    };
}
interface SingleChange {
    prop: string;
    before?: number | string;
    after?: number | string;
    message?: string;
    when: any;
}
interface TaggedModel extends Model {
    _push: {
        pushFunc: () => void;
        events: {
            [index: number]: string;
        };
        changes: SingleChange[];
        previousVideoState?: SingleChange;
        previousOnOffState?: SingleChange;
    };
}
declare var _: any;
declare var moment: any;
declare class PushMFC {
    private mfc;
    private assert;
    private client;
    private selfStarting;
    private debug;
    private countdown;
    private trackedModels;
    private options;
    private joinApiKey;
    private deviceMap;
    constructor(joinApiKey: string, options: Options, client?: Client);
    start(callback: () => void): void;
    private getDevices();
    private getThumbnailForModel(m);
    private note(targets, model, title, message);
    private pushStack(model);
    private processOptions();
    private modelStatePusher(model, before, after);
    private modelRankPusher(model, before, after);
    private modelTopicPusher(model, before, after);
    private logDebug(msg, obj?);
}
