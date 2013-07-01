// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Web Socket Server to handle clients connections

'use strict';

var ws = require('ws');
var fs = require('fs');
var string = require('string');
var cxUtil = require('./util.js');
var log = cxUtil.log;
var values = cxUtil.values;

module.exports = WebSocketServer;

function WebSocketServer(options){
  this.connections = [];
  var port = options.port || 0;
  if (port > 0){
    log('concurix.server: starting on port ', port);
    this.server = ws.createServer({port: port});
    var self = this;
    this.server.on('connection', function(c) {
      self.onConnection(c);
    });
  }
}

WebSocketServer.prototype.onConnection = function onConnection(c){
  this.connections.push(c);
  var self = this;
  c.on('message', function(msg) {
    self.onMessage(c, msg);
  });
  c.on('close', function(code, msg) {
    var index = self.connections.indexOf(c);
    if( index != -1){
      self.connections.splice(index, 1);
    }
  });
}

WebSocketServer.prototype.broadcast = function broadcast(msg){
  this.connections.forEach(function(c) {
    c.send(msg);
  });
}

WebSocketServer.prototype.onMessage = function onMessage(connection, msg){
  var native_pattern = /^([^\\\/]+)\.js$/;
  var tokens = msg.split(":");
  var json;
  switch (tokens[0]) {
    case "get_code":
      var matches = tokens[1].match(native_pattern);
      if (matches != null && matches.length > 1) {
        var core_module = matches[1];
        var native_modules = process.binding('natives');
        if (native_modules[core_module]) {
          json = {type: "code", data: string(native_modules[core_module].toString()).escapeHTML().s};
          connection.send(JSON.stringify(json));
          return;
        }
      }
      fs.readFile(tokens[1], function(err, data){
        if( err ){
          json = {type: "code", error: err};
        } else {
          json = {type: "code", data: string(data.toString()).escapeHTML().s};
        }
        connection.send(JSON.stringify(json));
      });
      break;
  }
}

WebSocketServer.prototype.close = function close(msg){
  if (!this.server) return;
  log('concurix.server: closing server');
  this.server.close();
  this.server = null;
}