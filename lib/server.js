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

var EventEmitter = require('events').EventEmitter;
var ws = require('ws');
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
    this.server.on('connection', this.onConnection.bind(this));
  }
}

WebSocketServer.prototype = Object.create(EventEmitter.prototype);

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
    c.send(msg, function(res){
      if(res){
        log('concurix.server: error from websocket.send ', res);
      }
    });
  });
}

WebSocketServer.prototype.onMessage = function onMessage(connection, msg){
  var data = JSON.parse(msg);
  this.emit('data', data);
}

WebSocketServer.prototype.close = function close(msg){
  this.connections = [];
  if (!this.server) return;
  log('concurix.server: closing server');
  this.server.close();
  this.server = null;
}