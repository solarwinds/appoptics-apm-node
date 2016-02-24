var helper = require('../helper')
var tv = helper.tv

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

    tv.requestStore.run(function () {
      // Hack to look like there's a previous layer
      tv.requestStore.set('lastEvent', true)

      tv.requestStore.set('foo', 'bar')
      pool.acquire(function (err) {
        tv.requestStore.get('foo').should.equal('bar')
        done()
      })
    })

    acquiring = true
  })
})
