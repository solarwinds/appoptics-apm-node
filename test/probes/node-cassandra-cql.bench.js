var helper = require('../helper')
var ao = helper.ao
var Layer = ao.Layer

var db_host = process.env.CASSANDRA_PORT_9160_TCP_ADDR || '127.0.0.1'
var remote_host = db_host + ':9042'

var cassandra
var stream = require('stream')
var hasReadableStream = typeof stream.Readable !== 'undefined'
if (hasReadableStream) {
  cassandra = require('node-cassandra-cql')
}

tracelyzer.setMaxListeners(Infinity)

suite('probes/node-cassandra-cql', function () {
  var context = {}
  var client

  before(function () {
    if ( ! cassandra) {
      throw new Error('This node version is not supported by node-cassandra-cql')
    }
  })

  //
  // Ensure we have a connection and that the appropriate test data exists
  //
  before(function (done) {
    var testClient = new cassandra.Client({
      hosts: [db_host]
    })
    testClient.execute("CREATE KEYSPACE IF NOT EXISTS test WITH replication = {'class':'SimpleStrategy','replication_factor':1};", done)
  })
  before(function () {
    client = new cassandra.Client({
      hosts: [db_host],
      keyspace: 'test'
    })
  })
  before(function (done) {
    client.execute('CREATE COLUMNFAMILY IF NOT EXISTS "foo" (bar varchar, PRIMARY KEY (bar));', done)
  })
  after(function (done) {
    client.execute('TRUNCATE "foo";', done)
  })

  before(function () {
    ao.requestStore.enter(context)
    layer = new Layer('test', null, {})
    layer.enter()
  })
  after(function () {
    layer.exit()
    ao.requestStore.exit(context)
  })

  bench('execute', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    client.execute('SELECT now() FROM system.local', function () {})
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
