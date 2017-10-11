var helper = require('./helper')
var should = require('should')
var ao = require('..')
var addon = ao.addon
var Event = ao.Event

describe('event', function () {
  var emitter
  var event

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  it('should construct valid event', function () {
    event = new Event('test', 'entry')
    event.should.have.property('Layer', 'test')
    event.should.have.property('Label', 'entry')
    event.should.have.property('taskId').and.match(/^[0-9A-F]{40}$/)
    event.should.have.property('opId').and.match(/^[0-9A-F]{16}$/)
  })

  it('should convert an event to a string', function () {
    event.toString().should.match(/^1B[0-9A-F]{56}$/)
  })

  it('should enter the event context', function () {
    var context = addon.Context.toString()
    event.enter()
    addon.Context.toString().should.not.equal(context)
  })

  it('should send the event', function (done) {
    var event2 = new Event('test', 'exit', event.event)

    emitter.once('message', function (msg) {
      msg.should.have.property('X-Trace', event2.toString())
      msg.should.have.property('Edge', event.opId)
      msg.should.have.property('Layer', 'test')
      msg.should.have.property('Label', 'exit')
      done()
    })

    // NOTE: events must be sent within a request store context
    ao.requestStore.run(function () {
      event2.send()
    })
  })

  it('should support set function', function () {
    var event = new Event('test', 'entry')
    event.set({ Foo: 'bar' })
    event.should.have.property('Foo', 'bar')
  })

  it('should support data in send function', function () {
    var event = new Event('test', 'entry')
    var called = false
    event.set = function () {
      called = true
    }
    event.send({ Foo: 'bar' })
    called.should.equal(true)
  })
})
