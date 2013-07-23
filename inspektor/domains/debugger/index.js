// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var Domain = require('../domain.js');
var log = require('../../util.js').log;
var V8Debugger = require('./v8debugger.js');
var translate = require('./translate.js');

function Debugger(config){
  this.v8debugger = new V8Debugger(config.v8Port, config.debuggeePid);
  
  this.v8debugger.on('break', this._onBreak.bind(this));
  this.v8debugger.on('exception', this._onException.bind(this));
}

var proto = Debugger.prototype = Object.create(Domain.prototype);

proto._getScripts = function _getScripts(){
  var req = this.v8debugger.createRequest({
    command: 'scripts',
    arguments: {
      types: 4,
      // includeSource: true
    }
  });
  
  this.v8debugger.send(req, this._onScripts.bind(this));
};

proto._onScripts = function _onScripts(rsp, err){
  if (err){
    //TODO: notify front-end
    log('failed to get scripts from v8: ', err);
    return;
  }
  
  var scripts = translate.scripts(rsp.body);
  
  var self = this;
  scripts.forEach(function(s){
    if (!s) return;
    self.notify({
      method: "Debugger.scriptParsed",
      params: s
    });
  });
};

proto._onBreak = function _onBreak(rsp){
  this._notifyBreakEvent('other');
};

proto._onException = function _onException(rsp){
  var data = {
    uncaught: rsp.body.uncaught,
    description: rsp.body.exception.text
  }
  this._notifyBreakEvent('exception', data);
};

proto._notifyBreakEvent = function _notifyBreakEvent(reason, data){
  var self = this;
  this._getFrames(function _onFrames(v8frames, err){
    if (err){
      //TODO: notify front-end
      log('failed to get frames from v8: ', err);
      return;
    }
    
    data = data || null;

    var noti = {
      method: "Debugger.paused",
      params: {
        callFrames: translate.frames(v8frames),
        reason: reason,
        data: data
      }
    };

    self.notify(noti);
  });
}

proto._getFrames = function _getFrames(onFramesCallback){
  var req = this.v8debugger.createRequest({
    command: 'backtrace',
    arguments: {
      inlineRefs: true
    }
  });

  var self = this;
  this.v8debugger.send(req, function _onBacktrace(rsp, err){
    if (err){
      onFramesCallback(null, err);
      return;
    }
    
    var frames = rsp.body.frames || [];
    // var refs = rsp.refs;
    // frames.forEach(function(f){
    //   f.refs = refs;
    // });

    self._getScopes(frames, function(v8frames, scopesErr){
      if (scopesErr){
        onFramesCallback(null, err);
        return;
      }
      onFramesCallback(v8frames);
    });
  });
};

proto._getScopes = function _getScopes(v8frames, onScopesCallback){
  var len = v8frames.length;
  if (len === 0){
    onScopesCallback(v8frames);
    return;
  }
  
  var self = this;
  var frameIdx = 0;
  
  this._getScope(v8frames[frameIdx], onScope);
  
  function onScope(v8frame, scopesErr){
    if (scopesErr){
      onScopesCallback(v8frames, scopesErr);
      return;
    }
    var isLastFrame = !(len - frameIdx - 1);
    if (isLastFrame){
      onScopesCallback(v8frames);
    } else {
      frameIdx++;
      self._getScope(v8frames[frameIdx], onScope);
    }
  }
};

proto._getScope = function _getScope(v8frame, onScopeCallback){
  var req = this.v8debugger.createRequest({
    command: 'scopes',
    arguments: {
      frameNumber: v8frame.index,
      // inlineRefs: true
    }
  });
  
  this.v8debugger.send(req, function(scopesRsp, scopesErr){
    
    if (scopesErr){
      onScopeCallback(v8frame, scopesErr);
    } else {
      var scopes = scopesRsp.body.scopes || [];
      var refs = scopesRsp.refs;
      scopes.forEach(function(s){
        s.refs = refs;
      });
      v8frame.scopes = scopes;
      onScopeCallback(v8frame);
    }
  });
};

// chrome devtools protocol commands
proto.supportsSeparateScriptCompilationAndExecution = function supportsSeparateScriptCompilationAndExecution(cmd){
  this.respond(cmd.id, { result: true });
};

proto.causesRecompilation = function causesRecompilation(cmd){
  this.respond(cmd.id, { result: false });
};

proto.canSetScriptSource = function canSetScriptSource(cmd){
  this.respond(cmd.id, { result: true });
};

proto.getScriptSource = function getScriptSource(cmd){
  var scriptId = parseInt(cmd.params.scriptId);
  
  var req = this.v8debugger.createRequest({
    command: 'scripts',
    arguments: {
      types: 4,
      ids: [scriptId],
      includeSource: true
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function onScript(rsp, err){
    if (err){
      self.respond(cmd.id, null, err.message );
    }
    self.respond(cmd.id, { scriptSource: rsp.body[0].source });
  });
};

proto.enable = function enable(cmd){
  var self = this;
  this.v8debugger.once('enabled', function(){
    self.respond(cmd.id);
    self._getScripts();
  });
  
  this.v8debugger.enable();
};

proto.disable = function disable(cmd){
  this.v8debugger.disable();
  
  if (cmd) {
    this.respond(cmd.id);
  }
};

proto.setPauseOnExceptions = function setPauseOnExceptions(cmd){
  var state = cmd.params.state;
  
  var req = this.v8debugger.createRequest({
    command: 'setexceptionbreak',
    arguments: {
      type: state === 'none' ? 'uncaught': state,
      enabled: state === 'none' ? false : true
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function(rsp, err){
    if (err){
      self.respond(cmd.id, null, err.message);
    } else {
      self.respond(cmd.id);
    }
  });
};

proto.evaluateOnCallFrame = function evaluateOnCallFrame(cmd){
  // there is a bug in V8 where it does not update local variables
  // https://code.google.com/p/chromium/issues/detail?id=124206
  var params = cmd.params;
  var frame = parseInt(params.callFrameId);
  var disable_break = ('doNotPauseOnExceptionsAndMuteConsole' in params) ?
    params.doNotPauseOnExceptionsAndMuteConsole : true;
  
  var req_params = {
    command: 'evaluate',
    arguments: {
      expression: params.expression,
      frame: frame,
      global: false,
      disable_break: disable_break
    }
  };
  
  var req = this.v8debugger.createRequest(req_params);
  var self = this;
  
  this.v8debugger.send(req, function(rsp, err){
    if (err) {
      self.respond(cmd.id, { result: { type: 'string', value: err.message }, wasThrown: true });
    } else {
      var remoteObj = translate.object(rsp.body);
      self.respond(cmd.id, { result: remoteObj, wasThrown: false });
    }
  });
};

proto.getFunctionDetails = function getFunctionDetails(cmd){
  var objectId = parseInt(cmd.params.functionId);
  
  var req = this.v8debugger.createRequest({
    command: 'lookup',
    arguments: {
      handles: [objectId],
      includeSource: false
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function(rsp, err){
    if (err){
      self.respond(cmd.id, null, err.message);
    } else {
      var details = translate.func(rsp.body[objectId.toString()], rsp.refs);
      self.respond(cmd.id, { details: details });
    }
  });
};

proto.stepInto = function stepInto(cmd){
  var req = this.v8debugger.createRequest({
    command: 'continue',
    arguments: {
      stepaction: "in"
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function(rsp, err){
    if (err){
      self.respond(cmd.id, null, err.message);
    } else {
      self.respond(cmd.id);
    }
  });
};

proto.stepOut = function stepOut(cmd){
  var req = this.v8debugger.createRequest({
    command: 'continue',
    arguments: {
      stepaction: "out"
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function(rsp, err){
    if (err){
      self.respond(cmd.id, null, err.message);
    } else {
      self.respond(cmd.id);
    }
  });
};

proto.stepOver = function stepOver(cmd){
  var req = this.v8debugger.createRequest({
    command: 'continue',
    arguments: {
      stepaction: "next"
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function(rsp, err){
    if (err){
      self.respond(cmd.id, null, err.message);
    } else {
      self.respond(cmd.id);
    }
  });
};

proto.resume = function resume(cmd){
  var req = this.v8debugger.createRequest({
    command: 'continue'
  });
  
  var self = this;
  this.v8debugger.send(req, function(rsp, err){
    if (!cmd) return;
    if (err){
      self.respond(cmd.id, null, err.message);
    } else {
      self.respond(cmd.id);
    }
  });
};

proto.pause = function pause(cmd){
  // var req = this.v8debugger.createRequest({
  //   command: 'suspend'
  // });
  // 
  // var self = this;
  // this.v8debugger.send(req, function(rsp, err){      
  //     var req = self.v8debugger.createRequest({
  //       command: 'continue',
  //       arguments: {
  //         stepaction: "in"
  //       }
  //     });
  //     
  //     self.v8debugger.send(req, function(rsp, err){
  //       if (err){
  //         self.respond(cmd.id, null, err.message);
  //       } else {
  //         self.respond(cmd.id);
  //       }
  //     });
  //   }
  // });
};

proto.setBreakpointByUrl = function setBreakpointByUrl(cmd){
  var lineNumber = cmd.params.lineNumber;
  var url = cmd.params.url;
  var condition = cmd.params.condition || null;
    
  var req = this.v8debugger.createRequest({
    command: 'setbreakpoint',
    arguments: {
      type: 'script',
      target: url,
      line: lineNumber,
      condition: condition
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function (rsp, err){
    if (err) {
      self.respond(cmd.id, null, err.message);
      return;
    }
    var breakpoint = rsp.body.breakpoint;
    var actual_locations = rsp.body.actual_locations.map(function(loc){
      return {lineNumber: loc.line, scriptId: loc.script_id.toString()};
    });
    var result = {
      breakpointId: breakpoint.toString(),
      locations: actual_locations
    };
    
    self.respond(cmd.id, result);
  });
};

proto.removeBreakpoint = function removeBreakpoint(cmd){
  var breakpointId = parseInt(cmd.params.breakpointId);
  
  var req = this.v8debugger.createRequest({
    command: 'clearbreakpoint',
    arguments: {
      breakpoint: breakpointId
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function (rsp, err){
    if (err) {
      self.respond(cmd.id, null, err.message);
    } else {
      self.respond(cmd.id);
    }
  });
};

// Runtime commands
proto.releaseObjectGroup = function releaseObjectGroup(cmd){
  this.respond(cmd.id);
};

proto.releaseObject = function releaseObject(cmd){
  this.respond(cmd.id);
};

proto.getProperties = function getProperties(cmd){
  var objectId = parseInt(cmd.params.objectId);
  var ownProperties = cmd.params.ownProperties;
  
  var req = this.v8debugger.createRequest({
    command: 'lookup',
    arguments: {
      handles: [objectId],
      includeSource: false,
      // inlineRefs: true
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function(rsp, err){
    if (err){
      self.respond(cmd.id, null, err.message);
    } else {
      var properties = translate.properties(rsp.body[objectId.toString()], rsp.refs);
      self.respond(cmd.id, { result: properties });
    }
  });
};

proto.setScriptSource = function setScriptSource(cmd){
  var params = cmd.params;
  var scriptId = parseInt(params.scriptId);
  var source = params.scriptSource;
  
  var req = this.v8debugger.createRequest({
    command: 'changelive',
    arguments: {
      script_id: scriptId,
      new_source: source,
      preview_only: false
    }
  });
  
  var self = this;
  this.v8debugger.send(req, function(rsp, err){
    if (err){
      self.respond(cmd.id, null, err.message);
    } else {
      self.respond(cmd.id, { callFrames: [] });
    }
  });
}

module.exports = Debugger;