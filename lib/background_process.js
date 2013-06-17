// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Background process to 'massage' trace data and handle clients connections

'use strict';

var path = require('path');
var os = require('os');
var Ipc = require('./ipc');
var WebSocketServer = require('./server');
var Archive = require('./archive');
var cxUtil = require('./util.js');
var log = cxUtil.log;
var values = cxUtil.values;
var version = require('../package.json').version;

// var Server = require('./server');

function BackgroundProcess(){
  log('concurix.background: starting');
  
  this.listenParentProcess();
  
  var ipcSocketPath = process.env.ipcSocketPath;
  this.ipc = new Ipc({ipcSocketPath: ipcSocketPath});

  this.maxAge = process.env.maxAge;
  
  var self = this;
  this.ipc.on('msg', function(msg){
    self.onIpcMsg(msg);
  });
  
  var port = process.env.serverPort;
  this.server = new WebSocketServer({port: port});
  this.broadcastTimer = setInterval(function(){
    self.broadcast();
  }, 2000);
  
  var accountKey = process.env.accountKey;
  var hostname = process.env.hostname;
  var archiveSessionUrl = process.env.archiveSessionUrl;
  if (accountKey && hostname && archiveSessionUrl){
    this.archiveUrl = [archiveSessionUrl, accountKey, hostname].join('/');
  }
  
  this.nodes = {};
  this.links = {};
  
  // counting maps so we can do an easy aging algorithm
  this.ageNodes = {};
  this.ageLinks = {};
}

BackgroundProcess.prototype.listenParentProcess = function listenParentProcess(){
  var self = this;
  process.on('SIGTERM', function(){
    self.cleanUp();
    process.exit();
  });

  process.on('disconnect', function() {
    log('concurix.background: parent process crashed');
    self.cleanUp();
    process.exit();
  });
}

BackgroundProcess.prototype.cleanUp = function cleanUp(){
  this.ipc.close();
  clearInterval(this.broadcastTimer);
  this.server.close();
  this.nodes = {};
  this.links = {};
}

BackgroundProcess.prototype.onIpcMsg = function onIpcMsg(msg){
  if (this.eventsCount > 1e6){
    //TODO: what should we do in this case?
    log("concurix.background: dropping events");
    return;
  }
  switch(msg.cxCmd){
    case 'trace': this.onTrace(msg.trace);
  }
}

BackgroundProcess.prototype.onTrace = function onTrace(trace){
  var target = this.createOrUpdateNode(trace);
  //log("trace event module top", trace.module.top);
  if (trace.calledBy){
    var source = this.createOrFindNode(trace.calledBy);
    this.createOrUpdateLink(source, target, 'invocation');
    delete trace.calledBy;
  }
  
  if (trace.callbackOf){
    var source = this.createOrFindNode(trace.callbackOf);
    this.createOrUpdateLink(source, target, 'callback');
    delete trace.callbackOf;
  }
}

BackgroundProcess.prototype.createOrUpdateNode = function createOrReturnNode(trace){
  
  var node = this.createOrFindNode(trace);
  if (!node.num_calls){
    node.num_calls = 1;
    node.duration = trace.duration;
    node.mem_delta = trace.mem_delta;
  } else {
    node.num_calls += 1;
    node.duration += trace.duration;
    node.mem_delta += trace.mem_delta;
  }
  return node;
}

BackgroundProcess.prototype.createOrFindNode = function createOrFindNode(trace){
  var name = this.traceToName(trace);
  var nodes = this.nodes;
  if(!nodes[name]){
    nodes[name] = trace;
    trace.name = name;
    this.eventsCount++;
  }
  //take the age counter to zero, this is a 'live' node now.
  this.ageNodes[name] = 0;
  return nodes[name];
}

BackgroundProcess.prototype.createOrUpdateLink = function createOrUpdateLink(src, trg, type){
  var srcName = src.name;
  var trgName = trg.name;
  var key = [srcName, trgName, type].join('-');
  var lnk = this.links[key];
  if(!lnk){
    lnk = this.links[key] = {
      source: srcName,
      target: trgName,
      type: type,
      num_calls: 0,
      total_delay: 0
    }
    this.eventsCount++;
  }
  lnk.num_calls++;
  // use abs as sometimes it gets negative
  lnk.total_delay += Math.abs(trg.start - src.start);
  
  //take the age counter to zero, this is a 'live' link now.
  this.ageLinks[key] = 0;
  return lnk;
}

BackgroundProcess.prototype.broadcast = function broadcast(){
  if (!this.server) return;
  var msg = {
    type: "nodejs",
    version: version,
    // run_id: 'to be set',
    load_avg: os.loadavg(), //array of 1, 5, and 15 minute load averages
    cpus: os.cpus(),
    timestamp: cxUtil.unixTimeSec(),
    data: {
      nodes: values(this.nodes),
      links: values(this.links)
    }
  };
  var json = JSON.stringify(msg);
  this.server.broadcast(json);
  if (this.archiveUrl){
    Archive.archive(json, this.archiveUrl);
  }
  this.resetTraceEvents();
}

BackgroundProcess.prototype.traceToName = function traceToName(trace){
  return [trace.pid, trace.id].join(':');
}

BackgroundProcess.prototype.resetTraceEvents = function resetTraceEvents(){
  //nodes and links counter
  // this.eventsCount = 0;
  var links = this.links;
  var nodes = this.nodes;
  var ageLinks = this.ageLinks;
  var ageNodes = this.ageNodes;
  
  for(var key in links ){
    if( ageLinks[key] > this.maxAge ){
      delete links[key];
      delete ageLinks[key];
    } else {
      links[key].num_calls = 0;
      links[key].total_delay = 0;
      ageLinks[key]++;
    }
  }
  for(var key in nodes ){
    if( ageNodes[key] > this.maxAge ){
      delete nodes[key];
      delete ageNodes[key];
    } else {
      nodes[key].mem_delta = 0;
      nodes[key].duration = 0;
      nodes[key].num_calls = 0;
      ageNodes[key]++;
    }
  }
}


new BackgroundProcess();
