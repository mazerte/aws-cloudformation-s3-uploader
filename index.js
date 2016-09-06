var CfnLambda = require('cfn-lambda');
var AWS = require('aws-sdk');

var Uploader = require('./lib/uploader');

function S3UploaderHandler(event, context) {
  var S3Uploader = CfnLambda({
    Create: Uploader.Create,
    Update: Uploader.Update,
    Delete: Uploader.Delete,
    SchemaPath: [__dirname, 'src', 'schema.json']
  });
  // Not sure if there's a better way to do this...
  AWS.config.region = currentRegion(context);

  return S3Uploader(event, context);
}

function currentRegion(context) {
  return context.invokedFunctionArn.match(/^arn:aws:lambda:(\w+-\w+-\d+):/)[1];
}

exports.handler = S3UploaderHandler;
