var debug = require('debug')('node-oboe:probes:mongodb')
var Layer = require('../layer')
var Event = require('../event')
var oboe = require('..')

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
  var _executeQueryCommand = mongodb.Db.prototype._executeQueryCommand

  mongodb.Db.prototype._executeQueryCommand = function (db_command, options, callback) {
    var self = this

    function run () {
      return _executeQueryCommand.call(
        self,
        db_command,
        options,
        oboe.requestStore.bind(callback)
      )
    }

    if ( ! oboe.tracing || ! Layer.last) {
      return run()
    }

    var layer = Layer.last.descend('mongodb', identify(db_command))
    return layer.run(function (wrap) {
      callback = wrap(callback)
      return run()
    })
  }

  return mongodb
}
