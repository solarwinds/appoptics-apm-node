/* global it, describe, before, beforeEach, after */
'use strict'

const helper = require('../helper')
const { ao } = require('../1.test-common')

const crypto = require('crypto')

describe('probes.crypto', function () {
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
      msg.should.have.property('Layer', 'crypto')
      msg.should.have.property('Label', 'entry')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'crypto')
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
        msg.should.have.property('Label').oneOf('entry', 'exit'),
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  //
  // Define tests
  //
  if (crypto.pbkdf2) {
    it('should support pbkdf2', function (done) {
      helper.test(emitter, function (done) {
        crypto.pbkdf2('secret', 'salt', 4096, 512, 'sha1', function (e) {
          done(e)
        })
      }, [
        function (msg) {
          checks.entry(msg)
          msg.should.have.property('Operation', 'pbkdf2')
          msg.should.have.property('Iterations', 4096)
          msg.should.have.property('KeyLength', 512)
          msg.should.have.property('Digest', 'sha1')
        },
        function (msg) {
          checks.exit(msg)
        }
      ], done)
    })
  }

  if (crypto.pbkdf2Sync) {
    it('should support pbkdf2Sync', function (done) {
      helper.test(emitter, function (done) {
        try {
          crypto.pbkdf2Sync('secret', 'salt', 4096, 512, 'sha1')
        } catch (e) {}
        done()
      }, [
        function (msg) {
          checks.entry(msg)
          msg.should.have.property('Operation', 'pbkdf2Sync')
          msg.should.have.property('Iterations', 4096)
          msg.should.have.property('KeyLength', 512)
          msg.should.have.property('Digest', 'sha1')
        },
        function (msg) {
          checks.exit(msg)
        }
      ], done)
    })
  }

  const methods = [
    'publicEncrypt',
    'privateEncrypt',
    'publicDecrypt',
    'privateDecrypt'
  ]

  methods.forEach(function (method) {
    if (!crypto[method]) return

    it('should support ' + method, function (done) {
      helper.test(emitter, function (done) {
        try {
          crypto[method]('secret', new Buffer('foo'))
        } catch (e) {}
        done()
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

  if (crypto.createDiffieHellman) {
    it('should support computeSecret for DiffieHellman', function (done) {
      // increase timeout - intermittent failures when running matrix tests
      this.timeout(5000)
      helper.test(emitter, function (done) {
        const a = crypto.createDiffieHellman(512)
        a.generateKeys()
        a.computeSecret(a.getPublicKey())
        done()
      }, [
        function (msg) {
          checks.entry(msg)
          msg.should.have.property('Class', 'DiffieHellman')
          msg.should.have.property('Operation', 'computeSecret')
        },
        function (msg) {
          checks.exit(msg)
        }
      ], done)
    })
  }

  if (crypto.createECDH) {
    it('should support computeSecret for ECDH', function (done) {
      helper.test(emitter, function (done) {
        const a = crypto.createECDH('secp521r1')
        a.generateKeys()
        a.computeSecret(a.getPublicKey())
        done()
      }, [
        function (msg) {
          checks.entry(msg)
          msg.should.have.property('Class', 'ECDH')
          msg.should.have.property('Operation', 'computeSecret')
        },
        function (msg) {
          checks.exit(msg)
        }
      ], done)
    })
  }
})
