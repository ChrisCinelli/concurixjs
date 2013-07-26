// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// File system routines

var fs = require('fs');
var string = require('string');
var native_pattern = /^([^\\\/]+)\.js$/;
var native_modules = process.binding('natives');

module.exports.read = read;

function read(name, cb){
  var matches = name.match(native_pattern);
  
  if (matches != null && matches.length > 1) {
    var core_module = matches[1];    
    if (native_modules[core_module]) {
      var content = string(native_modules[core_module].toString()).escapeHTML().s;
      cb(content);
      return;
    }
  }
  
  fs.readFile(name, function(err, data){
    if( err ){
      cb(null, err);
    } else {
      var content = string(data.toString()).escapeHTML().s;
      cb(content);
    }
  });
}
    
    
    
