var requirePatch = require('../require-patch')
var shimmer = require('shimmer')
var tv = require('..')
var Layer = tv.Layer
var Event = tv.Event
var conf = tv['mongodb-core']

module.exports = function (mongodb) {
  var twofour = requirePatch.relativeRequire('mongodb-core/lib/wireprotocol/2_4_support')

  patchCommands(mongodb.Server.prototype, twofour)
  patchCommands(mongodb.ReplSet.prototype, twofour)
  patchCommands(mongodb.Mongos.prototype, twofour)
  patchCursor(mongodb.Cursor.prototype)

  return mongodb
}

function patchCommands (obj, twofour) {
  function isTwoFour (ctx) {
    return ctx.s.wireProtocolHandler instanceof twofour
  }

  function makeWrapper (name, addData) {
    shimmer.wrap(obj, name, function (handler) {
      return function (ns, cmd, options, callback) {
        if (typeof options === 'function') {
          callback = options
          options = {}
        }
        var fn = handler.bind(this, ns, cmd, options)
        var self = this

        if ( ! isTwoFour(this)) {
          return fn(callback)
        }

        return tv.instrument(function (last) {
          var data = makeBaseData(self, ns)
          data.QueryOp = name
          addData(data, cmd)
          return last.descend('mongodb-core', data)
        }, function (done) {
          fn(done)
        }, conf, callback)
      }
    })
  }

  makeWrapper('insert', function (data, cmd) {
    data.Insert_Document = JSON.stringify(cmd)
  })
  makeWrapper('update', function (data, cmd) {
    data.Query = JSON.stringify(cmd.map(getQuery))
    data.Update_Document= JSON.stringify(cmd.map(getUpdate))
  })
  makeWrapper('remove', function (data, cmd) {
    data.Query = JSON.stringify(cmd.map(getQuery))
  })

  shimmer.wrap(obj, 'command', function (handler) {
    return function (ns, cmd, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var fn = handler.bind(this, ns, cmd, options)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb-core', makeData(self, ns, cmd))
      }, function (done) {
        fn(done)
      }, conf, callback)
    }
  })
}

function patchCursor (cursor) {
  shimmer.wrap(cursor, 'next', function (handler) {
    return function (callback) {
      var fn = handler.bind(this)
      var self = this
      var layer

      return tv.instrument(function (last) {
        layer = last.descend('mongodb-core', makeData(self.topology, self.ns, self.cmd))
        return layer
      }, function (done) {
        fn(function () {
          if (layer) {
            var e = layer.events.exit
            e.CursorId = self.cursorState.cursorId.toString()
            e.CursorOp = 'next'
          }
          done.apply(this, arguments)
        })
      }, conf, callback)
    }
  })
}

//
// Helpers
//

// List deconstructors
function getQuery (v) { return v.q || v.query }
function getUpdate (v) { return v.u || v.update }

// Command identifiers
function notUndef (prop) {
  var args = Array.prototype.slice.call(arguments)
  return function (obj) {
    var has = false
    for (var i = 0; i < args.length; i++) {
      var prop = args[i]
      if (prop in obj || prop.toLowerCase() in obj) {
        has = true
      }
    }
    return has
  }
}

var is = {
  // Databases
  dropDatabase: notUndef('dropDatabase'),

  // Collections
  createCollection: notUndef('create'),
  renameCollection: notUndef('renameCollection'),
  dropCollection: notUndef('dropCollection', 'drop'),

  // Other
  distinct: notUndef('distinct'),
  count: notUndef('count'),

  // Queries
  insert: notUndef('insert'),
  update: notUndef('update'),
  remove: notUndef('delete'),

  // Find
  find: notUndef('find'),
  findAndModify: notUndef('findAndModify'),

  // Indexes
  createIndexes: notUndef('createIndexes'),
  dropIndexes: notUndef('deleteIndexes'),
  reIndex: notUndef('reIndex'),

  // Aggregation
  group: notUndef('group'),
  mapReduce: notUndef('mapReduce'),
}

function serverDetails (ctx) {
  return ctx.s.serverDetails || ctx.s.replState.primary.s.serverDetails
}

function makeBaseData (ctx, ns) {
  var parts = ns.split('.')
  var database = parts.shift()
  var collection = parts.join('.')

  return {
    RemoteHost: serverDetails(ctx).name,
    Collection: collection,
    Database: database,
    Flavor: 'mongodb',
    Spec: 'query'
  }
}

function makeData (ctx, ns, cmd) {
  var data = makeBaseData(ctx, ns)

  if (is.dropDatabase(cmd)) {
    data.QueryOp = 'drop'

  } else if (is.createCollection(cmd)) {
    data.QueryOp = 'create_collection'
    data.New_Collection_Name = cmd.create

  } else if (is.renameCollection(cmd)) {
    data.QueryOp = 'rename'
    data.New_Collection_Name = cmd.to.split('.').slice(1).join('.')

  } else if (is.dropCollection(cmd)) {
    data.QueryOp = 'drop_collection'

  } else if (is.distinct(cmd)) {
    data.QueryOp = 'distinct'
    data.Query = JSON.stringify(getQuery(cmd))
    data.Key = cmd.key

  } else if (is.find(cmd)) {
    data.QueryOp = 'find'
    data.Query = JSON.stringify(cmd.query)

  } else if (is.findAndModify(cmd)) {
    data.QueryOp = 'find_and_modify'
    data.Query = JSON.stringify(cmd.query)
    data.Update_Document = JSON.stringify(cmd.update)

  } else if (is.insert(cmd)) {
    data.QueryOp = 'insert'
    data.Insert_Document = JSON.stringify(cmd.documents)

  } else if (is.update(cmd)) {
    data.QueryOp = 'update'
    data.Query = JSON.stringify(cmd.updates.map(getQuery))
    data.Update_Document = JSON.stringify(cmd.updates.map(getUpdate))

  } else if (is.remove(cmd)) {
    data.QueryOp = 'remove'
    data.Query = JSON.stringify(cmd.deletes.map(getQuery))

  } else if (is.count(cmd)) {
    data.QueryOp = 'count'
    data.Query = JSON.stringify(getQuery(cmd))

  } else if (is.createIndexes(cmd)) {
    data.QueryOp = 'create_indexes'
    data.Indexes = JSON.stringify(cmd.indexes)

  } else if (is.dropIndexes(cmd)) {
    data.QueryOp = 'drop_indexes'
    data.Index = JSON.stringify(cmd.index)

  } else if (is.reIndex(cmd)) {
    data.QueryOp = 'reindex'

  } else if (is.group(cmd)) {
    data.QueryOp = 'group'
    data.Group_Condition = JSON.stringify(cmd.group.cond)
    data.Group_Initial = JSON.stringify(cmd.group.initial)
    data.Group_Reduce = cmd.group.$reduce.toString()
    data.Group_Key = JSON.stringify(cmd.group.key)

  } else if (is.mapReduce(cmd)) {
    data.QueryOp = 'map_reduce'
    data.Map_Function = cmd.map
    data.Reduce_Function = cmd.reduce
    if (cmd.finalize) {
      data.Finalize_Function = cmd.finalize
    }

  } else {
    data.QueryOp = 'command'
    data.Command = JSON.stringify(cmd)
  }

  return data
}
