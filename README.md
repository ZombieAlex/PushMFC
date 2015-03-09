#PushMFC.js

A Node.js module to send [Pushbullet](http://www.pushbullet.com) notifications for [MyFreeCams](http://www.myfreecams.com).

PushMFC is a work in progress.  It probably has some bugs.  It definitely has some design quirks.  But it mostly works.

To find your Pushbullet API key, log into [Pushbullet.com](http://www.pushbullet.com) and go to your "Account Settings" by clicking on your picture in the upper right.  Your key will be listed under "Access Token".  This key is never sent back to me, but merely given to the the [Pushbullet NPM](https://www.npmjs.com/package/pushbullet) to enable pushing to your devices.


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

var pmi = new pm.PushMFC('<Your Pushbullet API Key here>', options);
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
    [index: string]: { //Which Pushbullet device name to use for these options
        [index: number]: Events[]; //Which events to monitor for which models
    };
};
```
