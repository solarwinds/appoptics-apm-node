var helper = require('./helper')
var should = require('should')
var ao = require('..')
var addon = ao.addon
var Profile = ao.Profile
var Layer = ao.Layer

describe('profile', function () {
  var emitter

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  //
  // Verify basic structural integrity
  //
  it('should construct valid profile', function () {
    var profile = new Profile('test-profile', null, {})

    profile.should.have.property('events')
    var events = ['entry','exit']
    events.forEach(function (event) {
      profile.events.should.have.property(event)
      profile.events[event].taskId.should.not.match(/^0*$/)
      profile.events[event].opId.should.not.match(/^0*$/)

      profile.events[event].should.not.have.property('Layer')
      profile.events[event].should.have.property('ProfileName', 'test-profile')
      profile.events[event].should.have.property('Language', 'nodejs')
    })

    profile.events.entry.should.have.property('Label', 'profile_entry')
    profile.events.exit.should.have.property('Label', 'profile_exit')
  })

  it('should descend profile from a layer', function () {
    var layer = new Layer('test', null, {})
    layer.run(function () {
      var profile = layer.profile('test-profile')

      profile.should.be.instanceof(Profile)
      profile.should.have.property('events')
      var events = ['entry','exit']
      events.forEach(function (event) {
        profile.events.should.have.property(event)
        profile.events[event].taskId.should.not.match(/^0*$/)
        profile.events[event].opId.should.not.match(/^0*$/)
      })
    })
  })

  it('should allow error/info reporting from profile layer', function (done) {
    var layer = new Layer('test-layer', null, {})

    var checks = [
      function (msg) {
        msg.should.have.property('Layer', 'test-layer')
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('ProfileName', 'test-profile')
        msg.should.have.property('Label', 'profile_entry')
      },
      function (msg) {
        msg.should.not.have.property('ProfileName')
        msg.should.not.have.property('Layer')

        msg.should.have.property('Label', 'error')
        msg.should.have.property('ErrorClass', 'Error')
        msg.should.have.property('ErrorMsg', 'test error')
      },
      function (msg) {
        msg.should.not.have.property('ProfileName')
        msg.should.not.have.property('Layer')

        msg.should.have.property('Label', 'info')
        msg.should.have.property('Foo', 'bar')
      },
      function (msg) {
        msg.should.have.property('ProfileName', 'test-profile')
        msg.should.have.property('Label', 'profile_exit')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test-layer')
        msg.should.have.property('Label', 'exit')
      },
    ]

    helper.doChecks(emitter, checks, done)

    layer.run(function () {
      var profile = layer.profile('test-profile')

      profile.should.be.instanceof(Profile)
      profile.should.have.property('events')
      profile.events.should.have.property('internal')

      profile.run(function () {
        ao.reportError(new Error('test error'))
        ao.reportInfo({ Foo: 'bar' })
      })
    })
  })
})
