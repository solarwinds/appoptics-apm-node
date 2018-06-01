var helper = require('../helper')
var should = require('should')
var ao = helper.ao
var Span = ao.Span

var mongoose = require('mongoose')
var Schema = mongoose.Schema

var pkg = require('mongoose/package')

// use built-in Promise, replaceing mongoose's own implementation (deprecated)
mongoose.Promise = Promise

var host = process.env.AO_TEST_MONGODB_2_4 || 'localhost:27017'

if (process.env.CI === 'true' && process.env.TRAVIS === 'true') {
  host = process.env.AO_TEST_MONGODB_3 || 'localhost:27017'
}

describe('probes/mongoose ' + pkg.version, function () {
  var Cat = mongoose.model('test', new Schema({
    name: String
  }))
  var mOpts = {useMongoClient: true}

  before(function (done) {
    mongoose.connect('mongodb://' + host + '/test', mOpts, done)
  })
  after(function() {
    mongoose.disconnect()
  })

  var savedCat

  it('should trace through mongoose adding an object', function (done) {
    var span = new Span('outer', {})
    span.run(function () {
      var data = {
        name: 'Sargeant Cuddlesby'
      }

      var password = 'this is a test'
      ao.requestStore.set('name', data.name)

      var kitty = new Cat(data)
      kitty.save(function (err, item, rows) {
        let name = ao.requestStore.get('name')
        should.equal(name, data.name)
        savedCat = item
        Cat.findOne(data, function () {
          name = ao.requestStore.get('name')
          should.equal(name, data.name)
          done()
        })
      })
    })
  })

  it('should trace through mongoose deleting an object', function (done) {
    var span = new Span('outer', {})
    span.run(function () {

      ao.requestStore.set('cat', 'Mimi')

      Cat.remove(function (err, deletedCat) {
        let storedCat = ao.requestStore.get('cat')
        should.equal(storedCat, 'Mimi')
        Cat.findOne(savedCat, function (err, cat) {
          storedCat = ao.requestStore.get('cat')
          should.equal(storedCat, 'Mimi')
          should.not.exist(cat)
          done()
        })
      })
    })
  })
})
