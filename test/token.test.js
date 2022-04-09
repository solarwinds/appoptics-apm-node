/* global it, describe */
'use strict'

const token = process.env.AO_TEST_SERVICE_KEY.split(':')[0]
const name = 'swoken-Modification-test'
process.env.APPOPTICS_SERVICE_KEY = `${token}:${name}`

const ao = require('..')
const assert = require('assert')

describe('verify that a swoken is handled correctly', function () {
  it('the service name should be lower case', function () {
    assert.strictEqual(ao.cfg.serviceKey, `${token}:${name.toLowerCase()}`)
  })

  it('shouldn\'t change the environment variable', function () {
    assert.strictEqual(process.env.APPOPTICS_SERVICE_KEY, `${token}:${name}`)
  })
})
