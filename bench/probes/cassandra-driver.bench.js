var helper = require('../helper')
var ao = helper.ao
var Span = ao.Span

var db_host = process.env.CASSANDRA_PORT_9160_TCP_ADDR || '127.0.0.1'
var remote_host = db_host + ':9042'

var cassandra
var stream = require('stream')
var hasReadableStream = typeof stream.Readable !== 'undefined'
if (hasReadableStream) {
  cassandra = require('cassandra-driver')
}

tracelyzer.setMaxListeners(Infinity)

suite('probes/cassandra-driver', function () {
  var context = {}
  var client

  before(function () {
    if ( ! cassandra) {
      throw new Error('This node version is not supported by cassandra-driver')
    }
  })

  //
  // Ensure we have a connection and that the appropriate test data exists
  //
  before(function (done) {
    var testClient = new cassandra.Client({
      contactPoints: [db_host]
    })
    testClient.execute("CREATE KEYSPACE IF NOT EXISTS test WITH replication = {'class':'SimpleStrategy','replication_factor':1};", done)
  })
  before(function () {
    client = new cassandra.Client({
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

  before(function () {
    ao.requestStore.enter(context)
    span = new Span('test', null, {})
    span.enter()
  })
  after(function () {
    span.exit()
    ao.requestStore.exit(context)
  })

  bench('execute', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    client.execute('SELECT now() FROM system.local', function () {})
  })

  bench('batch', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    client.batch([{
      query: 'INSERT INTO foo (bar) values (?)',
      params: ['bux']
    }, {
      query: 'INSERT INTO foo (bar) values (\'bax\')'
    }], function () {})
  })

  bench('iterator', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    client.eachRow('SELECT * from foo', function () {
      // row handler
    }, function () {})
  })

  bench('stream', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    var s = client.stream('SELECT * from foo')
    s.on('error', function () {})
    s.on('end', function () {})
    s.resume()
  })
})

function after (n, cb) {
  return function () {
    --n || cb()
  }
}

function multi_on (em, n, ev, cb) {
  function step () {
    if (n-- > 0) em.once(ev, function () {
      cb.apply(this, arguments)
      step()
    })
  }
  step()
}
