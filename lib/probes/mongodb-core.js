'use strict'

const shimmer = require('shimmer')

const ao = require('..')
const conf = ao.probes['mongodb-core']

const logMissing = ao.makeLogMissing('mongodb-core')

module.exports = function (mongodb, options) {
  const { version } = options

  // Patch Server
  let proto = mongodb.Server && mongodb.Server.prototype
  if (proto) {
    patchCommands(proto)
  } else {
    logMissing('Server.prototype')
  }

  // Patch ReplSet
  proto = mongodb.ReplSet && mongodb.ReplSet.prototype
  if (proto) {
    patchCommands(proto)
  } else {
    logMissing('ReplSet.prototype')
  }

  // Patch Mongos
  proto = mongodb.Mongos && mongodb.Mongos.prototype
  if (proto) {
    patchCommands(proto)
  } else {
    logMissing('Mongos.prototype')
  }

  // Patch Cursor
  proto = mongodb.Cursor && mongodb.Cursor.prototype
  if (proto) {
    patchCursor(proto)
  } else {
    logMissing('Cursor.prototype')
  }

  return [mongodb, version]
}

function makeWrapper (obj, name, addData) {
  if (typeof obj[name] !== 'function') {
    logMissing(`${name}()`)
    return
  }
  shimmer.wrap(obj, name, handler => function (ns, cmd, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    const kvpairs = makeBaseData(this, ns)
    kvpairs.QueryOp = name
    addData(kvpairs, cmd)

    return ao.instrument(
      () => {
        return {
          name: 'mongodb-core',
          kvpairs
        }
      },
      done => handler.call(this, ns, cmd, opts, done),
      conf,
      cb
    )
  })
}

function patchCommand (obj) {
  if (typeof obj.command !== 'function') {
    logMissing(`${obj.command}()`)
    return
  }
  shimmer.wrap(obj, 'command', handler => function (ns, cmd, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }
    return ao.instrument(
      () => {
        return {
          name: 'mongodb-core',
          kvpairs: makeData(this, ns, cmd)
        }
      },
      done => handler.call(this, ns, cmd, opts, done),
      conf,
      cb
    )
  })
}

function patchCommands (obj) {
  makeWrapper(obj, 'insert', (data, cmd) => {
    data.Insert_Document = JSON.stringify(cmd)
  })
  makeWrapper(obj, 'update', (data, cmd) => {
    data.Query = JSON.stringify(cmd.map(getQuery))
    data.Update_Document = JSON.stringify(cmd.map(getUpdate))
  })
  makeWrapper(obj, 'remove', (data, cmd) => {
    data.Query = JSON.stringify(cmd.map(getQuery))
  })

  patchCommand(obj)
}

function patchCursor (cursor) {
  if (typeof cursor.next !== 'function') {
    logMissing('cursor.next()')
    return
  }
  shimmer.wrap(cursor, 'next', handler => function (cb) {
    const self = this
    let span

    return ao.instrument(
      () => {
        return {
          name: 'mongodb-core',
          kvpairs: makeData(this.topology, this.ns, this.cmd)
        }
      },
      done => handler.call(this, function () {
        if (span) {
          span.events.exit.set({
            CursorId: self.cursorState.cursorId.toString(),
            CursorOp: 'next'
          })
        }
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
function ifDef (...args) {
  return function (o) {
    for (let i = 0; i < args.length; i++) {
      if (args[i] in o || args[i].toLowerCase() in o) {
        return true
      }
    }
    return false
  }
}

function serverDetails ({ s = {} }) {
  let o
  if (s.serverDetails) {
    o = s.serverDetails
  } else if (s.replicaSetState && s.replicaSetState.primary) {
    o = s.replicaSetState.primary
    // eslint-disable-next-line max-len
  } else if (s.coreTopology && s.coreTopology.s && s.coreTopology.s.replicaSetState && s.coreTopology.s.replicaSetState.primary) {
    o = s.coreTopology.s.replicaSetState.primary
  } else if (s.replState && s.replState.primary) {
    o = s.replState.primary.s.serverDetails
  } else {
    o = { name: s.options.host + ':' + (s.options.port || 27017) }
  }
  return o
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
    Database
  }
}

// NOTE: The order of these matters.
// BAM note: why does the order matter?
const dataMakers = [
  // Databases
  [ifDef('dropDatabase'), function (data) {
    data.QueryOp = 'drop'
  }],

  // Collections
  [ifDef('create'), function (data, cmd) {
    data.QueryOp = 'create_collection'
    data.New_Collection_Name = cmd.create
  }],
  [ifDef('renameCollection'), function (data, cmd) {
    data.QueryOp = 'rename'
    data.New_Collection_Name = cmd.to.slice(cmd.to.indexOf('.') + 1)
  }],
  [ifDef('dropCollection', 'drop'), function (data) {
    data.QueryOp = 'drop_collection'
  }],

  // Finding
  [ifDef('distinct'), function (data, cmd) {
    data.QueryOp = 'distinct'
    data.Query = JSON.stringify(getQuery(cmd))
    data.Key = cmd.key
  }],
  [ifDef('find'), function (data, cmd) {
    data.QueryOp = 'find'
    data.Query = JSON.stringify(cmd.query)
  }],
  [ifDef('findAndModify'), function (data, cmd) {
    data.QueryOp = 'find_and_modify'
    data.Query = JSON.stringify(cmd.query)
    data.Update_Document = JSON.stringify(cmd.update)
  }],
  [ifDef('count'), function (data, cmd) {
    data.QueryOp = 'count'
    data.Query = JSON.stringify(getQuery(cmd))
  }],

  // Modifying
  [ifDef('insert'), function (data, cmd) {
    data.QueryOp = 'insert'
    data.Insert_Document = JSON.stringify(cmd.documents)
  }],
  [ifDef('update'), function (data, cmd) {
    data.QueryOp = 'update'
    data.Query = JSON.stringify(cmd.updates.map(getQuery))
    data.Update_Document = JSON.stringify(cmd.updates.map(getUpdate))
  }],
  [ifDef('delete'), function (data, cmd) {
    data.QueryOp = 'remove'
    data.Query = JSON.stringify(cmd.deletes.map(getQuery))
  }],

  // Indexes
  [ifDef('createIndexes'), function (data, cmd) {
    data.QueryOp = 'create_indexes'
    data.Indexes = JSON.stringify(cmd.indexes)
  }],
  [ifDef('deleteIndexes', 'dropIndexes'), function (data, cmd) {
    data.QueryOp = 'drop_indexes'
    data.Index = JSON.stringify(cmd.index)
  }],
  [ifDef('reIndex'), function (data) {
    data.QueryOp = 'reindex'
  }],

  // Aggregation
  [ifDef('group'), function (data, cmd) {
    data.QueryOp = 'group'
    data.Group_Condition = JSON.stringify(cmd.group.cond)
    data.Group_Initial = JSON.stringify(cmd.group.initial)
    if (typeof cmd.group.$reduce === 'function') {
      data.Group_Reduce = cmd.group.$reduce.toString()
    } else if (typeof cmd.group.$reduce === 'object') {
      data.Group_Reduce = cmd.group.$reduce.code.toString()
    } else {
      data.Group_Reduce = cmd.group.$reduce.toString()
    }
    data.Group_Key = JSON.stringify(cmd.group.key)
  }],
  [ifDef('mapReduce'), function (data, cmd) {
    data.QueryOp = 'map_reduce'
    data.Map_Function = cmd.map
    data.Reduce_Function = cmd.reduce
    if (cmd.finalize) {
      data.Finalize_Function = cmd.finalize
    }
  }],
  [ifDef('aggregate'), function (data, cmd) {
    data.QueryOp = 'aggregate'
    data.Pipeline = JSON.stringify(cmd.pipeline)
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
