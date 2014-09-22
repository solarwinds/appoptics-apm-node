//
// Load our various dependencies
//
var MongoDB = require('mongodb').MongoClient
var redis = require('redis').createClient()
var https = require('https')
var http = require('http')

//
// Load task file
//
exports.load = function (name) {
  return require('../test/' + name)
}

//
// All database interfaces are expose through a context object
//
exports.getContext = function (context, done) {
  context = context || {}
  parallel([
    //
    // Some stuff works as-is
    //
    function (done) {
      context.redis = redis
      context.https = https
      context.http = http
      done()
    },

    //
    // Mongo needs to connect and add the db to the context
    //
    function (done) {
      MongoDB.connect('mongodb://localhost/test', function (err, db) {
        if (err) return done(err)
        context.mongo = db
        done()
      })
    }
  ], function (err) {
    done(err, context)
  })
}

//
// Helper to connect to databases in parallel before adding to context
//
function parallel (tasks, done) {
  var pending = tasks.length
  function taskComplete (err) {
    if (err) throw err
    if ( ! --pending) done()
  }

  tasks.forEach(function (task) {
    task(taskComplete)
  })
}
