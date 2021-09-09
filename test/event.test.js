/* global it, describe, before, beforeEach, after, afterEach */
'use strict'

const helper = require('./helper')
const ao = helper.ao
const aob = ao.addon
const Event = ao.Event

const expect = require('chai').expect

describe('event', function () {
  let emitter
  let event
  let ev0
  let mdTaskId
  let mdOpId
  let baseStats

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = aob.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  beforeEach(function () {
    ev0 = aob.Event.makeRandom(1)
    const mds = ev0.toString(1).split('-')
    mdTaskId = mds[1].toUpperCase()
    mdOpId = mds[2].toUpperCase()
  })

  afterEach(function () {
    if (this.currentTest.title === 'UDP might lose a message') {
      baseStats = Object.assign({}, ao._stats.event)
    }
  })

  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () {})
      done()
    }, [
      function (msg) {
        expect(msg).property('Label').oneOf(['entry', 'exit'])
        expect(msg).property('Layer', 'fake')
      }
    ], done)
  })

  // net 1
  it('should construct valid event inheriting from the parent', function () {
    event = new Event('test', 'entry', ev0)
    expect(event).property('Layer', 'test')
    expect(event).property('Label', 'entry')
    expect(event).property('taskId', mdTaskId)
    expect(event).property('opId').not.equal(mdOpId)
    expect(event).property('opId').match(/^[0-9A-F]{16}$/)
  })

  // net 2
  it('should convert an event to a string', function () {
    event = new Event('test', 'entry', ev0)
    expect(event.toString()).match(/^2B[0-9A-F]{56}01$/)
    expect(event.toString().substr(2, 40)).equal(mdTaskId, 'task id must match')
    expect(event.toString().substr(42, 16)).not.equal(mdOpId, 'op id must not match')
  })

  // net 4
  it('should fetch an event\'s sample flag', function () {
    ao.sampleRate = 0
    ao.traceMode = 'never'
    ev0 = aob.Event.makeRandom(0)
    event = new Event('test', 'entry', ev0)
    expect(ao.sampling(event)).equal(false)
    expect(ao.sampling(event.toString())).equal(false)

    ao.sampleRate = aob.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ev0 = aob.Event.makeRandom(1)
    event = new Event('test', 'entry', ev0)
    expect(ao.sampling(event)).equal(true)
    expect(ao.sampling(event.toString())).equal(true)
  })

  // net 4, sent 1
  it('should send the event', function (done) {
    const edge = true
    const event2 = new Event('test', 'exit', event.event, edge)

    emitter.once('message', function (msg) {
      expect(msg).property('X-Trace', event2.toString())
      expect(msg).property('Edge', event.opId)
      expect(msg).property('Layer', 'test')
      expect(msg).property('Label', 'exit')
      done()
    })

    // NOTE: events must be sent within a request store context
    ao.requestStore.run(function () {
      event2.sendReport()
    })
  })

  // net 5
  it('should not allow setting a NaN value', function () {
    const event2 = new Event('test', 'exit', event.event)

    const logChecks = [
      { level: 'error', message: 'Error: Invalid type for KV Nan: NaN' }
      // there is a stack trace here but issuing the error is enough.
    ]

    const [getCount, clear] = helper.checkLogMessages(logChecks) // eslint-disable-line

    event2.set({ Nan: NaN })

    expect(getCount()).equal(1, 'incorrect log message count')
  })

  // net 6
  it('should support set function', function () {
    const event = new Event('test', 'entry', ev0)
    event.set({ Foo: 'bar' })
    expect(event.kv).property('Foo', 'bar')
  })

  // create 6, sent 2
  it('should support data in send function', function (done) {
    const event = new Event('test', 'entry', ev0)

    emitter.once('message', function (msg) {
      expect(msg).property('Foo', 'fubar')
      done()
    })
    ao.requestStore.run(function () {
      event.sendReport({ Foo: 'fubar' })
    })
  })

  it('should generate the expected stats', function () {
    // this suite creates 8 events and sends 2 after the UDP test
    const stats = ao._stats.event
    expect(stats.created).equal(baseStats.created + 8, 'events created')
    expect(stats.active).equal(baseStats.active + 6, 'events active')
  })
})
