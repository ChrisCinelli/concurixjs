// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var cp = require('child_process');
var ws = require('ws');
var fs = require('fs');
var log = require('./util.js').log;

function Agent(config){
  this.proxy = null;
  this.server = null;
  this.proxySock = null;
  this.config = config;
}

Agent.prototype.isRunning = function isRunning(){
  return !!this.server;
};

Agent.prototype.start = function start(){
  if (this.server) return;
  log('inspektor: starting');

  var self = this;

  this.server = new ws.Server({
    port: this.config.debuggeePort,
    host: '127.0.0.1'
  });

  this.server.on('listening', function(){
    self.spawnProxy();
    // self.loadAgents();
  });
  this.server.on('connection', this.onProxyConnection.bind(this));
};

Agent.prototype.stop = function stop(){
  log('inspektor: stopping');

  if (this.proxySock) {
      this.proxySock.close();
      this.proxySock = null;
  }

  if (this.proxy && this.proxy.pid) {
      process.kill(this.proxy.pid, 'SIGTERM');
      this.proxy = null;
  }

  if (this.server) {
      this.server.close();
      this.server = null;
  }
  
};

Agent.prototype.spawnProxy = function spawnProxy(){
  if (this.proxy) return;
  
  log('inspektor: spawning proxy');
  var self = this;
  var config = this.config;
  
  var url = 'http://localhost:' + config.frontendPort + 
    '/inspector.html?ws=127.0.0.1:' + config.frontendPort + '/websocket';
  log('visit: ', url);
  
  var stdio = ['ignore', 'ignore', 'ignore'];
  
  if (config.logs){
    stdio[1] = fs.openSync(config.logs + '/inspektor.log', 'w');
    stdio[2] = fs.openSync(config.logs + '/inspektor_err.log', 'w');
  }
  
  // TODO find a better way to pass parameters to proxy
  process.env.INSPEKTOR_DEBUGGEE_PORT = config.debuggeePort;
  process.env.INSPEKTOR_DEBUGGEE_PID = config.debuggeePid;
  process.env.INSPEKTOR_FRONTEND_PORT = config.frontendPort;
  process.env.INSPEKTOR_V8_PORT = config.v8Port;
  this.proxy = cp.spawn(__dirname + '/debug_proxy.js', [], {
    env: process.env,
    cwd: __dirname,
    stdio: stdio
  });
};

Agent.prototype.onProxyConnection = function onProxyConnection(socket){
  log('inspektor: proxy connected, waiting for commands...');

  this.proxySock = socket;
  this.proxySock.on('message', this.onProxyData.bind(this));
  this.proxySock.on('error', function(error) {
    console.error(error);
  });
};

Agent.prototype.onProxyData = function onProxyData(message){
  var self = this;
  var data;

  try {
    data = JSON.parse(message);
  } catch(e) {
    log('inspektor: invalid proxy message');
    log(e.message);
    return;
  }
  
  log('inspektor: proxy -> debuggee');
  log(data);

  // var id = data.id;
  // var command = data.method.split('.');
  // var domain = this.loadedAgents[command[0]];
  // var method = command[1];
  // var params = data.params;
  // 
  // if (!domain || !domain[method]) {
  //     console.warn('%s is not implemented', data.method);
  //     return;
  // }
  // 
  // domain[method](params, function(result) {
  //     var response = {
  //         id: id,
  //         result: result
  //     };
  // 
  //     self.proxySock.send(JSON.stringify(response));
  // });
  
};

Agent.prototype.notify = function notify(note){
  if (!this.proxySock) return;
  this.proxySock.send(JSON.stringify(note));
};


// this.loadAgents = function() {
//     var runtimeAgent = new agents.Runtime(this.notify.bind(this));
// 
//     for (var agent in agents) {
//         if (typeof agents[agent] == 'function' && agent != 'Runtime') {
//             this.loadedAgents[agent] = new agents[agent](this.notify.bind(this), runtimeAgent);
//         }
//     }
//     this.loadedAgents.Runtime = runtimeAgent;
// };

module.exports = Agent;
