var oboe = require('../')

describe('config', function () {
  var version
  var revision

  it('should get version', function () {
    version = oboe.Config.getVersion()
    version.should.be.an.instanceof(Number)
    version.should.equal(1)
  })

  it('should get revision', function () {
    revision = oboe.Config.getRevision()
    revision.should.be.an.instanceof(Number)
    revision.should.equal(1)
  })

  it('should check valid versions', function () {
    var check = oboe.Config.checkVersion(version, revision)
    check.should.be.an.instanceof(Boolean)
    check.should.equal(true)
  })

  it('should check invalid versions', function () {
    var check = oboe.Config.checkVersion(10000, 0)
    check.should.be.an.instanceof(Boolean)
    check.should.equal(false)
  })
})
