var AWS = require('aws-sdk');
var request = require('request');

var s3 = new AWS.S3({apiVersion: '2006-03-01'});

var Create = function(params, reply) {
  var put = function(body, contentType) {
    var p = params.Destination;
    p.Body = body;
    p.ContentType = contentType;
    s3.putObject(p, function(err, data) {
      if (err) {
        console.error(err);
        reply(err);
      } else {
        reply(null, p.Bucket + "/" + p.Key, { "Bucket": p.Bucket, "Key": p.Key });
      }
    });
  }
  if (params.Source.Url) {
    request({ url: params.Source.Url, encoding: null }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        put(body, response.headers['content-type']);
      } else {
        console.error(error, response.statusCode, body);
        reply(error);
      }
    });
  } else if(params.Source.Body) {
    put(params.Source.Body, "text/plain");
  } else if(params.Source.Json) {
    put(JSON.stringify(params.Source.Json), "application/json");
  }
};

var Update = function(physicalId, params, oldParams, reply) {
  Delete(physicalId, oldParams, function(err) {
    if (err) return reply(err);
    Create(params, reply);
  });
};

var Delete = function(physicalId, params, reply) {
  var p = {
    Bucket: params.Destination.Bucket,
    Key: params.Destination.Key
  };
  s3.deleteObject(p, function(err, data) {
    if (err) {
      console.error(err);
      reply(err);
    } else {
      reply(null, physicalId);
    }
  });
};

exports.Create = Create;
exports.Update = Update;
exports.Delete = Delete;
