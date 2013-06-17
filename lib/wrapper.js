// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Wraps function providing before and after hooks

// 'arguments' are not accessible under strict mode 
// 'use strict';

var util = require('./util.js');
var extend = util.extend;
var log = util.log;
var proxyCounter = 0;

exports.wrap = function wrap(func, beforeHook, afterHook, globalState) {
  if (func.__concurix_wrapped_by__){
    extend(func.__concurix_wrapped_by__, func);
    return func.__concurix_wrapped_by__;
  }
  
  if (func.__concurix_wrapper_for__) {
    return func;
  } 
  
  var self = this;
  var proxyId,
      script,
      file,
      callerMod;
  var loc = {
    position: 0,
    line: 0
  };
  
  if( typeof v8debug != "undefined" ){
    script = v8debug.Debug.findScript(func);
    file = script ? script.name : "native";
    if( file != "native"){
      loc = v8debug.Debug.findFunctionSourceLocation(func);      
    }    
    proxyId = file + ":" + loc.position;
    callerMod = globalState.module;
    globalState.module = {
      top: callerMod ? callerMod.top : file,
      requireId: callerMod ? callerMod.requireId : file,
      id: file
    };
  } else {
    // if we don't have the v8debug info, then treat every proxy as unique to the module
    proxyId = globalState.module ? globalState.module.id : "unknown";
  }

  var proxy = function concurixProxy() {
    if (this.__concurix_obj__){
      return func.apply(this, arguments);
    }
    
    var trace = {};
    //save caller info and call beforeHook
    try {
      //WEIRD BEHAVIOR ALERT:  the nodejs debug module gives us line numbers that are zero index based; add 1
      trace.line = loc.line + 1;
      trace.processId = process.pid;
      trace.id = proxyId;
      trace.functionName = func.name || 'anonymous';
      trace.args = arguments;
      // WARNING: start time is not accurate as it includes beforeHook excecution
      // this is done to have approximate start time required in calculating total_delay in bg process
      trace.startTime = process.hrtime();
      // trace.wrappedThis = this;
      if(beforeHook) beforeHook.call(self, trace, globalState);
    } catch(e) {
      log('concurix.wrapper beforeHook: error', e);
    }
    
    // Re-calculate accurate start time so we get accurate execTime
    var startTime = process.hrtime();
    //re-assign any properties back to the original function
    extend(func, proxy);
    var startMem = process.memoryUsage().heapUsed;
    var ret = func.apply(this, arguments);
    //save return value, exec time and call afterHook
    try {
      trace.memDelta = process.memoryUsage().heapUsed - startMem;
      trace.ret = ret;
      trace.startTime = startTime;
      trace.execTime = process.hrtime(startTime);
      if (afterHook) afterHook.call(self, trace, globalState);
    } catch(e) {
      log('concurix.wrapper afterHook: error', e);
      debugger;
    }
    
    return trace.ret;
  };
  extend(proxy, func);
  proxy.prototype = func.prototype;
  proxy.__concurix_wrapper_for__ = func.name || 'anonymous';
  // proxy.__concurix_fun_code__ = func.toString();
  func.__concurix_wrapped_by__ = proxy;
  
  return proxy;
}

exports.wrap.__concurix_wrapper_for__ = 'wrap';