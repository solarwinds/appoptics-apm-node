/* global it, describe, before, beforeEach, after */
'use strict'

const helper = require('../helper')
const { ao } = require('../1.test-common')

const dns = require('dns')

describe('probes.dns', function () {
  let emitter

  beforeEach(function (done) {
    setTimeout(function () {
      done()
    }, 100)
  })

  //
  // Define some general message checks
  //
  const checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'dns')
      msg.should.have.property('Label', 'entry')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'dns')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ao.g.testing(__filename)
  })
  after(function (done) {
    emitter.close(done)
  })

  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit')
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  //
  // Define tests
  //
  const tld = 'example.com'

  it('should support getServers', function (done) {
    helper.test(emitter, function (done) {
      try {
        dns.getServers()
        done()
      } catch (e) {}
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Operation', 'getServers')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should support setDefaultResultOrder', function (done) {
    helper.test(emitter, function (done) {
      try {
        dns.setDefaultResultOrder('verbatim')
        done()
      } catch (e) {}
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Operation', 'setDefaultResultOrder')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should support lookup', function (done) {
    helper.test(emitter, function (done) {
      try {
        dns.lookup(tld, (err, address, family) => {
          done()
        })
      } catch (e) {}
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Operation', 'lookup')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should support lookupService', function (done) {
    helper.test(emitter, function (done) {
      try {
        dns.lookupService('127.0.0.1', 22, (err, hostname, service) => {
          done()
        })
      } catch (e) {}
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Operation', 'lookupService')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should support reverse', function (done) {
    helper.test(emitter, function (done) {
      try {
        dns.reverse('8.8.8.8', (err, hostnames) => {
          done()
        })
      } catch (e) {}
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Operation', 'reverse')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  const resolveMethods = [
    'resolve',
    'resolve6',
    'resolve4',
    'resolveAny',
    'resolveCaa',
    'resolveCname',
    'resolveMx',
    // 'resolveNaptr', // does not return
    'resolveNs',
    // 'resolvePtr', // does not return
    'resolveSoa',
    'resolveSrv',
    'resolveTxt'
  ]

  resolveMethods.forEach(function (method) {
    if (!dns[method]) return

    it('should support ' + method, function (done) {
      helper.test(emitter, function (done) {
        try {
          dns[method](tld, (err, addresses) => {
            done()
          })
        } catch (e) {}
      }, [
        function (msg) {
          checks.entry(msg)
          msg.should.have.property('Operation', method)
        },
        function (msg) {
          checks.exit(msg)
        }
      ], done)
    })
  })

  it('should support setServers', function (done) {
    // The dns.setServers() method must not be called while a DNS query is in progress.
    // The dns.setServers() method affects only dns.resolve(), dns.resolve*() and dns.reverse() (and specifically not dns.lookup()).
    // hence the test helper is encapsulated inside the dns call.
    dns.resolve(tld, (err, addresses) => {
      helper.test(emitter, function (done) {
        try {
          dns.setServers([
            '8.8.8.8'
          ])

          done()
        } catch (e) {}
      }, [
        function (msg) {
          checks.entry(msg)
          msg.should.have.property('Operation', 'setServers')
        },
        function (msg) {
          checks.exit(msg)
        }
      ], done)
    })
  })
})
