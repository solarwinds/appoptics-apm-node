'use strict'

const requirePatch = require('../require-patch')
const shimmer = require('shimmer')
const semver = require('semver')
const ao = require('..')
const conf = ao.probes['mongodb-core']
const log = ao.loggers

const clientVersion = requirePatch.relativeRequire('mongodb-core/package').version
const majorVersion = semver.major(clientVersion)

let protocols

module.exports = function (mongodb) {
  protocols = {
    twosix: {
      file: '2_6_support'
    },
    threetwo: {
      file: '3_2_support'
    }
  }

  // version 3 dropped support for 2.4 wire protocol.
  if (majorVersion < 3) {
    protocols.twofour = {file: '2_4_support'}
  }

  Object.keys(protocols).forEach(p => {
    try {
      protocols[p].class = requirePatch.relativeRequire(
        'mongodb-core/lib/wireprotocol/' + protocols[p].file
      )
    } catch (e) {
      log.patching('cannot require %s support %s', p, e)
    }
  })

  // Patch Server
  {
    const proto = mongodb.Server && mongodb.Server.prototype
    if (proto) {
      patchCommands(proto)
    } else {
      log.patching('mongodb-core missing Server[.prototype]')
    }
  }

  // Patch ReplSet
  {
    const proto = mongodb.ReplSet && mongodb.ReplSet.prototype
    if (proto) {
      patchCommands(proto)
    } else {
      log.patching('mongodb-core missing ReplSet[.prototype]')
    }
  }

  // Patch Mongos
  {
    const proto = mongodb.Mongos && mongodb.Mongos.prototype
    if (proto) {
      patchCommands(proto)
    } else {
      log.patching('mongodb-core missing Mongos[.prototype]')
    }
  }

  // Patch Cursor
  {
    const proto = mongodb.Cursor && mongodb.Cursor.prototype
    if (proto) {
      patchCursor(proto)
    } else {
      log.patching('mongodb-core missing Cursor[.prototype]')
    }
  }

  return mongodb
}

function protocolVersion (t) {
  let wph
  if (t.wireProtocolHandler) {
    wph = t.wireProtocolHandler
  } else if (t.s && t.s.replicaSetState) {
    const rs = t.s.replicaSetState
    if (rs.primary && rs.primary.wireProtocolHandler) {
      wph = rs.primary.wireProtocolHandler
    } else {
      return undefined
    }
  }

  // check for 2.4 last as it is no longer supported
  if (wph instanceof protocols.twosix.class) {
    return '2.6'
  } else if (majorVersion > 1 && wph instanceof protocols.threetwo.class) {
    return '3.2'
  } else if (majorVersion < 3 && wph instanceof protocols.twofour.class) {
    return '2.4'
  } else {
    return undefined
  }
}

function makeWrapper (obj, name, addData) {
  if (typeof obj[name] !== 'function') {
    log.patching('mongodb-core %s not a function', name)
    return
  }
  shimmer.wrap(obj, name, handler => function (ns, cmd, opts, cb) {
    const version = protocolVersion(this)
    //log.debug('wire protocol is %s', version, ns, cmd)
    // client version 1 cannot handle wire protocols greater
    // than 2.4.
    if (version !== '2.4' && majorVersion < 2) {
      return handler.call(this, ns, cmd, opts, cb)
    }

    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }

    return ao.instrument(
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
  if (typeof obj.command !== 'function') {
    log.patching('mongodb-core obj.command not a function for ', obj)
    return
  }
  shimmer.wrap(obj, 'command', handler => function (ns, cmd, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    }
    return ao.instrument(
      last => last.descend('mongodb-core', makeData(this, ns, cmd)),
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
    log.patching('mongodb-core %s not a function', 'cursor.next')
    return
  }
  shimmer.wrap(cursor, 'next', handler => function (cb) {
    const self = this
    let span

    return ao.instrument(
      last => (span = last.descend(
        'mongodb-core',
        makeData(this.topology, this.ns, this.cmd)
      )),
      done => handler.call(this, function () {
        if (span) span.events.exit.set({
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
    return args.reduce((r, v) => r || v in o || v.toLowerCase() in o, false)
  }
}

function serverDetails ({s = {}}) {
  if (s.serverDetails) {
    return s.serverDetails
  } else if (s.replState && s.replState.primary) {
    return s.replState.primary.s.serverDetails
  } else {
    return {name: s.options.host + ':' + (s.options.port || 27017)}
  }
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
