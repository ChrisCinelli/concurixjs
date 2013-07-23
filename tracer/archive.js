// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
//
// Sends tracing data to Concurix's S3 instances in JSON format.
//

'use strict';

var needle = require('needle');
var m = require('moment');
var os = require('os');
var underscore = require('underscore');
var AWS = require('aws-sdk');
var cxUtil = require('./util.js');
var log = cxUtil.log;

var batchRuns = [];
var runInfo = null;

var sns = null;


exports.archive = function(json, url){
  var data;
  updateRunInfo(function(){doArchive(json);}, url);
}

//TODO need to deal with config files.
function updateRunInfo(callback, url){
  //if we don't have a run or if the current run has expired, go get a new run id.
  if( !runInfo || runInfo.fields.expires < m().unix() ){
    //send off any queued batch runs
    sendBatch();
    needle.get(url, function(err, response, body){
      if(!err){
        runInfo = body;
        initAWS(runInfo);
        callback();        
      } else {
        log("concurix.archive: error getting new permissions from concurix.com: ", err);
      }
    });
  } else {
    callback();
  }
}

function initAWS(runInfo){
  var c = runInfo.credentials;
  AWS.config = new AWS.Config({
    accessKeyId: c.AccessKeyId,
    sessionToken: c.SessionToken,
    secretAccessKey: c.SecretAccessKey,
    region: c.region
  });
  
  sns = new AWS.SNS();
}

function doArchive(json){
  var date = m().unix().toString();
  var filename = date + ".json";
  var data = underscore.pick(runInfo.fields, 'AWSAccessKeyId', 'signature', 'policy');
  data.key = runInfo.run_id + "/" +  filename;
  data.file = {
    content_type: 'application/json',
    'filename': filename,
    value: json
  }
  
  needle.post(runInfo.trace_url, data, {multipart: true}, function(err, res, body){
    var params= {};
    if( !err ){
      params.TopicArn = runInfo.sns_arn;
      params.Message = JSON.stringify({
        type: "stream",
        key: data.key
        });
      sns.client.publish(params, function(err, data){
        if(!err) {
          checkBatch(date);
        } else {  
          log("concurix.archive: trace notification error ", err, data);
        }
      });
    } else {
      log("concurix.archive: error s3 post: ", err);
    }
  });
}

//TODO: the duration for batch analysis should be configurable.  leaving at 
//10 for now so we can more easily test.
function checkBatch(date){
  batchRuns.push(date);
  if( batchRuns.length >= 10) {
    sendBatch();
  }
}

function sendBatch() {
  if(batchRuns.length)
  {
    var params = {
      TopicArn: runInfo.sns_arn,
      Message: JSON.stringify({
        type: "batch",
        run_id: runInfo.run_id,
        dates: batchRuns
      })
    };
    batchRuns = [];
    sns.client.publish(params, function(err, data){
      if(err){
        log("concurix.archive: error sending trace information: ", err, data);
      }
    });
  }
}
