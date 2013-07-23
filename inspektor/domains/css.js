// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var Domain = require('./domain.js');

function CSS(config){

}

var proto = CSS.prototype = Object.create(Domain.prototype);

// chrome devtools protocol commands
proto.getSupportedCSSProperties = function getSupportedCSSProperties(cmd){
  //this.respond(cmd.id, { cssProperties: [] });
}

proto.enable = function enable(cmd){
  //do nothing
}

proto.disable = function disable(cmd){
  //do nothing
}

module.exports = CSS;