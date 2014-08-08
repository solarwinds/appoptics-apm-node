var debug = require('debug')('node-oboe:probes:mongodb')
var requirePatch = require('../require-patch')
var Layer = require('../layer')
var Event = require('../event')
var oboe = require('..')

function argsToArray (args) {
  var length = args.length
  var res = []
  var i = 0
  for (; i < length; i++) {
    res[i] = args[i]
  }
  return res
}

function filterProps (obj, props) {
  var res = {}
  for (var key in obj) {
    if (obj.hasOwnProperty(key) && !~props.indexOf(key)) {
      res[key] = obj[key]
    }
  }
  return res
}

/**
 * Support checklist:
 * - command
 * o count
 * o create_collection
 * o create_index (Should indexes be passed in place of Query?)
 * o distinct
 * o drop
 * o drop_collection
 * o drop_index
 * o drop_indexes
 * - ensure_index (No such query, compound of index_information and create_index)
 * o find
 * o find_and_modify
 * o group
 * o index_information
 * o inline_map_reduce (No such query, does not appear to exist...)
 * o insert
 * o map_reduce
 * o options (No such query, must patch abstract interface)
 * o reindex
 * o remove
 * o rename
 * - save (No such query, compound of insert and update)
 * - sort (No such query, there's a sorting option, if that is what it's for)
 * o update
 */
function identify (db_command) {
  // debug('db_command is', filterProps(db_command, ['db']))
  var config = db_command.db.serverConfig
  var data = {
    Flavor: 'mongodb',
    Database: db_command.db.databaseName,
    RemoteHost: config.host + ':' + config.port
  }

  // Get collection name, parsing out db name
  var reg = new RegExp('^' + (data.Database + '.').replace('.', "\\."))
  data.Collection = db_command.collectionName.replace(reg, '')

  // Don't identify namespace modifications
  if (db_command.collectionName === (data.Database + '.system.namespaces')) {
    return false
  }

  // Add limit data, where present
  if (db_command.numberToReturn !== -1) {
    data.Limit = db_command.numberToReturn
  }

  // Interpret query structure
  var query = db_command.query

  // If it has a drop key, it is a drop_collection command
  if (query.hasOwnProperty('dropDatabase')) {
    data.QueryOp = 'drop'

  // If it has a create key, it is a create_collection command
  } else if (query.hasOwnProperty('drop')) {
    data.QueryOp = 'drop_collection'
    data.Collection = query.drop.replace(reg, '')

  // If it has a create key, it is a create_collection command
  } else if (query.hasOwnProperty('create')) {
    data.QueryOp = 'create_collection'
    data.Collection = query.create.replace(reg, '')

  // If it has a renameCollection key, it is a rename command
  } else if (query.hasOwnProperty('renameCollection')) {
    data.QueryOp = 'rename'
    data.New_Collection_Name = query.to.replace(reg, '')
    data.Collection = query.renameCollection.replace(reg, '')

  // If it has a ns key and collection is *.system.indexes, it is an index_information command
  } else if (db_command.collectionName === (data.Database + '.system.indexes') && query.hasOwnProperty('ns')) {
    data.QueryOp = 'index_information'
    data.Collection = query.ns.replace(reg, '')

  // If it has a createIndexes key, it is a create_index command
  } else if (query.hasOwnProperty('createIndexes')) {
    data.QueryOp = 'create_index'
    var index = query.indexes[0]
    data.Query = index.key
    data.Index = index.name
    data.Collection = query.createIndexes.replace(reg, '')

  // If it has a deleteIndexes key, it is a drop_index command
  } else if (query.hasOwnProperty('deleteIndexes')) {
    data.QueryOp = 'drop_index'
    data.Index = query.index
    data.Collection = query.deleteIndexes.replace(reg, '')
    if (data.Index === '*') {
      data.QueryOp = 'drop_indexes'
    }

  // If it has a reIndex key, it is a reindex command
  } else if (query.hasOwnProperty('reIndex')) {
    data.QueryOp = 'reindex'
    data.Index = query.index
    data.Collection = query.reIndex.replace(reg, '')

  // If it has an insert key, it is an insert command
  } else if (query.hasOwnProperty('count')) {
    data.QueryOp = 'count'
    data.Query = query.query
    data.Collection = query.count.replace(reg, '')

  // If it has an insert key, it is an insert command
  } else if (query.hasOwnProperty('distinct')) {
    data.QueryOp = 'distinct'
    data.Query = query.query
    data.Key = query.key
    data.Collection = query.distinct.replace(reg, '')

  // If it has an mapreduce key, it is an map_reduce command
  } else if (query.hasOwnProperty('mapreduce')) {
    data.QueryOp = 'map_reduce'
    data.Map_Function = query.map
    data.Reduce_Function = query.reduce
    data.Collection = query.mapreduce.replace(reg, '')
    if (query.out && query.out.inline) {
      data.QueryOp = 'inline_map_reduce'
    }

  // If it has an insert key, it is an insert command
  } else if (query.hasOwnProperty('insert')) {
    data.QueryOp = 'insert'
    data.Query = query.documents[0]
    data.Collection = query.insert.replace(reg, '')

  // If it has a findandmodify key, it is a find_and_modify command
  } else if (query.hasOwnProperty('findandmodify')) {
    data.QueryOp = 'find_and_modify'
    data.Query = query.query
    data.Update_Document = query.update
    data.Collection = query.findandmodify.replace(reg, '')

  // If it has an update key, it is an update command
  } else if (query.hasOwnProperty('update')) {
    data.QueryOp = 'update'
    data.Query = query.updates[0].q
    data.Update_Document = query.updates[0].u
    data.Collection = query.update.replace(reg, '')

  // If it has a delete key, it is a delete command
  } else if (query.hasOwnProperty('delete')) {
    data.QueryOp = 'delete'
    data.Query = query.deletes[0].q
    data.Collection = query.delete.replace(reg, '')

  // If it has a group key, it is a group command
  } else if (query.hasOwnProperty('group')) {
    query = query.group
    data.QueryOp = 'group'
    data.Group_Condition = JSON.stringify(query.cond)
    data.Group_Initial = JSON.stringify(query.initial)
    data.Group_Reduce = query.$reduce.code.toString()
    data.Group_Key = query.key ? JSON.stringify(query.key) : query.$keyf.code.toString()
    data.Collection = query.ns

  // If no other type, it is a find
  } else {
    data.QueryOp = 'find'
    data.Query = Object.keys(query).length ? query : 'all'
  }

  if (data.Query && typeof data.Query !== 'string') {
    data.Query = JSON.stringify(data.Query)
  }
  if (data.Update_Document && typeof data.Update_Document !== 'string') {
    data.Update_Document = JSON.stringify(data.Update_Document)
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
      var args = argsToArray(arguments)
      var callback = args.pop()
      var run = cmd.bind.apply(cmd, [this].concat(args))
      var last = Layer.last

      if ( ! oboe.tracing || ! last) {
        debug('skipping')
        return run(callback)
      }

      // Skip unrecognized interactions
      var data = identify(args[0])
      if ( ! data) {
        return run(oboe.requestStore.bind(callback))
      }

      // var layer = last.descend('mongodb', data)
      // layer.enter()
      // return run(oboe.requestStore.bind(function () {
      //   layer.exit()
      //   return callback.apply(this, arguments)
      // }))

      debug('building layer')
      var layer = last.descend('mongodb', data)
      return layer.run(function (wrap) {
        return run(wrap(callback))
      })
    }
  })

  // Patch options command manually
  var options = mongodb.Collection.prototype.options
  mongodb.Collection.prototype.options = function (callback) {
    var run = options.bind(this)
    var last = Layer.last

    if ( ! oboe.tracing || ! last) {
      return run(callback)
    }

    var config = this.db.serverConfig
    var layer = last.descend('mongodb', {
      RemoteHost: config.host + ':' + config.port,
      Collection: this.collectionName,
      Database: this.db.databaseName,
      QueryOp: 'options',
      Flavor: 'mongodb'
    })
    return layer.run(function (wrap) {
      return run(wrap(callback))
    })
  }

  return mongodb
}
