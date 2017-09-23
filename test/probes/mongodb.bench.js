var helper = require('../helper')
var ao = helper.ao
var Layer = ao.Layer

var MongoDB = require('mongodb').MongoClient
var pkg = require('mongodb/package.json')

var db_host = process.env.MONGODB_PORT_27017_TCP_ADDR || 'localhost'

tracelyzer.setMaxListeners(Infinity)

suite('probes/mongodb', function () {
  var context = {}
  var db

  //
  // Prepare MongoDB connection
  //
  before(function (done) {
    MongoDB.connect('mongodb://' + db_host + '/test', function (err, _db) {
      if (err) return done(err)
      db = _db
      done()
    })
  })
  after(function (done) {
    db.close(done)
  })

  //
  // Enter tracing layer
  //
  before(function () {
    ao.requestStore.enter(context)
    layer = new Layer('test', null, {})
    layer.enter()
  })
  after(function () {
    layer.exit()
    ao.requestStore.exit(context)
  })

  //
  // Benchmarks
  //
  bench('dropDatabase', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.dropDatabase(cb)
  })

  bench('createCollection', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.createCollection('test', cb)
  })

  bench('options', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').options(cb)
  })

  bench('renameCollection', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.renameCollection('test', 'test2', cb)
  })

  bench('dropCollection', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.dropCollection('test2', cb)
  })

  bench('insert', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').insert({ foo: 'bar' }, cb)
  })

  bench('findAndModify', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').findAndModify(
      { foo: 'bar' },
      [],
      { baz: 'buz' },
      cb
    )
  })

  bench('update', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').update(
      { foo: 'bar' },
      { bax: 'bux' },
      cb
    )
  })

  bench('distinct', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').distinct('foo', cb)
  })

  bench('count', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').count({
      foo: 'bar',
      baz: 'buz'
    }, cb)
  })

  bench('remove', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').remove({
      foo: 'bar',
      baz: 'buz'
    }, cb)
  })

  bench('save', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').save({
      foo: 'bar',
      baz: 'buz'
    }, cb)
  })

  bench('createIndex', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').createIndex('foo', done)
  })

  bench('dropIndex', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').dropIndex('foo_1', cb)
  })

  bench('ensureIndex', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').ensureIndex({ foo: 1 }, cb)
  })

  bench('indexInformation', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').indexInformation(cb)
  })

  bench('reIndex', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').reIndex(cb)
  })

  bench('dropAllIndexes', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').dropAllIndexes(cb)
  })

  bench('group', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').group(
      function (doc) { return { a: doc.a }; },
      { foo: 'bar' },
      { count: 0 },
      function (obj, prev) { prev.count++; },
      cb
    )
  })

  bench('mapReduce', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').mapReduce(
      function () { emit(this.foo, 1); },
      function (k, vals) { return 1; },
      {
        out: {
          replace: 'tempCollection',
          readPreference : 'secondary'
        }
      },
      cb
    )
  })

  bench('mapReduce - inline', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').mapReduce(
      function () { emit(this.foo, 1); },
      function (k, vals) { return 1; },
      { out: { inline: true } },
      cb
    )
  })

  bench('cursor', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.collection('test').find({ foo: 'bar' }).nextObject(cb)
  })
})

//
// Helpers
//
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
