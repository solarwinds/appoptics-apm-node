'use strict'
const helper = require('./helper')
const ao = require('..')
const should = require('should')    // eslint-disable-line no-unused-vars
const addon = ao.addon
const Event = ao.Event

describe('event', function () {
  let emitter
  let event

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

  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () {})
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit'),
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  it('should construct valid event', function () {
    event = new Event('test', 'entry')
    event.should.have.property('Layer', 'test')
    event.should.have.property('Label', 'entry')
    event.should.have.property('taskId').and.match(/^[0-9A-F]{40}$/)
    event.should.have.property('opId').and.match(/^[0-9A-F]{16}$/)
  })

  it('should convert an event to a string', function () {
    event.toString().should.match(/^2B[0-9A-F]{58}$/)
  })

  it('should fetch an event\'s sample flag', function () {
    ao.sampleRate = 0
    ao.sampleMode = 'never'
    event = new Event('test', 'entry')
    ao.sampling(event).should.equal(false)
    ao.sampling(event.toString()).should.equal(false)

    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    event = new Event('test', 'entry')
    ao.sampling(event).should.equal(true)
    ao.sampling(event.toString()).should.equal(true)
  })

  it('should enter the event context', function () {
    const context = addon.Context.toString()
    event.enter()
    addon.Context.toString().should.not.equal(context)
  })

  it('should send the event', function (done) {
    const event2 = new Event('test', 'exit', event.event)

    emitter.once('message', function (msg) {
      msg.should.have.property('X-Trace', event2.toString())
      msg.should.have.property('Edge', event.opId)
      msg.should.have.property('Layer', 'test')
      msg.should.have.property('Label', 'exit')
      done()
    })

    // NOTE: events must be sent within a request store context
    ao.requestStore.run(function () {
      event2.sendReport()
    })
  })

  it('should support set function', function () {
    const event = new Event('test', 'entry')
    event.set({Foo: 'bar'})
    event.should.have.property('Foo', 'bar')
  })

  it('should support data in send function', function (done) {
    const event = new Event('test', 'entry')

    emitter.once('message', function (msg) {
      msg.should.have.property('Foo')
      msg.Foo.should.equal('fubar')
      done()
    })
    ao.requestStore.run(function () {
      event.sendReport({Foo: 'fubar'})
    })
  })
})
