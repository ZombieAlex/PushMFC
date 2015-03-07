

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
interface TaggedModel extends ExpandedModel {
    _push: {
        pushFunc: () => void;
        events: {
            [index: number]: string;
        };
        changes: SingleChange[];
        previousVideoState?: SingleChange;
        previousOnOffState?: SingleChange;
        countdown: {
            exists: boolean;
            numbers: number[];
            index: number;
            decrementMap: number[];
        };
    };
}
declare var _: any;
declare var moment: any;
declare class PushMFC {
    mfc: any;
    pushbullet: any;
    assert: any;
    client: Client;
    pusher: any;
    options: Options;
    pbApiKey: string;
    deviceMap: {
        [index: string]: string;
    };
    constructor(pbApiKey: string, options: Options);
    start(callback: () => void): void;
    mute(): void;
    unmute(): void;
    snooze(duration: any): void;
    private pushStack(model);
    private push(deviceIden, title, message, callback?);
    private processOptions();
    private modelStatePusher(model, before, after);
    private modelRankPusher(model, before, after);
    private modelTopicPusher(model, before, after);
    private countdownPusher(model, before, after);
    private resetCountdown(model, newNumbers);
}
