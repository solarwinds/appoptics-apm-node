/* global it, describe */
'use strict'

// as well as REPORTER specifying that the COLLECTOR should be used.
process.env.APPOPTICS_REPORTER = 'ssl'
process.env.APPOPTICS_SERVICE_KEY = process.env.SW_APM_TEST_SERVICE_KEY
process.env.APPOPTICS_COLLECTOR = process.env.SW_APM_TEST_COLLECTOR

const ao = require('..')
const assert = require('assert')

describe('verify that agent can connect to collector', function () {
  it('should connect to the collector using the token', function () {
    const o = {}
    const ready = ao.readyToSample(5000, o)
    assert.strictEqual(o.status, 1, `expected status 1, not ${o.status}`)
    // return value should be true
    assert.strictEqual(ready, true, 'should return boolean true')
  })
})
