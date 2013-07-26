// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Socket based IPC

'use strict';

var EventEmitter = require('events').EventEmitter;
var net = require('net');
var fs = require('fs');
var cxUtil = require('./util.js');
var log = cxUtil.log;

exports.Connection = Connection;
exports.Server = Server;


function Server(path){
  this.path = path;
  this.server = null;
  this.deleteSocketFile(this.create);
}

Server.prototype = Object.create(EventEmitter.prototype);

Server.prototype.deleteSocketFile = function deleteSocketFile(callback){
  var self = this;
  var path = this.path;
  fs.exists(path, function(exists){
    if (exists) {
      // previous socket exists, delete it first
      fs.unlink(path, function(err){
        if (err) throw err;
        if (callback) callback.call(self);
      });
    } else {
      if (callback) callback.call(self);
    }
  });
}

Server.prototype.create = function create(){
  if (this.server) return;
  
  var self = this;
  var server = net.createServer();
  
  server.on('connection', function(c){
    var buffer = { content: "" };
    c.on('data', function(data) {
      var frames = extractFrames(data, buffer);
      frames.forEach(function(f){
        if (!f) return;
        var obj = JSON.parse(f);
        self.emit('data', obj);
      });
    });
    c.on('close', function(data){
      buffer = null
    })
  });
  
  server.listen(this.path);
  this.server = server;
}

function extractFrames(data, buffer){
  var tailingFrame = false;
  var content = buffer.content = buffer.content.concat(data.toString());

  if (content[content.length - 1] != '\0') {
    tailingFrame = true;
  }
  var frames = content.split("\0");
  if (tailingFrame) {
    buffer.content = frames.pop();
  } else {
    buffer.content = "";
  }
  
  return frames
}

Server.prototype.close = function close(){
  if (!this.socket) return;
  this.socket.close();
  this.socket = null;
}


function Connection(path){
  this.path = path;
  this.socket = null;
  this.timer = null;
  this.buffer = null;
  this.attempts = 10;
  
  this.connect();
}

Connection.prototype = Object.create(EventEmitter.prototype);

Connection.prototype.connect = function connect(){
  this.socket = net.connect(this.path);
  this.socket.setEncoding('utf8');
  this.socket.__concurix_obj__ = true;
  
  var self = this;
  this.socket.on('error', function(e){
    self.socket = null;
    self.attempts--;
    if (self.attempts > 0){
      self.startSocketTimer();
    }
  });
  
  this.socket.on('close', function(){
    self.buffer = null;
    self.socket = null;
  });
  
  this.socket.on('connect', function(){
    this.attempts = 10;
    self.buffer = {content: ""};
    self.stopSocketTimer();
  });
  
  this.socket.on('data', function(data){
    var frames = extractFrames(data, self.buffer);
    frames.forEach(function(f){
      if (!f) return;
      var obj = JSON.parse(f);
      self.emit('data', obj);
    });
  });
}

Connection.prototype.startSocketTimer = function startSocketTimer(){
  if (this.timer) return;
  var self = this;
  this.timer = setTimeout(function(){
    self.timer = null;
    self.connect();
  }, 1000);
}

Connection.prototype.stopSocketTimer = function stopSocketTimer(){
  if (this.timer){
    clearInterval(this.timer);
    this.socketTimer = null;
  }
}

Connection.prototype.close = function close(){
  if (this.socket){
    this.socket.end();
    this.socket = null;
    this.buffer = null;
  }
}

Connection.prototype.send = function send(obj){
  if (!this.socket) return;
  var str = JSON.stringify(obj) + '\0';
  this.socket.write(str);
}