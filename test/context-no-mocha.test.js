'use strict'

const expect = require('chai').expect
const ao = require('..')

const gc = global.gc || (() => true)

async function t1 (main) {
  // the promise-returning function for the span
  function psoon (...args) {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(args), 100)
      // soon(() => {
      //  resolve(args)
      // });
    })
  }

  const pa = new Promise((resolve, reject) => {
    resolve()
  })

  let p
  // promiseStartOrContinueTrace. psoon's ...args are used to resolve the promise.
  const res = ao.pStartOrContinueTrace(
    null,
    main, // span name
    // promise-returning runner
    () => p = psoon(1, 2, 3, 5), // eslint-disable-line no-return-assign
    { enabled: true }
  )

  expect(res).instanceOf(Promise)

  // wait for the span and the checks to complete then verify the result.
  return Promise.all([pa, res, p]).then(r => {
    expect(r[1]).equal(r[2])
    return res.then(res => {
      expect(res).deep.equal([1, 2, 3, 5])
      return res
    })
  })
}

function output (...args) {
  process._rawDebug(...args)
}

const noopsCollect = false

let ix = 0
const tests = [
  noop,
  noop,
  noop,
  t1,
  t1,
  t1,
  noop,
  noop,
  noop,
  done
]

let doneFlag = false

async function noop () {
  if (noopsCollect) gc()
  return ['noop', `test-${ix}`, [...ao.requestStore._contexts.keys()]]
}
async function done () {
  doneFlag = true
  return ['set doneFlag', `test-${ix}`, [...ao.requestStore._contexts.keys()]]
}

output('start', [...ao.requestStore._contexts.keys()])

const i0 = setInterval(function () {
  output('separate', ao.lastEvent)
  if (doneFlag) clearInterval(i0)
}, 1000)

const interval = setInterval(function () {
  if (ix < tests.length) {
    tests[ix](`test-${ix}`)
      .then(r => {
        output('done', ...r)
        ix += 1
      })
  } else {
    output('clearing interval 1', [...ao.requestStore._contexts.keys()])
    clearInterval(interval)
  }
}, 1000)

let counter = 0
const i2 = setInterval(function () {
  if (!doneFlag) {
    return
  }

  if (++counter > 3) {
    output('clearing interval 2')
    clearInterval(i2)
    expect(ao.lastEvent).equal(undefined)
    expect([...ao.requestStore._contexts.keys()]).property('length', 0)
  }
  output('countdown', ao.lastEvent, [...ao.requestStore._contexts.keys()])
  gc()
}, 3000)
