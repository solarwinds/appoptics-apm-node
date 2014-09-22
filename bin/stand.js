//
// Load our various dependencies
//
var MongoDB = require('mongodb').MongoClient
var redis = require('redis').createClient()
var postgres = require('pg')
var https = require('https')
var http = require('http')
var tv = require('..')

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
      context.tv = tv
      done()
    },

    //
    // Mongo needs to connect and add the db to the context
    //
    function (done) {
      var address = 'mongodb://localhost/test'
      MongoDB.connect(address, function (err, db) {
        if (err) return done(err)
        context.mongo = db
        context.mongo.address = address
        done()
      })
    },

    //
    // Postgres also needs to connect and add db to context
    //
    function (done) {
      var pg = context.pg = postgres
      pg.address = 'postgres://postgres@localhost/test'
      var client = new pg.Client(pg.address)
      client.connect(function (err) {
        if (err) return done(err)
        pg.db = client
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
