// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
// 
// Tracer for functions and require

'use strict';

var EventEmitter = require('events').EventEmitter;
var cxUtil = require('./util.js');
var extend = cxUtil.extend;
var log = cxUtil.log;
var isFunction = cxUtil.isFunction;
var isObject = cxUtil.isObject;
var iterateOwnProperties = cxUtil.iterateOwnProperties;
var hrtToUs = cxUtil.hrtToUs;
var addHrTimes = cxUtil.addHrTimes;
var wrap = require('./wrapper.js').wrap;
var cache = require.cache;
var tree = require('./calltree.js');

module.exports = Tracer;

function Tracer(options){
  options = options || {};
  this.__concurix_obj__ = true;
  console.__concurix_obj__ = true;
  this.nestStack = [];
  this.nestRequire = [];
  this.wrap = wrap;
  
  // clears modules cache is required
  if (options.clearModulesCache){
    // this should be done by clearing each key of require.cache individually
    // log('clearing previously loaded modules');
    // require.cache = {};
  }
  
  this.blacklistedModules = options.blacklistedModules;
  this.whitelistedModules = options.whitelistedModules;
  
  this.wrapRequire();
  
  this.cxEmit = this.emit;
  this.newFrame = true;
}

Tracer.prototype = Object.create(EventEmitter.prototype);

Tracer.prototype.stop = function stop(){
  this.running = false;
}

Tracer.prototype.start = function start(){
  this.running = true;
}

Tracer.prototype.wrapRequire = function wrapRequire(){
  var proto = Object.getPrototypeOf(module);
  if (proto.require.__concurix_wrapper_for__){
    log('WARNING concurix tracer is already attached');
  } else {
    this.origRequire = proto.require;
    var globalState = { whitelisted: 0 };
    proto.require = this.wrap(
      proto.require,
      this.requireBeforeHook,
      this.requireAfterHook,
      globalState
    );
  }
}

Tracer.prototype.restoreRequire = function restoreRequire(){
  var proto = Object.getPrototypeOf(module);
  proto.require = this.origRequire;
}

Tracer.prototype.isModuleBlacklisted = function isModuleBlacklisted(requireId){
  if (!this.blacklistedModules) return;
  var blacklistedModules = this.blacklistedModules;
  for (var i = blacklistedModules.length - 1; i >= 0; i--){
    if (blacklistedModules[i] === requireId) return true;
  }
  return false;
}

Tracer.prototype.isModuleWhitelisted = function isModuleWhitelisted(requireId){
  if (!this.whitelistedModules) return true;
  
  var whitelistedModules = this.whitelistedModules;
  for (var i = whitelistedModules.length - 1; i >= 0; i--){
    if (whitelistedModules[i] === requireId) return true;
  }
  
  return false;
}

Tracer.prototype.requireBeforeHook = function requireBeforeHook(trace, globalState){
  this.pushNestRequire(trace);
  if (this.isModuleWhitelisted(trace.args[0])) globalState.whitelisted++;
}

Tracer.prototype.requireAfterHook = function requireAfterHook(trace, globalState){
  var _module = {
    requireId: trace.args[0], 
    id: this.getModuleId(trace),
    top: this.getRequireTop(trace)
  };
  
  var shouldWrapExports = !this.isModuleBlacklisted(_module.requireId) &&
      (globalState.whitelisted > 0);
  
  if(shouldWrapExports){
    var _exports = trace.ret;
    this.wrapFunctions(_exports, _module, -1);
    
    //check to see if the returned object itself is a function, if so, wrap it
    if( isFunction(_exports) ){
      var funcGlobalState = { module: _module};
      trace.ret = this.wrap(_exports, this.funcBeforeHook, this.funcAfterHook, funcGlobalState);
    }
  } else {
    // log('skipping \'%s\' module', _module);
  }
  this.popNestRequire(trace);
  if (this.isModuleWhitelisted(trace.args[0])) globalState.whitelisted--;
}

//keep track of the 'top level' module that is 'require'd.  if the name
//starts with a . or .., it's a relative require path and thus most likely
//a submodule
Tracer.prototype.pushNestRequire = function pushNestRequire(trace){
  var name = trace.args[0];
  if( name.charAt(0) != '.'){
    this.nestRequire.push(name);
  }
}

Tracer.prototype.popNestRequire = function popNestRequire(trace){
  var name = trace.args[0];
  if( name.charAt(0) != '.'){
    this.nestRequire.pop(name);
  }  
}

Tracer.prototype.getRequireTop = function getRequireTop(trace){
  //if we don't have a top level name in the stack, then we are likely working
  //directly with user modules as opposed to installed npm's.  return that
  return this.nestRequire[this.nestRequire.length -1 ] || trace.args[0]; 
}

Tracer.prototype.getModuleId = function getModuleId(trace){
  var keys = Object.keys(cache);
  for (var i = keys.length - 1; i >= 0; i--){
    var k = keys[i]
    if (cache[k].exports == trace.ret){
      return cache[k].id
    }
  }
  
  //could not find it, it should be a built-in
  return trace.args[0];
}

// iterate through all configurable properties and hook into each function
Tracer.prototype.wrapFunctions = function wrapFunctions(obj, _module, protoLevel){
  if (!obj || !isObject(obj)) return;
  
  if (obj.__concurix_wrapped_obj__ || !Object.isExtensible(obj)) return;
  Object.defineProperty(obj, '__concurix_wrapped_obj__', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: true
  });

  protoLevel = protoLevel ? protoLevel : 0;
  var self = this;
  
  iterateOwnProperties(obj, function(key){
    var desc = Object.getOwnPropertyDescriptor(obj, key);
    // ignore properties that cannot be set
    if (!desc.configurable || !desc.writable || desc.set) return;
    
    if (isFunction(desc.value)) {
      var globalState = { module: _module };
      obj[key] = self.wrap(desc.value, self.funcBeforeHook, self.funcAfterHook, globalState);
    } else if (isObject(desc.value)) {
      // to save cycles do not go up through the prototype chain for object-type properties
      self.wrapFunctions(desc.value, _module, 0);
    }
  });
  
  // protoLevel is how deep you want to traverse the prototype chain. 
  // protoLevel = -1 - this will go all the way up excluding Object.prototype 
  if (protoLevel != 0){
    protoLevel--;
    var proto = Object.getPrototypeOf(obj);
    var globalState = { module: _module };
    self.wrapFunctions(proto, _module, protoLevel);
  }
}

Tracer.prototype.funcBeforeHook = function funcBeforeHook(trace, globalState){
  if (globalState){
    trace.module = globalState.module;
  }
  
  this.nestStack.push(trace);
  trace.nestLevel = this.nestStack.length;
  
  //wrap any callbacks found in the arguments
  var args = trace.args;
  for(var i = args.length - 1; i >= 0; i--){
    var a = args[i];
    if (isFunction(a)){
      var callbackGlobalState = {
        module: trace.module,
        callbackOf: trace
      };
      // trace.hasCallbacks = trace.hasCallbacks || [];
      // trace.hasCallbacks.push(callbackTrace);
      args[i] = this.wrap(a, this.funcBeforeHook, this.funcAfterHook, callbackGlobalState);
      trace.origFunctionArguments = trace.origFunctionArguments || [];
      trace.origFunctionArguments.push(a);
    }
  }
}

Tracer.prototype.funcAfterHook = function funcAfterHook(trace, globalState){
  // wrap the return value if it's a function
  // do we need to traverse 'ret' if it's an instance of a class?
  if (isFunction(trace.ret)){
    var retGlobalState = {
      module: trace.module
    };
    trace.ret = this.wrap(trace.ret, this.funcBeforeHook, this.funcAfterHook, retGlobalState);
  } else if (isObject(trace.ret)){
    this.wrapFunctions(trace.ret, trace.module, -1);
  }
  
  
  if (trace.origFunctionArguments){
    var args = trace.args;
    var j = 0;
    for(var i = args.length - 1; i >= 0; i--){
      var a = args[i];
      if (isFunction(a)){
        var origFunc = trace.origFunctionArguments[j];
        origFunc.prototype = a.prototype;
        extend(origFunc, a);
        j++;
      }
    }
  }
  
  if (this.running){
    var traceInfo = this.extractTraceInfo(trace);
    
    //get the previous trace (second last)
    var nestCount = this.nestStack.length;
    if (nestCount > 1){
      var caller = this.nestStack[nestCount-2];
      caller.childExecTime = caller.childExecTime || [0,0];
      caller.childExecTime = addHrTimes(caller.childExecTime, trace.execTime);
      traceInfo.calledBy = this.extractTraceInfo(caller);
    }
    
    traceInfo.callbackOf = this.extractTraceInfo(globalState.callbackOf);
    // WARNING: UNUSUAL BEHAVIOR ALERT
    // "properly" the line above is the correct logic, we compute the delay from when the callback is registered to when it is called.
    // however, common usage is for callbacks to be registered and then called mulitple times.  to make the data more useful,
    // reset the 'start' of any callback to the last invocation once we have fired it.  there are corner cases with this logic
    // as well, so it's really a judgement call as to what is the 'right' data to show.  perhaps in the future we will store both
    if( globalState.callbackOf ){
      globalState.callbackOf.startTime = trace.startTime; 
    }   
    this.aggregate(traceInfo, trace);
  }
  //clear memory
  this.nestStack.pop();
}

Tracer.prototype.extractTraceInfo = function extractTraceInfo(trace){
  if (!trace) return;
  var info = {
    id: trace.id,
    pid: trace.processId,
    module: trace.module,
    fun_name: trace.functionName,
    line: trace.line,
    start: hrtToUs(trace.startTime),
    duration: hrtToUs(trace.execTime),
    child_duration: 0,  //do not compute it here, it will be computed during aggregation
    mem_delta: trace.memDelta,
    nest_level: trace.nestLevel
  };
  return info;
}

Tracer.prototype.aggregate = function aggregate(traceInfo, rawTrace){
  if (this.newFrame){
    var self = this;
    setTimeout(function(){
      self.cxEmit('frame', { nodes: tree.getNodes(), links: tree.getLinks() });
      tree.reset();
      self.newFrame = true;
    }, 100);
    this.newFrame = false;
  }
  
  var target = tree.createOrUpdateNode(traceInfo);
  if (traceInfo.calledBy){
    var source = tree.createOrFindNode(traceInfo.calledBy);
    tree.createOrUpdateLink(source, target, 'invocation', traceInfo);
    source.child_duration = source.child_duration || 0;
    source.child_duration += hrtToUs(rawTrace.childExecTime); 
    delete traceInfo.calledBy;
  }
  
  if (traceInfo.callbackOf){
    var source = tree.createOrFindNode(traceInfo.callbackOf);
    tree.createOrUpdateLink(source, target, 'callback', traceInfo);
    delete traceInfo.callbackOf;
  }
}