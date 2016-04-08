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
var Events;
(function (Events) {
    Events[Events["All"] = 0] = "All";
    Events[Events["OnOff"] = 1] = "OnOff";
    Events[Events["VideoStates"] = 2] = "VideoStates";
    Events[Events["Rank"] = 3] = "Rank";
    Events[Events["Topic"] = 4] = "Topic";
    Events[Events["CountdownStart"] = 5] = "CountdownStart";
    Events[Events["CountdownComplete"] = 6] = "CountdownComplete";
})(Events || (Events = {}));
;
var _ = require('lodash');
var moment = require('moment');
var PushMFC = (function () {
    function PushMFC(pbApiKey, options, client) {
        //@TODO - Just give in and move all these requires to the global scope....it makes the code cleaner, assert() rather than this.assert() etc...
        this.mfc = require("MFCAuto");
        this.pushbullet = require('pushbullet');
        this.assert = require('assert');
        this.debug = false;
        this.deviceMap = {};
        this.assert.notStrictEqual(pbApiKey, undefined, "Pushbullet API Key is required");
        this.pbApiKey = pbApiKey;
        this.options = options;
        if (client === undefined) {
            this.client = new this.mfc.Client();
            this.selfStarting = true;
        }
        else {
            this.client = client;
            this.selfStarting = false; //If we were given an existing client, assume our caller will handle connecting it
        }
        this.pusher = new this.pushbullet(this.pbApiKey);
    }
    PushMFC.prototype.start = function (callback) {
        var _this = this;
        this.pusher.devices(function (error, response) {
            _this.assert(response !== undefined && Array.isArray(response.devices) && response.devices.length > 0, "Pushbullet sent the device list in an unexpected format");
            for (var i = 0; i < response.devices.length; i++) {
                _this.deviceMap[response.devices[i].nickname] = response.devices[i].iden;
                _this.assert.notStrictEqual("All Devices", response.devices[i].nickname, "You have a Pushbullet device named 'All Devices', PushMFC is currently reserving that name for a special case and cannot continue");
            }
            _this.logDebug("Pushbullet sent these devices:\n", response);
            _this.processOptions();
            _this.push(undefined, "PM: Startup", "PushMFC has started");
            if (_this.selfStarting) {
                _this.client.connect(true, callback);
            }
            else {
                callback();
            }
        });
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
        this.logDebug("Pushing stack for model '" + model.nm + "'\n", model._push);
        var change;
        var title = "PM: " + model.nm;
        var body = "";
        var line = "";
        //The set of all devices targetted by events in this push
        var targetDevices = {};
        while ((change = model._push.changes.shift()) !== undefined) {
            line = "";
            switch (change.prop) {
                case "vs":
                    //Record the target device for this change
                    this.assert.notStrictEqual(model._push.events[Events.VideoStates], undefined);
                    targetDevices[model._push.events[Events.VideoStates]] = true;
                    //Build the string for this change
                    line += "Is now in state " + this.mfc.STATE[change.after];
                    if (model._push.previousVideoState !== undefined && model._push.previousVideoState.when !== change.when) {
                        line += " after " + moment.duration(change.when - model._push.previousVideoState.when).humanize() + " in state " + this.mfc.STATE[model._push.previousVideoState.after];
                    }
                    model._push.previousVideoState = change;
                    line += ".\n";
                    break;
                case "vs2":
                    //Record the target device for this change
                    this.assert.notStrictEqual(model._push.events[Events.OnOff], undefined);
                    targetDevices[model._push.events[Events.OnOff]] = true;
                    //Build the string for this change
                    if (change.after === this.mfc.STATE.Offline) {
                        line += "Is now off MFC";
                    }
                    else {
                        line += "Is now on MFC";
                    }
                    if (model._push.previousOnOffState !== undefined && model._push.previousOnOffState.when !== change.when) {
                        line += " after " + moment.duration(change.when - model._push.previousOnOffState.when).humanize();
                        if (change.after === this.mfc.STATE.Offline) {
                            line += " on";
                        }
                        else {
                            line += " off";
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
                case "cdstart":
                    //Record the target device for this change
                    this.assert.notStrictEqual(model._push.events[Events.CountdownStart], undefined);
                    targetDevices[model._push.events[Events.CountdownStart]] = true;
                    line += change.message + "\n";
                    break;
                case "cdend":
                    //Record the target device for this change
                    this.assert.notStrictEqual(model._push.events[Events.CountdownComplete], undefined);
                    targetDevices[model._push.events[Events.CountdownComplete]] = true;
                    line += change.message + "\n";
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
        if (targetDevices["All Devices"] === true) {
            this.push(undefined, title, body);
        }
        else {
            for (var device in targetDevices) {
                if (targetDevices.hasOwnProperty(device)) {
                    this.push(device, title, body);
                }
            }
        }
    };
    PushMFC.prototype.push = function (deviceIden, title, message, callback) {
        //@TODO - obey the mute/unmute/snooze values
        this.logDebug("Pushing:\n", { deviceIden: deviceIden, title: title, message: message });
        this.pusher.note(deviceIden, title, message, callback);
    };
    PushMFC.prototype.processOptions = function () {
        this.assert.notStrictEqual(this.options, undefined, "No options specified");
        for (var device in this.options) {
            this.assert(device === "All Devices" || this.deviceMap[device] !== undefined, "Unknown Pushbullet device in options: " + device);
            if (this.options.hasOwnProperty(device)) {
                for (var modelId in this.options[device]) {
                    this.assert(Array.isArray(this.options[device][modelId]), "Options for model '" + modelId + "' were not specified as an array");
                    this.assert.notStrictEqual(this.options[device][modelId].length, 0, "Options for model '" + modelId + "' were empty");
                    var model = this.mfc.Model.getModel(modelId);
                    if (model._push === undefined) {
                        model.on("vs", this.modelStatePusher.bind(this)); //@TODO - This is kind of ugly, we don't need to hook these callbacks if we're not pushing these
                        model.on("rank", this.modelRankPusher.bind(this));
                        model.on("topic", this.modelTopicPusher.bind(this));
                        model._push = {
                            events: {},
                            changes: [],
                            pushFunc: _.debounce(this.pushStack.bind(this, model), 5000),
                            countdown: {
                                index: -1,
                                exists: false,
                                numbers: [],
                                decrementMap: []
                            }
                        };
                    }
                    this.options[device][modelId].forEach(function (deviceIden, item) {
                        this.assert.notStrictEqual(item, undefined, "Unknown option specified on model " + modelId);
                        if (item === Events.All) {
                            model._push.events[Events.OnOff] = deviceIden;
                            model._push.events[Events.VideoStates] = deviceIden;
                            model._push.events[Events.Rank] = deviceIden;
                            model._push.events[Events.Topic] = deviceIden;
                            model._push.events[Events.CountdownStart] = deviceIden;
                            model._push.events[Events.CountdownComplete] = deviceIden;
                        }
                        else {
                            model._push.events[item] = deviceIden;
                        }
                    }.bind(this, device === "All Devices" ? "All Devices" : this.deviceMap[device]));
                }
            }
        }
    };
    PushMFC.prototype.modelStatePusher = function (model, before, after) {
        if (before !== after) {
            var change;
            if (model._push.events[Events.OnOff] !== undefined) {
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
            if (model._push.events[Events.VideoStates] !== undefined) {
                change = { prop: "vs", before: before, after: after, when: moment() };
                if (model._push.previousVideoState === undefined) {
                    model._push.previousVideoState = change;
                }
                model._push.changes.push(change);
                model._push.pushFunc();
            }
        }
    };
    PushMFC.prototype.modelRankPusher = function (model, before, after) {
        if (model._push.events[Events.Rank] !== undefined && before !== after && (before !== undefined || after !== 0)) {
            model._push.changes.push({ prop: "rank", before: before, after: after, when: moment() });
            model._push.pushFunc();
        }
    };
    PushMFC.prototype.modelTopicPusher = function (model, before, after) {
        if (model._push.events[Events.Topic] !== undefined && before !== after && after !== undefined && after !== null && after !== "") {
            model._push.changes.push({ prop: "topic", before: before, after: after, when: moment() });
            model._push.pushFunc();
        }
        if (after !== before && (model._push.events[Events.CountdownStart] !== undefined || model._push.events[Events.CountdownComplete] !== undefined)) {
            this.countdownPusher(model, before, after);
        }
    };
    PushMFC.prototype.countdownPusher = function (model, before, after) {
        var numberRe = /([0-9]+)/g;
        //If any single number in a model's topic decrements at least
        //this many times, we'll assume that it's a countdown goal
        var minimumDecrements = 2;
        //MFC's auto-countdown frequently puts the string "[none]"
        //in the topic for a completed auto-countdown
        var cleanAfter = after.replace(/\[none\]/g, "0");
        //Pull out any numbers in the new topic
        var newNumbers = (cleanAfter.match(numberRe) || []).map(Number);
        var oldNumbers = model._push.countdown.numbers;
        //If we've already been tracking numbers in this model's topic
        if (newNumbers.length === oldNumbers.length && newNumbers.length > 0) {
            //Compare the new numbers to the old
            for (var i = 0; i < newNumbers.length; i++) {
                //For any numbers that have decreased
                if (oldNumbers[i] > newNumbers[i]) {
                    //Record that they've decreased once
                    model._push.countdown.decrementMap[i]++;
                    //If the number at this position has decreased enough
                    if (model._push.countdown.decrementMap[i] >= minimumDecrements) {
                        if (model._push.countdown.exists) {
                            if (model._push.countdown.index !== i) {
                                //We had previously been tracking .index as our
                                //countdown field.  But another index has passed
                                //our decrement threshold too.  Our assumptions
                                //were possibly invalid.  Just reset and start
                                //over without assuming any countdown has been
                                //set or reached.
                                this.logDebug("Abandoning countdown for " + model.nm + ". New topic:\n\t" + after + "\nOld topic:\n\t" + before, model._push.countdown);
                                this.resetCountdown(model, newNumbers);
                                return;
                            }
                            else {
                                //We already think we have a countdown at this
                                //index.  Is the new value 0?
                                if (newNumbers[i] === 0) {
                                    if (model._push.countdown.exists && model._push.events[Events.CountdownComplete] !== undefined) {
                                        model._push.changes.push({
                                            prop: "cdend",
                                            message: "Countdown completed! Topic is now:\n\t" + after + "\nAnd was:\n\t" + before,
                                            when: moment()
                                        });
                                        model._push.pushFunc();
                                    }
                                    this.logDebug("Completing countdown for " + model.nm + ". New topic:\n\t" + after + "\nOld topic:\n\t" + before, model._push.countdown);
                                    this.resetCountdown(model, newNumbers);
                                    return;
                                }
                            }
                        }
                        else {
                            //Number "i" has decremented enough that we
                            //think we're looking at a countdown now.
                            model._push.countdown.exists = true;
                            model._push.countdown.index = i;
                            if (model._push.events[Events.CountdownStart] !== undefined) {
                                model._push.changes.push({
                                    prop: "cdstart",
                                    message: "Countdown detected, " + newNumbers[i] + " remaining:\n\t" + after,
                                    when: moment()
                                });
                                model._push.pushFunc();
                            }
                            this.logDebug("Starting countdown for " + model.nm + ". New topic:\n\t" + after + "\nOld topic:\n\t" + before, model._push.countdown);
                        }
                    }
                }
            }
            //Set the current numbers for the next topic update to compare against
            model._push.countdown.numbers = newNumbers;
        }
        else {
            //Topic has radically changed and doesn't have the same amount
            //of distinct numbers as it used to.  That might be because a
            //countdown has been reached and the model wrote a completely new
            //topic.
            if (model._push.countdown.exists && model._push.events[Events.CountdownComplete] !== undefined) {
                model._push.changes.push({
                    prop: "cdend",
                    message: "Countdown completed! Topic is now:\n\t" + after + "\nAnd was:\n\t" + before,
                    when: moment()
                });
                model._push.pushFunc();
            }
            //Whether a topic was reached or not, our assumptions are still
            //invalid and we need to reset the countdown state for this model
            if (model._push.countdown.exists) {
                this.logDebug("Completing countdown for " + model.nm + ". New topic:\n\t" + after + "\nOld topic:\n\t" + before, model._push.countdown);
            }
            this.resetCountdown(model, newNumbers);
        }
    };
    PushMFC.prototype.resetCountdown = function (model, newNumbers) {
        model._push.countdown = {
            exists: false,
            numbers: newNumbers,
            index: -1,
            decrementMap: newNumbers.map(function () { return 0; })
        };
    };
    PushMFC.prototype.logDebug = function (msg, obj) {
        if (this.debug === true) {
            if (obj) {
                msg = msg + JSON.stringify(obj, null, '  ');
            }
            this.mfc.log(msg);
            this.mfc.log("-----------------------------------");
        }
    };
    return PushMFC;
})();
;
exports.Events = Events;
exports.PushMFC = PushMFC;
