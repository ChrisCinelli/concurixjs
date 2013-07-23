// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Concurix Tracer Public API

'use strict';

var os = require('os');
var Agent = require('./tracer/agent.js');
var util = require('./tracer/util.js');
var extend = util.extend;

exports.tracer = tracer;

function tracer(options){
  var defaultOptions = {
    port: 6788,
    forceRestart: true,
    blacklistedModules: ['util', 'cluster', 'console', 'rfile', 'callsite', 'browserify-middleware'],
    clearModulesCache: true,
    ipcSocketPath: '/tmp/concurix.sock',
    accountKey: '28164101-1362-769775-170247',
    hostname: os.hostname(),
    archiveSessionUrl: 'http://api.concurix.com/v1/bench/new_offline_run',
    maxAge: 15,
    useContext: 'true'
  };
  
  extend(defaultOptions, options);
  var agent = new Agent(defaultOptions);
  return {
    stop: function(){ agent.pauseTracer() },
    start: function(){ agent.resumeTracer() },
    terminate: function(){ agent.terminate() }
  };
}