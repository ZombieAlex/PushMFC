#PushMFC.js

A Node.js module to send [Pushbullet](http://www.pushbullet.com) notifications for [MyFreeCams](http://www.myfreecams.com).

PushMFC is a work in progress.  It probably has some bugs.  It definitely has some design quirks.  But it mostly works.

To find your Pushbullet API key, log into [Pushbullet.com](http://www.pushbullet.com) and go to your "Account Settings" by clicking on your picture in the upper right.  Your key will be listed under "Access Token".  This key is never sent back to me, but merely given to the the [Pushbullet NPM](https://www.npmjs.com/package/pushbullet) to enable pushing to your devices.


------------

##Example Usage

```javascript
var pm = require('PushMFC');

var options = {
    targetDevice: 'Chrome', //This is optional, leave it off to target all devices
    models: {
        3111899: [pm.Events.All], //AspenRae
        6158368: [pm.Events.OnOff], //GinnyPotter
        //Add as many models as you'd like here
    }
};

var pmi = new pm.PushMFC('<Your Pushbullet API Key here>', options);
pmi.start();
```

------------
