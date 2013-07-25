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
    port: 6788,
    forceRestart: true,    
    ipcSocketPath: '/tmp/concurix.sock',
    accountKey: '28164101-1362-769775-170247',
    hostname: os.hostname(),
    archiveSessionUrl: 'http://api.concurix.com/v1/bench/new_offline_run',
    maxAge: 15,
    useContext: 'true',
    //tracer's options
    tracerEnabled: true,
    clearModulesCache: true,
    whitelistedModules: null,
    blacklistedModules: ['util', 'cluster', 'console', 'rfile', 'callsite', 'browserify-middleware'],
  };
  
  options = options || {};
  Object.keys(options).forEach(function(name){
    defaultOptions[name] = options[name];
  })
  
  var agent = new Agent(defaultOptions);
  return {
    stop: function(){ agent.start() },
    start: function(){ agent.stop() }
  };
}