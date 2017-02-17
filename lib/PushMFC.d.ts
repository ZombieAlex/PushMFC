import * as mfc from "MFCAuto";
export declare enum Events {
    All = 0,
    OnOff = 1,
    VideoStates = 2,
    Rank = 3,
    Topic = 4,
    CountdownStart = 5,
    CountdownComplete = 6,
}
export interface Options {
    [index: string]: {
        [index: number]: Events[];
    };
}
export declare class PushMFC {
    private client;
    private selfStarting;
    private debug;
    private countdown;
    private trackedModels;
    private options;
    private joinApiKey;
    private deviceMap;
    constructor(joinApiKey: string, options: Options, client?: mfc.Client);
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
