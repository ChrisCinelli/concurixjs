// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Concurixjs Public API

'use strict';

var os = require('os');
var Agent = require('./lib/agent');

module.exports = function concurixjs(options){
  var defaultOptions = {
    frontendPort: 6788,
    forceRestart: true,    
    ipcSocketPath: '/tmp/concurix.sock',
    hostname: os.hostname(),
    archiveHost: 'api.concurix.com', // Change to localhost for local testing
    archivePort: 80,
    accountKey: '28164101-1362-769775-170247',
    maxAge: 15,
    useContext: 'true',
    logsPath: null,
    //tracer's options
    enableTracer: true,
    clearModulesCache: true,
    whitelistedModules: null,
    blacklistedModules: ['util', 'cluster', 'console', 'rfile', 'callsite', 'browserify-middleware'],
    //debugger's options
    enableDebugger: true,
    v8Port: 5858,
    debuggeePid: process.pid
  };
  
  options = options || {};
  Object.keys(options).forEach(function(name){
    defaultOptions[name] = options[name];
  })
  
  var agent = new Agent(defaultOptions);
  return {
    stop: function(){ agent.stop() },
    start: function(){ agent.start() }
  };
}