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
var readFile = require('./file').read;
var Aggregate = require('../tracer/aggregate');
var log = require('./util').log;
var Inspektor = require('../inspektor/domains');

function Proxy(){
  log('concurix.proxy: starting');
  
  this.listenParentProcess();
  
  var ipcSocketPath = process.env.CX_IPC_SOCKET_PATH;
  this.ipcServer = new IpcServer(ipcSocketPath);
  this.ipcServer.on('data', this.onIpcMsg.bind(this));

  var port = process.env.CX_FRONTEND_PORT;
  this.server = new WebSocketServer({port: port});
  this.server.on('data', this.onFrontendData.bind(this));
  
  Archive.init({
    accountKey: process.env.CX_ACCOUNT_KEY,
    machineName: process.env.CX_HOSTNAME,
    host: process.env.CX_ARCHIVE_HOST,
    port: process.env.CX_ARCHIVE_PORT
  });
  
  this.aggregate = new Aggregate({
    maxAge: process.env.CX_MAX_AGE,
    useContext: process.env.CX_USE_CONTEXT
  });
  
  this.aggregate.on('data', this.tracerToFrontend.bind(this));
  
  var enableDebugger = JSON.parse(process.env.CX_ENABLED_DEBUGGER);
  if (enableDebugger) {
    log('enabling debugger')
    this.inspektor = new Inspektor({
      notify: this.inspektorToFrontend.bind(this),
      debuggeePid: process.env.CX_DEBUGGEE_PID,
      v8Port: process.env.CX_V8_PORT
    });

    var self = this;
    this.server.on('no_connections', function(){
      self.inspektor.disable();
    });
  }
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
};

Proxy.prototype.cleanUp = function cleanUp(){
  this.ipcServer.close();
  this.aggregate.stop();
  this.server.close();
};

Proxy.prototype.onIpcMsg = function onIpcMsg(msg){
  switch(msg.type){
    case 'Tracer.frame': this.aggregate.frame(msg.data);
  }
};

Proxy.prototype.tracerToFrontend = function tracerToFrontend(data){
  if (!this.server) return;
    
  var json = JSON.stringify(data);
  //HACK: to avoid calling JSON.stringify twice use string concatenation
  var str = '{"method":"Concurix.traces","result":' + json + '}';  
  this.server.broadcast(str);

  Archive.archive(json);
};

Proxy.prototype.inspektorToFrontend = function inspektorToFrontend(data){
  // log('============================== proxy -> frontend');
  // log(data)
  this.server.broadcast(JSON.stringify(data));
}

Proxy.prototype.onFrontendData = function onFrontendData(data){
  var method = data.method || "";
  
  var methods = method.split('.');
  var domain = methods[0];
  
  if (domain === 'Concurix') {
    this.handleConcurixCmd(methods[1], data)
  } else {
    if (!this.inspektor) return;
    this.inspektor.handleCommand(data);
  }
}

// TODO: find a better place for this code
Proxy.prototype.handleConcurixCmd = function handleConcurixCmd(cmd, data){
  if (cmd === 'getCode'){
    var name = data.params.name;
    var self = this;
    readFile(name, function(content, err){
      var rsp = {
        method: data.method,
        result: {
          content: null
        }
      }
      if (err){
        rsp.error = err;
      } else {
        rsp.result.content = content;
      }
      var json = JSON.stringify(rsp);
      self.server.broadcast(json);
    })
  }
  
}

new Proxy();
