var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')
var db_host = process.env.CASSANDRA_PORT_9160_TCP_ADDR || '127.0.0.1'
var remote_host = db_host + ':9042'

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

describe('probes.cassandra-driver', function () {
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
      msg.should.have.property('Layer', 'cassandra')
      msg.should.have.property('Label', 'info')
      msg.should.have.property('RemoteHost', remote_host)
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
    // Intercept tracelyzer messages for analysis
    //
    before(function (done) {
      emitter = helper.tracelyzer(done)
      tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
      tv.traceMode = 'always'
    })
    after(function (done) {
      emitter.close(done)
    })

    // Yes, this is really, actually needed.
    // Sampling may actually prevent reporting,
    // if the tests run too fast. >.<
    beforeEach(function (done) {
      helper.padTime(done)
    })

    //
    // Construct database client
    //
    before(function (done) {
      var testClient = new cassandra.Client({
        contactPoints: [db_host]
      })
      testClient.execute("CREATE KEYSPACE IF NOT EXISTS test WITH replication = {'class':'SimpleStrategy','replication_factor':1};", done)
    })
    before(function () {
      client = ctx.cassandra = new cassandra.Client({
        contactPoints: [db_host],
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

    it('should trace a basic query', test_basic)
    it('should trace a prepared query', test_prepare)
    it('should sanitize query string, when not using value list', test_sanitize)
    it('should trace an iterator query', test_iterator)
    it('should trace a query stream', test_stream)
    it('should trace a batched query', test_batch)

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
  }

  //
  // Define test handlers
  //
  function test_basic (done) {
    helper.httpTest(emitter, helper.run(ctx, 'cassandra-driver/basic'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT now() FROM system.local')
        msg.should.have.property('ConsistencyLevel', 'one')
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
    helper.httpTest(emitter, helper.run(ctx, 'cassandra-driver/prepare'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT now() FROM system.local')
        msg.should.have.property('ConsistencyLevel', 'one')
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
    helper.httpTest(emitter, helper.run(ctx, 'cassandra-driver/sanitize'), [
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
    helper.httpTest(emitter, helper.run(ctx, 'cassandra-driver/iterator'), [
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

  function test_stream (done) {
    helper.httpTest(emitter, helper.run(ctx, 'cassandra-driver/stream'), [
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
    helper.httpTest(emitter, helper.run(ctx, 'cassandra-driver/batch'), [
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
    ], done)
  }
})
