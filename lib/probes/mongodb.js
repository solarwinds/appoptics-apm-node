'use strict'

const requirePatch = require('../require-patch')
const shimmer = require('shimmer')
const semver = require('semver')
const ao = require('..')
const Layer = ao.Layer
const conf = ao.mongodb

module.exports = function (mongodb) {
  let pkg
  try { pkg = requirePatch.relativeRequire('mongodb/package.json') }
  catch (e) {}

  // Skip instrumentation on unsupported versions
  if (pkg && semver.satisfies(pkg.version, '>=1.2.9 < 2')) {
    // Patch collection methods
    {
      const proto = mongodb.Collection && mongodb.Collection.prototype
      if (proto) patchCollection(proto)
    }

    // Patch Cursor methods
    {
      const proto = mongodb.Cursor && mongodb.Cursor.prototype
      if (proto) patchCursor(proto)
    }

    // Patch Db methods
    {
      const proto = mongodb.Db && mongodb.Db.prototype
      if (proto) patchDb(proto, pkg.version)
    }

    // Patch ReplSet checkout function
    {
      const proto = mongodb.ReplSet && mongodb.ReplSet.prototype
      if (proto) patchCheckout(proto)
    }

    // Patch Server checkout function
    {
      const proto = mongodb.Server && mongodb.Server.prototype
      if (proto) patchCheckout(proto)
    }
  }

  return mongodb
}

function serialize (obj) {
  return typeof obj === 'string' ? obj : JSON.stringify(obj)
}

function withCommonData (collection, db, data) {
  const {host, port} = db.serverConfig
  if (host && port) {
    data.RemoteHost = `${host}:${port}`
  }
  data.Collection = collection
  data.Database = db.databaseName
  data.Flavor = 'mongodb'
  data.Spec = 'query'
  return data
}

//
// Collection patches
//
function patchMapReduce (proto) {
  if (typeof proto.mapReduce !== 'function') return

  function getOpName (opts) {
    return (opts.out && opts.out.inline ? 'inline_' : '') + 'map_reduce'
  }

  shimmer.wrap(proto, 'mapReduce', fn => function (map, reduce, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: getOpName(opts),
          Map_Function: (map.code ? map.code : map).toString(),
          Reduce_Function: (reduce.code ? reduce.code : reduce).toString()
        })
      ),
      done => fn.call(this, map, reduce, opts, done),
      conf,
      cb
    )
  })
}

function patchGroup (proto) {
  if (typeof proto.group !== 'function') return
  shimmer.wrap(proto, 'group', fn => function (...args) {
    const [keys, condition, initial, reduce] = args
    const callback = args.pop()

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'group',
          Group_Condition: JSON.stringify(condition),
          Group_Initial: JSON.stringify(initial),
          Group_Reduce: (reduce.code ? reduce.code : reduce).toString(),
          Group_Key: (keys.code ? keys.code : keys).toString()
        })
      ),
      done => fn.apply(this, args.concat(done)),
      conf,
      callback
    )
  })
}

function patchCount (proto) {
  if (typeof proto.count !== 'function') return
  shimmer.wrap(proto, 'count', fn => function (...args) {
    const [query] = args
    const cb = args.pop()

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'count',
          Query: JSON.stringify(query)
        })
      ),
      done => fn.apply(this, args.concat(done)),
      conf,
      cb
    )
  })
}

function patchDistinct (proto) {
  if (typeof proto.distinct !== 'function') return
  shimmer.wrap(proto, 'distinct', fn => function (...args) {
    const [key, query] = args
    const cb = args.pop()

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'distinct',
          Key: key,
          Query: JSON.stringify(query)
        })
      ),
      done => fn.apply(this, args.concat(done)),
      conf,
      cb
    )
  })
}

function patchRename (proto) {
  if (typeof proto.rename !== 'function') return
  shimmer.wrap(proto, 'rename', fn => function (name, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'rename',
          New_Collection_Name: name
        })
      ),
      done => fn.call(this, name, opts, done),
      conf,
      cb
    )
  })
}

function patchOptions (proto) {
  if (typeof proto.options !== 'function') return
  shimmer.wrap(proto, 'options', fn => function (cb) {
    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'options'
        })
      ),
      done => fn.call(this, done),
      conf,
      cb
    )
  })
}

function patchInsert (proto) {
  if (typeof proto.insert !== 'function') return
  shimmer.wrap(proto, 'insert', fn => function (doc, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'insert',
          Query: JSON.stringify(doc)
        })
      ),
      done => fn.call(this, doc, opts, done),
      conf,
      cb
    )
  })
}

function patchRemove (proto) {
  if (typeof proto.remove !== 'function') return
  shimmer.wrap(proto, 'remove', fn => function (query, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'delete',
          Query: JSON.stringify(query)
        })
      ),
      done => fn.call(this, query, opts, done),
      conf,
      cb
    )
  })
}

function patchSave (proto) {
  if (typeof proto.save !== 'function') return
  shimmer.wrap(proto, 'save', fn => function (doc, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'save',
          Query: JSON.stringify(doc)
        })
      ),
      done => fn.call(this, doc, opts, done),
      conf,
      cb
    )
  })
}

function patchUpdate (proto) {
  if (typeof proto.update !== 'function') return
  shimmer.wrap(proto, 'update', fn => function (query, doc, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'update',
          Query: JSON.stringify(query),
          Update_Document: JSON.stringify(doc)
        })
      ),
      done => fn.call(this, query, doc, opts, done),
      conf,
      cb
    )
  })
}

function patchFindAndModify (proto) {
  if (typeof proto.findAndModify !== 'function') return
  shimmer.wrap(proto, 'findAndModify', fn => function (...args) {
    const [query,, doc] = args
    const cb = args.pop()

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(this.collectionName, (this.s || this).db, {
          QueryOp: 'find_and_modify',
          Query: JSON.stringify(query),
          Update_Document: JSON.stringify(doc)
        })
      ),
      done => fn.apply(this, args.concat(done)),
      conf,
      cb
    )
  })
}

function patchCollection (proto) {
  //
  // collection/aggregation.js
  //
  patchMapReduce(proto)
  patchGroup(proto)

  //
  // collection/commands.js
  //
  patchCount(proto)
  patchDistinct(proto)
  patchRename(proto)
  patchOptions(proto)

  //
  // collection/core.js
  //
  patchInsert(proto)
  patchRemove(proto)
  patchSave(proto)
  patchUpdate(proto)
  patchFindAndModify(proto)
}

//
// Cursor patches
//
function patchCursor (proto) {
  if (typeof proto.nextObject !== 'function') return

  function collectionName (ctx) {
    return (ctx.collection && ctx.collection.collectionName) || ctx.ns
  }

  function query (ctx) {
    return Object.keys(ctx.selector).length
      ? JSON.stringify(ctx.selector)
      : 'all'
  }

  shimmer.wrap(proto, 'nextObject', fn => function (...args) {
    const cb = args.pop()

    return ao.instrument(
      last => last.descend(
        'mongodb',
        withCommonData(collectionName(this), this.db, {
          QueryOp: 'find',
          CursorId: (this.cursorId || 0).toString(),
          CursorOp: 'nextObject',
          Query: query(this),
          Limit: this.limitValue
        })
      ),
      done => fn.apply(this, args.concat(done)),
      conf,
      cb
    )
  })
}

//
// Db patches
//
function patchCreateIndex (proto) {
  if (typeof proto.createIndex !== 'function') return
  shimmer.wrap(proto, 'createIndex', fn => function (name, field, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend('mongodb', withCommonData(name, this, {
        QueryOp: 'create_index',
        Index: JSON.stringify(field)
      })),
      done => fn.call(this, name, field, opts, done),
      conf,
      cb
    )
  })
}

function patchDropIndex (proto) {
  if (typeof proto.dropIndex !== 'function') return
  shimmer.wrap(proto, 'dropIndex', fn => function (name, index, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend('mongodb', withCommonData(name, this, {
        QueryOp: 'drop_index' + (index === '*' ? 'es' : ''),
        Index: index
      })),
      done => fn.call(this, name, index, opts, done),
      conf,
      cb
    )
  })
}

function patchIndexInformation (proto) {
  if (typeof proto.indexInformation !== 'function') return
  shimmer.wrap(proto, 'indexInformation', fn => function (name, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }
    return ao.instrument(
      last => last.descend('mongodb', withCommonData(name, this, {
        QueryOp: 'index_information'
      })),
      done => fn.call(this, name, opts, done),
      conf,
      cb
    )
  })
}

function patchEnsureIndex (proto) {
  if (typeof proto.ensureIndex !== 'function') return
  shimmer.wrap(proto, 'ensureIndex', fn => function (name, field, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }
    return ao.instrument(
      last => last.descend('mongodb', withCommonData(name, this, {
        QueryOp: 'ensure_index',
        Index: serialize(field)
      })),
      done => fn.call(this, name, field, opts, done),
      conf,
      cb
    )
  })
}

function patchReIndex (proto) {
  if (typeof proto.reIndex !== 'function') return
  shimmer.wrap(proto, 'reIndex', fn => function (name, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend('mongodb', withCommonData(name, this, {
        QueryOp: 'reindex'
      })),
      done => fn.call(this, name, opts, done),
      conf,
      cb
    )
  })
}

function patchCreateCollection (proto) {
  if (typeof proto.createCollection !== 'function') return
  shimmer.wrap(proto, 'createCollection', fn => function (name, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend('mongodb', withCommonData(name, this, {
        QueryOp: 'create_collection'
      })),
      done => fn.call(this, name, opts, done),
      conf,
      cb
    )
  })
}

function patchRenameCollection (proto) {
  if (typeof proto.renameCollection !== 'function') return
  shimmer.wrap(proto, 'renameCollection', fn => function (a, b, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
      last => last.descend('mongodb', withCommonData(a, this, {
        QueryOp: 'rename',
        New_Collection_Name: b
      })),
      done => fn.call(this, a, b, opts, done),
      conf,
      cb
    )
  })
}

function patchDropCollection (proto) {
  if (typeof proto.dropCollection !== 'function') return
  shimmer.wrap(proto, 'dropCollection', fn => function (name, cb) {
    return ao.instrument(
      last => last.descend('mongodb', withCommonData(name, this, {
        QueryOp: 'drop_collection'
      })),
      done => fn.call(this, name, done),
      conf,
      cb
    )
  })
}

function patchDropDatabase (proto) {
  if (typeof proto.dropDatabase !== 'function') return
  shimmer.wrap(proto, 'dropDatabase', fn => function (...args) {
    const cb = args.pop()
    const run = args.length
      ? done => fn.call(this, args[0], done)
      : done => fn.call(this, done)

    return ao.instrument(
      last => last.descend('mongodb', withCommonData('', this, {
        QueryOp: 'drop'
      })),
      run,
      conf,
      cb
    )
  })
}

function patchDb (proto, version) {
  patchCreateIndex(proto)
  patchDropIndex(proto)
  patchIndexInformation(proto)
  patchEnsureIndex(proto)
  patchReIndex(proto)
  patchCreateCollection(proto)
  patchDropCollection(proto)

  // In 1.4+, db.renameCollection just calls collection.rename
  if (semver.satisfies(version, '>=1.2.0 <1.3.14')) {
    patchRenameCollection(proto)
  }

  patchDropDatabase(proto)
}

//
// Checkout patches
//
function patchCheckout (target) {
  const methods = [
    'checkoutReader',
    'checkoutWriter'
  ]

  methods.forEach(method => {
    shimmer.wrap(target, method, fn => function (read) {
      const server = fn.call(this, read)
      const last = Layer.last
      if (last && !last.hasRemoteHost) {
        const {host, port} = server.socketOptions
        last.hasRemoteHost = true
        last.info({ RemoteHost: `${host}:${port}` })
      }
      return server
    })
  })
}
