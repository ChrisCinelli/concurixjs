// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var log = require('./../util.js').log;

function Domains(config){
  var domainsList = ['Domain', 'Debugger', 'CSS', 'Network', 'Page', 'Console', 'Inspector', 'Profiler'];
  
  var domains = this.domains = {};
  var notify = config.notify;
  var self = this;
  
  domainsList.forEach(function(name){
    var constr = require('./' + name.toLowerCase());
    var dmn = new constr(config);
    dmn.on('data', notify);
    domains[name] = dmn;
  });
  
  // TODO: can runtime be in its own module?
  // forwarding all Runtime commands to Debugger
  domains['Runtime'] = domains['Debugger'];
}

Domains.prototype.handleCommand = function handleCommand(cmd){
  var domains = this.domains;
  var methods = cmd.method.split('.');
  var domain = methods[0];
  var handler = domains[domain] || domains['Domain'];
  handler.handleCommand.call(handler, methods[1], cmd);
}

Domains.prototype.disable = function disable(){
  this.domains['Debugger'].disable();
}

module.exports = Domains;
