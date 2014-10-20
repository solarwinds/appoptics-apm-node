var helper = require('./helper')
var should = require('should')
var tv = require('..')
var addon = tv.addon
var Profile = tv.Profile
var Layer = tv.Layer

describe('profile', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  beforeEach(function (done) {
    this.timeout(5000)
    emitter = helper.tracelyzer(done)
    tv.sampleRate = addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  afterEach(function (done) {
    this.timeout(5000)
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
})
