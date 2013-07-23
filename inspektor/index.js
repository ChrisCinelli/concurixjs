// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var Agent = require('./agent.js');

var defaultParams = {
  logs: undefined,          //path where proxy logs will be stored
  frontendPort: 9999,
  debuggeePort: 3333,
  v8Port: 5858,
  debuggeePid: process.pid
};

var agent = new Agent(defaultParams);

process.on('SIGUSR2', function() {
  if (agent.isRunning()) {
    agent.stop();
  } else {
    agent.start();
  }
});

exports.config = function config(params){
  Object.keys(params).forEach(function(k){
    defaultParams[k] = params[k];
  })
};

exports.start = function start(){
  agent.start();
};

exports.stop = function stop(){
  agent.stop();
};
