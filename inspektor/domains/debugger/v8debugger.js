// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var Protocol = require('_debugger').Protocol;
var net = require('net');
var EventEmitter = require('events').EventEmitter;
var log = console.log.bind(console);

function V8Debugger(v8Port, debuggeePid){
  this.v8Port = v8Port;
  this.debuggeePid = debuggeePid;
  this.debuggeeSignalled = false;
  this.enabled = false;
  this.v8running = true;
  
  this.protocol = new Protocol();
  this.protocol.onResponse = this.onV8ProtocolResponse.bind(this);
  this.connection = null;
  
  this.nextSeq = 1;
  this.queueSize = 0;
  this.queue = {};
  
  this.on('break', this.onBreak.bind(this));
  this.on('exception', this.onException.bind(this));
}

V8Debugger.prototype = Object.create(EventEmitter.prototype);

V8Debugger.prototype.resetQueue = function resetQueue(){
  this.nextSeq = 1;
  this.queueSize = 0;
  this.queue = {};
};

V8Debugger.prototype.enable = function enable(){
  this.resetQueue();
  if (this.enabled) {
    this.emit('enabled');
    return;
  }
  
  if (!this.debuggeeSignalled){
    log('sending debug signal to pid = ', this.debuggeePid);
    process.kill(this.debuggeePid, 'SIGUSR1');
    this.debuggeeSignalled = true;
    setTimeout(this.connectToV8.bind(this), 500);
  } else {
    this.connectToV8();
  }
};

V8Debugger.prototype.disable = function disable(){
  var req = this.createRequest({
    command: 'disconnect'
  });
  this.send(req);
  this.disconnectFromV8();
};


V8Debugger.prototype.connectToV8 = function connectToV8(){
  log('connecting to v8 on port = ', this.v8Port);
  this.connection = net.connect(this.v8Port);
  this.connection.setEncoding('utf8');

  this.connection.on('connect', this.onConnect.bind(this));
  this.connection.on('data', this.onConnectionData.bind(this));
  this.connection.on('close', this.onConnectionClose.bind(this));
  this.connection.on('error', this.onConnectionError.bind(this));
};

V8Debugger.prototype.disconnectFromV8 = function disconnectFromV8(){
  log('closing v8 connection');
  if (this.connection){
    this.connection.end();
  }
};

V8Debugger.prototype.onConnect = function onConnect(){
  log('connected to v8');
  this.enabled = true;
  this.emit('enabled');
  this.sendQueue();
};

V8Debugger.prototype.onV8ProtocolResponse = function onV8ProtocolResponse(response){
  var body = response.body;
  
  if('running' in body){
    this.v8running = body.running;
  }
  
  log('============================== v8 -> proxy');
  log(body);
  
  switch(body.type){
    case 'event': this.emit(body.event, body); break;
    case 'response': this.onResponse(body); break;
    default:
      log('unknown v8 response: body = ', body);
  }
};

V8Debugger.prototype.onConnectionData = function onConnectionData(data){
  // log('============================== v8 -> raw: ', (new Date()).getTime());
  this.protocol.execute(data);
};

V8Debugger.prototype.onConnectionClose = function onConnectionClose(){
  log('disconnected from v8');
  this.connection = null;
  this.enabled = false;
  this.resetQueue();
};

V8Debugger.prototype.onConnectionError = function onConnectionError(err){
  // TODO: notify front-end about the error and ask to reload
  log('v8 connection error: ', err);
  this.connection = null;
  this.enabled = false;
  this.resetQueue();
};

V8Debugger.prototype.createRequest = function createRequest(data){
  var req = { 
    seq: 0,
    type: "request",
    command: null,
    arguments: null
  };
  
  Object.keys(data).forEach(function(k){
    req[k] = data[k];
  });
  return req;
}

V8Debugger.prototype.send = function send(data, callback){
  data.seq = this.nextSeq;
  this.queue[data.seq] = {callback: callback, data: data, sent: false};
  this.nextSeq++;
  
  this.sendQueue();
  
  if (this.queueSize > 50){
    log('WARNING: queue overflow: nextSeq = ', this.nextSeq);
  }
};

V8Debugger.prototype.sendQueue = function sendQueue(){
  if (!this.enabled) return;
  var conn = this.connection;
  var queue = this.queue;
  var keys = Object.keys(queue);
  keys.forEach(function(sid){
    var q = queue[sid];
    if (q.sent) return;
    log('============================ proxy -> v8');
    log(q.data);
    var str = JSON.stringify(q.data);
    str = 'Content-Length: ' + str.length + '\r\n\r\n' + str;
    conn.write(str);
    q.sent = true;
  });
  this.queueSize = keys.length;
};

V8Debugger.prototype.onResponse = function onResponse(rsp){  
  if (!('request_seq' in rsp)){
    // request most likely failed, TODO: try to clear the queue
    log('v8 response without request_seq, rsp.command = ', rsp.command);
    return;
  }
  
  var q = this.queue[rsp.request_seq];
  if (!q){
    log('v8 response without corresponding command, rsp.command = ', rsp.command);
    return;
  }
  
  if (rsp.success){
    if (q.callback) q.callback(rsp);
  } else {
    if (q.callback) q.callback(rsp, new Error(rsp.message));
  }
  
  delete this.queue[rsp.request_seq];
};

V8Debugger.prototype.onBreak = function onBreak(rsp){
  log('v8 break event')
  this.v8running = false;
};

V8Debugger.prototype.onException = function onException(rsp){
  log('v8 exception event');
  this.v8running = false;
};

module.exports = V8Debugger;
