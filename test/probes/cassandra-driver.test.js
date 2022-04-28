/* global it, describe, before, beforeEach, after, afterEach */
'use strict'

const helper = require('../helper')
const { ao, startTest, endTest } = require('../1.test-common')

const noop = helper.noop
const conf = ao.probes['cassandra-driver']

const should = require('should') // eslint-disable-line no-unused-vars
const hosts = helper.Address.from(
  process.env.SW_APM_TEST_CASSANDRA_2_2 || 'cassandra:9042'
)

const ks = 'test' + (process.env.AO_IX || '')

if (helper.skipTest(module.filename)) {
  process.exit()
}

const cassandra = require('cassandra-driver')

const pkg = require('cassandra-driver/package')

describe('probes.cassandra-driver ' + pkg.version, function () {
  this.timeout(10000)
  const ctx = { ao }
  let emitter
  let client
  let prevDebug

  before(function () {
    startTest(__filename)
  })
  after(function () {
    endTest()
  })

  //
  // Define some general message checks
  //
  const checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'cassandra')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Database', ks)
      msg.should.have.property('Flavor', 'cql')
    },
    info: function (msg) {
      msg.should.have.property('Label', 'info')
      msg.should.have.property('RemoteHost')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'cassandra')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // Intercept messages for analysis
  //
  before(function (done) {
    emitter = helper.backend(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ao.g.testing(__filename)
  })
  after(function (done) {
    emitter.close(done)
  })

  //
  // Construct database client
  //
  before(function (done) {
    const testClient = new cassandra.Client({
      contactPoints: hosts.map(function (v) { return v.host }),
      protocolOptions: { port: hosts[0].port },
      localDataCenter: 'datacenter1'
    })
    function shutdown () {
      testClient.shutdown(function () {
        done()
      })
    }
    // eslint-disable-next-line max-len
    testClient.execute(`CREATE KEYSPACE IF NOT EXISTS ${ks} WITH replication = {'class':'SimpleStrategy','replication_factor':1};`, shutdown)
  })
  before(function () {
    client = ctx.cassandra = new cassandra.Client({
      contactPoints: hosts.map(function (v) { return v.host }),
      protocolOptions: { port: hosts[0].port },
      keyspace: ks,
      localDataCenter: 'datacenter1'
    })
  })
  before(function (done) {
    client.execute('CREATE COLUMNFAMILY IF NOT EXISTS "foo" (bar varchar, PRIMARY KEY (bar));', done)
  })
  before(function (done) {
    client.batch([{
      query: 'INSERT INTO foo (bar) values (?);',
      params: ['baz']
    }, {
      query: 'INSERT INTO foo (bar) values (?);',
      params: ['buz']
    }], done)
  })
  // cleanup
  after(function (done) {
    client.execute('TRUNCATE "foo";', function () {
      client.shutdown(function () {
        done()
      })
    })
  })

  beforeEach(function () {
    prevDebug = ao.logLevel
    if (this.currentTest.title === 'should trace a prepared query') {
      // ao.logLevel += ',test:messages'
    }
  })

  afterEach(function () {
    ao.logLevel = prevDebug
  })

  // test to work around UDP dropped message issue
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', noop)
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit')
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  it('should be configured to sanitize SQL by default', function () {
    conf.should.have.property('sanitizeSql', true)
    // turn off for testing
    conf.sanitizeSql = false
  })

  it('should be configured to not tag SQL by default', function () {
    ao.probes.mysql.should.have.property('tagSql', false)
  })

  it('should trace a basic query', test_basic)
  it('should trace a prepared query', test_prepare)
  it('should sanitize query string, when not using value list', test_sanitize)
  it('should trace an iterator query', test_iterator)
  it('should trace a query stream', test_stream)
  it('should trace a batched query', test_batch)
  it('should tag queries when feature is enabled', test_tag)
  it('should not break when disabled', test_disabled)
  it('should shorten long queries', test_query_shortening)

  //
  // Define test handlers
  //
  function test_basic (done) {
    helper.test(emitter, function (done) {
      ctx.cassandra.execute('SELECT now() FROM system.local', done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT now() FROM system.local')
        msg.should.have.property('ConsistencyLevel')
        msg.should.not.have.property('QueryTag')
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_prepare (done) {
    helper.test(emitter, function (done) {
      ctx.cassandra.execute('SELECT now() FROM system.local', [], { prepare: true }, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT now() FROM system.local')
        msg.should.have.property('ConsistencyLevel')
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_sanitize (done) {
    helper.test(emitter, function (done) {
      const conf = ctx.ao.probes['cassandra-driver']
      conf.sanitizeSql = true
      ctx.cassandra.execute("SELECT * from foo where bar='1'", function (err) {
        conf.sanitizeSql = false
        done(err)
      })
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT * from foo where bar=?')
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_iterator (done) {
    helper.test(emitter, function (done) {
      ctx.cassandra.eachRow('SELECT * from foo where bar=?', ['1'], function () {
        // row handler
      }, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT * from foo where bar=?')
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_stream (done) {
    helper.test(emitter, function (done) {
      const s = ctx.cassandra.stream('SELECT * from foo')
      s.on('error', done)
      s.on('end', done)
      s.resume()
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT * from foo')
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_batch (done) {
    function after (err) {
      conf.sanitizeSql = false
      done(err)
    }

    helper.test(emitter, function (done) {
      ctx.cassandra.batch([{
        query: 'INSERT INTO foo (bar) values (?)',
        params: ['bux']
      }, {
        query: 'INSERT INTO foo (bar) values (\'bax\')'
      }], done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'BATCH')
        msg.should.have.property('BatchQueries', '["INSERT INTO foo (bar) values (?)","INSERT INTO foo (bar) values (\'bax\')"]')
        msg.should.have.property('BatchQueryArgs', '[["bux"],null]')
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], next)

    function next (err) {
      if (err) return after(err)

      conf.sanitizeSql = true
      helper.test(emitter, function (done) {
        ctx.cassandra.batch([{
          query: 'INSERT INTO foo (bar) values (?)',
          params: ['bux']
        }, {
          query: 'INSERT INTO foo (bar) values (\'bax\')'
        }], done)
      }, [
        function (msg) {
          checks.entry(msg)
          msg.should.have.property('Query', 'BATCH')
          msg.should.have.property('BatchQueries', '["INSERT INTO foo (bar) values (?)","INSERT INTO foo (bar) values (?)"]')
          msg.should.not.have.property('BatchQueryArgs')
        },
        function (msg) {
          checks.info(msg)
        },
        function (msg) {
          checks.exit(msg)
        }
      ], after)
    }
  }

  function test_tag (done) {
    ao.probes['cassandra-driver'].tagSql = true

    helper.test(emitter, function (done) {
      ctx.cassandra.execute('SELECT now() FROM system.local', done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT now() FROM system.local')
        msg.should.have.property('QueryTag', `/*traceparent='${msg['sw.trace_context']}'*/`)
        msg.should.have.property('ConsistencyLevel')
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_disabled (done) {
    conf.enabled = false
    conf.sanitizeSql = true
    helper.test(emitter, function (done) {
      ctx.cassandra.batch([{
        query: 'INSERT INTO foo (bar) values (?)',
        params: ['bux']
      }, {
        query: 'INSERT INTO foo (bar) values (\'bax\')'
      }], done)
    }, [], next)

    function after (err) {
      conf.enabled = true
      conf.sanitizeSql = false
      done(err)
    }

    function next (err) {
      if (err) return after(err)
      helper.test(emitter, function (done) {
        ctx.cassandra.batch([{
          query: 'INSERT INTO foo (bar) values (?)',
          params: ['bux']
        }, {
          query: 'INSERT INTO foo (bar) values (\'bax\')'
        }], done)
      }, [], after)
    }
  }

  function test_query_shortening (done) {
    helper.test(emitter, function (done) {
      const query = 'SELECT ' +
        range(300).map(function () { return 'now()' }).join(', ') +
        ' FROM system.local'

      query.length.should.be.above(2048)
      ctx.cassandra.execute(query, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query')
        msg.Query.length.should.not.be.above(2048)
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)

    function range (end, start, step) {
      step = step || 1
      start = start || 0
      const inc = start > end ? -step : step
      const items = []
      for (let i = start; i < end; i += inc) {
        items.push(i)
      }
      return items
    }
  }
})
