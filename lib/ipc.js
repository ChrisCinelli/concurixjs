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

module.exports = Ipc;

function Ipc(options){
  this.ipcSocketPath = options.ipcSocketPath;
  this.deleteSocketFile(this.openSocket);
}

Ipc.prototype = Object.create(EventEmitter.prototype);

Ipc.prototype.deleteSocketFile = function deleteSocketFile(callback){
  var self = this;
  var path = this.ipcSocketPath;
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

Ipc.prototype.openSocket = function openSocket(callback){
  if (this.socket) return;
  
  var self = this;
  var socket = net.createServer();
  socket.on('connection', function(c){
    var buffer = { content: "" };
    c.on('data', function(data) {
      self.onData(data, buffer);
    });
    c.on('close', function(data){
      buffer.content = "";
    })
  });
  
  socket.listen(this.ipcSocketPath);
  this.socket = socket;
}

Ipc.prototype.onData = function onData(data, buffer){
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
  
  var self = this;
  frames.forEach(function(frame) {
    if (!frame) return;
    var msg = JSON.parse(frame);
    self.emit('msg', msg);
  });
}

Ipc.prototype.close = function close(){
  if (!this.socket) return;
  log("concurix.ipc: closing socket server");
  this.socket.close();
  this.socket = null;
}


// t = function connectSocket(){
//   if (this.socket) return;
//   var self = this;
//   
//   // if (!fs.existsSync(this.config.ipcSocketPath)){
//   //   self.startSocketTimer();
//   //   return;
//   // }
//   
//   var socket = net.connect(self.config.ipcSocketPath);
//   self.socket = socket;
//   self.socket.__concurix_obj__ = true;
//   
//   socket.on('error', function(e){
//     self.socket = null;
//     self.startSocketTimer();
//   });
//   
//   socket.on('close', function(){
//     self.socket = null;
//   });
//   
//   socket.on('connect', function(){
//     self.stopSocketTimer();
//   });
// }
// 
// Agent.prototype.closeSocket = function closeSocket(){
//   if (this.socket){
//     this.socket.end();
//     this.socket = null;
//   }
// }
// 
// Agent.prototype.startSocketTimer = function startSocketTimer(){
//   if (this.socketTimer) return;
//   var self = this;
//   this.socketTimer = setTimeout(function(){
//     self.socketTimer = null;
//     self.connectSocket();
//   }, 1000);
// }
// 
// Agent.prototype.stopSocketTimer = function stopSocketTimer(){
//   if (this.socketTimer){
//     clearInterval(this.socketTimer);
//     this.socketTimer = null;
//   }
// }