var helper = require('../helper')
var ao = helper.ao

var Pool = require('generic-pool').Pool

var foo = { bar: 'baz' }

var pool = new Pool({
  name: 'test',
  create: function (cb) {
    cb(null, foo)
  },
  max: 1,
  min: 1
})

describe('probes/generic-pool', function () {
  it('should trace through generic-pool acquire', function (done) {
    var acquiring = false

    pool.acquire(function (err, foo2) {
      var t = setInterval(function () {
        if (acquiring) {
          pool.release(foo2)
          clearInterval(t)
        }
      }, 10)
    })

    ao.requestStore.run(function () {
      // Hack to look like there's a previous layer
      ao.requestStore.set('lastEvent', true)

      ao.requestStore.set('foo', 'bar')
      pool.acquire(function (err) {
        ao.requestStore.get('foo').should.equal('bar')
        done()
      })
    })

    acquiring = true
  })
})
