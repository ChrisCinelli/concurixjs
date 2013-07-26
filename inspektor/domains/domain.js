// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var EventEmitter = require('events').EventEmitter;

function Domain(){
  
}

Domain.prototype = Object.create(EventEmitter.prototype);

Domain.prototype.handleCommand = function handleCommand(method, cmd){
  if (typeof this[method] === 'function'){
    this[method].call(this, cmd);
    return;
  }
};

Domain.prototype.respond = function respond(cmdId, result, error){
  var response = {
    id: cmdId,
  }
  
  if (result) response.result = result;
  if (error) response.error = error;
  
  this.emit('data', response);
};

Domain.prototype.notify = function notify(noti){
  this.emit('data', noti);
};

module.exports = Domain;