'use strict'

const helper = require('../helper')
const {ao} = require('../1.test-common.js')


const noop = helper.noop
const addon = ao.addon

const semver = require('semver')
const mongodb = require('mongodb')
const MongoClient = mongodb.MongoClient

const expect = require('chai').expect;

const pkg = require('mongodb/package.json');

// prior to version 3.3.0 mongodb used mongodb-core. from 3.3.0 on mongodb
// has incorporated those functions into its own codebase.
const moduleName = semver.gte(pkg.version, '3.3.0') ? 'mongodb' : 'mongodb-core';

let hosts = {
  '2.4': process.env.AO_TEST_MONGODB_2_4 || 'mongo_2_4:27017',
  '2.6': process.env.AO_TEST_MONGODB_2_6 || 'mongo_2_6:27017',
  '3.0': process.env.AO_TEST_MONGODB_3_0 || 'mongo_3_0:27017',
  'replica set': process.env.AO_TEST_MONGODB_SET
}

// version 3 of mongodb-core removed the 2.4 protocol driver. and mongodb 3.0.0
// uses mongodb-core 3.0.0
if (semver.gte(pkg.version, '3.0.0')) {
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
// at a time locally. Save database name and collection name.

const dbn = 'test' + (process.env.AO_IX ? '-' + process.env.AO_IX : '')
const cn = `coll-${dbn}`

describe('probes.mongodb UDP', function () {
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

describe('probes/mongodb ' + pkg.version, function () {
  Object.keys(hosts).forEach(function (host) {
    const db_host = hosts[host]
    if (!db_host) return
    describe(host, function () {
      makeTests(db_host, host, host === 'replica set')
    })
  })
})


//
// make the tests
//
function makeTests (db_host, host, isReplicaSet) {
  const ctx = {}
  let emitter
  let db
  //let realSampleTrace

  const options = {
    writeConcern: {w: 1},
    ordered: true
  }

  //
  // Intercept appoptics messages for analysis
  //
  beforeEach(function (done) {
    ao.probes.fs.enabled = false
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ao.probes[moduleName].collectBacktraces = false
    emitter = helper.appoptics(function () {
      done();
    });
  });
  afterEach(function (done) {
    ao.probes.fs.enabled = true
    emitter.close(function () {
      done();
    });
  });


  // skip specific tests to faciliate test debugging.
  beforeEach(function () {
    const current = this.currentTest;
    const doThese = {
      databases: true,
      collections: true,
      queries: true,
      indexes: true,
      cursors: true,
      aggregations: true,
    }
    if (current.parent && !(current.parent.title in doThese)) {
    }
    // skip specific titles
    const skipTheseTitles = [];
    if (skipTheseTitles.indexOf(current.title) >= 0) {
    }
    // do only these specific titles
    const doTheseTitles = [
      'should drop',
      'should distinct',
      'should count',
    ];
    if (doTheseTitles.length && doTheseTitles.indexOf(current.title) >= 0) {
      //ao.logger.addEnabled('span');
    }
  });
  afterEach(function () {
    //ao.logger.removeEnabled('span');
  });

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

    ao.loggers.test.debug(`using dbn ${dbn}`)

    let server

    if (hosts.length > 1) {
      const options = {
        setName: 'default'
      }
      const servers = []
      hosts.forEach(function (host) {
        servers.push(new mongodb.Server(host.host, host.port))
      })
      server = new mongodb.ReplSet(servers, options)
      const mongoClient = new MongoClient(server, {})

      mongoClient.connect((err, _client) => {
        ao.loggers.test.debug('mongoClient() connect callback', err)
        if (err) {
          // eslint-disable-next-line no-console
          console.log('error connecting', err)
          return done(err)
        }
        ctx.server = server
        ctx.client = _client
        ctx.mongo = db = _client.db(dbn)
        ctx.collection = db.collection(cn)

        db.command({dropDatabase: 1}, function (err) {
          ao.loggers.test.debug('before() dropDatabase callback', err)
          done()
        })
      })

    } else {
      const host = hosts[0]
      const mongoOptions = {}
      let mongoClient

      if (semver.gte(pkg.version, '3.0.0')) {
        server = new mongodb.Server(host.host, host.port)
        mongoClient = new MongoClient(server, mongoOptions)
      } else {
        throw new Error(`mongodb v${pkg.version} is not supported`);
      }

      mongoClient.connect((err, _client) => {
        ao.loggers.test.debug('mongoClient() connect callback', err)
        if (err) {
          // eslint-disable-next-line no-console
          console.log('error connecting', err)
          return done(err)
        }
        ctx.server = server
        ctx.client = _client
        ctx.mongo = db = _client.db(dbn)
        ctx.collection = db.collection(cn)

        db.command({dropDatabase: 1}, function (err) {
          ao.loggers.test.debug('before() dropDatabase callback', err)
          done()
        })
      })
    }
  })
  before(function (done) {
    /*
    if (!db) {
      done()
      return
    }
    db.command(
      `${dbn}.$cmd`,
      {dropDatabase: 1},
      function (err) {
        ao.loggers.test.debug('before() dropDatabase callback', err)
        done(err)
      }
    )
    // */
    done()
  })
  after(function () {
    if (ctx.client) {
      ctx.client.close()
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
      it('should drop', function (tdone) {
        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'drop')
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [entry]

        if (isReplicaSet && moduleName === 'mongodb-core') {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          db.command({dropDatabase: 1}, done)
        }, steps, tdone)
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
          msg.should.have.property('New_Collection_Name', cn)
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
          db.command({create: cn},
            function (e, data) {
              if (e) {
                ao.loggers.test.debug(`error creating "coll-${dbn}`, e)
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

        const adminDb = ctx.client.db('admin')

        helper.test(emitter, function (done) {
          adminDb.command(
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
          db.command(
            {drop: `coll2-${dbn}`},
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
      it('should insertMany', function (done) {
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
          ctx.collection.insertMany(
            [{a: 1}, {a: 2}],
          ).then(results => done())
        }, steps, done)
      })

      it('should updateOne', function (done) {
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
          ctx.collection.updateOne(
            query,
            update
          ).then(results => done())
        }, steps, done)
      })

      // calls topologies but function is "findAndModify"
      it('should findOneAndUpdate', function (done) {
        const query = {a: 1}
        const update = {$set: {a:1, b: 2}}

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
          ctx.collection.findOneAndUpdate(
            query,
            update
          )
            .then(results => done())
            .catch(err => {
              done(err)
            })
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

        if (isReplicaSet && moduleName === 'mongodb-core') {
          steps.push(entry)
          steps.push(exit)
        }

        steps.push(exit)

        helper.test(emitter, function (done) {
          debugger
          ctx.collection.distinct(
            key,
            query,
            options
          ).then(results => done())
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
        if (isReplicaSet && moduleName === 'mongodb-core') {
          steps.push(entry)
          steps.push(exit)
        }
        steps.push(exit)

        helper.test(emitter, function (done) {
          ctx.collection.count(
            query,
            options
          ).then(results => done())
        }, steps, done)
      })

      it('should countDocuments', function (done) {
        const query = {a: 1}
        const pipeline = '[{"$match":{"a":1}},{"$group":{"_id":1,"n":{"$sum":1}}}]';

        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp').oneOf('count', 'aggregate')
          if (msg.QueryOp === 'count') {
            msg.should.have.property('Query', JSON.stringify(query))
          } else {
            msg.should.have.property('Pipeline', pipeline);
          }
        }

        function exit (msg) {
          check.exit(msg)
        }

        const steps = [entry]
        /*
        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }
        // */
        steps.push(exit)

        helper.test(emitter, function (done) {
          ctx.collection.countDocuments(
            query,
            options
          ).then(results => done())
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
          ctx.collection.remove(
            query,
            {justOne: true}
          ).then(results => done())
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
          name: 'mimi'
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

        const steps = [entry]
        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }
        steps.push(exit)

        helper.test(emitter, function (done) {
          ctx.collection.createIndexes([index], options)
            .then(results => done())
            .catch(e => {
              done(e)
            })
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

        const steps = [entry]
        if (isReplicaSet) {
          steps.push(entry)
          steps.push(exit)
        }
        steps.push(exit)

        helper.test(emitter, function (done) {
          ctx.collection.reIndex()
            .then(results => done())
        }, steps, done)
      })

      it('should drop_indexes', function (done) {
        function entry (msg) {
          check.entry(msg)
          check.common(msg)
          msg.should.have.property('QueryOp', 'drop_indexes')
          msg.should.have.property('Index', JSON.stringify('*'))
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
          ctx.collection.dropIndexes()
            .then(results => done())
        }, steps, done)
      })
    },

    cursors: function () {
      it('should find', function (done) {
        helper.test(emitter, function (done) {
          const cursor = ctx.collection.find(
            {a: 1},
            options
          )
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
          ctx.collection.group(
            {},
            {a: {$gte: 0}},
            {count: 0},
            function (doc, out) {out.count++}.toString(),
          ).then(results => done())
        }, steps, done)
      })

      if (host === '2.4') {
        it.skip('should map_reduce', noop)
        return
      }

      it('should map_reduce', function (done) {
        // eslint-disable-next-line
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
          ctx.collection.mapReduce(
            map.toString(),
            reduce.toString(),
            {out: {inline: 1}}
          ).then(results => done())
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
