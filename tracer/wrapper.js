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
// to avoid tracing and wrapping itself 'block_tracing' acts as a semaphore 
// which is set to 'true' when it's in concurixjs code and 'false' when in user's code
var block_tracing = false;

var concurixProxy = function (){
  if (block_tracing){
    return cxOrigFuncToWrap.apply(this, arguments);
  }
  
  block_tracing = true;
  var trace = {};
  var rethrow = null;
  var doRethrow = false;
  //save caller info and call cxBeforeHook
  try {
    //WEIRD BEHAVIOR ALERT:  the nodejs debug module gives us line numbers that are zero index based; add 1
    trace.line = loc.line + 1;
    trace.processId = process.pid;
    trace.id = proxyId;
    trace.functionName = cxOrigFuncToWrap.name || 'anonymous';
    trace.args = arguments;
    // WARNING: start time is not accurate as it includes cxBeforeHook excecution
    // this is done to have approximate start time required in calculating total_delay in bg process
    trace.startTime = process.hrtime();
    // trace.wrappedThis = this;
    if(cxBeforeHook) cxBeforeHook.call(self, trace, globalState);
  } catch(e) {
    log('concurix.wrapper cxBeforeHook: error', e);
  }
  
  // Re-calculate accurate start time so we get accurate execTime
  var startTime = process.hrtime();
  //re-assign any properties back to the original function
  extend(cxOrigFuncToWrap, proxy);
  var startMem = process.memoryUsage().heapUsed;
  try{
    block_tracing = false;
    var ret = cxOrigFuncToWrap.apply(this, arguments);
  } catch (e) {
    // it's a bit unfortunate we have to catch and rethrow these, but some nodejs modules like
    // fs use exception handling as flow control for normal cases vs true exceptions.
    rethrow = e;
    doRethrow = true; // Amazon uses null exceptions as part of their normal flow control, handle that case
  }
  block_tracing = true;
  //save return value, exec time and call cxAfterHook
  try {
    trace.memDelta = process.memoryUsage().heapUsed - startMem;
    trace.ret = ret;
    trace.startTime = startTime;
    trace.execTime = process.hrtime(startTime);
    if (cxAfterHook) cxAfterHook.call(self, trace, globalState);
  } catch(e) {
    log('concurix.wrapper cxAfterHook: error', e);
  }
  block_tracing = false;
  if( doRethrow ){
    throw rethrow;
  }
  return trace.ret;
};

exports.wrap = function wrap(cxOrigFuncToWrap, cxBeforeHook, cxAfterHook, globalState) {
  if (cxOrigFuncToWrap.__concurix_wrapped_by__){
    extend(cxOrigFuncToWrap.__concurix_wrapped_by__, cxOrigFuncToWrap);
    return cxOrigFuncToWrap.__concurix_wrapped_by__;
  }
  
  if (cxOrigFuncToWrap.__concurix_wrapper_for__) {
    return cxOrigFuncToWrap;
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
    script = v8debug.Debug.findScript(cxOrigFuncToWrap);
    if (!script){
      // do not wrap native code or extensions
      return cxOrigFuncToWrap;
    }
    file = script.name;
    loc = v8debug.Debug.findFunctionSourceLocation(cxOrigFuncToWrap);
    proxyId = file + ":" + loc.position;
    callerMod = globalState.module;
    globalState.module = {
      top: callerMod ? callerMod.top : file,
      requireId: callerMod ? callerMod.requireId : file,
      id: file
    };
  } else {
    // do not wrap native code or extensions
    var func_src = cxOrigFuncToWrap.toString();
    if (func_src.match(/\{ \[native code\] \}$/)){
      return cxOrigFuncToWrap;
    }
    // if we don't have the v8debug info, then treat every proxy as unique to the module
    proxyId = globalState.module ? globalState.module.id : "unknown";
  }

  // keep the original func name using eval
  var orgFuncName = cxOrigFuncToWrap.name || 'anonymous';
  proxyStr = concurixProxy.toString().replace(/^function/, 'function ' + orgFuncName);
  eval("var proxy = " + proxyStr);
  
  extend(proxy, cxOrigFuncToWrap);
  proxy.prototype = cxOrigFuncToWrap.prototype;
  proxy.__concurix_wrapper_for__ = orgFuncName;
  // proxy.__concurix_fun_code__ = func.toString();
  cxOrigFuncToWrap.__concurix_wrapped_by__ = proxy;  
  return proxy;
}

exports.wrap.__concurix_wrapper_for__ = 'wrap';