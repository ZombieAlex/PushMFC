/*
PushMFC.js - 'Join by joaoapps' notifications for MyFreeCams
*/
import {Countdown} from "mfcauto-plugins";
import * as _ from "lodash";
import * as assert from "assert";
import * as https from "https";
import * as mfc from "MFCAuto";
import * as moment from "moment";

export enum Events {
    All,                // Log every possible event
    OnOff,              // Track only whether the model is generally on MFC or not (leaving off public/private/group details)
    VideoStates,        // Track all offline, online, private, public, group, etc states for the model
    Rank,               // Changes in the model's rank
    Topic,              // Changes in the model's topic
    CountdownStart,     // Notify when we detect a countdown has started
    CountdownComplete,  // Notify when we detect a countdown has complete
}

export interface Options {
    [index: string]: {              // Which device to use for this set of models
        [index: number]: Events[];  // Which events to monitor for which models
    };
};

interface SingleChange {
    prop: string;
    // Single change should either have a before and after, or a message
    before?: number | string;
    after?: number | string;
    message?: string;
    when: any; // Time of the change, a date or moment...
}

interface TaggedModel extends mfc.Model {
    _push: {
        // A bound a debounced function that will send the Join
        // note notification for all current changes for this model
        pushFunc: () => void;
        events: {
            // event -> deviceId (or "All Devices" for all)
            // Controls which events are sent to which Join device
            // There is one and only one device allowed, last one specified wins
            [index: number]: string;
        }
        // A stack of all the changes this model has had since the last push
        changes: SingleChange[];

        // Helper references that allow us to get the time since the last
        // video state change and on/off change when we finally push these
        // states
        previousVideoState?: SingleChange;
        previousOnOffState?: SingleChange;
    };
}

export class PushMFC {
    private client: mfc.Client;
    private selfStarting: boolean;
    private debug: boolean = false;
    private countdown: Countdown;
    private trackedModels: Set<number>;

    private options: Options;
    private joinApiKey: string;
    private deviceMap: { [index: string]: string } = {};

    constructor(joinApiKey: string, options: Options, client?: mfc.Client) {
        assert.notStrictEqual(joinApiKey, undefined, "Join API Key is required");
        this.joinApiKey = joinApiKey;
        this.options = options;
        this.trackedModels = new Set() as Set<number>;
        if (client === undefined) {
            this.client = new mfc.Client();
            this.selfStarting = true;
        } else {
            this.client = client;
            this.selfStarting = false; // If we were given an existing client, assume our caller will handle connecting it
        }
        this.client.setMaxListeners(500);
        this.countdown = new Countdown();
        this.countdown.on("countdownCompleted", (model: TaggedModel, before: string, after: string) => {
            if(model._push !== undefined && model._push.events[Events.CountdownComplete] !== undefined){
                model._push.changes.push({
                    prop: "cdend",
                    message: "Countdown completed! New topic: " + after + "\nOld topic: " + before,
                    when: moment(),
                });
                model._push.pushFunc();
            }
        });
        this.countdown.on("countdownDetected", (model: TaggedModel, remaining: string, topic: string) => {
            if(model._push !== undefined && model._push.events[Events.CountdownStart] !== undefined){
                model._push.changes.push({
                    prop: "cdstart",
                    message: "Countdown detected, " + remaining + " remaining:\n" + topic,
                    when: moment(),
                });
                model._push.pushFunc();
            }
        });
        this.client.on("CLIENT_CONNECTED", () => {
            // On connect, explicitly query each user we're tracking.
            // This resolves an issue where MFC does not send information
            // about a model who is online but not on camera when you first
            // load the model list.  That model must be either in your friend
            // list or specifically queried for (like this) to know she's
            // online.
            this.trackedModels.forEach((id) => {
                this.client.queryUser(id);
            });
        });
    }

    public start(callback: () => void) {
        this.getDevices().then((devices: any[]) => {
            for (let i = 0; i < devices.length; i++) {
                this.deviceMap[devices[i].deviceName] = devices[i].deviceId;
                assert.notStrictEqual("All Devices", devices[i].deviceName, "You have a Join device named 'All Devices', PushMFC is currently reserving that name for a special case and cannot continue");
            }
            this.logDebug("Join sent these devices:\n", devices);
            this.processOptions();
            if (this.selfStarting) {
                this.client.connect(true).then(callback);
            } else {
                callback();
            }
        });
    }

    private getDevices() {
        return new Promise((resolve, reject) => {
            https.get(  `https://joinjoaomgcd.appspot.com/_ah/api/registration/v1/listDevices?apikey=${this.joinApiKey}`,
                        (res) => {
                            let contents = "";
                            res.on("data", function (chunk: string) {
                                contents += chunk;
                            });
                            res.on("end", () => {
                                let obj = JSON.parse(contents);
                                assert(Array.isArray(obj.records) && obj.records.length > 0, `Join sent the device list in an unexpected format: '${contents}'`);
                                resolve(obj.records);
                            });
                        }
                    ).on("error", (e) => {
                        reject(e);
                    }
            );
        });
    }

    private getThumbnailForModel(m: mfc.Model) {
        let id = m.uid.toString();
        return `http://img.mfcimg.com/photos2/${id.slice(0, 3)}/${id}/avatar.90x90.jpg`;
    }

    private note(targets: string[], model: mfc.Model, title: string, message: string) {
        if (targets == undefined){
            // Send to all devices
            https.get(`https://joinjoaomgcd.appspot.com/_ah/api/messaging/v1/sendPush?apikey=${this.joinApiKey}&deviceId=group.all&text=${encodeURIComponent(message)}&title=${encodeURIComponent(title)}&icon=${encodeURIComponent(this.getThumbnailForModel(model))}`);
        }else{
            // Send to the specified device subset
            https.get(`https://joinjoaomgcd.appspot.com/_ah/api/messaging/v1/sendPush?apikey=${this.joinApiKey}&text=${encodeURIComponent(message)}&title=${encodeURIComponent(title)}&icon=${encodeURIComponent(this.getThumbnailForModel(model))}&deviceId=${encodeURIComponent(targets.join(','))}`);
        }
    }

    private pushStack(model: TaggedModel) {
        this.logDebug(`Pushing stack for model '${model.nm}'\n`, model._push);

        let change: SingleChange;

        let title = `PM: ${model.nm}`;
        let body = "";
        let line = "";

        // The set of all devices targetted by events in this push
        let targetDevices: { [index: string]: boolean } = {};

        while ((change = model._push.changes.shift()) !== undefined) {
            line = "";
            switch (change.prop) {
                case "vs":
                    // Record the target device for this change
                    assert.notStrictEqual(model._push.events[Events.VideoStates], undefined);
                    targetDevices[model._push.events[Events.VideoStates]] = true;

                    // Build the string for this change
                    line += "Is now in state " + mfc.STATE[change.after];
                    if (model._push.previousVideoState !== undefined && model._push.previousVideoState.when !== change.when) {
                        line += " after " + moment.duration(change.when - model._push.previousVideoState.when).humanize() + " in state " + mfc.STATE[model._push.previousVideoState.after];
                    }
                    model._push.previousVideoState = change;
                    line += ".\n";
                    break;
                case "vs2": // Property doesn't really exist on Model, we're overloading the mechanism here to capture Online/Offline....
                    // Record the target device for this change
                    assert.notStrictEqual(model._push.events[Events.OnOff], undefined);
                    targetDevices[model._push.events[Events.OnOff]] = true;

                    // Build the string for this change
                    if (change.after === mfc.STATE.Offline) {
                        line += "Is now off MFC";
                    } else {
                        line += "Is now on MFC";
                    }
                    if (model._push.previousOnOffState !== undefined && model._push.previousOnOffState.when !== change.when) {
                        line += " after " + moment.duration(change.when - model._push.previousOnOffState.when).humanize();
                        if (change.after === mfc.STATE.Offline) {
                            line += " on";
                        } else {
                            line += " off";
                        }
                    }
                    model._push.previousOnOffState = change;
                    line += ".\n";
                    break;
                case "rank":
                    // Record the target device for this change
                    assert.notStrictEqual(model._push.events[Events.Rank], undefined);
                    targetDevices[model._push.events[Events.Rank]] = true;

                    // Build the string for this change
                    let brank = change.before === 0 ? " from rank over 1000" : (change.before === undefined ? "" : " from rank " + change.before);
                    let arank = change.after === 0 ? "over 1000" : String(change.after);
                    line += `Has moved${brank} to rank ${arank}.\n`;
                    break;
                case "topic":
                    // Record the target device for this change
                    assert.notStrictEqual(model._push.events[Events.Topic], undefined);
                    targetDevices[model._push.events[Events.Topic]] = true;

                    // Build the string for this change
                    line += `New topic: ${change.after}\n`;
                    break;
                case "cdstart":
                    // Record the target device for this change
                    assert.notStrictEqual(model._push.events[Events.CountdownStart], undefined);
                    targetDevices[model._push.events[Events.CountdownStart]] = true;

                    line += change.message + "\n";
                    break;
                case "cdend":
                    // Record the target device for this change
                    assert.notStrictEqual(model._push.events[Events.CountdownComplete], undefined);
                    targetDevices[model._push.events[Events.CountdownComplete]] = true;

                    line += change.message + "\n";
                    break;
                default:
                    assert(false, `Don't know how to push for property: ${change.prop}`);
            }
            body = "[" + change.when.format("HH:mm:ss") + "] " + line + body;
        }

        /*
        Finally make the actual Join push.

        Possible cases:
            1. All events in this note have the same device target, easy, just send to that device
            2. Events in this note have different targets, but at least one of the events has an "All Devices" target, just send to all devices
            3. Events in this note have different targets, but none have the "All Devices" target, best option here is to send two notes
        */
        if (targetDevices["All Devices"] === true) {
            this.note(undefined, model, title, body);
        } else {
            let deviceList = [];
            for (let device in targetDevices) {
                if (targetDevices.hasOwnProperty(device)) {
                    deviceList.push(device);
                }
            }
            this.note(deviceList, model, title, body);
        }
    }

    private processOptions() {
        assert.notStrictEqual(this.options, undefined, "No options specified");
        for (let device in this.options) {
            if (this.options.hasOwnProperty(device)) {
                assert(device === "All Devices" || this.deviceMap[device] !== undefined, "Unknown Pushbullet device in options: " + device);
                for (let modelId in this.options[device]) {
                    if (this.options[device].hasOwnProperty(modelId)) {
                        assert(Array.isArray(this.options[device][modelId]), "Options for model '" + modelId + "' were not specified as an array");
                        assert.notStrictEqual(this.options[device][modelId].length, 0, "Options for model '" + modelId + "' were empty");
                        let modelIdInt = parseInt(modelId);
                        this.trackedModels.add(modelIdInt);

                        let model = mfc.Model.getModel(modelIdInt) as TaggedModel;
                        if (model._push === undefined) {
                            model.on("vs", this.modelStatePusher.bind(this)); // @TODO - This is kind of ugly, we don't need to hook these callbacks if we're not pushing these
                            model.on("rank", this.modelRankPusher.bind(this));
                            model.on("topic", this.modelTopicPusher.bind(this));
                            model._push = {
                                events: {},
                                changes: [],
                                pushFunc: _.debounce(this.pushStack.bind(this, model), 5000),
                            };
                        }
                        this.options[device][modelId].forEach(function (deviceIden: string, item: Events) {
                            assert.notStrictEqual(item, undefined, "Unknown option specified on model " + modelId);
                            if (item === Events.All) {
                                model._push.events[Events.OnOff] = deviceIden;
                                model._push.events[Events.VideoStates] = deviceIden;
                                model._push.events[Events.Rank] = deviceIden;
                                model._push.events[Events.Topic] = deviceIden;
                                model._push.events[Events.CountdownStart] = deviceIden;
                                model._push.events[Events.CountdownComplete] = deviceIden;
                            } else {
                                model._push.events[item] = deviceIden;
                            }
                        }.bind(this, device === "All Devices" ? "All Devices" : this.deviceMap[device]));
                    }
                }
            }
        }
    }

    private modelStatePusher(model: TaggedModel, before: mfc.FCVIDEO, after: mfc.FCVIDEO) {
        if (before !== after) {
            let change: SingleChange;
            if (model._push.events[Events.OnOff] !== undefined) {
                if (before === mfc.FCVIDEO.OFFLINE && after !== mfc.FCVIDEO.OFFLINE) {
                    change = { prop: "vs2", before: before, after: after, when: moment() };
                    if (model._push.previousOnOffState === undefined) {
                        model._push.previousOnOffState = change;
                    }
                    model._push.changes.push(change);
                    model._push.pushFunc();
                }
                if (after === mfc.FCVIDEO.OFFLINE && before !== mfc.FCVIDEO.OFFLINE) {
                    change = { prop: "vs2", before: before, after: after, when: moment() };
                    if (model._push.previousOnOffState === undefined) {
                        model._push.previousOnOffState = change;
                    }
                    model._push.changes.push(change);
                    model._push.pushFunc();
                }
            }
            if (model._push.events[Events.VideoStates] !== undefined) {
                change = { prop: "vs", before: before, after: after, when: moment() };
                if (model._push.previousVideoState === undefined) {
                    model._push.previousVideoState = change;
                }
                model._push.changes.push(change);
                model._push.pushFunc();
            }
        }
    }

    private modelRankPusher(model: TaggedModel, before: number, after: number) {
        if (model._push.events[Events.Rank] !== undefined && before !== after && (before !== undefined || after !== 0)) {
            model._push.changes.push({ prop: "rank", before: before, after: after, when: moment() });
            model._push.pushFunc();
        }
    }

    private modelTopicPusher(model: TaggedModel, before: string, after: string) {
        if (model._push.events[Events.Topic] !== undefined && before !== after && after !== undefined && after !== null && after !== "") {
            model._push.changes.push({ prop: "topic", before: before, after: after, when: moment() });
            model._push.pushFunc();
        }
    }

    private logDebug(msg: string, obj?: any) {
        if (this.debug === true) {
            if (obj) {
                msg = msg + JSON.stringify(obj, null, "  ");
            }
            mfc.log(msg);
            mfc.log("-----------------------------------");
        }
    }
};
