'use strict'

const helper = require('../helper')
const {ao} = require('../1.test-common.js')

const noop = helper.noop
const addon = ao.addon

const expect = require('chai').expect;
const semver = require('semver')
const mongodb = require('mongodb-core')

const requirePatch = require('../../lib/require-patch')
requirePatch.disable()
const pkg = require('mongodb-core/package.json')
requirePatch.enable()

const moduleName = 'mongodb-core';

// just because it's not really documented particularly well in mongo docs
// the namespace argument (the first argument, a string, to most calls) is
// `database-name.collection-name` and the `$cmd` collection is a special
// collection against which

// need to make decisions based on major version
const majorVersion = semver.major(pkg.version)

let hosts = {
  '2.4': process.env.AO_TEST_MONGODB_2_4 || 'mongo_2_4:27017',
  '2.6': process.env.AO_TEST_MONGODB_2_6 || 'mongo_2_6:27017',
  '3.0': process.env.AO_TEST_MONGODB_3_0 || 'mongo_3_0:27017',
  'replica set': process.env.AO_TEST_MONGODB_SET
}

// version 3 of mongodb-core removed the 2.4 protocol driver.
if (majorVersion >= 3) {
  delete hosts['2.4']
}

// if travis reset for now.
// TODO BAM handle via env vars.
if (process.env.CI === 'true' && process.env.TRAVIS === 'true') {
  hosts = {
    '3+': process.env.AO_TEST_MONGODB_3 || 'localhost:27017',
    'replica set': process.env.AO_TEST_MONGODB_SET
  }
}

// use AO_IX if present. It provides a unique ID to prevent collisions
// during matrix testing. It's not needed when testing only one instance
// at a time locally.

const dbn = 'test' + (process.env.AO_IX ? '-' + process.env.AO_IX : '')

describe('probes.mongodb-core UDP', function () {
  let emitter

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ao.g.testing(__filename)
  })
  after(function (done) {
    emitter.close(done)
  })

  // fake test to work around UDP dropped message issue
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', noop)
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit'),
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })
})

describe('probes/mongodb-core ' + pkg.version, function () {
  Object.keys(hosts).forEach(function (host) {
    const db_host = hosts[host]
    if (!db_host) return
    describe(host, function () {
      makeTests(db_host, host, host === 'replica set')
    })
  })
})

function makeTests (db_host, host, isReplicaSet) {
  const ctx = {}
  let emitter
  let db
  let realSampleTrace

  const options = {
    writeConcern: {w: 1},
    ordered: true
  }

  //
  // Intercept appoptics messages for analysis
  //
  beforeEach(function (done) {
    ao.probes.fs.enabled = false
    emitter = helper.appoptics(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    realSampleTrace = ao.addon.Context.sampleTrace
    ao.addon.Context.sampleTrace = function () {
      return {sample: true, source: 6, rate: ao.sampleRate}
    }
    ao.probes['mongodb-core'].collectBacktraces = false
  })
  afterEach(function (done) {
    ao.probes.fs.enabled = true
    ao.addon.Context.sampleTrace = realSampleTrace
    emitter.close(done)
  })

  //
  // Open a fresh mongodb connection for each test
  //
  before(function (done) {
    const hosts = db_host.split(',').map(function (host) {
      const parts = host.split(':')
      host = parts.shift()
      const port = parts.shift()
      return {
        host: host,
        port: Number(port)
      }
    })

    ao.logLevel = 'error,warn,debug,patching'

    ao.loggers.test.debug(`using dbn ${dbn}`)

    let server
    if (hosts.length > 1) {
      const options = {
        setName: 'default'
      }
      server = new mongodb.ReplSet(hosts, options)
    } else {
      server = new mongodb.Server({
        host: hosts[0].host,
        port: hosts[0].port,
        reconnect: true,
        reconnectInterval: 50
      })
    }

    server.on('error', function (err) {
      // eslint-disable-next-line no-console
      console.log('error connecting', err)
      done()
    })
    server.on('connect', function (_db) {
      ctx.mongo = db = _db
      done()
    })

    server.connect()
  })
  before(function (done) {
    if (!db) {
      done()
      return
    }
    db.command(`${dbn}.$cmd`, {
      dropDatabase: 1
    }, function () {done()})
  })
  after(function () {
    if (db) {
      db.destroy()
    }
  })

  const check = {
    base: function (msg) {
      msg.should.have.property('Spec', 'query')
      msg.should.have.property('Flavor', 'mongodb')
      msg.should.have.property('RemoteHost')
      expect(msg.RemoteHost).oneOf(db_host.split(','));
    },
    common: function (msg) {
      msg.should.have.property('Database', `${dbn}`)
    },
    entry: function (msg) {
      const explicit = `${msg.Layer}:${msg.Label}`;
      expect(explicit).equal(`${moduleName}:entry`, 'message Layer and Label must be correct');
      check.base(msg)
    },
    exit: function (msg) {
      const explicit = `${msg.Layer}:${msg.Label}`;
      expect(explicit).equal(`${moduleName}:exit`, 'message Layer and Label must be correct');
    }
  }

  //
  // Tests
  //
  const tests = {
    databases: function () {
      it('should drop', function (done) {
        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'drop')
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(
            `${dbn}.$cmd`,
            {dropDatabase: 1},
            done
          )
        }, steps, done)
      })
    },

    //
    // collections tests
    //
    collections: function () {
      it('should create', function (done) {
        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'create_collection')
          msg.should.have.property('New_Collection_Name', `coll-${dbn}`)
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [entry]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.$cmd`, {create: `coll-${dbn}`},
            function (e, data) {
              if (e) {
                ao.loggers.debug(`error creating "coll-${dbn}`, e)
                done(e)
                return
              }
              done()
            }
          )
        }, steps, done)
      })

      it('should rename', function (done) {
        function entry (msg) {
          check.entry(msg)
          msg.should.have.property('QueryOp', 'rename')
          msg.should.have.property('New_Collection_Name', `coll2-${dbn}`)
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(
            'admin.$cmd',
            {
              renameCollection: `${dbn}.coll-${dbn}`,
              to: `${dbn}.coll2-${dbn}`,
              dropTarget: true
            },
            function (e, data) {
              if (e) {
                ao.loggers.debug(`error renaming "coll-${dbn} to ${dbn}.coll2-${dbn}`, e)
                done(e)
                return
              }
              done()
            }
          )
        }, steps, done)
      })

      it('should drop', function (done) {
        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'drop_collection')
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [entry]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.$cmd`, {drop: `coll2-${dbn}`},
            function (e, data) {
              if (e) {
                ao.loggers.debug(`error dropping "coll2-${dbn}`, e)
                done(e)
                return
              }
              done()
            }
          )
        }, steps, done)
      })
    },

    //
    // query tests
    //
    queries: function () {
      it('should insert', function (done) {
        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'insert')
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [entry]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.insert(`${dbn}.data-${dbn}`, [{a: 1}, {a: 2}], options, done)
        }, steps, done)
      })

      it('should update', function (done) {
        const query = {a: 1}
        const update = {
          $set: {b: 1}
        }

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'update')
          msg.should.have.property('Query', JSON.stringify([query]))
          msg.should.have.property('Update_Document', JSON.stringify([update]))
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [entry]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.update(`${dbn}.data-${dbn}`, [{
            q: query,
            u: update
          }], options, done)
        }, steps, done)
      })

      it('should findAndModify', function (done) {
        const query = {a: 1}
        const update = {a:1, b: 2}

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'find_and_modify')
          msg.should.have.property('Query', JSON.stringify(query))
          msg.should.have.property('Update_Document', JSON.stringify(update))
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.data-${dbn}`, {
            findAndModify: `${dbn}.data-${dbn}`,
            query: query,
            update: update,
            new: true
          }, options, done)
        }, steps, done)
      })

      it('should distinct', function (done) {
        const query = {a: 1}
        const key = 'b'

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'distinct')
          msg.should.have.property('Query', JSON.stringify(query))
          msg.should.have.property('Key', key)
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.$cmd`, {
            distinct: `${dbn}.data-${dbn}`,
            key: key,
            q: query
          }, options, done)
        }, steps, done)
      })

      it('should count', function (done) {
        const query = {a: 1}

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'count')
          msg.should.have.property('Query', JSON.stringify(query))
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.$cmd`, {
            count: `${dbn}.data-${dbn}`,
            q: query
          }, options, done)
        }, steps, done)
      })

      it('should remove', function (done) {
        const query = {a: 1}

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'remove')
          msg.should.have.property('Query', JSON.stringify([query]))
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [entry]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.remove(`${dbn}.data-${dbn}`, [{
            q: query,
            limit: 1
          }], options, done)
        }, steps, done)
      })
    },

    indexes: function () {
      if (host === '2.4') {
        it.skip('should create_indexes', noop)
        it.skip('should reindex', noop)
        it.skip('should drop_indexes', noop)
        return
      }

      it('should create_indexes', function (done) {
        const index = {
          key: {a: 1, b: 2},
          name: 'data'
        }

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'create_indexes')
          msg.should.have.property('Indexes', JSON.stringify([index]))
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.$cmd`, {
            createIndexes: `${dbn}.data-${dbn}`,
            indexes: [ index ]
          }, options, done)
        }, steps, done)
      })

      it('should reindex', function (done) {
        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'reindex')
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.$cmd`, {
            reIndex: `${dbn}.data-${dbn}`
          }, options, done)
        }, steps, done)
      })

      it('should drop_indexes', function (done) {
        const index = {a: 1, b: 2}

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'drop_indexes')
          msg.should.have.property('Index', JSON.stringify(index))
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.$cmd`, {
            deleteIndexes: `${dbn}.data-${dbn}`,
            index: index
          }, options, done)
        }, steps, done)
      })
    },

    cursors: function () {
      it('should find', function (done) {
        helper.test(emitter, function (done) {
          const cursor = db.cursor(`${dbn}.data-${dbn}`, {
            find: `${dbn}.data-${dbn}`,
            query: {a: 1}
          }, options)
          cursor.next(done)
        }, [
          function (msg) {
            check.entry(msg)
          },
          function (msg) {
            check.exit(msg)
          }
        ], done)
      })
    },

    aggregations: function () {
      it('should group', function (done) {
        const group = {
          ns: `${dbn}.data-${dbn}`,
          key: {},
          initial: {count: 0},
          $reduce: function (doc, out) {out.count++}.toString(),
          out: 'inline',
          cond: {a: {$gte: 0}}
        }

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'group')
          msg.should.have.property('Group_Reduce', group.$reduce.toString())
          msg.should.have.property('Group_Initial', JSON.stringify(group.initial))
          msg.should.have.property('Group_Condition', JSON.stringify(group.cond))
          msg.should.have.property('Group_Key', JSON.stringify(group.key))
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.$cmd`, {
            group: group
          }, done)
        }, steps, done)
      })

      if (host === '2.4') {
        it.skip('should map_reduce', noop)
        return
      }

      it('should map_reduce', function (done) {
        // eslint-disable-next-line no-undef
        function map () {emit(this.a, 1)}
        function reduce (k, vals) {return 1}

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'map_reduce')
          msg.should.have.property('Reduce_Function', reduce.toString())
          msg.should.have.property('Map_Function', map.toString())
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command(`${dbn}.$cmd`, {
            mapreduce: `${dbn}.data-${dbn}`,
            map: map.toString(),
            reduce: reduce.toString(),
            out: 'inline'
          }, done)
        }, steps, done)
      })
    }
  }

  describe('databases', tests.databases)
  describe('collections', tests.collections)
  describe('queries', tests.queries)
  describe('indexes', tests.indexes)
  describe('cursors', tests.cursors)
  describe('aggregations', tests.aggregations)
}
