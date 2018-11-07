'use strict'

const assert = require('assert')
const {ao, startTest, endTest} = require('../1.test-common.js')

describe('probes/dummy vz.z.z', function () {
  before(function () {
    startTest(__filename, {customFormatter: 'terse'})
    //ao.requestStore.dumpCtx()
  })
  after(function () {
    //ao.requestStore.dumpCtx()
    endTest()
  })
  beforeEach(function () {
    assert(this.currentTest.title === 'should test nothing and succeed')
    assert(this.test.title === '"before each" hook')
  })
  afterEach(function () {
    assert(this.currentTest.title === 'should test nothing and succeed')
    assert(this.test.title === '"after each" hook')
  })
  it('should test nothing and succeed', function () {
  })
})
