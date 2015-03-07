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
var Events;
(function (Events) {
    Events[Events["All"] = 0] = "All";
    Events[Events["OnOff"] = 1] = "OnOff";
    Events[Events["VideoStates"] = 2] = "VideoStates";
    Events[Events["Rank"] = 3] = "Rank";
    Events[Events["Topic"] = 4] = "Topic";
})(Events || (Events = {}));
;
var _ = require('lodash');
var moment = require('moment');
var PushMFC = (function () {
    function PushMFC(pbApiKey, options) {
        //@TODO - Just give in and move all these requires to the global scope....it makes the code cleaner, assert() rather than this.assert() etc...
        this.mfc = require("MFCAuto");
        this.pushbullet = require('pushbullet');
        this.assert = require('assert');
        this.assert.notStrictEqual(pbApiKey, undefined, "Pushbullet API Key is required");
        this.pbApiKey = pbApiKey;
        this.options = options;
        this.processOptions();
        this.client = new this.mfc.Client();
        this.pusher = new this.pushbullet(this.pbApiKey);
    }
    PushMFC.prototype.start = function (callback) {
        this.pusher.devices(function (error, response) {
            if (this.options.targetDevice !== undefined && Array.isArray(response.devices)) {
                for (var i = 0; i < response.devices.length; i++) {
                    if (this.options.targetDevice === response.devices[i].nickname) {
                        this.deviceIden = response.devices[i].iden;
                        break;
                    }
                }
                if (this.deviceIden === undefined) {
                    throw new Error("Could not find a Pushbullet device named '" + this.options.targetDevice + "'");
                }
            }
            this.push("PM: Startup", "PushMFC has started");
            this.client.connect(true, callback);
        }.bind(this));
    };
    PushMFC.prototype.mute = function () {
        //@TODO
    };
    PushMFC.prototype.unmute = function () {
        //@TODO
    };
    PushMFC.prototype.snooze = function (duration /*@TODO*/) {
        //@TODO
    };
    PushMFC.prototype.pushStack = function (model) {
        var change;
        var title = "PM: " + model.nm;
        var body = "";
        while ((change = model._push.changes.pop()) !== undefined) {
            body += "[" + change.when.format("HH:mm:ss") + "] ";
            switch (change.prop) {
                case "vs":
                    body += "Is now in state " + this.mfc.STATE[change.after];
                    if (model._push.previousVideoState !== undefined && model._push.previousVideoState.when !== change.when) {
                        body += " after " + moment.duration(change.when - model._push.previousVideoState.when).humanize() + " in state " + this.mfc.STATE[model._push.previousVideoState.after];
                    }
                    model._push.previousVideoState = change;
                    body += ".\n";
                    break;
                case "vs2":
                    if (change.after === this.mfc.STATE.Offline) {
                        body += "Is now off MFC";
                    }
                    else {
                        body += "Is now on MFC";
                    }
                    if (model._push.previousOnOffState !== undefined && model._push.previousOnOffState.when !== change.when) {
                        body += " after " + moment.duration(change.when - model._push.previousOnOffState.when).humanize();
                        if (change.after === this.mfc.STATE.Offline) {
                            body += " on";
                        }
                        else {
                            body += " off";
                        }
                    }
                    model._push.previousOnOffState = change;
                    body += ".\n";
                    break;
                case "rank":
                    title = "PM: " + model.nm;
                    var brank = change.before === 0 ? " from rank over 250" : (change.before === undefined ? "" : " from rank " + change.before);
                    var arank = change.after === 0 ? "over 250" : String(change.after);
                    body += "Has moved" + brank + " to rank " + arank + ".\n";
                    break;
                case "topic":
                    body += "Has changed her topic:\n\t" + change.after + "\n";
                    break;
                default:
                    this.assert(false, "Don't know how to push for property: " + change.prop);
            }
        }
        this.push(title, body);
    };
    PushMFC.prototype.push = function (title, message, callback) {
        //@TODO - obey the mute/unmute/snooze values
        this.pusher.note(this.deviceIden, title, message, callback);
    };
    PushMFC.prototype.processOptions = function () {
        this.assert.notStrictEqual(this.options, undefined, "No options specified");
        this.assert.notStrictEqual(this.options.models, undefined, "No models specified to push");
        for (var k in this.options.models) {
            if (this.options.models.hasOwnProperty(k)) {
                this.assert(Array.isArray(this.options.models[k]), "Options for model '" + k + "' were not specified as an array");
                this.assert.notStrictEqual(this.options.models[k].length, 0, "Options for model '" + k + "' were empty");
                var model = this.mfc.Model.getModel(k);
                model.on("vs", this.modelStatePusher.bind(this)); //@TODO - This is kind of ugly, we don't need to hook these callbacks if we're not pushing these
                model.on("rank", this.modelRankPusher.bind(this));
                model.on("topic", this.modelTopicPusher.bind(this));
                model._push = { events: {}, changes: [], pushFunc: _.debounce(this.pushStack.bind(this, model), 5000) };
                this.options.models[k].forEach(function (item) {
                    this.assert.notStrictEqual(item, undefined, "Unknown option specified on model " + k);
                    model._push.events[item] = true;
                }.bind(this));
            }
        }
    };
    PushMFC.prototype.modelStatePusher = function (model, before, after) {
        if (before !== after) {
            var change;
            if (model._push.events[2 /* VideoStates */] === true || model._push.events[0 /* All */] === true) {
                change = { prop: "vs", before: before, after: after, when: moment() };
                if (model._push.previousVideoState === undefined) {
                    model._push.previousVideoState = change;
                }
                model._push.changes.push(change);
                model._push.pushFunc();
            }
            if (model._push.events[1 /* OnOff */] === true || model._push.events[0 /* All */] === true) {
                if (before === this.mfc.FCVIDEO.OFFLINE && after !== this.mfc.FCVIDEO.OFFLINE) {
                    change = { prop: "vs2", before: before, after: after, when: moment() };
                    if (model._push.previousOnOffState === undefined) {
                        model._push.previousOnOffState = change;
                    }
                    model._push.changes.push(change);
                    model._push.pushFunc();
                }
                if (after === this.mfc.FCVIDEO.OFFLINE && before !== this.mfc.FCVIDEO.OFFLINE) {
                    change = { prop: "vs2", before: before, after: after, when: moment() };
                    if (model._push.previousOnOffState === undefined) {
                        model._push.previousOnOffState = change;
                    }
                    model._push.changes.push(change);
                    model._push.pushFunc();
                }
            }
        }
    };
    PushMFC.prototype.modelRankPusher = function (model, before, after) {
        if ((model._push.events[3 /* Rank */] === true || model._push.events[0 /* All */] === true) && before !== after && (before !== undefined || after !== 0)) {
            model._push.changes.push({ prop: "rank", before: before, after: after, when: moment() });
            model._push.pushFunc();
        }
    };
    PushMFC.prototype.modelTopicPusher = function (model, before, after) {
        if ((model._push.events[4 /* Topic */] === true || model._push.events[0 /* All */] === true) && before !== after && after !== undefined && after !== null && after !== "") {
            model._push.changes.push({ prop: "topic", before: before, after: after, when: moment() });
            model._push.pushFunc();
        }
    };
    return PushMFC;
})();
;
exports.Events = Events;
exports.PushMFC = PushMFC;
