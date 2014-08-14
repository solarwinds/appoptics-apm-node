var debug = require('debug')('node-oboe:probes:mongodb')
var requirePatch = require('../require-patch')
var shimmer = require('shimmer')
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

module.exports = function (mongodb) {
  // Patch mongo with CLS binds
  requirePatch.disable()
  require('cls-mongodb')(oboe.requestStore)
  var utils = require('mongodb/lib/mongodb/utils')
  requirePatch.enable()

  //
  // Manually patch a few compound commands
  //
  function attempt (run, collectionName, db, data, callback) {
    var last = Layer.last
    if ( ! oboe.tracing || ! last) {
      return run(callback)
    }

    var config = db.serverConfig
    data.RemoteHost = config.host + ':' + config.port
    data.Collection = collectionName
    data.Database = db.databaseName
    data.Flavor = 'mongodb'

    return last.descend('mongodb', data).run(function (wrap) {
      return run(wrap(callback))
    })
  }

  //
  // collection/aggregation.js
  //
  shimmer.wrap(mongodb.Collection.prototype, 'mapReduce', function (fn) {
    return function (map, reduce, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var inline = options.out && options.out.inline
      var run = fn.bind(this, map, reduce, options)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: (inline ? 'inline_' : '') + 'map_reduce',
        Map_Function: (map.code ? map.code : map).toString(),
        Reduce_Function: (reduce.code ? reduce.code : reduce).toString()
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Collection.prototype, 'group', function (fn) {
    return function (keys, condition, initial, reduce, finalize, command, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      args.unshift(this)
      var run = fn.bind.apply(fn, args)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'group',
        Group_Condition: JSON.stringify(condition),
        Group_Initial: JSON.stringify(initial),
        Group_Reduce: (reduce.code ? reduce.code : reduce).toString(),
        Group_Key: JSON.stringify((keys.code ? keys.code : keys).toString())
      }, callback)
    }
  })

  //
  // collection/commands.js
  //
  shimmer.wrap(mongodb.Collection.prototype, 'count', function (fn) {
    return function (query, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, query, options)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'count',
        Query: JSON.stringify(query)
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Collection.prototype, 'distinct', function (fn) {
    return function (key, query, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      args.unshift(this)
      var run = fn.bind.apply(fn, args)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'distinct',
        Key: key,
        Query: JSON.stringify(query)
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Collection.prototype, 'rename', function (fn) {
    return function (newName, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, newName, options)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'rename',
        New_Collection_Name: newName
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Collection.prototype, 'options', function (fn) {
    return function (callback) {
      return attempt(fn.bind(this), this.collectionName, this.db, {
        QueryOp: 'options'
      }, callback)
    }
  })

  //
  // collection/core.js
  //
  shimmer.wrap(mongodb.Collection.prototype, 'insert', function (fn) {
    return function (doc, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, doc, options)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'insert',
        Query: JSON.stringify(doc)
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Collection.prototype, 'remove', function (fn) {
    return function (query, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, query, options)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'delete',
        Query: JSON.stringify(query)
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Collection.prototype, 'save', function (save) {
    return function (doc, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = save.bind(this, doc, options)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'save',
        Query: JSON.stringify(doc)
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Collection.prototype, 'update', function (fn) {
    return function (query, doc, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, query, doc, options)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'update',
        Query: JSON.stringify(query),
        Update_Document: JSON.stringify(doc)
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Collection.prototype, 'findAndModify', function (fn) {
    return function (query, sort, doc, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      args.unshift(this)
      var run = fn.bind.apply(fn, args)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'find_and_modify',
        Query: JSON.stringify(query),
        Update_Document: JSON.stringify(doc)
      }, callback)
    }
  })

  //
  // collection/query.js
  // TODO: findOne is the wrong thing to patch--need to patch Cursor methods
  //
  shimmer.wrap(mongodb.Collection.prototype, 'findOne', function (fn) {
    return function (query, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, query, options)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'find',
        Query: JSON.stringify(query)
      }, callback)
    }
  })

  //
  // db.js
  //
  shimmer.wrap(mongodb.Db.prototype, 'createIndex', function (fn) {
    return function (collectionName, fieldOrSpec, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, fieldOrSpec, options)
      return attempt(run, collectionName, this, {
        QueryOp: 'create_index',
        Index: JSON.stringify(fieldOrSpec)
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Db.prototype, 'dropIndex', function (fn) {
    return function (collectionName, index, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, index, options)
      return attempt(run, collectionName, this, {
        QueryOp: 'drop_index' + (index === '*' ? 'es' : ''),
        Index: index
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Db.prototype, 'indexInformation', function (fn) {
    return function (collectionName, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, options)
      return attempt(run, collectionName, this, {
        QueryOp: 'index_information'
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Db.prototype, 'ensureIndex', function (fn) {
    return function (collectionName, fieldOrSpec, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, fieldOrSpec, options)
      var desc = utils.parseIndexOptions(fieldOrSpec)
      return attempt(run, collectionName, this, {
        QueryOp: 'ensure_index',
        Index: desc.name
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Db.prototype, 'reIndex', function (fn) {
    return function (collectionName, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, options)
      return attempt(run, collectionName, this, {
        QueryOp: 'reindex'
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Db.prototype, 'createCollection', function (fn) {
    return function (collectionName, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, options)
      return attempt(run, collectionName, this, {
        QueryOp: 'create_collection'
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Db.prototype, 'dropCollection', function (fn) {
    return function (collectionName, callback) {
      var run = fn.bind(this, collectionName)
      return attempt(run, collectionName, this, {
        QueryOp: 'drop_collection'
      }, callback)
    }
  })

  shimmer.wrap(mongodb.Db.prototype, 'dropDatabase', function (fn) {
    return function (options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, options)
      return attempt(run, '', this, {
        QueryOp: 'drop'
      }, callback)
    }
  })

  // var command = mongodb.Db.prototype.command
  // mongodb.Db.prototype.command = function (selector, options, callback) {
  //   var run = command.bind(this, selector, options)
  //   var last = Layer.last
  //
  //   if ( ! oboe.tracing || ! last) {
  //     return run(callback)
  //   }
  //
  //   var config = this.serverConfig
  //   var layer = last.descend('mongodb', {
  //     RemoteHost: config.host + ':' + config.port,
  //     Database: this.databaseName,
  //     QueryOp: 'options',
  //     Flavor: 'mongodb'
  //   })
  //
  //   return layer.run(function (wrap) {
  //     return run(wrap(callback))
  //   })
  // }

  return mongodb
}
