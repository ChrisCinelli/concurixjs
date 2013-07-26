#!/usr/bin/env node

// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Links together front-end, tracer, debugger, archive

'use strict';

var IpcServer = require('./ipc').Server;
var WebSocketServer = require('./server');
var Archive = require('./archive');
var Aggregate = require('../tracer/aggregate');
var log = require('./util').log;

// var Server = require('./server');

function Proxy(){
  log('concurix.proxy: starting');
  
  this.listenParentProcess();
  
  var ipcSocketPath = process.env.CX_IPC_SOCKET_PATH;
  this.ipcServer = new IpcServer(ipcSocketPath);
  this.ipcServer.on('data', this.onIpcMsg.bind(this));

  var port = process.env.CX_FRONTEND_PORT;
  this.server = new WebSocketServer({port: port});
  
  var accountKey = process.env.CX_ACCOUNT_KEY;
  var hostname = process.env.CX_HOSTNAME;
  var archiveSessionUrl = process.env.CX_ARCHIVE_SESSION_URL;
  if (accountKey && hostname && archiveSessionUrl){
    this.archiveUrl = [archiveSessionUrl, accountKey, hostname].join('/');
  }
    
  this.aggregate = new Aggregate({
    maxAge: process.env.CX_MAX_AGE,
    useContext: process.env.CX_USE_CONTEXT
  });
  
  this.aggregate.on('data', this.sendTracesToFrontend.bind(this));
}

Proxy.prototype.listenParentProcess = function listenParentProcess(){
  var self = this;
  process.on('SIGTERM', function(){
    self.cleanUp();
    process.exit();
  });

  process.on('disconnect', function() {
    log('concurix.proxy: parent process crashed');
    self.cleanUp();
    process.exit();
  });
}

Proxy.prototype.cleanUp = function cleanUp(){
  this.ipcServer.close();
  this.aggregate.stop();
  this.server.close();
}

Proxy.prototype.onIpcMsg = function onIpcMsg(msg){
  switch(msg.type){
    case 'Tracer.frame': this.aggregate.frame(msg.data);
  }
}

Proxy.prototype.sendTracesToFrontend = function sendTracesToFrontend(data){
  if (!this.server) return;
  
  log('sendTracesToFrontend')
  log(data)
  var json = JSON.stringify(data);
  this.server.broadcast(json);

  if (this.archiveUrl){
    Archive.archive(json, this.archiveUrl);
  }
}

new Proxy();
