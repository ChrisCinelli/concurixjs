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

var AWS          = require('aws-sdk');

var s3BucketName = undefined;
var s3KeyPrefix  = undefined;
var s3Handler    = undefined;

var snsArn       = undefined;
var snsHandler   = undefined;

exports.init     = init;
exports.archive  = archive;

var config       = undefined;

function init(params, callback) {
  config = params || {};  
  if (config.accountKey && config.machineName && config.host && config.port) {
    acquireAwsCredentials(callback);
  }
}

function refreshAwsCredentials() {
  acquireAwsCredentials();
}

// Invoke a Concurix web-api to obtain AWS credentials
function acquireAwsCredentials(userCallback) {
  function requestCallback(response) {
    var str = '';

    // This is an 'OK' response.  Set up handlers to be informed about the content
    if (response.statusCode === 200) {
      response.on('data',  function(chunk) { str += chunk; });
      response.on('end',   function()      { start(str);   });

      response.on('error', function(err)   { console.log('\n\nErr:  ' + err); });
    } else {
      console.error('Failed to get Trace Session Data');
      console.log(require('util').inspect(response));

      if (userCallback)
        userCallback('Failed');
    }
  }

  function start(str) {
    var response = JSON.parse(str);

    s3BucketName = response.s3Bucket;
    s3KeyPrefix  = response.s3Prefix;
    snsArn       = response.snsArn;

    AWS.config   = new AWS.Config({
                                    accessKeyId:     response.AccessKeyId,
                                    sessionToken:    response.SessionToken,
                                    secretAccessKey: response.SecretAccessKey,
                                    region:          response.Region
                                 });

    s3Handler    = new AWS.S3();
    snsHandler   = new AWS.SNS();

    // Schedule an event to refresh the credentials about 1 minute
    // before the new credentials expire
    setTimeout(refreshAwsCredentials, response.DurationMS - 60 * 1000);

    if (userCallback)
      userCallback('Success');
  }

  var options     = {
                      host:   config.host,
                      port:   config.port,
                      path:   '/v1/' + config.accountKey + '/new_run/' + config.machineName,
                      method: 'POST'
                    };

  require('http').request(options, requestCallback).end();
}

function archive(json) {
  if (!s3Handler) return;
  var unixMsec = (new Date()).getTime();
  var unixSec  = Math.floor(unixMsec / 1000);
  var key      = s3KeyPrefix + '/' + unixSec + '.json';

  // Write the data to S3
  s3Handler.putObject({Bucket: s3BucketName, Key: key, Body: json}, function(putErr, putData) {
    if (!putErr) {
      var message = JSON.stringify({ type: 'stream', key: key });
      var params  = { TopicArn: snsArn, Message: message };

      // Publish a notification for the new trace
      snsHandler.client.publish(params, function(err, data) {
        if (err) {
          console.log('concurix.archive: trace notification error ', err, data);
        }
      });
      
    } else {
      console.log('Failed to write: ' + putErr);
    }
  });
}
