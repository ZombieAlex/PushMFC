/// <reference path="../dependent_definitions/node.d.ts" />
/// <reference path="../../node_modules/MFCAuto/lib/MFCAuto.d.ts" />
/*
PushMFC.js - Pushbullet notifications for MyFreeCams

@TODO List
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
}

interface Options{
    targetDevice?: string; //Which Pushbullet device to target, unspecified == all devices
    models: {
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
            [index: number]: boolean;
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
    deviceIden: string;

    constructor(pbApiKey: string, options: Options){
        this.assert.notStrictEqual(pbApiKey, undefined, "Pushbullet API Key is required");
        this.pbApiKey = pbApiKey;
        this.options = options;
        this.processOptions();
        this.client = new this.mfc.Client();
        this.pusher = new this.pushbullet(this.pbApiKey);
    }

    start(callback: ()=>void){
        this.pusher.devices(function(error:any, response:any){
            if(this.options.targetDevice !== undefined && Array.isArray(response.devices)){
                for(var i = 0; i<response.devices.length; i++){
                    if(this.options.targetDevice === response.devices[i].nickname){
                        this.deviceIden = response.devices[i].iden;
                        break;
                    }
                }
                if(this.deviceIden === undefined){
                    throw new Error("Could not find a Pushbullet device named '" + this.options.targetDevice + "'");
                }
            }
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

        while((change = model._push.changes.pop()) !== undefined){
            body += "[" + change.when.format("HH:mm:ss") + "] ";
            switch(change.prop){
                case "vs":
                    body += "Is now in state " + this.mfc.STATE[<number>change.after];
                    if(model._push.previousVideoState !== undefined && model._push.previousVideoState.when !== change.when){
                        body += " after " + moment.duration(change.when - model._push.previousVideoState.when).humanize() + " in state " + this.mfc.STATE[<number>model._push.previousVideoState.after];
                    }
                    model._push.previousVideoState = change;
                    body += ".\n";
                    break;
                case "vs2": //Property doesn't really exist on Model, we're overloading the mechanism here to capture Online/Offline....
                    if(change.after === this.mfc.STATE.Offline){
                        body += "Is now off MFC";
                    }else{
                        body += "Is now on MFC";
                    }
                    if(model._push.previousOnOffState !== undefined && model._push.previousOnOffState.when !== change.when){
                        body += " after " + moment.duration(change.when - model._push.previousOnOffState.when).humanize();
                        if(change.after === this.mfc.STATE.Offline){
                            body += " on"
                        }else{
                            body += " off"
                        }
                    }
                    model._push.previousOnOffState = change;
                    body += ".\n";
                    break;
                case "rank":
                    if(change.before !== undefined || change.after !== 0){
                        title = "PM: " + model.nm;
                        var brank = change.before === 0 ? " from rank over 250" : (change.before === undefined ? "" : " from rank " + change.before);
                        var arank = change.after === 0 ? "over 250" : String(change.after);
                        body += "Has moved" + brank + " to rank " + arank + ".\n";
                    }
                    break;
                case "topic":
                    body += "Has changed her topic:\n\t" + change.after + "\n";
                    break;
                default:
                    this.assert(false, "Don't know how to push for property: " + change.prop);
            }
        }

        this.push(title, body);
    }

    private push(title: string, message: string, callback?: ()=>void){
        //@TODO - obey the mute/unmute/snooze values
        this.pusher.note(this.deviceIden, title, message, callback);
    }

    private processOptions() {
        this.assert.notStrictEqual(this.options, undefined, "No options specified");
        this.assert.notStrictEqual(this.options.models, undefined, "No models specified to push");
        for(var k in this.options.models){
            if(this.options.models.hasOwnProperty(k)){
                this.assert(Array.isArray(this.options.models[k]), "Options for model '" + k + "' were not specified as an array");
                this.assert.notStrictEqual(this.options.models[k].length, 0, "Options for model '" + k + "' were empty");

                var model = <TaggedModel>this.mfc.Model.getModel(k);
                model.on("vs", this.modelStatePusher.bind(this)); //@TODO - This is kind of ugly, we don't need to hook these callbacks if we're not pushing these
                model.on("rank", this.modelRankPusher.bind(this))
                model.on("topic", this.modelTopicPusher.bind(this));
                model._push = {events: {}, changes: [], pushFunc: _.debounce(this.pushStack.bind(this,model), 5000)};
                this.options.models[k].forEach(function(item){
                    this.assert.notStrictEqual(item, undefined, "Unknown option specified on model " + k);
                    model._push.events[item] = true;
                });
            }
        }
    }

    private modelStatePusher(model: TaggedModel, before: FCVIDEO, after: FCVIDEO) {
        if(before!==after){
            var change: SingleChange;
            if(model._push.events[Events.VideoStates] === true || model._push.events[Events.All] === true){
                change = {prop: "vs", before: before, after: after, when: moment()};
                if(model._push.previousVideoState === undefined){
                    model._push.previousVideoState = change;
                }
                model._push.changes.push(change);
                model._push.pushFunc();
            }
            if(model._push.events[Events.OnOff] === true ||  model._push.events[Events.All] === true){
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
        }
    }

    private modelRankPusher(model: TaggedModel, before: number, after: number) {
        if((model._push.events[Events.Rank] === true || model._push.events[Events.All] === true) && before !== after){
            model._push.changes.push({prop: "rank", before: before, after: after, when: moment()});
            model._push.pushFunc();
        }
    }

    private modelTopicPusher(model: TaggedModel, before: string, after: string) {
        if((model._push.events[Events.Topic] === true || model._push.events[Events.All] === true) && before !== after && after !== undefined && after !== null && after !== ""){
            model._push.changes.push({prop: "topic", before: before, after: after, when: moment()});
            model._push.pushFunc();
        }
    }
};

exports.Events = Events;
exports.PushMFC = PushMFC;
