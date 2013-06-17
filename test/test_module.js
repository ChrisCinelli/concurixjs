var subModule = require('./test_submodule');

module.exports = testModule = {}

testModule.apiFunc = function apiFunc(){
  return 'apiFunc';
}

testModule.subModule = subModule;

testModule.callSubApiFunc = function callSubApiFunc(){
  return subModule.apiFunc();
}

testModule.apiFuncWithCallback = function apiFuncWithCallback(callback){
  callback();
  return callback;
}


//copied from aws-sdk for testing purposes only
var abort = {};

testModule.each = function each(object, iterFunction) {
  for (var key in object) {
    if (object.hasOwnProperty(key)) {
      var ret = iterFunction.call(this, key, object[key]);
      if (ret === abort) break;
    }
  }
}

testModule.update = function update(obj1, obj2) {
  testModule.each(obj2, function iterator(key, item) {
    obj1[key] = item;
  });
  return obj1;
}


testModule.inherit = function inherit(klass, features) {
  var newObject = null;
  if (features === undefined) {
    features = klass;
    klass = Object;
    newObject = {};
  } else {
    /*jshint newcap:false camelcase:false */
    var ctor = function __ctor_wrapper__() {};
    ctor.prototype = klass.prototype;
    newObject = new ctor();
  }

  // constructor not supplied, create pass-through ctor
  if (features.constructor === Object) {
    features.constructor = function() {
      klass.apply(this, arguments);
    };
  }

  features.constructor.prototype = newObject;
  testModule.update(features.constructor.prototype, features);
  features.constructor.__super__ = klass;
  return features.constructor;
}

testModule.defineService = function defineService(service, features) {
  features = features || {};
  var svc = testModule.inherit(service, features);
  svc.Client = function(){
    return 'client';
  };
  return svc;
};


var util = require('util');
var EventEmitter = require('events').EventEmitter;

function Agent(options) {
  EventEmitter.call(this);

  var self = this;
  self.options = options || {};
  self.requests = {};
  self.sockets = {};
  self.maxSockets = Agent.defaultMaxSockets + 1;
  self.on('free', function() {});
}

testModule.Agent = Agent;
util.inherits(Agent, EventEmitter);

Agent.defaultMaxSockets = 5;




