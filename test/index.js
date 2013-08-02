// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
// 
// Unit and Functional Tests

var assert = require('assert');
var cluster = require('cluster');
var concurix = require('../index.js');
var cxUtil = require('../tracer/util.js');
var log = cxUtil.log;
var sleep = cxUtil.sleep;

var tests = {}

tests.testWrapper = function testWrapper(doneCallback){
  
  var wrap = require('../tracer/wrapper.js').wrap;
  
  //define a guinea pig function
  function addOne(n){
    return n + 1;
  }
  addOne.prop1 = 'custom property';
  
  //wrap the function
  var wrapped = wrap(addOne, null, function(trace){
    assert(trace.functionName === addOne.name);
    assert(trace.args.length === 1);
  }, {});

  assert(wrapped(3) === 4);
  assert(addOne.prototype === wrapped.prototype);
  assert(addOne.prop1 === wrapped.prop1);
  doneCallback();
}

tests.testTracer = function testTracer(doneCallback){
  
  
  //check that filtered modules are not wrapped
  var util = require('util'); //should not be wrapped
  assert(!util.inspect.__concurix_wrapped_by__);
  
  //load module and check that exports are wrapped
  var testModule = require('./test_module');
  assert(testModule.apiFunc.name === 'apiFunc');
  assert(testModule.subModule.apiFunc.name === 'apiFunc');
  assert(testModule.callSubApiFunc() == 'apiFunc');

  //check that callbacks and return values are wrapped
  var callback = function dummyCallback(){
   return 'dummyCallback';
  }
  var ret = testModule.apiFuncWithCallback(callback);
  assert(ret.name === 'dummyCallback');
  assert(ret.__concurix_wrapper_for__);
  assert(ret() === callback());
  assert(callback.__concurix_wrapped_by__ === ret);
  doneCallback();
}

tests.testTracerWithIheritance = function testTracerWithIheritance(doneCallback){

  var testModule = require('./test_module');
  var Service = testModule.inherit({
    constructor: function Service(config) {
      this.client = new this.constructor.Client(config);
    }
  });
  
  var service = testModule.defineService(Service);
  obj = new service();
  
  var AWS = require('aws-sdk');
      
  AWS.config.update({
    accessKeyId: 'dummyAccessId',
    secretAccessKey: 'dummyaccessKey'
  });
  AWS.config.update({region: 'us-east-1'});

  ec2 = new AWS.EC2();
  
  var callback = function testCallback(err, data){
    console.log('aws callback');
    doneCallback();
    console.log(err);
    // console.log(data);
  }
  
  ec2.client.describeInstances({}, callback);  
}

tests.testEventEmitterInheritance = function testEventEmitterInheritance(doneCallback){
  var testModule = require('./test_module');
  var Agent = testModule.Agent;
  var agent = new Agent({});
  doneCallback();
}

tests.testEventEmitterInheritance = function testEventEmitterInheritance(doneCallback){
  var testModule = require('./test_module');
  var Agent = testModule.Agent;
  var agent = new Agent({});
  doneCallback();
}

////////////////////////////////////////////////
var tracer = concurix({
  forceRestart: false,
  archiveHost: null,
})
tracer.start();
sleep(200);

var proto = Object.getPrototypeOf(module);
var origRequire = proto.require;

function testEngine(testSteps){
  // try {
    if (testSteps.length == 0) {
      sleep(200);
      log('====== DONE ======');
      tracer.stop();
      return;
    }
    
    //restore require
    proto.require = origRequire;
    require.cache = {};
    
    var step = testSteps[0];
    log('====== %s ======', step);
    tests[step](function doneCallback(){
      console.log('       PASSED');
      testEngine(testSteps.slice(1));
    });
  // } catch(e) {
  //   console.log('FAILED with ', e);
  //   testEngine(testSteps.slice(1));
  // }
}

//start testing
testEngine(Object.keys(tests));
