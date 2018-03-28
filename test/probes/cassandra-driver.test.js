var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon
var conf = ao.probes['cassandra-driver']

var should = require('should')
var hosts = helper.Address.from(
  process.env.AO_TEST_CASSANDRA_2_2 || 'cassandra:9042'
)

//
// Do not load unless stream.Readable exists.
// It will fail silently, stalling the tests.
//
var cassandra
var stream = require('stream')
var hasReadableStream = typeof stream.Readable !== 'undefined'
if (hasReadableStream) {
  cassandra = require('cassandra-driver')
}

describe('probes.cassandra-driver UDP', function () {
  var emitter

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
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


describe('probes.cassandra-driver', function () {
  this.timeout(10000)
  var emitter
  var ctx = {}
  var client
  var db

  //
  // Define some general message checks
  //
  var checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'cassandra')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Database', 'test')
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
  // Only run before/after when running tests
  //
  if (hasReadableStream) {
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

    //
    // Construct database client
    //
    before(function (done) {
      var testClient = new cassandra.Client({
        contactPoints: hosts.map(function (v) { return v.host }),
        protocolOptions: { port: hosts[0].port }
      })
      testClient.execute("CREATE KEYSPACE IF NOT EXISTS test WITH replication = {'class':'SimpleStrategy','replication_factor':1};", done)
    })
    before(function () {
      client = ctx.cassandra = new cassandra.Client({
        contactPoints: hosts.map(function (v) { return v.host }),
        protocolOptions: { port: hosts[0].port },
        keyspace: 'test'
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
    after(function (done) {
      client.execute('TRUNCATE "foo";', done)
    })

    it('should sanitize SQL by default', function () {
      conf.should.have.property('sanitizeSql', true)
      conf.sanitizeSql = false
    })
    it('should trace a basic query', test_basic)
    it('should trace a prepared query', test_prepare)
    it('should sanitize query string, when not using value list', test_sanitize)
    it('should trace an iterator query', test_iterator)
    it('should trace a query stream', test_stream)
    it('should trace a batched query', test_batch)
    it('should not break when disabled', test_disabled)
    it('should shorten long queries', test_query_shortening)

  //
  // Otherwise, just create blank skipped tests for log visibility
  //
  } else {
    it.skip('should trace a basic query', test_basic)
    it.skip('should trace a prepared query', test_prepare)
    it.skip('should sanitize query string, when not using value list', test_sanitize)
    it.skip('should trace an iterator query', test_iterator)
    it.skip('should trace a query stream', test_stream)
    it.skip('should trace a batched query', test_batch)
    it.skip('should not break when disabled', test_disabled)
    it.skip('should shorten long queries', test_query_shortening)
  }

  //
  // Define test handlers
  //
  function test_basic (done) {
    helper.test(emitter, helper.run(ctx, 'cassandra-driver/basic'), [
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

  function test_prepare (done) {
    helper.test(emitter, helper.run(ctx, 'cassandra-driver/prepare'), [
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
    helper.test(emitter, helper.run(ctx, 'cassandra-driver/sanitize'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT * from foo where bar=\'?\'')
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
    helper.test(emitter, helper.run(ctx, 'cassandra-driver/iterator'), [
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
    helper.test(emitter, helper.run(ctx, 'cassandra-driver/stream'), [
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

    helper.test(emitter, helper.run(ctx, 'cassandra-driver/batch'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'BATCH')
        msg.should.have.property('BatchQueries', '["INSERT INTO foo (bar) values (?)","INSERT INTO foo (bar) values (\'bax\')"]')
        msg.should.have.property('BatchQueryArgs', '["bux",null]')
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], next)

    function next(err) {
      if (err) return after(err)

      conf.sanitizeSql = true
      helper.test(emitter, helper.run(ctx, 'cassandra-driver/batch'), [
        function (msg) {
          checks.entry(msg)
          msg.should.have.property('Query', 'BATCH')
          msg.should.have.property('BatchQueries', '["INSERT INTO foo (bar) values (?)","INSERT INTO foo (bar) values (\'?\')"]')
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

  function test_disabled (done) {
    conf.enabled = false
    conf.sanitizeSql = true
    helper.test(emitter, helper.run(ctx, 'cassandra-driver/batch'), [], next)

    function after (err) {
      conf.enabled = true
      conf.sanitizeSql = false
      done(err)
    }

    function range (end, start, step) {
      step = step || 1
      start = start || 0
      inc = start > end ? -step : step
      var items = []
      for (var i = start; i < end; i += inc) {
        items.push(i)
      }
      return items
    }

    function next(err) {
      if (err) return after(err)
      helper.test(emitter, helper.run(ctx, 'cassandra-driver/batch'), [], after)
    }
  }

  function test_query_shortening (done) {
    helper.test(emitter, function (done) {
      var query = 'SELECT '
        + range(300).map(function () { return 'now()' }).join(', ')
        + ' FROM system.local'

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
      inc = start > end ? -step : step
      var items = []
      for (var i = start; i < end; i += inc) {
        items.push(i)
      }
      return items
    }
  }

})
