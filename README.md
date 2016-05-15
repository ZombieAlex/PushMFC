#PushMFC.js

A Node.js module to send [Join by joaoapps](http://joaoapps.com/join/) notifications for [MyFreeCams](http://www.myfreecams.com).  A previous version of
this module worked with [Pushbullet](http://www.pushbullet.com).  That version is now archived and unmaintained in the [pushbullet branch](https://github.com/ZombieAlex/PushMFC/tree/pushbullet).
It probably still works, but no guarantees.

PushMFC is a work in progress.  It probably has some bugs.  It definitely has some design quirks.  But it mostly works.

To find your Join API key:

1. Log into [the Join API page](https://joinjoaomgcd.appspot.com/). And while you're here, take note of all your device names. Those names are what we will use in the PushMFC config
2. Select one of your devices (it doesn't matter which device)
3. Click the "JOIN API" button
4. Click "SHOW" next to "API Key"

------------

##Example Usage

```javascript
var pm = require('PushMFC');

var options = {
    'All Devices': {    //These events will be pushed to all devices
        3111899: [pm.Events.All], //AspenRae
        //Add as many models as you'd like here
    },
    'Phone': { //These events will be pushed to the device named Phone
        3111899: [pm.Events.OnOff], //AspenRae
        6158368: [pm.Events.OnOff], //GinnyPotter
    },
    //Add as many device names as you want here
    //Last device wins if an event for a model is listed
    //under multiple devices
};

var pmi = new pm.PushMFC('<Your Join API Key here>', options);
pmi.start();
```

------------

##Options
As defined in TypeScript...

```typescript
enum Events {
    All,        //Log every possible event
    OnOff,      //Track only whether the model is generally on MFC or not (leaving off public/private/group details)
    VideoStates,//Track all offline, online, private, public, group, etc states for the model
    Rank,       //Changes in the model's rank
    Topic,      //Changes in the model's topic
    CountdownStart,     //Notify when we detect a countdown has started
    CountdownComplete,  //Notify when we detect a countdown has complete
}

interface Options{
    [index: string]: { //Which device name to use for these options
        [index: number]: Events[]; //Which events to monitor for which models
    };
};
```
