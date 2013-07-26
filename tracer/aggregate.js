// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Aggregates traces from each cluster

var EventEmitter = require('events').EventEmitter;
var os = require('os');
var util = require('./util');
var values = util.values;
var log = util.log;
var Functions = require('./functions');
var version = require('../package.json').version;

module.exports = Aggregate;

function Aggregate(config){
  this.maxAge = config.maxAge;
  this.useContext = config.useContext;  
  this.nodes = {};
  this.links = {};
  // counting maps so we can do an easy aging algorithm
  this.ageNodes = {};
  this.ageLinks = {};

  Functions.parse_core_modules();
  
  this.broadcastTimer = setInterval(this.broadcast.bind(this), 2000);
}

Aggregate.prototype = Object.create(EventEmitter.prototype);

Aggregate.prototype.stop = function stop(){
  clearInterval(this.broadcastTimer);
}

Aggregate.prototype.frame = function frame(frame){
  var key, new_link, old_link, new_node, old_node, filename;

  if (this.useContext) {
    // Parse files containing nodes.  Parsing will happen asynchronously.
    for (key in frame.nodes) {
      new_node = frame.nodes[key];
      filename = new_node.id.split(':')[0];
      if (filename) {
        Functions.parse(filename)
      }
    }
  }
  
  // merge links
  for (key in frame.links){
    old_link = this.links[key];
    if (old_link){
      new_link = frame.links[key];
      old_link.num_calls += new_link.num_calls;
      old_link.total_delay += new_link.total_delay;
    } else {
      this.links[key] = frame.links[key];
    }
    //take the age counter to zero, this is a 'live' link now.
    this.ageLinks[key] = 0;    
  }
  
  // merge nodes
  for (key in frame.nodes){
    old_node = this.nodes[key];
    if (old_node){
      if (this.useContext) {
        // Always rename to pick up asynchronously computed info
        new_node = Functions.rename(frame.nodes[key]);
      } else {
        new_node = frame.nodes[key];
      }
      old_node.fun_name = new_node.fun_name;
      old_node.num_calls += new_node.num_calls;
      old_node.duration += new_node.duration;
      old_node.mem_delta += new_node.mem_delta;
      old_node.child_duration += new_node.child_duration;
      old_node.nest_level = Math.floor(((old_node.nest_level * old_node.num_calls) + (new_node.nest_level * new_node.num_calls)) / (old_node.num_calls + new_node.num_calls));
    } else {
      if (this.useContext) {
        this.nodes[key] = Functions.rename(frame.nodes[key]);
      } else {
        this.nodes[key] = frame.nodes[key];
      }
    }
    //take the age counter to zero, this is a 'live' node now.
    this.ageNodes[key] = 0;
  }
};

Aggregate.prototype.broadcast = function broadcast(){
  var msg = {
    type: "nodejs",
    version: version,
    // run_id: 'to be set',
    load_avg: os.loadavg(), //array of 1, 5, and 15 minute load averages
    cpus: os.cpus(),
    timestamp: util.unixTimeSec(),
    data: {
      nodes: values(this.nodes),
      links: values(this.links)
    }
  };
  
  this.emit('data', msg);
  this.resetTraceEvents();
};

Aggregate.prototype.resetTraceEvents = function resetTraceEvents(){
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
      nodes[key].nest_level = 0;
      nodes[key].child_duration = 0;
      ageNodes[key]++;
    }
  }
};
