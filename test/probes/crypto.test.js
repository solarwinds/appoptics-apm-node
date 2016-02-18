var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var crypto = require('crypto')
var fs = require('fs')

describe('probes.crypto', function () {
  var emitter

  //
  // Define some general message checks
  //
  var checks = {
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
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  //
  // Define tests
  //
  if (crypto.pbkdf2) {
    it('should support pbkdf2', function (done) {
      helper.test(emitter, function (done) {
        crypto.pbkdf2('secret', 'salt', 4096, 512, function (e) {
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
          crypto.pbkdf2Sync('secret', 'salt', 4096, 512)
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

  var methods = [
    'publicEncrypt',
    'privateEncrypt',
    'publicDecrypt',
    'privateDecrypt'
  ]

  methods.forEach(function (method) {
    if ( ! crypto[method]) return

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
      helper.test(emitter, function (done) {
        var a = crypto.createDiffieHellman(512)
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
        var a = crypto.createECDH('secp521r1')
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
