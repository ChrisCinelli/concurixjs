#!/usr/bin/env node

// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

// - https://code.google.com/p/v8/wiki/DebuggerProtocol
// - https://developers.google.com/chrome-developer-tools/docs/protocol/1.0/page
// - http://localhost:9999/inspector.html?host=localhost:9999&page=0
// - https://developer.chrome.com/trunk/extensions/debugger.html

var Ws = require('ws');
var log = require('./util.js').log;
var Domains = require('./domains');

function DebugProxy(){
  
  var env = process.env;
  this.debuggeePort = env.INSPEKTOR_DEBUGGEE_PORT;
  this.debuggeePid = env.INSPEKTOR_DEBUGGEE_PID;
  this.frontendPort = env.INSPEKTOR_FRONTEND_PORT;
  this.v8Port = env.INSPEKTOR_V8_PORT;
  
  this.debuggeeSock = null;
  this.frontendSock = null;
  
  this.domains = new Domains({
    notify: this.sendToFrontend.bind(this),
    debuggeePid: this.debuggeePid,
    v8Port: this.v8Port
  });
}

DebugProxy.prototype.onDebuggeeConnected = function onDebuggeeConnected(){
  log('onDebuggeeConnected');
    
  // start websockets server for the frontend
  this.wss = new Ws.Server({
    port: this.frontendPort
  });

  log('starting front-end server, port = ', this.frontendPort);
  console.log('proxy.pid = ', process.pid);

  this.wss.on('connection', this.onFrontendConnection.bind(this));
}

DebugProxy.prototype.onDebuggeeMessage = function onDebuggeeMessage(){
  log('onDebuggeeMessage');
}

DebugProxy.prototype.onFrontendConnection = function onFrontendConnection(socket){
  if (this.frontendSock){
    log('front-end is already connected, closing new socket');
    socket.close();
    return;
  }
  
  var self = this;
  this.frontendSock = socket;

  this.frontendSock.on('message', this.onFrontendMessage.bind(this));
  this.frontendSock.on('close', function(){
    self.frontendSock = null;
    self.domains.disable();
  });

  log('new frontend connection');
};

DebugProxy.prototype.onFrontendMessage = function onFrontendMessage(message){
    var cmd = JSON.parse(message);
    log('====================== frontend -> proxy');
    log(cmd);
    this.domains.handleCommand(cmd);    
};

DebugProxy.prototype.sendToFrontend = function sendToFrontend(obj){
  if (!this.frontendSock) return;
  log('======================== proxy -> frontend');
  log(obj);
  this.frontendSock.send(JSON.stringify(obj));
};

DebugProxy.prototype.start = function() {
  var url = 'ws://127.0.0.1:' + this.debuggeePort;
  log('debugeeSock url = ' + url);
  this.debuggeeSock = new Ws(url);
  this.debuggeeSock.on('open', this.onDebuggeeConnected.bind(this));
  this.debuggeeSock.on('message', this.onDebuggeeMessage.bind(this));
};

var proxy = new DebugProxy();
proxy.start();
