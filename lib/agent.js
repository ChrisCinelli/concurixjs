// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//

var cp = require('child_process');
var cluster = require('cluster');
var fs = require('fs');
var Tracer = require('../tracer');
var log = require('./util.js').log;
var Connection = require('./ipc.js').Connection;
module.exports = Agent;

function Agent(options){  
  this.__concurix_obj__ = true;
  this.proxy = null;
  this.tracer = null;
  this.connection = null;
  this.config = options || {};

  if (cluster.isMaster){
    this.startProxy();
  }
  
  var config = this.config;
  var self = this;
  if (config.enableTracer){
    this.tracer = new Tracer({
      clearModulesCache: config.clearModulesCache,
      blacklistedModules: config.blacklistedModules,
      whitelistedModules: config.whitelistedModules
    });
    
    this.tracer.on('frame', function(frame){
      self.sendToProxy('Tracer.frame', frame);
    });
  }
  
  this.connection = new Connection(config.ipcSocketPath);
}

Agent.prototype.startProxy = function startProxy(){
  if (this.proxy) return;
  
  var config = this.config;
  var self = this;
  // TODO: is there a better way to pass params?
  var env = process.env;
  env.CX_FRONTEND_PORT = config.frontendPort;
  env.CX_IPC_SOCKET_PATH = config.ipcSocketPath;
  env.CX_ACCOUNT_KEY = config.accountKey;
  env.CX_HOSTNAME = config.hostname;
  env.CX_ARCHIVE_SESSION_URL = config.archiveSessionUrl;
  env.CX_MAX_AGE = config.maxAge;
  env.CX_USE_CONTEXT = config.useContext;
  env.CX_V8_PORT = config.v8Port;
  env.CX_DEBUGGEE_PID = config.debuggeePid;
  env.CX_ENABLED_DEBUGGER = config.enableDebugger;
  
  log(env.CX_ENABLED_DEBUGGER)
  var stdio = ['ignore', 'ignore', 'ignore'];
  
  if (config.logsPath){
    stdio[1] = fs.openSync(config.logsPath + '/concurixjs.log', 'w');
    stdio[2] = fs.openSync(config.logsPath + '/concurixjs_err.log', 'w');
  }
  
  this.proxy = cp.spawn(__dirname + '/proxy.js', [], {
    env: env,
    cwd: __dirname,
    stdio: stdio
  });
  
  this.proxy.on('close', function (code, signal) {
    log('concurixjs: proxy process exited');
    self.proxy = null;
    if (self.config.forceRestart) self.startProxy();
  });
  
  // this.proxy.on('message', function(m) {
  //   // console.log('message from proxy:', m);
  // });
};

Agent.prototype.stopProxy = function stopProxy(){
  if (!this.proxy) return;
  
  this.proxy.kill();
  this.proxy = null;
};

Agent.prototype.start = function start(){
  if (this.tracer) this.tracer.start();
};

Agent.prototype.stop = function stop(){
  if (this.tracer) this.tracer.stop();
};

Agent.prototype.sendToProxy = function sendToProxy(type, data){
  if (!this.connection) return;
  this.connection.send({ type: type, data: data });
}

