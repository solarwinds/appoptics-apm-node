var debug = require('debug')('traceview:probes:mongodb')
var requirePatch = require('../require-patch')
var shimmer = require('shimmer')
var semver = require('semver')
var Layer = require('../layer')
var Event = require('../event')
var tv = require('..')
var conf = tv.mongodb

function argsToArray (args) {
  var length = args.length
  var res = []
  var i = 0
  for (; i < length; i++) {
    res[i] = args[i]
  }
  return res
}

function serialize (obj) {
  return typeof obj === 'string' ? obj : JSON.stringify(obj)
}

module.exports = function (mongodb) {
  requirePatch.disable()
  var pkg = require('mongodb/package.json')
  requirePatch.enable()

  tv.versions['MongoDB.Version'] = pkg.version

  // Skip instrumentation on unsupported versions
  if (semver.satisfies(pkg.version, '>=1.2.9')) {
    patchCollection(mongodb.Collection)
    patchCursor(mongodb.Cursor)
    patchDb(mongodb.Db)
  }

  return mongodb
}

function attempt (run, collectionName, db, data, callback) {
  var last = Layer.last
  if ( ! tv.tracing || ! last) {
    return run(callback)
  }

  if ( ! conf.enabled) {
    return run(tv.requestStore.bind(callback))
  }

  var config = db.serverConfig
  data.RemoteHost = config.host + ':' + config.port
  data.Collection = collectionName
  data.Database = db.databaseName
  data.Flavor = 'mongodb'

  if (conf.collectBacktraces) {
    data.Backtrace = tv.backtrace(4)
  }

  return last.descend('mongodb', data).run(function (wrap) {
    return run(wrap(callback))
  })
}

function patchCollection (collection) {
  //
  // collection/aggregation.js
  //
  shimmer.wrap(collection.prototype, 'mapReduce', function (fn) {
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

  shimmer.wrap(collection.prototype, 'group', function (fn) {
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
        Group_Key: (keys.code ? keys.code : keys).toString()
      }, callback)
    }
  })

  //
  // collection/commands.js
  //
  shimmer.wrap(collection.prototype, 'count', function (fn) {
    return function (query, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      args.unshift(this)
      var run = fn.bind.apply(fn, args)
      return attempt(run, this.collectionName, this.db, {
        QueryOp: 'count',
        Query: JSON.stringify(query)
      }, callback)
    }
  })

  shimmer.wrap(collection.prototype, 'distinct', function (fn) {
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

  shimmer.wrap(collection.prototype, 'rename', function (fn) {
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

  shimmer.wrap(collection.prototype, 'options', function (fn) {
    return function (callback) {
      return attempt(fn.bind(this), this.collectionName, this.db, {
        QueryOp: 'options'
      }, callback)
    }
  })

  //
  // collection/core.js
  //
  shimmer.wrap(collection.prototype, 'insert', function (fn) {
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

  shimmer.wrap(collection.prototype, 'remove', function (fn) {
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

  shimmer.wrap(collection.prototype, 'save', function (save) {
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

  shimmer.wrap(collection.prototype, 'update', function (fn) {
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

  shimmer.wrap(collection.prototype, 'findAndModify', function (fn) {
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
}

function patchCursor (cursor) {
  shimmer.wrap(cursor.prototype, 'nextObject', function (fn) {
    return function (options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      var run = fn.bind(this, options)
      var coll = this.collection.collectionName
      var query = Object.keys(this.selector).length ? this.selector : 'all'

      var data = {
        QueryOp: 'find',
        Query: JSON.stringify(query),
        CursorId: this.cursorId.toString(),
        CursorOp: 'nextObject'
      }

      if (this.limitValue) {
        data.Limit = this.limitValue
      }

      return attempt(run, coll, this.db, data, callback)
    }
  })
}

function patchDb (db) {
  requirePatch.disable()
  var utils = require('mongodb/lib/mongodb/utils')
  var pkg = require('mongodb/package.json')
  requirePatch.enable()

  shimmer.wrap(db.prototype, 'createIndex', function (fn) {
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

  shimmer.wrap(db.prototype, 'dropIndex', function (fn) {
    return function (collectionName, index, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      var run = fn.bind.apply(fn, [this].concat(args))
      return attempt(run, collectionName, this, {
        QueryOp: 'drop_index' + (index === '*' ? 'es' : ''),
        Index: index
      }, callback)
    }
  })

  shimmer.wrap(db.prototype, 'indexInformation', function (fn) {
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

  shimmer.wrap(db.prototype, 'ensureIndex', function (fn) {
    return function (collectionName, fieldOrSpec, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, fieldOrSpec, options)
      return attempt(run, collectionName, this, {
        QueryOp: 'ensure_index',
        Index: serialize(fieldOrSpec)
      }, callback)
    }
  })

  shimmer.wrap(db.prototype, 'reIndex', function (fn) {
    return function (collectionName, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      var run = fn.bind.apply(fn, [this].concat(args))
      return attempt(run, collectionName, this, {
        QueryOp: 'reindex'
      }, callback)
    }
  })

  shimmer.wrap(db.prototype, 'createCollection', function (fn) {
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

  // In 1.4+, db.renameCollection just calls collection.rename
  if (semver.satisfies(pkg.version, '>=1.2.0 <1.3.14')) {
    shimmer.wrap(db.prototype, 'renameCollection', function (fn) {
      return function (from, to, options, callback) {
        var args = argsToArray(arguments)
        callback = args.pop()
        var run = fn.bind.apply(fn, [this].concat(args))
        return attempt(run, from, this, {
          QueryOp: 'rename',
          New_Collection_Name: to
        }, callback)
      }
    })
  }

  shimmer.wrap(db.prototype, 'dropCollection', function (fn) {
    return function (collectionName, callback) {
      var run = fn.bind(this, collectionName)
      return attempt(run, collectionName, this, {
        QueryOp: 'drop_collection'
      }, callback)
    }
  })

  shimmer.wrap(db.prototype, 'dropDatabase', function (fn) {
    return function (options, callback) {
      var run
      if (typeof options !== 'function') {
        run = fn.bind(this, options)
      } else {
        callback = options
        run = fn.bind(this)
      }
      return attempt(run, '', this, {
        QueryOp: 'drop'
      }, callback)
    }
  })

  // shimmer.wrap(db.prototype, 'command', function (fn) {
  //   return function (selector, options, callback) {
  //     if (typeof options === 'function') {
  //       callback = options
  //       options = {}
  //     }
  //     var run = fn.bind(this, selector, options)
  //     return attempt(run, '', this, {
  //       QueryOp: 'command',
  //       Command: JSON.stringify(selector)
  //     }, callback)
  //   }
  // })
}
