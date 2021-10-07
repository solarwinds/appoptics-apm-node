/* global it, describe */
'use strict'
const expect = require('chai').expect
const w3cTraceContext = require('../lib/w3c-trace-context')

const baseTraceparent = '00-0123456789abcdef0123456789abcdef-7a71b110e5e3588d-01'
const baseXtrace = '2B0123456789ABCDEF0123456789ABCDEF999988887A71B110E5E3588D01'

const baseTracestateSpanId = '7a71b110e5e3588d'
const baseTracestateFlags = '01'
const baseTracestateOrgPart = 'sw=' + baseTracestateSpanId + '-' + baseTracestateFlags

const otherXtrace = '2B0123456789ABCDEF0123456789ABCDEF99998888999988885566778801'
const otherTracestateOrgPart = 'sw=9999888855667788-01'

const expectEmptyObject = (w3c) => {
  expect(w3c).to.be.an('object')
  expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
  expect(w3c.xtrace).to.be.equal('')
  expect(w3c.traceparent).to.be.equal('')
  expect(w3c.tracestate).to.be.equal('')
}

describe('w3cTraceContext', function () {
  describe('w3cTraceContext.fromHeaders object creation from w3c request headers', function () {
    it('should create an object from empty headers', function () {
      const myHeaders = {}
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
      expect(w3c.xtrace).to.be.equal('')
      expect(w3c.traceparent).to.be.equal('')
      expect(w3c.tracestate).to.be.equal('')
    })

    it('should create an object omitting unseeded header keys', function () {
      const myHeaders = {
        'x-some': 'thing',
        other: 'also thing'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.not.have.any.keys('x-some', 'other')
    })

    it('should create an object from wrong input (number)', function () {
      const w3c = w3cTraceContext.fromHeaders(1)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
    })

    it('should create an object from wrong input (string)', function () {
      const w3c = w3cTraceContext.fromHeaders('wow')

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
    })

    it('should create an object from wrong input (boolean)', function () {
      const w3c = w3cTraceContext.fromHeaders(true)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
    })

    it('should create an object from wrong input (empty)', function () {
      const w3c = w3cTraceContext.fromHeaders()

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
    })

    it('should create an object from wrong input (undefined)', function () {
      const w3c = w3cTraceContext.fromHeaders(undefined)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
    })

    it('should create an object from traceparent only', function () {
      const myHeaders = {
        traceparent: baseTraceparent
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal('')
    })

    it('should create an object from traceparent and sw tracestate', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart)
    })

    it('should create an object from traceparent and tracestate that do not match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
      expect(w3c.xtrace).to.be.equal(otherXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(otherTracestateOrgPart)
    })

    it('should create an object from traceparent with other vendor tracestate', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'oh=different'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal('oh=different')
    })

    it('should create an object from traceparent and tracestate with other vendor tracestate', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,' + baseTracestateOrgPart + ',a2=i_was_before'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal('a1=continue_from_me,' + baseTracestateOrgPart + ',a2=i_was_before')
    })

    it('should create an empty object from invalid traceparent only (bad version)', function () {
      const myHeaders = {
        traceparent: '01' + baseTraceparent.slice(2)
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expectEmptyObject(w3c)
    })

    it('should create an empty object from invalid traceparent only (bad traceId part)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.slice(0, -30) + baseTraceparent.slice(-29)
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expectEmptyObject(w3c)
    })

    it('should create an empty object from invalid traceparent only (bad spanId part)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.slice(0, -6) + baseTraceparent.slice(-5)
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expectEmptyObject(w3c)
    })

    it('should create an empty object from invalid traceparent only (bad flags part)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.slice(-1) + 'a'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expectEmptyObject(w3c)
    })

    it('should create an empty object from tracestate only (bad data)', function () {
      const myHeaders = {
        tracestate: baseTracestateOrgPart + ',a1=bad,a2=game'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expectEmptyObject(w3c)
    })

    it('should create an empty object from tracestate and invalid traceparent (bad data)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.replace('a', 'A'),
        tracestate: baseTracestateOrgPart
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expectEmptyObject(w3c)
    })

    // TODO: do we want to validate the traceparent?
  })

  describe('w3cTraceContext.fromData object creation from xtrace, stored tracestate input', function () {
    it('should create an object from xtrace', function () {
      const data = {
        xtrace: baseXtrace
      }
      const w3c = w3cTraceContext.fromData(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart)
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when there are other vendors', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: 'oh=other'
      }
      const w3c = w3cTraceContext.fromData(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',oh=other')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when there is an existing sw value', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: 'oh=other,' + baseTracestateOrgPart
      }
      const w3c = w3cTraceContext.fromData(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',oh=other')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when there is an existing sw value on left', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: baseTracestateOrgPart + ',oh=other'
      }
      const w3c = w3cTraceContext.fromData(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',oh=other')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an empty from invalid xtrace (bad prefix)', function () {
      const data = {
        xtrace: 'AA' + baseXtrace.slice(2)
      }
      const w3c = w3cTraceContext.fromData(data)

      expectEmptyObject(w3c)
    })

    it('should create an empty from invalid xtrace (bad traceId)', function () {
      const data = {
        xtrace: baseXtrace.slice(0, -16) + baseTraceparent.slice(-16)
      }
      const w3c = w3cTraceContext.fromData(data)

      expectEmptyObject(w3c)
    })

    it('should create an empty from invalid xtrace (bad opId)', function () {
      const data = {
        xtrace: baseXtrace.slice(0, -6) + baseTraceparent.slice(-5)
      }
      const w3c = w3cTraceContext.fromData(data)

      expectEmptyObject(w3c)
    })

    it('should create an empty from invalid xtrace (bad flags)', function () {
      const data = {
        xtrace: baseXtrace.slice(-1) + 'a'
      }
      const w3c = w3cTraceContext.fromData(data)

      expectEmptyObject(w3c)
    })
  })

  describe('w3cTraceContext.fromHeaders info type', function () {
    it('should be Continuation when traceparent and tracestate do not match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const type = w3cTraceContext.fromHeaders(myHeaders).info.type

      expect(type).to.be.equal('Continuation')
    })

    it('should be Flow when traceparent and tracestate match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart
      }
      const type = w3cTraceContext.fromHeaders(myHeaders).info.type

      expect(type).to.be.equal('Flow')
    })

    it('should be Downstream when there is only traceparent', function () {
      const myHeaders = {
        traceparent: baseTraceparent
      }
      const type = w3cTraceContext.fromHeaders(myHeaders).info.type

      expect(type).to.be.equal('Downstream')
    })

    it('should be Source when there is no traceparent just tracestate (malformed)', function () {
      const myHeaders = {
        tracestate: baseTracestateOrgPart
      }
      const type = w3cTraceContext.fromHeaders(myHeaders).info.type

      expect(type).to.be.equal('Source')
    })

    it('should be Source when there are no headers', function () {
      const myHeaders = {
      }
      const type = w3cTraceContext.fromHeaders(myHeaders).info.type

      expect(type).to.be.equal('Source')
    })
  })

  describe('w3cTraceContext.fromHeaders info spanId', function () {
    it('should be valid when traceparent and tracestate do not match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.spanId

      expect(id).to.be.equal(baseTracestateSpanId)
    })

    it('should be valid when traceparent and tracestate match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.spanId

      expect(id).to.be.equal(baseTracestateSpanId)
    })

    it('should be empty when traceparent is malformed (too long)', function () {
      const myHeaders = {
        traceparent: baseTraceparent + '1'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.spanId

      expect(id).to.be.equal('')
    })

    it('should be empty when traceparent is malformed (too short)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.slice(0, 10) + baseTraceparent.slice(11)
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.spanId

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (no dash)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.replace('-', '_')
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.spanId

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (not hex)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.replace('a', 'z')
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.spanId

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (not lowercase hex)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.replace('a', 'A')
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.spanId

      expect(id).to.be.equal('')
    })

    it('should be empty when there is no traceparent', function () {
      const myHeaders = {
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.spanId

      expect(id).to.be.equal('')
    })
  })

  describe('w3cTraceContext.fromHeaders info savedSpanId', function () {
    it('should be valid when traceparent and tracestate do not match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal('9999888855667788')
    })

    it('should be empty when tracestate is malformed (too long)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.slice(0, 2) + '1' + baseTracestateOrgPart.slice(2)
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (too short)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.slice(0, 6) + baseTracestateOrgPart.slice(7)
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (no dash)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.replace('-', '_')
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (not hex)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.replace('a', 'z')
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be valid when tracestate is with other vendor and own data', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,' + baseTracestateOrgPart + ',a2=i_was_before'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal(baseTracestateSpanId)
    })

    it('should be first valid when tracestate is malformed and contains own twice', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart + ',sw=77771111aaaa0011-01'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal(baseTracestateSpanId)
    })

    it('should be first when tracestate is with other vendor and own data twice', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,' + baseTracestateOrgPart + ',a2=i_was_before,sw=77771111aaaa0011-01'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal(baseTracestateSpanId)
    })

    it('should be empty when tracestate is with other vendor data only', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,a2=i_was_before'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be empty when there is no tracestate', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,a2=i_was_before'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedSpanId

      expect(id).to.be.equal('')
    })
  })

  describe('w3cTraceContext.fromHeaders info savedFlags', function () {
    it('should be valid when traceparent and tracestate do not match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('01')
    })

    it('should be empty when tracestate is malformed (too long)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.slice(0, 2) + '1' + baseTracestateOrgPart.slice(2)
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (too short)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.slice(0, 6) + baseTracestateOrgPart.slice(7)
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (no dash)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.replace('-', '_')
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (not hex)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.replace('a', 'z')
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('')
    })

    it('should be valid when tracestate is with other vendor and own data', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,' + baseTracestateOrgPart + ',a2=i_was_before'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('01')
    })

    it('should be valid when tracestate is malformed and contains own twice', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart + ',sw=77771111aaaa0011-01'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('01')
    })

    it('should be valid when tracestate is with other vendor and own data twice', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,' + baseTracestateOrgPart + ',a2=i_was_before,sw=77771111aaaa0011-01'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('01')
    })

    it('should be empty when tracestate is with other vendor data only', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,a2=i_was_before'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('')
    })

    it('should be empty when there is no tracestate', function () {
      const myHeaders = {
        traceparent: baseTraceparent
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).info.savedFlags

      expect(id).to.be.equal('')
    })
  })

  describe('w3cTraceContext.padding', function () {
    it('should have a default value of 99998888', function () {
      expect(w3cTraceContext.padding).to.be.equal('99998888')
    })

    it('should be setable', function () {
      w3cTraceContext.padding = '12345678'

      expect(w3cTraceContext.padding).to.be.equal('12345678')
    })
  })

  describe('w3cTraceContext.orgId', function () {
    it('should have a default value of sw', function () {
      expect(w3cTraceContext.orgId).to.be.equal('sw')
    })

    it('should be setable', function () {
      w3cTraceContext.orgId = 'no'

      expect(w3cTraceContext.orgId).to.be.equal('no')
    })
  })

  // TODO: revisit
  // allows x-trace header to ensure comparability with older agents
  describe('w3cTraceContext.fromHeaders object creation from legacy x-trace input', function () {
    it('should create an object from x-trace', function () {
      const myHeaders = {
        'x-trace': baseXtrace
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart)
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from x-trace even overriding xtrace if specified', function () {
      const myHeaders = {
        xtrace: otherXtrace,
        'x-trace': baseXtrace
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate', 'info')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart)
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an empty object from invalid x-trace', function () {
      const myHeaders = {
        'x-trace': baseXtrace + 'A'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expectEmptyObject(w3c)
    })
  })

  describe('w3cTraceContext.fromHeaders info type from legacy x-trace input', function () {
    it('should be Flow when there is only x-trace', function () {
      const myHeaders = {
        'x-trace': baseXtrace
      }
      const type = w3cTraceContext.fromHeaders(myHeaders).info.type

      expect(type).to.be.equal('Flow')
    })

    it('should be Source when using xtrace (bad data)', function () {
      const myHeaders = {
        xtrace: baseXtrace
      }
      const type = w3cTraceContext.fromHeaders(myHeaders).info.type

      expect(type).to.be.equal('Source')
    })

    it('should be Flow if x-trace present even when traceparent and tracestate do not match', function () {
      const myHeaders = {
        'x-trace': baseXtrace,
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const type = w3cTraceContext.fromHeaders(myHeaders).info.type

      expect(type).to.be.equal('Continuation')
    })

    it('should be Source when there is only x-trace that is invalid', function () {
      const myHeaders = {
        'x-trace': baseXtrace + 'A'
      }
      const type = w3cTraceContext.fromHeaders(myHeaders).info.type

      expect(type).to.be.equal('Source')
    })
  })
})
