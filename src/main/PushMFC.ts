/// <reference path="../dependent_definitions/node.d.ts" />
/// <reference path="../../node_modules/MFCAuto/lib/MFCAuto.d.ts" />
/*
PushMFC.js - Pushbullet notifications for MyFreeCams

@TODO List
    * Pre-query all the given models to get around the long standing bug
        where MFC doesn't send any information for models that are online
        but "idle" and not in any other video state like away free chat etc
        at the moment you log in.  They do send that detail for friends, but
        nobody else.  I think this is queryable through an FCTYPE.DETAILS
        message.
    * Support logging for all friends of a given account
    * Support specifying models my name:
        [index: string]: Events[]; //Models can be specified by name
    * Support dynamic filters like:
        dynamic: {
            [index: string]: {
                when: (model, before, after) => boolean;
                push: Events[];
            }
        }

        Where it would look like:

        dynamic: {
            rank: {
                when: (model, before, after) => after !== 0;
                push: [pm.Events.All]
            }
        }
*/

enum Events {
    All, //Log every possible event
    OnOff, //Track only whether the model is generally on MFC or not (leaving off public/private/group details)
    VideoStates, //Track all offline, online, private, public, group, etc states for the model
    Rank, //Changes in the model's rank
    Topic, //Changes in the model's topic
    CountdownStart, //@TODO - Unimplemented yet
    CountdownComplete, //@TODO - Unimplemented yet
}

interface Options{
    [index: string]: { //Which device to use for this set of models
        [index: number]: Events[]; //Which events to monitor for which models
    };
};

interface SingleChange{
    prop: string;
    before: number|string;
    after: number|string;
    when: any; //Time of the change, a date or moment...
}

interface TaggedModel extends ExpandedModel{
    _push: {
        pushFunc: ()=>void;
        events: {
            [index: number]: string; //event -> targetDeviceIden (or "All Devices" for all)
        }
        changes: SingleChange[];
        previousVideoState?: SingleChange;
        previousOnOffState?: SingleChange;
    }
}

var _ = require('lodash');
var moment = require('moment');

class PushMFC{
    //@TODO - Just give in and move all these requires to the global scope....it makes the code cleaner, assert() rather than this.assert() etc...
    mfc = require("MFCAuto");
    pushbullet: any = require('pushbullet');
    assert: any = require('assert');

    client: Client;
    pusher: any;

    options: Options;
    pbApiKey: string;
    deviceMap: {[index:string]: string} = {};

    constructor(pbApiKey: string, options: Options){
        this.assert.notStrictEqual(pbApiKey, undefined, "Pushbullet API Key is required");
        this.pbApiKey = pbApiKey;
        this.options = options;
        this.client = new this.mfc.Client();
        this.pusher = new this.pushbullet(this.pbApiKey);
    }

    start(callback: ()=>void){
        this.pusher.devices(function(error:any, response:any){
            this.assert(response!==undefined && Array.isArray(response.devices) && response.devices.length > 0, "Pushbullet sent the device list in an unexpected format")
            for(var i = 0; i<response.devices.length; i++){
                this.deviceMap[response.devices[i].nickname] = response.devices[i].iden;
                this.assert.notStrictEqual("All Devices", response.devices[i].nickname, "You have a Pushbullet device named 'All Devices', PushMFC is currently reserving that name for a special case and cannot continue")
            }
            this.processOptions();
            this.push("PM: Startup", "PushMFC has started");
            this.client.connect(true,callback);
        }.bind(this));
    }

    mute(){
        //@TODO
    }

    unmute(){
        //@TODO
    }

    snooze(duration:any /*@TODO*/){
        //@TODO
    }

    private pushStack(model: TaggedModel){
        var change: SingleChange;

        var title = "PM: " + model.nm;
        var body = "";
        var line = "";

        //The set of all devices targetted by events in this push
        var targetDevices: {[index: string]: boolean} = {};

        while((change = model._push.changes.shift()) !== undefined){
            line = "";
            switch(change.prop){
                case "vs":
                    //Record the target device for this change
                    this.assert.notStrictEqual(model._push.events[Events.VideoStates], undefined);
                    targetDevices[model._push.events[Events.VideoStates]] = true;

                    //Build the string for this change
                    line += "Is now in state " + this.mfc.STATE[<number>change.after];
                    if(model._push.previousVideoState !== undefined && model._push.previousVideoState.when !== change.when){
                        line += " after " + moment.duration(change.when - model._push.previousVideoState.when).humanize() + " in state " + this.mfc.STATE[<number>model._push.previousVideoState.after];
                    }
                    model._push.previousVideoState = change;
                    line += ".\n";
                    break;
                case "vs2": //Property doesn't really exist on Model, we're overloading the mechanism here to capture Online/Offline....
                    //Record the target device for this change
                    this.assert.notStrictEqual(model._push.events[Events.OnOff], undefined);
                    targetDevices[model._push.events[Events.OnOff]] = true;

                    //Build the string for this change
                    if(change.after === this.mfc.STATE.Offline){
                        line += "Is now off MFC";
                    }else{
                        line += "Is now on MFC";
                    }
                    if(model._push.previousOnOffState !== undefined && model._push.previousOnOffState.when !== change.when){
                        line += " after " + moment.duration(change.when - model._push.previousOnOffState.when).humanize();
                        if(change.after === this.mfc.STATE.Offline){
                            line += " on"
                        }else{
                            line += " off"
                        }
                    }
                    model._push.previousOnOffState = change;
                    line += ".\n";
                    break;
                case "rank":
                    //Record the target device for this change
                    this.assert.notStrictEqual(model._push.events[Events.Rank], undefined);
                    targetDevices[model._push.events[Events.Rank]] = true;

                    //Build the string for this change
                    title = "PM: " + model.nm;
                    var brank = change.before === 0 ? " from rank over 250" : (change.before === undefined ? "" : " from rank " + change.before);
                    var arank = change.after === 0 ? "over 250" : String(change.after);
                    line += "Has moved" + brank + " to rank " + arank + ".\n";
                    break;
                case "topic":
                    //Record the target device for this change
                    this.assert.notStrictEqual(model._push.events[Events.Topic], undefined);
                    targetDevices[model._push.events[Events.Topic]] = true;

                    //Build the string for this change
                    line += "Has changed her topic:\n\t" + change.after + "\n";
                    break;
                default:
                    this.assert(false, "Don't know how to push for property: " + change.prop);
            }
            body = "[" + change.when.format("HH:mm:ss") + "] " + line + body;
        }

        /*
        Finally make the actual Pushbullet push.

        Possible cases:
            1. All events in this note have the same device target, easy, just send to that device
            2. Events in this note have different targets, but at least one of the events has an "All Devices" target, just send to all devices
            3. Events in this note have different targets, but none have the "All Devices" target, best option here is to send two notes
        */
        if(targetDevices["All Devices"] === true){
            this.push(undefined, title, body);
        }else{
            for(var device in targetDevices){
                if(targetDevices.hasOwnProperty(device)){
                    this.push(device, title, body);
                }
            }
        }
    }

    private push(deviceIden: string, title: string, message: string, callback?: ()=>void){
        //@TODO - obey the mute/unmute/snooze values
        this.pusher.note(deviceIden, title, message, callback);
    }

    private processOptions() {
        this.assert.notStrictEqual(this.options, undefined, "No options specified");
        for(var device in this.options){
            this.assert(device === "All Devices" || this.deviceMap[device] !== undefined, "Unknown Pushbullet device in options: " + device);
            if(this.options.hasOwnProperty(device)){
                for(var modelId in this.options[device]){
                    this.assert(Array.isArray(this.options[device][modelId]), "Options for model '" + modelId + "' were not specified as an array");
                    this.assert.notStrictEqual(this.options[device][modelId].length, 0, "Options for model '" + modelId + "' were empty");

                    var model = <TaggedModel>this.mfc.Model.getModel(modelId);
                    model.on("vs", this.modelStatePusher.bind(this)); //@TODO - This is kind of ugly, we don't need to hook these callbacks if we're not pushing these
                    model.on("rank", this.modelRankPusher.bind(this))
                    model.on("topic", this.modelTopicPusher.bind(this));
                    model._push = {events: {}, changes: [], pushFunc: _.debounce(this.pushStack.bind(this,model), 5000)};
                    this.options[device][modelId].forEach(function(deviceIden: string, item: Events){
                        this.assert.notStrictEqual(item, undefined, "Unknown option specified on model " + modelId);
                        if(item === Events.All){
                            model._push.events[Events.OnOff] = deviceIden;
                            model._push.events[Events.VideoStates] = deviceIden;
                            model._push.events[Events.Rank] = deviceIden;
                            model._push.events[Events.Topic] = deviceIden;
                            model._push.events[Events.CountdownStart] = deviceIden;
                            model._push.events[Events.CountdownComplete] = deviceIden;
                        }else{
                            model._push.events[item] = deviceIden;
                        }
                    }.bind(this, device === "All Devices" ? "All Devices" : this.deviceMap[device]));
                }
            }
        }
    }

    private modelStatePusher(model: TaggedModel, before: FCVIDEO, after: FCVIDEO) {
        if(before!==after){
            var change: SingleChange;
            if(model._push.events[Events.OnOff] !== undefined ||  model._push.events[Events.All] !== undefined){
                if(before === this.mfc.FCVIDEO.OFFLINE && after !== this.mfc.FCVIDEO.OFFLINE){
                    change = {prop: "vs2", before: before, after: after, when: moment()};
                    if(model._push.previousOnOffState === undefined){
                        model._push.previousOnOffState = change;
                    }
                    model._push.changes.push(change);
                    model._push.pushFunc();
                }
                if(after === this.mfc.FCVIDEO.OFFLINE && before !== this.mfc.FCVIDEO.OFFLINE){
                    change = {prop: "vs2", before: before, after: after, when: moment()};
                    if(model._push.previousOnOffState === undefined){
                        model._push.previousOnOffState = change;
                    }
                    model._push.changes.push(change);
                    model._push.pushFunc();
                }
            }
            if(model._push.events[Events.VideoStates] !== undefined || model._push.events[Events.All] !== undefined){
                change = {prop: "vs", before: before, after: after, when: moment()};
                if(model._push.previousVideoState === undefined){
                    model._push.previousVideoState = change;
                }
                model._push.changes.push(change);
                model._push.pushFunc();
            }
        }
    }

    private modelRankPusher(model: TaggedModel, before: number, after: number) {
        if((model._push.events[Events.Rank] !== undefined || model._push.events[Events.All] !== undefined) && before !== after && (before !== undefined || after !== 0)){
            model._push.changes.push({prop: "rank", before: before, after: after, when: moment()});
            model._push.pushFunc();
        }
    }

    private modelTopicPusher(model: TaggedModel, before: string, after: string) {
        if((model._push.events[Events.Topic] !== undefined || model._push.events[Events.All] !== undefined) && before !== after && after !== undefined && after !== null && after !== ""){
            model._push.changes.push({prop: "topic", before: before, after: after, when: moment()});
            model._push.pushFunc();
        }
    }
};

exports.Events = Events;
exports.PushMFC = PushMFC;
