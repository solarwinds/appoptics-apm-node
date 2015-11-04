var debug = require('debug')('traceview:probes:mongodb')
var requirePatch = require('../require-patch')
var argsToArray = require('sliced')
var shimmer = require('shimmer')
var semver = require('semver')
var tv = require('..')
var Layer = tv.Layer
var Event = tv.Event
var conf = tv.mongodb

module.exports = function (mongodb) {
  var pkg = requirePatch.relativeRequire('mongodb/package.json')

  // Skip instrumentation on unsupported versions
  if (semver.satisfies(pkg.version, '>=1.2.9 < 2')) {
    patchCollection(mongodb.Collection, pkg.version)
    patchCursor(mongodb.Cursor, pkg.version)
    patchDb(mongodb.Db, pkg.version)
    patchCheckout(mongodb.ReplSet.prototype)
    patchCheckout(mongodb.Server.prototype)
  }

  return mongodb
}

function serialize (obj) {
  return typeof obj === 'string' ? obj : JSON.stringify(obj)
}

function withCommonData (collectionName, db, data) {
  var config = db.serverConfig
  if (config.host && config.port) {
    data.RemoteHost = config.host + ':' + config.port
  }
  data.Collection = collectionName
  data.Database = db.databaseName
  data.Flavor = 'mongodb'
  data.Spec = 'query'
  return data
}

function patchCollection (collection, version) {
  //
  // collection/aggregation.js
  //
  shimmer.wrap(collection.prototype, 'mapReduce', function (fn) {
    return function (map, reduce, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var self = this

      return tv.instrument(function (last) {
        var inline = options.out && options.out.inline
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: (inline ? 'inline_' : '') + 'map_reduce',
          Map_Function: (map.code ? map.code : map).toString(),
          Reduce_Function: (reduce.code ? reduce.code : reduce).toString()
        }))
      }, function (done) {
        fn.call(self, map, reduce, options, done)
      }, conf, callback)
    }
  })

  shimmer.wrap(collection.prototype, 'group', function (fn) {
    return function (keys, condition, initial, reduce, finalize, command, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      args.unshift(this)
      var run = fn.bind.apply(fn, args)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'group',
          Group_Condition: JSON.stringify(condition),
          Group_Initial: JSON.stringify(initial),
          Group_Reduce: (reduce.code ? reduce.code : reduce).toString(),
          Group_Key: (keys.code ? keys.code : keys).toString()
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
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
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'count',
          Query: JSON.stringify(query)
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  shimmer.wrap(collection.prototype, 'distinct', function (fn) {
    return function (key, query, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      args.unshift(this)
      var run = fn.bind.apply(fn, args)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'distinct',
          Key: key,
          Query: JSON.stringify(query)
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  shimmer.wrap(collection.prototype, 'rename', function (fn) {
    return function (newName, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, newName, options)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'rename',
          New_Collection_Name: newName
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  shimmer.wrap(collection.prototype, 'options', function (fn) {
    return function (callback) {
      var run = fn.bind(this)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'options'
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
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
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'insert',
          Query: JSON.stringify(doc)
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  shimmer.wrap(collection.prototype, 'remove', function (fn) {
    return function (query, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, query, options)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'delete',
          Query: JSON.stringify(query)
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  shimmer.wrap(collection.prototype, 'save', function (save) {
    return function (doc, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = save.bind(this, doc, options)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'save',
          Query: JSON.stringify(doc)
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  shimmer.wrap(collection.prototype, 'update', function (fn) {
    return function (query, doc, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, query, doc, options)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'update',
          Query: JSON.stringify(query),
          Update_Document: JSON.stringify(doc)
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  shimmer.wrap(collection.prototype, 'findAndModify', function (fn) {
    return function (query, sort, doc, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      args.unshift(this)
      var run = fn.bind.apply(fn, args)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
          QueryOp: 'find_and_modify',
          Query: JSON.stringify(query),
          Update_Document: JSON.stringify(doc)
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  //
  // indexes
  //
  if (semver.satisfies(version, '>= 2.0.0')) {
    shimmer.wrap(collection.prototype, 'dropIndex', function (fn) {
      return function (index, options, callback) {
        var args = argsToArray(arguments)
        callback = args.pop()
        args.unshift(this)
        var run = fn.bind.apply(fn, args)
        var self = this

        return tv.instrument(function (last) {
          return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
            QueryOp: 'drop_index' + (index === '*' ? 'es' : ''),
            Index: index
          }))
        }, function (done) {
          run(done)
        }, conf, callback)
      }
    })

    shimmer.wrap(collection.prototype, 'reIndex', function (fn) {
      return function (index, options, callback) {
        var args = argsToArray(arguments)
        callback = args.pop()
        args.unshift(this)
        var run = fn.bind.apply(fn, args)
        var self = this

        return tv.instrument(function (last) {
          return last.descend('mongodb', withCommonData(self.collectionName, (self.s || self).db, {
            QueryOp: 'reindex'
          }))
        }, function (done) {
          run(done)
        }, conf, callback)
      }
    })
  }
}

function patchCursor (cursor, version) {
  var is2 = semver.satisfies(version, '>= 2.0.0')

  shimmer.wrap(cursor.prototype, 'nextObject', function (fn) {
    return function (options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      args.unshift(this)
      var run = fn.bind.apply(fn, args)
      var self = this

      return tv.instrument(function (last) {
        var coll = (self.collection && self.collection.collectionName) || self.ns
        var db = is2 ? self.options.db : self.db

        var query = is2
          ? self.cmd.query
          : (Object.keys(self.selector).length
            ? self.selector
            : 'all'
          )

        var data = {
          QueryOp: 'find',
          Query: JSON.stringify(query),
          CursorId: (self.cursorId || 0).toString(),
          CursorOp: 'nextObject'
        }

        if (self.limitValue) {
          data.Limit = self.limitValue
        }

        return last.descend('mongodb', withCommonData(coll, db, data))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })
}

function patchDb (db, version) {
  var pkg = requirePatch.relativeRequire('mongodb/package.json')
  var utils = semver.satisfies(pkg.version, '>= 2.0.0')
    ? requirePatch.relativeRequire('mongodb/lib/utils')
    : requirePatch.relativeRequire('mongodb/lib/mongodb/utils')

  shimmer.wrap(db.prototype, 'createIndex', function (fn) {
    return function (collectionName, fieldOrSpec, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, fieldOrSpec, options)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(collectionName, self, {
          QueryOp: 'create_index',
          Index: JSON.stringify(fieldOrSpec)
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  if (semver.satisfies(version, '< 2.0.0')) {
    shimmer.wrap(db.prototype, 'dropIndex', function (fn) {
      return function (collectionName, index, options, callback) {
        var args = argsToArray(arguments)
        callback = args.pop()
        var run = fn.bind.apply(fn, [this].concat(args))
        var self = this

        return tv.instrument(function (last) {
          return last.descend('mongodb', withCommonData(collectionName, self, {
            QueryOp: 'drop_index' + (index === '*' ? 'es' : ''),
            Index: index
          }))
        }, function (done) {
          run(done)
        }, conf, callback)
      }
    })
  }

  shimmer.wrap(db.prototype, 'indexInformation', function (fn) {
    return function (collectionName, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, options)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(collectionName, self, {
          QueryOp: 'index_information'
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  shimmer.wrap(db.prototype, 'ensureIndex', function (fn) {
    return function (collectionName, fieldOrSpec, options, callback) {
      var args = argsToArray(arguments)
      callback = args.pop()
      var run = fn.bind.apply(fn, [this].concat(args))
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(collectionName, self, {
          QueryOp: 'ensure_index',
          Index: serialize(fieldOrSpec)
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  if (semver.satisfies(version, '< 2.0.0')) {
    shimmer.wrap(db.prototype, 'reIndex', function (fn) {
      return function (collectionName, options, callback) {
        var args = argsToArray(arguments)
        callback = args.pop()
        var run = fn.bind.apply(fn, [this].concat(args))
        var self = this

        return tv.instrument(function (last) {
          return last.descend('mongodb', withCommonData(collectionName, self, {
            QueryOp: 'reindex'
          }))
        }, function (done) {
          run(done)
        }, conf, callback)
      }
    })
  }

  shimmer.wrap(db.prototype, 'createCollection', function (fn) {
    return function (collectionName, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }
      var run = fn.bind(this, collectionName, options)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(collectionName, self, {
          QueryOp: 'create_collection'
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  // In 1.4+, db.renameCollection just calls collection.rename
  if (semver.satisfies(pkg.version, '>=1.2.0 <1.3.14')) {
    shimmer.wrap(db.prototype, 'renameCollection', function (fn) {
      return function (from, to, options, callback) {
        var args = argsToArray(arguments)
        callback = args.pop()
        var run = fn.bind.apply(fn, [this].concat(args))
        var self = this

        return tv.instrument(function (last) {
          return last.descend('mongodb', withCommonData(from, self, {
            QueryOp: 'rename',
            New_Collection_Name: to
          }))
        }, function (done) {
          run(done)
        }, conf, callback)
      }
    })
  }

  shimmer.wrap(db.prototype, 'dropCollection', function (fn) {
    return function (collectionName, callback) {
      var run = fn.bind(this, collectionName)
      var self = this

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData(collectionName, self, {
          QueryOp: 'drop_collection'
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })

  shimmer.wrap(db.prototype, 'dropDatabase', function (fn) {
    return function (options, callback) {
      var self = this
      var run

      if (typeof options !== 'function') {
        run = fn.bind(this, options)
      } else {
        callback = options
        run = fn.bind(this)
      }

      return tv.instrument(function (last) {
        return last.descend('mongodb', withCommonData('', self, {
          QueryOp: 'drop'
        }))
      }, function (done) {
        run(done)
      }, conf, callback)
    }
  })
}

function patchCheckout (target) {
  var methods = [
    'checkoutReader',
    'checkoutWriter'
  ]

  methods.forEach(function (method) {
    shimmer.wrap(target, method, function (fn) {
      return function (read) {
        var server = fn.call(this, read)
        var last = Layer.last
        if (last && ! last.hasRemoteHost) {
          var s = server.socketOptions
          last.hasRemoteHost = true
          last.info({
            RemoteHost: s.host + ':' + s.port
          })
        }
        return server
      }
    })
  })
}
