var _ = require('underscore');
var AWS = require('aws-sdk');
var request = require('request');
var async = require('async');
var tmp = require('tmp');
var fs = require('fs');
var mime = require('mime');
var AdmZip = require('adm-zip');

var s3 = new AWS.S3({apiVersion: '2006-03-01'});

var Create = function(params, reply) {
  var put = function(body, contentType) {
    var p = _.clone(params.Destination);
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
  var putEntry = function(zip, entry) {
    return function(callback) {
      var p = _.clone(params.Destination);
      p.Key += entry.entryName;
      p.Body = zip.readFile(entry)
      p.ContentType = mime.lookup(entry.entryName);
      console.log("Put Entry:", p.Key);
      s3.putObject(p, callback);
    }
  };
  var applyParameters = function(content, regex, parameters) {
    if ( _(parameters).isEmpty() ) return content;
    if ( !regex ) regex = "\\$\\{([A-Z]+)\\}";
    content = content.toString();
    regex = new RegExp(regex, "g");

    return content.replace(regex, function(match) {
      var replacement = regex.exec(match)[1];
      if ( replacement && parameters[replacement] ) {
        return parameters[replacement];
      } else {
        return match;
      }
    });
  };
  var getExternalSource = function(source, callback) {
    if (source.Url) {
      request({ url: source.Url, encoding: null }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
          callback(null, body, response.headers['content-type']);
        } else {
          console.error(error, response ? response.statusCode : "", body);
          callback(error);
        }
      });
    } else if (source.S3) {
      s3.getObject(source.S3, function(err, data) {
        if (!err) {
          callback(null, data.Body.toString(), data.ContentType);
        } else {
          console.error("S3 Get error:", err);
          callback(err);
        }
      });
    } else {
      console.log("Source:", source);
      callback("Can't get external source from this configuration !");
    }
  }
  if (params.Source.Url || params.Source.S3) {
    getExternalSource(params.Source, function(err, body, contentType) {
      if (err) return reply(err);

      if (params.Source.Unzip == "true") {
        var toUpload = [];
        tmp.file( function(err, path, fileDescriptor, cleanupCallback) {
          fs.appendFileSync(path, new Buffer(body, "utf-8"));
          var zip = new AdmZip(path);
          zip.getEntries().forEach( function(entry) {
            if (!entry.isDirectory) {
              toUpload.push( putEntry(zip, entry) );
            }
          });
          console.log("Upload", toUpload.length, "files");
          async.parallel(toUpload, function(err, result) {
            cleanupCallback();
            if (err) {
              console.error(err);
              reply(err);
            } else {
              reply(null, params.Destination.Bucket + "/" + params.Destination.Key, params.Destination);
            }
          });
        });
      } else {
        body = applyParameters(body, params.Source.ParametersRegex, params.Source.Parameters);
        put(body, contentType);
      }
    });
  } else if(params.Source.Body) {
    put(params.Source.Body, params.Source.Body.ContentType || "text/plain");
  } else if(params.Source.Json) {
    put(JSON.stringify(params.Source.Json), "application/json");
  } else {
    console.log("Source:", source);
    reply("Can't get source from this configuration !");
  }
};

var Update = function(physicalId, params, oldParams, reply) {
  Delete(physicalId, oldParams, function(err) {
    if (err) return reply(err);
    Create(params, reply);
  });
};

var Delete = function(physicalId, params, reply) {
  var deleteObject = function(object) {
    return function(callback) {
      var p = {
        Bucket: params.Destination.Bucket,
        Key: object.Key
      };
      s3.deleteObject(p, callback);
    }
  }
  var p = {
    Bucket: params.Destination.Bucket,
    Prefix: params.Destination.Key
  };
  s3.listObjectsV2(p, function(err, data) {
    if (err) {
      console.error(err);
      reply(err);
    } else {
      var toDelete = [];
      data.Contents.forEach( function(object) {
        toDelete.push( deleteObject(object) );
      });
      async.parallel( toDelete, function(err) {
        if (err) {
          console.error(err);
          reply(err);
        } else {
          reply(null, physicalId);
        }
      })
    }
  });
};

exports.Create = Create;
exports.Update = Update;
exports.Delete = Delete;
