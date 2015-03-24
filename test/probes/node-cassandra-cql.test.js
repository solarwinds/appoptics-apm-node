var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')

//
// Do not load unless stream.Readable exists.
// It will fail silently, stalling the tests.
//
var cql
var stream = require('stream')
var hasReadableStream = typeof stream.Readable !== 'undefined'
if (hasReadableStream) {
  cql = require('node-cassandra-cql')
}

describe('probes.cassandra', function () {
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
      msg.should.have.property('RemoteHost', 'localhost:9042')
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
      client = new cql.Client({
        hosts: ['localhost'],
        keyspace: 'test'
      })
      ctx.cql = client

      client.execute('CREATE COLUMNFAMILY IF NOT EXISTS "foo" (bar varchar, PRIMARY KEY (bar));', function () {
        done()
      })
    })

    it('should trace a basic query', test_basic)
    it('should trace prepared statements', test_prepared)
    it('should sanitize query string, when not using value list', test_sanitize)

  //
  // Otherwise, just create blank skipped tests for log visibility
  //
  } else {
    it.skip('should trace a basic query', test_basic)
    it.skip('should trace prepared statements', test_prepared)
    it.skip('should sanitize query string, when not using value list', test_sanitize)
  }

  //
  // Define test handlers
  //
  function test_basic (done) {
    helper.httpTest(emitter, helper.run(ctx, 'node-cassandra-cql/basic'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT now() FROM system.local')
        msg.should.have.property('ConsistencyLevel', 'quorum')
      },
      function (msg) {
        checks.info(msg)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_prepared (done) {
    helper.httpTest(emitter, helper.run(ctx, 'node-cassandra-cql/prepared'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT * from foo where bar=?')
        msg.should.have.property('QueryArgs', '["1"]')
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
    helper.httpTest(emitter, helper.run(ctx, 'node-cassandra-cql/sanitize'), [
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
})
