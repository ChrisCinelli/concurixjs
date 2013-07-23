// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Agent

'use strict';

var Tracer = require('./tracer.js');
var cxUtil = require('./util.js');
var extend = cxUtil.extend;
var log = cxUtil.log;
var cp = require('child_process');
var cluster = require('cluster');
var net = require('net');
var fs = require('fs');

module.exports = exports = Agent;

function Agent(options){  
  this.__concurix_obj__ = true;
  this.config = options;
  this.isMaster = cluster.isMaster;
  this.startBgProcess();
  this.connectSocket();
  this.startTracer();
}

Agent.prototype.startBgProcess = function startBgProcess(){
  if (this.bgProcess || !this.isMaster ) return;
  var config = this.config;
  var self = this;
  var options = { env: { 
    serverPort: config.port,
    ipcSocketPath: config.ipcSocketPath,
    accountKey: config.accountKey,
    hostname: config.hostname,
    archiveSessionUrl: config.archiveSessionUrl,
    maxAge: config.maxAge,
    useContext: config.useContext || 'false'
  }};
  
  
  
  var bgProcess = cp.fork(__dirname + '/background_process.js', [], options);
  
  bgProcess.on('close', function (code, signal) {
    log('concurix.bgProcess: exited');
    self.stopSocketTimer();
    self.bgProcess = null;
    if (self.config.forceRestart) self.startBgProcess();
  });
  
  this.bgProcess = bgProcess;
  
  // bgProcess.on('message', function(m) {
  //   // console.log('message from bgProcess:', m);
  // });
}

Agent.prototype.stopBgProcess = function stopBgProcess(){
  if (!(this.bgProcess && this.isMaster)) return;
  
  this.bgProcess.kill();
  this.bgProcess = null;
}

Agent.prototype.connectSocket = function connectSocket(){
  if (this.socket) return;
  var self = this;
  
  // if (!fs.existsSync(this.config.ipcSocketPath)){
  //   self.startSocketTimer();
  //   return;
  // }
  
  var socket = net.connect(self.config.ipcSocketPath);
  self.socket = socket;
  self.socket.__concurix_obj__ = true;
  
  socket.on('error', function(e){
    self.socket = null;
    self.startSocketTimer();
  });
  
  socket.on('close', function(){
    self.socket = null;
  });
  
  socket.on('connect', function(){
    self.stopSocketTimer();
  });
}

Agent.prototype.closeSocket = function closeSocket(){
  if (this.socket){
    this.socket.end();
    this.socket = null;
  }
}

Agent.prototype.startSocketTimer = function startSocketTimer(){
  if (this.socketTimer) return;
  var self = this;
  this.socketTimer = setTimeout(function(){
    self.socketTimer = null;
    self.connectSocket();
  }, 1000);
}

Agent.prototype.stopSocketTimer = function stopSocketTimer(){
  if (this.socketTimer){
    clearInterval(this.socketTimer);
    this.socketTimer = null;
  }
}

Agent.prototype.startTracer = function startTracer(){
  if (this._tracer) return;
  var config = this.config;
  var self = this;
  this._tracer = new Tracer({
    clearModulesCache: config.clearModulesCache,
    blacklistedModules: config.blacklistedModules,
    whitelistedModules: config.whitelistedModules
  });

  this._tracer.on('frame', function(frame){
    self.onFrame(frame);
  });
  this._tracer.start();
}

Agent.prototype.stopTracer = function stopTracer(){
  var _tracer = this._tracer;
  if (_tracer){
    _tracer.removeListener('frame', this.onFrame);
    _tracer.restoreRequire();
    this._tracer = null;
  }
}

Agent.prototype.onFrame = function onFrame(frame){
  if (!this.socket){ return; }
  frame.trace_name = this.config.traceName;
  //TODO: do we need UTF8 encoding before sending over the socket?
  var str = JSON.stringify({ cxCmd: 'frame', frame: frame }) + '\0';
  this.socket.write(str);
}

Agent.prototype.terminate = function terminate(){
  this.pauseTracer();
  this.config.forceRestart = false;
  
  this.closeSocket();
  this.stopTracer();
  this.stopBgProcess();
}

Agent.prototype.pauseTracer = function pauseTracer(){
  if (this._tracer){
    this._tracer.stop();
  }
}

Agent.prototype.resumeTracer = function resumeTracer(){
  if (this._tracer){
    this._tracer.start();
  }
}