var https = require("https");
var countdown = require("./Countdown.js").default;
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
var _ = require("lodash");
var moment = require("moment");
var PushMFC = (function () {
    function PushMFC(joinApiKey, options, client) {
        var _this = this;
        this.mfc = require("MFCAuto");
        this.assert = require("assert");
        this.debug = false;
        this.deviceMap = {};
        this.assert.notStrictEqual(joinApiKey, undefined, "Join API Key is required");
        this.joinApiKey = joinApiKey;
        this.options = options;
        this.trackedModels = new Set();
        if (client === undefined) {
            this.client = new this.mfc.Client();
            this.selfStarting = true;
        }
        else {
            this.client = client;
            this.selfStarting = false;
        }
        this.client.setMaxListeners(500);
        this.countdown = new countdown();
        this.countdown.on("countdownCompleted", function (model, before, after) {
            if (model._push !== undefined && model._push.events[Events.CountdownComplete] !== undefined) {
                model._push.changes.push({
                    prop: "cdend",
                    message: "Countdown completed! New topic: " + after + "\nOld topic: " + before,
                    when: moment(),
                });
                model._push.pushFunc();
            }
        });
        this.countdown.on("countdownDetected", function (model, remaining, topic) {
            if (model._push !== undefined && model._push.events[Events.CountdownStart] !== undefined) {
                model._push.changes.push({
                    prop: "cdstart",
                    message: "Countdown detected, " + remaining + " remaining:\n" + topic,
                    when: moment(),
                });
                model._push.pushFunc();
            }
        });
        this.client.on("CLIENT_CONNECTED", function () {
            _this.trackedModels.forEach(function (id) {
                _this.client.queryUser(id);
            });
        });
    }
    PushMFC.prototype.start = function (callback) {
        var _this = this;
        this.getDevices().then(function (devices) {
            for (var i = 0; i < devices.length; i++) {
                _this.deviceMap[devices[i].deviceName] = devices[i].deviceId;
                _this.assert.notStrictEqual("All Devices", devices[i].deviceName, "You have a Join device named 'All Devices', PushMFC is currently reserving that name for a special case and cannot continue");
            }
            _this.logDebug("Join sent these devices:\n", devices);
            _this.processOptions();
            if (_this.selfStarting) {
                _this.client.connect(true).then(callback);
            }
            else {
                callback();
            }
        });
    };
    PushMFC.prototype.getDevices = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            https.get("https://joinjoaomgcd.appspot.com/_ah/api/registration/v1/listDevices?apikey=" + _this.joinApiKey, function (res) {
                var contents = "";
                res.on("data", function (chunk) {
                    contents += chunk;
                });
                res.on("end", function () {
                    var obj = JSON.parse(contents);
                    _this.assert(Array.isArray(obj.records) && obj.records.length > 0, "Join sent the device list in an unexpected format");
                    resolve(obj.records);
                });
            }).on("error", function (e) {
                reject(e);
            });
        });
    };
    PushMFC.prototype.getThumbnailForModel = function (m) {
        var id = m.uid.toString();
        return "http://img.mfcimg.com/photos2/" + id.slice(0, 3) + "/" + id + "/avatar.90x90.jpg";
    };
    PushMFC.prototype.note = function (targets, model, title, message) {
        if (targets == undefined) {
            https.get("https://joinjoaomgcd.appspot.com/_ah/api/messaging/v1/sendPush?apikey=" + this.joinApiKey + "&deviceId=group.all&text=" + encodeURIComponent(message) + "&title=" + encodeURIComponent(title) + "&icon=" + encodeURIComponent(this.getThumbnailForModel(model)));
        }
        else {
            https.get("https://joinjoaomgcd.appspot.com/_ah/api/messaging/v1/sendPush?text=" + encodeURIComponent(message) + "&title=" + encodeURIComponent(title) + "&icon=" + encodeURIComponent(this.getThumbnailForModel(model)) + "&deviceId=" + encodeURIComponent(targets.join(',')));
        }
    };
    PushMFC.prototype.pushStack = function (model) {
        this.logDebug("Pushing stack for model '" + model.nm + "'\n", model._push);
        var change;
        var title = "PM: " + model.nm;
        var body = "";
        var line = "";
        var targetDevices = {};
        while ((change = model._push.changes.shift()) !== undefined) {
            line = "";
            switch (change.prop) {
                case "vs":
                    this.assert.notStrictEqual(model._push.events[Events.VideoStates], undefined);
                    targetDevices[model._push.events[Events.VideoStates]] = true;
                    line += "Is now in state " + this.mfc.STATE[change.after];
                    if (model._push.previousVideoState !== undefined && model._push.previousVideoState.when !== change.when) {
                        line += " after " + moment.duration(change.when - model._push.previousVideoState.when).humanize() + " in state " + this.mfc.STATE[model._push.previousVideoState.after];
                    }
                    model._push.previousVideoState = change;
                    line += ".\n";
                    break;
                case "vs2":
                    this.assert.notStrictEqual(model._push.events[Events.OnOff], undefined);
                    targetDevices[model._push.events[Events.OnOff]] = true;
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
                    this.assert.notStrictEqual(model._push.events[Events.Rank], undefined);
                    targetDevices[model._push.events[Events.Rank]] = true;
                    var brank = change.before === 0 ? " from rank over 250" : (change.before === undefined ? "" : " from rank " + change.before);
                    var arank = change.after === 0 ? "over 250" : String(change.after);
                    line += "Has moved" + brank + " to rank " + arank + ".\n";
                    break;
                case "topic":
                    this.assert.notStrictEqual(model._push.events[Events.Topic], undefined);
                    targetDevices[model._push.events[Events.Topic]] = true;
                    line += "New topic: " + change.after + "\n";
                    break;
                case "cdstart":
                    this.assert.notStrictEqual(model._push.events[Events.CountdownStart], undefined);
                    targetDevices[model._push.events[Events.CountdownStart]] = true;
                    line += change.message + "\n";
                    break;
                case "cdend":
                    this.assert.notStrictEqual(model._push.events[Events.CountdownComplete], undefined);
                    targetDevices[model._push.events[Events.CountdownComplete]] = true;
                    line += change.message + "\n";
                    break;
                default:
                    this.assert(false, "Don't know how to push for property: " + change.prop);
            }
            body = "[" + change.when.format("HH:mm:ss") + "] " + line + body;
        }
        if (targetDevices["All Devices"] === true) {
            this.note(undefined, model, title, body);
        }
        else {
            var deviceList = [];
            for (var device in targetDevices) {
                if (targetDevices.hasOwnProperty(device)) {
                    deviceList.push(device);
                }
            }
            this.note(deviceList, model, title, body);
        }
    };
    PushMFC.prototype.processOptions = function () {
        this.assert.notStrictEqual(this.options, undefined, "No options specified");
        for (var device in this.options) {
            if (this.options.hasOwnProperty(device)) {
                this.assert(device === "All Devices" || this.deviceMap[device] !== undefined, "Unknown Pushbullet device in options: " + device);
                var _loop_1 = function(modelId) {
                    if (this_1.options[device].hasOwnProperty(modelId)) {
                        this_1.assert(Array.isArray(this_1.options[device][modelId]), "Options for model '" + modelId + "' were not specified as an array");
                        this_1.assert.notStrictEqual(this_1.options[device][modelId].length, 0, "Options for model '" + modelId + "' were empty");
                        var modelIdInt = parseInt(modelId);
                        this_1.trackedModels.add(modelIdInt);
                        var model_1 = this_1.mfc.Model.getModel(modelIdInt);
                        if (model_1._push === undefined) {
                            model_1.on("vs", this_1.modelStatePusher.bind(this_1));
                            model_1.on("rank", this_1.modelRankPusher.bind(this_1));
                            model_1.on("topic", this_1.modelTopicPusher.bind(this_1));
                            model_1._push = {
                                events: {},
                                changes: [],
                                pushFunc: _.debounce(this_1.pushStack.bind(this_1, model_1), 5000),
                            };
                        }
                        this_1.options[device][modelId].forEach(function (deviceIden, item) {
                            this.assert.notStrictEqual(item, undefined, "Unknown option specified on model " + modelId);
                            if (item === Events.All) {
                                model_1._push.events[Events.OnOff] = deviceIden;
                                model_1._push.events[Events.VideoStates] = deviceIden;
                                model_1._push.events[Events.Rank] = deviceIden;
                                model_1._push.events[Events.Topic] = deviceIden;
                                model_1._push.events[Events.CountdownStart] = deviceIden;
                                model_1._push.events[Events.CountdownComplete] = deviceIden;
                            }
                            else {
                                model_1._push.events[item] = deviceIden;
                            }
                        }.bind(this_1, device === "All Devices" ? "All Devices" : this_1.deviceMap[device]));
                    }
                };
                var this_1 = this;
                for (var modelId in this.options[device]) {
                    _loop_1(modelId);
                }
            }
        }
    };
    PushMFC.prototype.modelStatePusher = function (model, before, after) {
        if (before !== after) {
            var change = void 0;
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
    };
    PushMFC.prototype.logDebug = function (msg, obj) {
        if (this.debug === true) {
            if (obj) {
                msg = msg + JSON.stringify(obj, null, "  ");
            }
            this.mfc.log(msg);
            this.mfc.log("-----------------------------------");
        }
    };
    return PushMFC;
}());
;
exports.Events = Events;
exports.PushMFC = PushMFC;
//# sourceMappingURL=PushMFC.js.map