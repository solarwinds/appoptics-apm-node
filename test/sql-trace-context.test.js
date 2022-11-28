/* global it, describe */
'use strict'
const expect = require('chai').expect
const sqlTraceContext = require('../lib/sql-trace-context')

const baseTraceparent = '00-0123456789abcdef0123456789abcdef-7a71b110e5e3588d-01'

describe('sqlTraceContext', function () {
  describe('sqlTraceContext.tag good input', function () {
    it('should inject when receiving traceparent that is valid', function () {
      const traceparent = baseTraceparent
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal(`/*traceparent='${traceparent}'*/`)
    })
  })

  describe('sqlTraceContext.tag bad traceparent input type', function () {
    it('should return empty string when receiving traceparent that is an empty string', function () {
      const traceparent = ''
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent that is a number', function () {
      const traceparent = 42
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent that is an object', function () {
      const traceparent = { key: 'value' }
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent that is an array', function () {
      const traceparent = [1, 2, '3']
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent that is null', function () {
      const traceparent = null
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent that is undefined', function () {
      const traceparent = undefined
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent that is a Buffer', function () {
      const traceparent = Buffer.from(baseTraceparent)
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
  })

  describe('sqlTraceContext.tag invalid traceparent input', function () {
    it('should return empty string when receiving traceparent with appended Bobby Tables', function () {
      const traceparent = baseTraceparent + 'Robert\'); DROP TABLE students;--'
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent with appended comment closer */', function () {
      const traceparent = baseTraceparent + '*/'
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent with appended valid chars', function () {
      const traceparent = baseTraceparent + 'a'
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent with appended missing chars', function () {
      const traceparent = baseTraceparent.slice(0, -1)
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent with appended space', function () {
      const traceparent = baseTraceparent + ' '
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent with appended linefeed', function () {
      const traceparent = baseTraceparent + '\n'
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
    it('should return empty string when receiving traceparent with appended tab', function () {
      const traceparent = baseTraceparent + '\t'
      const tag = sqlTraceContext.tag(traceparent)

      expect(tag).to.be.equal('')
    })
  })
})
