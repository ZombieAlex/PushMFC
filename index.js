var mod = require('./lib/PushMFC');

for(var key in mod){
    if(mod.hasOwnProperty(key)){
        exports[key] = mod[key];
    }
}
