var debug = require('debug')('node-oboe:probes:mongodb')
var Layer = require('../layer')
var Event = require('../event')
var oboe = require('..')

var requirePatch = require('../require-patch')

var slice = Array.prototype.slice

function identify (db_command) {
  var config = db_command.db.serverConfig
  var data = {
    Flavor: 'mongodb',
    Database: db_command.db.databaseName,
    RemoteHost: config.host + ':' + config.port
  }

  // Get collection name, parsing out db name
  var reg = new RegExp('^' + (data.Database + '.').replace('.', "\\."))
  data.Collection = db_command.collectionName.replace(reg, '')

  // Add limit data, where present
  if (db_command.numberToReturn !== -1) {
    data.Limit = db_command.numberToReturn
  }

  // Interpret query structure
  var query = db_command.query

  // If it has an insert key, it is an insert command
  if (query.hasOwnProperty('insert')) {
    data.QueryOp = 'insert'
    data.Query = query.documents
    data.Collection = query.insert

  // If it has an update key, it is an update command
  } else if (query.hasOwnProperty('update')) {
    data.QueryOp = 'update'
    data.Query = query.updates
    data.Collection = query.update

  // If it has a delete key, it is a delete command
  } else if (query.hasOwnProperty('delete')) {
    data.QueryOp = 'delete'
    data.Query = query.deletes
    data.Collection = query.delete

  // If no other type, it is a find
  } else {
    data.QueryOp = 'find'
    data.Query = query
  }

  if (data.Query && typeof data.Query !== 'string') {
    data.Query = JSON.stringify(data.Query)
  }

  return data
}

module.exports = function (mongodb) {
  // Patch mongo with CLS binds
  requirePatch.disable()
  require('cls-mongodb')(oboe.requestStore)
  requirePatch.enable()

  var operations = [
    '_executeQueryCommand',
    '_executeInsertCommand',
    '_executeUpdateCommand',
    '_executeRemoveCommand'
  ]

  operations.forEach(function (name) {
    var cmd = mongodb.Db.prototype[name]

    mongodb.Db.prototype[name] = function () {
      var args = slice.call(arguments)
      var callback = args.pop()
      var run = cmd.bind.apply(cmd, [this].concat(args))
      var last = Layer.last

      if ( ! last) {
        debug('skipping')
        return run(callback)
      }
      
      debug('building layer')
      var layer = last.descend('mongodb', identify(args[0]))
      return layer.run(function (wrap) {
        return run(wrap(callback))
      })
    }
  })

  return mongodb
}
