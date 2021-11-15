/* global it, describe */
'use strict'
const expect = require('chai').expect
const w3cTraceContext = require('../lib/w3c-trace-context')

const baseTraceparent = '00-0123456789abcdef0123456789abcdef-7a71b110e5e3588d-01'
const baseXtrace = '2B0123456789ABCDEF0123456789ABCDEF000000007A71B110E5E3588D01'

const baseTracestateSpanId = '7a71b110e5e3588d'
const baseTracestateFlags = '01'
const baseTracestateOrgPart = 'sw=' + baseTracestateSpanId + '-' + baseTracestateFlags

const otherXtrace = '2B0123456789ABCDEF0123456789ABCDEF00000000999988885566778801'
const otherTracestateOrgPart = 'sw=9999888855667788-01'

describe('w3cTraceContext', function () {
  describe('w3cTraceContext.fromHeaders object creation from w3c request headers', function () {
    it('should create an object from empty headers', function () {
      const myHeaders = {}
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal('')
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
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
    })

    it('should create an object from wrong input (string)', function () {
      const w3c = w3cTraceContext.fromHeaders('wow')

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
    })

    it('should create an object from wrong input (boolean)', function () {
      const w3c = w3cTraceContext.fromHeaders(true)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
    })

    it('should create an object from wrong input (empty)', function () {
      const w3c = w3cTraceContext.fromHeaders()

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
    })

    it('should create an object from wrong input (undefined)', function () {
      const w3c = w3cTraceContext.fromHeaders(undefined)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
    })

    it('should create an object from traceparent only', function () {
      const myHeaders = {
        traceparent: baseTraceparent
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from traceparent and sw tracestate', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from traceparent and tracestate that do not match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal(otherXtrace)
    })

    it('should create an object from traceparent with other vendor tracestate', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'oh=different'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from traceparent and tracestate with other vendor tracestate', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,' + baseTracestateOrgPart + ',a2=i_was_before'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an empty object from invalid traceparent only (bad version)', function () {
      const myHeaders = {
        traceparent: '01' + baseTraceparent.slice(2)
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal('')
    })

    it('should create an empty object from invalid traceparent only (bad traceId part)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.slice(0, -30) + baseTraceparent.slice(-29)
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal('')
    })

    it('should create an empty object from invalid traceparent only (bad spanId part)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.slice(0, -6) + baseTraceparent.slice(-5)
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal('')
    })

    it('should create an empty object from invalid traceparent only (bad flags part)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.slice(-1) + 'a'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal('')
    })

    it('should create an empty object from tracestate only (bad data)', function () {
      const myHeaders = {
        tracestate: baseTracestateOrgPart + ',a1=bad,a2=game'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal('')
    })

    it('should create an empty object from tracestate and invalid traceparent (bad data)', function () {
      const myHeaders = {
        traceparent: baseTraceparent.replace('a', 'A'),
        tracestate: baseTracestateOrgPart
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal('')
    })
  })

  describe('w3cTraceContext.prepHeaders object creation from xtrace, stored tracestate input', function () {
    it('should create an object from xtrace', function () {
      const data = {
        xtrace: baseXtrace
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart)
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when there are other vendors', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: 'oh=other'
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',oh=other')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when there is an existing sw value', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: 'oh=other,' + baseTracestateOrgPart
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',oh=other')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when there is an existing sw value on left', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: baseTracestateOrgPart + ',oh=other'
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',oh=other')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when tracestate is truncated', function () {
      const longTracestate = new Array(32).fill(null).map((_, index) => {
        const c = String.fromCharCode(65 + index).toLowerCase()
        return `${c}${c}=${new Array(12).fill(c).join('')}`
      }).join(',') // 511 chars
      const data = {
        xtrace: baseXtrace,
        tracestate: baseTracestateOrgPart + ',' + longTracestate
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',' + longTracestate.split(',').slice(0, -2).join(','))
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when tracestate is truncated extracting item over 128', function () {
      const longItem = `xx=${'x'.repeat(130)}`
      const longTracestate = new Array(25).fill(null).map((_, index) => {
        const c = String.fromCharCode(65 + index).toLowerCase()
        if (index === 10) return longItem
        return `${c}${c}=${new Array(12).fill(c).join('')}`
      }).join(',') // 517 chars with middle entry at 130

      const data = {
        xtrace: baseXtrace,
        tracestate: baseTracestateOrgPart + ',' + longTracestate
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',' + longTracestate.split(',').filter(item => item !== longItem).join(','))
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when tracestate is truncated extracting multiple items over 128', function () {
      const longItem = `xx=${'x'.repeat(130)}`
      const longTracestate = new Array(26).fill(null).map((_, index) => {
        const c = String.fromCharCode(65 + index).toLowerCase()
        if (index === 10 || index === 12) return longItem
        return `${c}${c}=${new Array(12).fill(c).join('')}`
      }).join(',') // 651 chars. two middle two entries at 130

      const data = {
        xtrace: baseXtrace,
        tracestate: baseTracestateOrgPart + ',' + longTracestate
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',' + longTracestate.split(',').filter(item => item !== longItem).join(','))
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when tracestate is truncated extracting multiple items over 128 and removing other items', function () {
      const longItem = `xx=${'x'.repeat(130)}`
      const longTracestate = new Array(16).fill(null).map((_, index) => {
        const c = String.fromCharCode(65 + index).toLowerCase()
        if (index === 10 || index === 12) return longItem
        return `${c}${c}=${new Array(36).fill(c).join('')}`
      }).join(',') // 827 chars. 16 long entries, two middle two entries at 130.

      const data = {
        xtrace: baseXtrace,
        tracestate: baseTracestateOrgPart + ',' + longTracestate
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',' + longTracestate.split(',').filter(item => item !== longItem).slice(0, -2).join(','))
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from xtrace and tracestate when there is an existing sw value that is malformed/melicious', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: 'oh=other,sw=no!'
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'traceparent', 'tracestate')

      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',oh=other')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from traceparent and tracestate with other vendor tracestate truncated to 32 entries', function () {
      const longTracestate = new Array(34).fill(null).map((_, index) => {
        const c = String.fromCharCode(65 + index).toLowerCase()
        return `${c}${c}=${new Array(10).fill(c).join('')}`
      }).join(',') // 33 entries not ok

      const data = {
        xtrace: baseXtrace,
        tracestate: baseTracestateOrgPart + ',' + longTracestate
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('traceparent', 'tracestate', 'xtrace')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',' + longTracestate.split(',').slice(0, 31).join(','))
    })

    it('should create an object from traceparent and tracestate when tracestate key has leading delimiter , (bad data validated)', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: ',woo=hoo'
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('traceparent', 'tracestate', 'xtrace')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',' + 'woo=hoo')
    })

    it('should create an object from traceparent and tracestate when tracestate key has trailing delimiter , (bad data)', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: 'woo=hoo,'
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('traceparent', 'tracestate', 'xtrace')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',' + 'woo=hoo')
    })

    it('should create an object from traceparent and tracestate when tracestate key with empty value (bad data)', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: 'oh=other,woo=,some=things'
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('traceparent', 'tracestate', 'xtrace')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',' + 'oh=other,some=things')
    })

    it('should create an object from traceparent and tracestate when tracestate key without value (bad data)', function () {
      const data = {
        xtrace: baseXtrace,
        tracestate: 'oh=other,woo,some=things'
      }
      const w3c = w3cTraceContext.prepHeaders(data)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('traceparent', 'tracestate', 'xtrace')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart + ',' + 'oh=other,some=things')
    })

    it('should create an object from traceparent and tracestate when tracestate key includes malicious/malformed org part (bad data)', function () {
      const myHeaders = {
        xtrace: baseXtrace,
        tracestate: 'sw=no!'
      }
      const w3c = w3cTraceContext.prepHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('traceparent', 'tracestate', 'xtrace')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
      expect(w3c.traceparent).to.be.equal(baseTraceparent)
      expect(w3c.tracestate).to.be.equal(baseTracestateOrgPart)
    })
  })

  describe('w3cTraceContext.fromHeaders info type', function () {
    it('should be Continuation when traceparent and tracestate do not match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const type = w3cTraceContext.reqType(myHeaders)

      expect(type).to.be.equal('Continuation')
    })

    it('should be Flow when traceparent and tracestate match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart
      }
      const type = w3cTraceContext.reqType(myHeaders)

      expect(type).to.be.equal('Flow')
    })

    it('should be Downstream when there is only traceparent', function () {
      const myHeaders = {
        traceparent: baseTraceparent
      }
      const type = w3cTraceContext.reqType(myHeaders)

      expect(type).to.be.equal('Downstream')
    })

    it('should be Source when there is no traceparent just tracestate (malformed)', function () {
      const myHeaders = {
        tracestate: baseTracestateOrgPart
      }
      const type = w3cTraceContext.reqType(myHeaders)

      expect(type).to.be.equal('Source')
    })

    it('should be Source when there are no headers', function () {
      const myHeaders = {
      }
      const type = w3cTraceContext.reqType(myHeaders)

      expect(type).to.be.equal('Source')
    })
  })

  describe('w3cTraceContext.fromHeaders info savedSpanId', function () {
    it('should be valid when traceparent and tracestate do not match', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal('9999888855667788')
    })

    it('should be empty when tracestate is malformed (too long)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.slice(0, 2) + '1' + baseTracestateOrgPart.slice(2)
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (too short)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.slice(0, 6) + baseTracestateOrgPart.slice(7)
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (no dash)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.replace('-', '_')
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be empty when tracestate is malformed (not hex)', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart.replace('a', 'z')
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be valid when tracestate is with other vendor and own data', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,' + baseTracestateOrgPart + ',a2=i_was_before'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal(baseTracestateSpanId)
    })

    it('should be first valid when tracestate is malformed and contains own twice', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: baseTracestateOrgPart + ',sw=77771111aaaa0011-01'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal(baseTracestateSpanId)
    })

    it('should be first when tracestate is with other vendor and own data twice', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,' + baseTracestateOrgPart + ',a2=i_was_before,sw=77771111aaaa0011-01'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal(baseTracestateSpanId)
    })

    it('should be empty when tracestate is with other vendor data only', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,a2=i_was_before'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal('')
    })

    it('should be empty when there is no tracestate', function () {
      const myHeaders = {
        traceparent: baseTraceparent,
        tracestate: 'a1=continue_from_me,a2=i_was_before'
      }
      const id = w3cTraceContext.fromHeaders(myHeaders).savedSpanId

      expect(id).to.be.equal('')
    })
  })

  describe('w3cTraceContext.padding', function () {
    it('should have a default value of 00000000', function () {
      expect(w3cTraceContext.padding).to.be.equal('00000000')
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
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an object from x-trace even overriding xtrace if specified', function () {
      const myHeaders = {
        xtrace: otherXtrace,
        'x-trace': baseXtrace
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
      expect(w3c.xtrace).to.be.equal(baseXtrace)
    })

    it('should create an empty object from invalid x-trace', function () {
      const myHeaders = {
        'x-trace': baseXtrace + 'A'
      }
      const w3c = w3cTraceContext.fromHeaders(myHeaders)

      expect(w3c).to.be.an('object')
      expect(w3c).to.have.all.keys('xtrace', 'tracestate', 'savedSpanId')
    })
  })

  describe('w3cTraceContext.fromHeaders info type from legacy x-trace input', function () {
    it('should be Flow when there is only x-trace', function () {
      const myHeaders = {
        'x-trace': baseXtrace
      }
      const type = w3cTraceContext.reqType(myHeaders)

      expect(type).to.be.equal('Flow')
    })

    it('should be Source when using xtrace (bad data)', function () {
      const myHeaders = {
        xtrace: baseXtrace
      }
      const type = w3cTraceContext.reqType(myHeaders)

      expect(type).to.be.equal('Source')
    })

    it('should be Flow if x-trace present even when traceparent and tracestate do not match', function () {
      const myHeaders = {
        'x-trace': baseXtrace,
        traceparent: baseTraceparent,
        tracestate: otherTracestateOrgPart
      }
      const type = w3cTraceContext.reqType(myHeaders)

      expect(type).to.be.equal('Continuation')
    })

    it('should be Source when there is only x-trace that is invalid', function () {
      const myHeaders = {
        'x-trace': baseXtrace + 'A'
      }
      const type = w3cTraceContext.reqType(myHeaders)

      expect(type).to.be.equal('Source')
    })
  })
})
