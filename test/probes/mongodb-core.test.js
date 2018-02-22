var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon

var should = require('should')

var semver = require('semver')
var request = require('request')
var mongodb = require('mongodb-core')
var http = require('http')

var requirePatch = require('../../dist/require-patch')
requirePatch.disable()
var pkg = require('mongodb-core/package.json')
requirePatch.enable()

var hosts = {
  '2.4': process.env.AO_TEST_MONGODB_2_4 || 'mongo_2_4:27017',
  '2.6': process.env.AO_TEST_MONGODB_2_6 || 'mongo_2_6:27017',
  '3.0': process.env.AO_TEST_MONGODB_3_0 || 'mongo_3:27017',
  'replica set': process.env.AO_TEST_MONGODB_SET
}

describe('probes.mongodb-core UDP', function () {
  var emitter

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  // fake test to work around UDP dropped message issue
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', ao.noop)
      done()
    }, [
        function (msg) {
          msg.should.have.property('Label').oneOf('entry', 'exit'),
            msg.should.have.property('Layer', 'fake')
        }
      ], done)
  })
})

describe('probes/mongodb-core', function () {
  Object.keys(hosts).forEach(function (host) {
    var db_host = hosts[host]
    if ( ! db_host) return
    describe(host, function () {
      makeTests(db_host, host, host === 'replica set')
    })
  })
})

function noop () {}

function makeTests (db_host, host, isReplicaSet) {
  var ctx = {}
  var emitter
  var db
  var realSampleTrace

  var options = {
    writeConcern: { w: 1 },
    ordered: true
  }

  //
  // Intercept appoptics messages for analysis
  //
  beforeEach(function (done) {
    ao.probes.fs.enabled = false
    emitter = helper.appoptics(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    realSampleTrace = ao.addon.Context.sampleTrace
    ao.addon.Context.sampleTrace = function () {
      return { sample: true, source: 6, rate: ao.sampleRate }
    }

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
    var hosts = db_host.split(',').map(function (host) {
      var parts = host.split(':')
      var host = parts.shift()
      var port = parts.shift()
      return {
        host: host,
        port: Number(port)
      }
    })

    var server = hosts.length > 1
      ? new mongodb.ReplSet(hosts, { setName: 'default' })
      : new mongodb.Server({
        host: hosts[0].host,
        port: hosts[0].port,
        reconnect: true,
        reconnectInterval: 50
      })

    server.on('error', done)
    server.on('connect', function (_db) {
      ctx.mongo = db = _db
      done()
    })

    server.connect()
  })
  before(function (done) {
    db.command('test.$cmd', {
      dropDatabase: 1
    }, done)
  })
  after(function () {
    db.destroy()
  })

  var check = {
    base: function (msg) {
      msg.should.have.property('Spec', 'query')
      msg.should.have.property('Flavor', 'mongodb')
      msg.should.have.property('RemoteHost')
      msg.RemoteHost.should.match(/:\d*$/)
    },
    common: function (msg) {
      msg.should.have.property('Database', 'test')
    },
    entry: function (msg) {
      msg.should.have.property('Layer', 'mongodb-core')
      msg.should.have.property('Label', 'entry')
      check.base(msg)
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'mongodb-core')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // Tests
  //
  var tests = {
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

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', { dropDatabase: 1 }, done)
        }, steps, done)
      })
    },

    collections: function () {
      it('should create', function (done) {
        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'create_collection')
          msg.should.have.property('New_Collection_Name', 'test')
        }

        function exit (msg) {
          check.exit(msg)
        }

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', { create: 'test' }, done)
        }, steps, done)
      })

      it('should rename', function (done) {
        function entry (msg) {
          check.entry(msg)
          msg.should.have.property('QueryOp', 'rename')
          msg.should.have.property('New_Collection_Name', 'test2')
        }

        function exit (msg) {
          check.exit(msg)
        }

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('admin.$cmd', {
            renameCollection: 'test.test',
            to: 'test.test2',
            dropTarget: true
          }, done)
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

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', { drop: 'test2' }, done)
        }, steps, done)
      })
    },

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

        var steps = [ entry, exit ]

        helper.test(emitter, function (done) {
          db.insert('test.data', [{ a: 1 }, { a: 2 }], options, done)
        }, steps, done)
      })

      it('should update', function (done) {
        var query = { a: 1 }
        var update = {
          $set: { b: 1 }
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

        var steps = [ entry, exit ]

        helper.test(emitter, function (done) {
          db.update('test.data', [{
            q: query,
            u: update
          }], options, done)
        }, steps, done)
      })

      it('should findAndModify', function (done) {
        var query = { a: 1 }
        var update = { a:1, b: 2 }

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

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.data', {
            findAndModify: 'test.data',
            query: query,
            update: update,
            new: true
          }, options, done)
        }, steps, done)
      })

      it('should distinct', function (done) {
        var query = { a: 1 }
        var key = 'b'

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

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', {
            distinct: 'test.data',
            key: key,
            q: query
          }, options, done)
        }, steps, done)
      })

      it('should count', function (done) {
        var query = { a: 1 }

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'count')
          msg.should.have.property('Query', JSON.stringify(query))
        }

        function exit (msg) {
          check.exit(msg)
        }

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', {
            count: 'test.data',
            q: query
          }, options, done)
        }, steps, done)
      })

      it('should remove', function (done) {
        var query = { a: 1 }

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'remove')
          msg.should.have.property('Query', JSON.stringify([query]))
        }

        function exit (msg) {
          check.exit(msg)
        }

        var steps = [ entry, exit ]

        helper.test(emitter, function (done) {
          db.remove('test.data', [{
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
        var index = {
          key: { a: 1, b: 2 },
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

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', {
            createIndexes: 'test.data',
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

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', {
            reIndex: 'test.data'
          }, options, done)
        }, steps, done)
      })

      it('should drop_indexes', function (done) {
        var index = { a: 1, b: 2 }

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'drop_indexes')
          msg.should.have.property('Index', JSON.stringify(index))
        }

        function exit (msg) {
          check.exit(msg)
        }

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', {
            deleteIndexes: 'test.data',
            index: index
          }, options, done)
        }, steps, done)
      })
    },

    cursors: function () {
      it('should find', function (done) {
        helper.test(emitter, function (done) {
          var cursor = db.cursor('test.data', {
            find: 'test.data',
            query: { a: 1 }
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
        var group = {
          ns: 'test.data',
          key: {},
          initial: { count: 0 },
          $reduce: function (doc, out) { out.count++ }.toString(),
          out: 'inline',
          cond: { a: { $gte: 0 } }
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

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', {
            group: group
          }, done)
        }, steps, done)
      })

      if (host === '2.4') {
        it.skip('should map_reduce', noop)
        return
      }

      it('should map_reduce', function (done) {
        function map () { emit(this.a, 1) }
        function reduce (k, vals) { return 1 }

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

        var steps = [ entry ]

        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command('test.$cmd', {
            mapreduce: 'test.data',
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
