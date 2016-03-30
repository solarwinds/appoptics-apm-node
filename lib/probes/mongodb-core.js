'use strict'

const requirePatch = require('../require-patch')
const shimmer = require('shimmer')
const tv = require('..')
const conf = tv['mongodb-core']

module.exports = function (mongodb) {
  let twofour
  try {
    twofour = requirePatch.relativeRequire(
      'mongodb-core/lib/wireprotocol/2_4_support'
    )
  } catch (e) {}

  // Patch Server
  {
    const proto = mongodb.Server && mongodb.Server.prototype
    if (proto) patchCommands(proto, twofour)
  }

  // Patch ReplSet
  {
    const proto = mongodb.ReplSet && mongodb.ReplSet.prototype
    if (proto) patchCommands(proto, twofour)
  }

  // Patch Mongos
  {
    const proto = mongodb.Mongos && mongodb.Mongos.prototype
    if (proto) patchCommands(proto, twofour)
  }

  // Patch Cursor
  {
    const proto = mongodb.Cursor && mongodb.Cursor.prototype
    if (proto) patchCursor(proto)
  }

  return mongodb
}

function isTwoFour ({ s = {} }, twofour) {
  return s.wireProtocolHandler instanceof twofour
}

function makeWrapper (obj, name, addData, twofour) {
  if (typeof obj[name] !== 'function') return
  shimmer.wrap(obj, name, handler => function (ns, cmd, opts, cb) {
    if (!isTwoFour(this, twofour)) {
      return handler.call(this, ns, cmd, opts, cb)
    }

    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return tv.instrument(
      last => {
        const data = makeBaseData(this, ns)
        data.QueryOp = name
        addData(data, cmd)
        return last.descend('mongodb-core', data)
      },
      done => handler.call(this, ns, cmd, opts, done),
      conf,
      cb
    )
  })
}

function patchCommand (obj) {
  if (typeof obj.command !== 'function') return
  shimmer.wrap(obj, 'command', handler => function (ns, cmd, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }
    return tv.instrument(
      last => last.descend('mongodb-core', makeData(this, ns, cmd)),
      done => handler.call(this, ns, cmd, opts, done),
      conf,
      cb
    )
  })
}

function patchCommands (obj, twofour) {
  makeWrapper(obj, 'insert', (data, cmd) => {
    data.Insert_Document = JSON.stringify(cmd)
  }, twofour)
  makeWrapper(obj, 'update', (data, cmd) => {
    data.Query = JSON.stringify(cmd.map(getQuery))
    data.Update_Document = JSON.stringify(cmd.map(getUpdate))
  }, twofour)
  makeWrapper(obj, 'remove', (data, cmd) => {
    data.Query = JSON.stringify(cmd.map(getQuery))
  }, twofour)

  patchCommand(obj)
}

function patchCursor (cursor) {
  if (typeof cursor.next !== 'function') return
  shimmer.wrap(cursor, 'next', handler => function (cb) {
    const self = this
    let layer

    return tv.instrument(
      last => (layer = last.descend(
        'mongodb-core',
        makeData(this.topology, this.ns, this.cmd)
      )),
      done => handler.call(this, function () {
        if (layer) layer.events.exit.set({
          CursorId: self.cursorState.cursorId.toString(),
          CursorOp: 'next'
        })
        return done.apply(this, arguments)
      }),
      conf,
      cb
    )
  })
}

//
// Helpers
//

// List deconstructors
function getQuery (v) { return v.q || v.query }
function getUpdate (v) { return v.u || v.update }

// Command identifiers
function notUndef (...args) {
  return function (o) {
    return args.reduce((m, v) => m || v in o || v.toLowerCase() in o, false)
  }
}

function serverDetails ({ s = {} }) {
  return s.serverDetails || s.replState.primary.s.serverDetails
}

function makeBaseData (ctx, ns) {
  const dot = ns.indexOf('.')
  const Database = ns.slice(0, dot)
  const Collection = ns.slice(dot + 1)

  return {
    RemoteHost: serverDetails(ctx).name,
    Flavor: 'mongodb',
    Spec: 'query',
    Collection,
    Database,
  }
}

// NOTE: The order of these matters
const dataMakers = [
  // Databases
  [notUndef('dropDatabase'), function (data) {
    data.QueryOp = 'drop'
  }],

  // Collections
  [notUndef('create'), function (data, cmd) {
    data.QueryOp = 'create_collection'
    data.New_Collection_Name = cmd.create
  }],
  [notUndef('renameCollection'), function (data, cmd) {
    data.QueryOp = 'rename'
    data.New_Collection_Name = cmd.to.slice(cmd.to.indexOf('.') + 1)
  }],
  [notUndef('dropCollection', 'drop'), function (data) {
    data.QueryOp = 'drop_collection'
  }],

  // Finding
  [notUndef('distinct'), function (data, cmd) {
    data.QueryOp = 'distinct'
    data.Query = JSON.stringify(getQuery(cmd))
    data.Key = cmd.key
  }],
  [notUndef('find'), function (data, cmd) {
    data.QueryOp = 'find'
    data.Query = JSON.stringify(cmd.query)
  }],
  [notUndef('findAndModify'), function (data, cmd) {
    data.QueryOp = 'find_and_modify'
    data.Query = JSON.stringify(cmd.query)
    data.Update_Document = JSON.stringify(cmd.update)
  }],
  [notUndef('count'), function (data, cmd) {
    data.QueryOp = 'count'
    data.Query = JSON.stringify(getQuery(cmd))
  }],

  // Modifying
  [notUndef('insert'), function (data, cmd) {
    data.QueryOp = 'insert'
    data.Insert_Document = JSON.stringify(cmd.documents)
  }],
  [notUndef('update'), function (data, cmd) {
    data.QueryOp = 'update'
    data.Query = JSON.stringify(cmd.updates.map(getQuery))
    data.Update_Document = JSON.stringify(cmd.updates.map(getUpdate))
  }],
  [notUndef('delete'), function (data, cmd) {
    data.QueryOp = 'remove'
    data.Query = JSON.stringify(cmd.deletes.map(getQuery))
  }],

  // Indexes
  [notUndef('createIndexes'), function (data, cmd) {
    data.QueryOp = 'create_indexes'
    data.Indexes = JSON.stringify(cmd.indexes)
  }],
  [notUndef('deleteIndexes'), function (data, cmd) {
    data.QueryOp = 'drop_indexes'
    data.Index = JSON.stringify(cmd.index)
  }],
  [notUndef('reIndex'), function (data) {
    data.QueryOp = 'reindex'
  }],

  // Aggregation
  [notUndef('group'), function (data, cmd) {
    data.QueryOp = 'group'
    data.Group_Condition = JSON.stringify(cmd.group.cond)
    data.Group_Initial = JSON.stringify(cmd.group.initial)
    data.Group_Reduce = cmd.group.$reduce.toString()
    data.Group_Key = JSON.stringify(cmd.group.key)
  }],
  [notUndef('mapReduce'), function (data, cmd) {
    data.QueryOp = 'map_reduce'
    data.Map_Function = cmd.map
    data.Reduce_Function = cmd.reduce
    if (cmd.finalize) {
      data.Finalize_Function = cmd.finalize
    }
  }]
]

function makeData (ctx, ns, cmd) {
  const data = makeBaseData(ctx, ns)

  for (let i = 0; i < dataMakers.length; i++) {
    const [test, make] = dataMakers[i]
    if (test(cmd)) {
      make(data, cmd)
      return data
    }
  }

  data.QueryOp = 'command'
  data.Command = JSON.stringify(cmd)

  return data
}
