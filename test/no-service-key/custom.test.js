/* global it, describe */
'use strict'

process.env.APPOPTICS_SERVICE_KEY = ''

const ao = require('../..')
const aob = ao.addon
const assert = require('assert')

const soon = global.setImmediate || process.nextTick

// eslint-disable-next-line no-unused-vars
function psoon () {
  return new Promise((resolve, reject) => {
    soon(resolve)
  })
}

const xtrace = '2B4FC9017BA3404828F253638A697DC7CF1A6BB1A4A544D5B98159B55501'

// Without the service key present,
// the custom instrumentation should be a no-op
describe('custom (without service key present)', function () {
  it('should have a bindings version of \'not loaded\'', function () {
    assert(ao.addon.version === 'not loaded')
  })

  it('should passthrough instrumentHttp', function () {
    let counter = 0
    ao.instrumentHttp('span-name', function () {
      counter += 1
    })
    assert(counter === 1)
  })

  it('should passthrough sync instrument', function () {
    let counter = 0
    ao.instrument('test', function () {
      counter++
    })
    assert(counter === 1, 'counter should be 1')
  })

  it('should passthrough async instrument', function (done) {
    function localDone () {
      done()
    }
    ao.instrument('test', soon, {}, localDone)
  })

  it('should passthrough pInstrument', function () {
    let counter = 0

    function pfunc () {
      counter += 1
      return Promise.resolve(99)
    }

    return ao.pInstrument('test', pfunc).then(r => {
      assert(counter === 1, 'counter should be 1')
      assert(r === 99, 'the result of pInstrument should be 99')
      return r
    })
  })

  it('should passthrough sync startOrContinueTrace', function () {
    let counter = 0
    ao.startOrContinueTrace(null, 'test', function () {
      counter++
    })
    assert(counter === 1, 'counter should be equal to 1')
  })

  it('should passthrough async startOrContinueTrace', function (done) {
    function localDone () {
      done()
    }
    ao.startOrContinueTrace(null, 'test', soon, localDone)
  })

  it('should passthrough pStartOrContinueTrace', function () {
    let counter = 0

    function pfunc () {
      counter += 1
      return Promise.resolve(99)
    }
    return ao.pStartOrContinueTrace(null, 'test', pfunc).then(r => {
      assert(counter === 1, 'counter should be 1')
      assert(r === 99, 'the result of pStartOrContinueTrace should be 99')
      return r
    })
  })

  it('should passthrough requestStore', function () {
    const store = ao.requestStore

    assert(typeof store === 'object')
    assert(store.name === 'ao-cls-context')
    assert(store.constructor.name === 'Namespace')
  })

  it('should support callback shifting', function (done) {
    ao.instrument('test', soon, done)
  })

  it('should supply API functions and properties', function () {
    assert(ao.traceMode === 'disabled')
    assert(ao.sampleRate === 0)
    assert(ao.tracing === false)
    assert(ao.traceId === undefined)
    assert(ao.lastEvent === undefined)
    assert(ao.lastSpan === undefined)
    assert(ao.requestStore && typeof ao.requestStore.get === 'function')
    assert(typeof ao.resetRequestStore === 'function')
    assert(ao.clsCheck() === false)
    assert(ao.stack() === '')
    assert(ao.bind('x') === 'x')
    assert(ao.bindEmitter('x') === 'x')
    assert(ao.backtrace())
    assert(ao.setCustomTxNameFunction('x') === false)

    assert(ao.readyToSample() === false)
    assert(ao.getTraceSettings().doSample === false)
    assert(ao.sampling() === false)
    assert(ao.xtraceToEvent('') === undefined)
    assert(ao.xtraceToEvent(xtrace) instanceof aob.Event)
    assert(ao.patchResponse('x') === undefined)
    assert(ao.addResponseFinalizer('x') === undefined)
    assert(ao.traceId === undefined)
    assert(ao.reportError(new Error('xyzzy')) === undefined)
    assert(ao.reportInfo('this is info') === undefined)
    assert(ao.sendMetric() === -1)
    assert(ao.getFormattedTraceId() === `${'0'.repeat(40)}-0`)

    let o = ao.insertLogObject()
    assert(typeof o === 'object')
    assert(Object.keys(o).length === 0)

    o = ao.insertLogObject({ existing: 'ron' })
    assert(typeof o === 'object')
    assert(Object.keys(o).length === 1)
    assert(o.existing === 'ron')
  })
})
