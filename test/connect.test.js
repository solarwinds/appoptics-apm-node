/* global it, describe */
'use strict'

process.env.APPOPTICS_REPORTER = 'ssl'

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
