

declare enum Events {
    All = 0,
    OnOff = 1,
    VideoStates = 2,
    Rank = 3,
    Topic = 4,
}
interface Options {
    targetDevice?: string;
    models: {
        [index: number]: Events[];
    };
}
interface SingleChange {
    prop: string;
    before: number | string;
    after: number | string;
    when: any;
}
interface TaggedModel extends ExpandedModel {
    _push: {
        pushFunc: () => void;
        events: {
            [index: number]: boolean;
        };
        changes: SingleChange[];
        previousVideoState?: SingleChange;
        previousOnOffState?: SingleChange;
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
    deviceIden: string;
    constructor(pbApiKey: string, options: Options);
    start(callback: () => void): void;
    mute(): void;
    unmute(): void;
    snooze(duration: any): void;
    private pushStack(model);
    private push(title, message, callback?);
    private processOptions();
    private modelStatePusher(model, before, after);
    private modelRankPusher(model, before, after);
    private modelTopicPusher(model, before, after);
}
