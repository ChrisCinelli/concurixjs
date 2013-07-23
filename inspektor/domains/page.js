// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var Domain = require('./domain.js');

function Page(config){

}

var proto = Page.prototype = Object.create(Domain.prototype);

proto.handleCommand = function handleCommand(method, cmd){
  if (typeof this[method] === 'function'){
    this[method].call(this, cmd);
    return;
  }
  
  // need to loopback dummy responses in order to load the front-end
  this.respond(cmd.id, { result: false });  
}

// chrome devtools protocol commands
proto.enable = function enable(cmd){
  //do nothing
}

proto.getResourceTree = function getResourceTree(cmd){
  //do nothing
}

module.exports = Page;