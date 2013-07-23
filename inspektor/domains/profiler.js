// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var Domain = require('./domain.js');

function Profiler(config){

}

var proto = Profiler.prototype = Object.create(Domain.prototype);

// chrome devtools protocol commands
module.exports = Profiler;