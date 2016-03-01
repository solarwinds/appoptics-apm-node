var helper = require('../helper')
var tv = helper.tv
var Layer = tv.Layer

var mongoose = require('mongoose')
var Schema = mongoose.Schema

var host = process.env.TEST_MONGODB_2_4 || 'localhost:27017'

describe('probes/mongoose', function () {
  var Cat = mongoose.model('test', new Schema({
    name: String
  }))

  before(function (done) {
    mongoose.connect('mongodb://' + host + '/test', done)
  })
  after(function() {
    mongoose.disconnect()
  })

  it('should trace through mongoose', function (done) {
    var layer = new Layer('outer', {})
    layer.run(function () {
      var data = {
        name: 'Sargeant Cuddlesby'
      }

      var password = 'this is a test'
      tv.requestStore.set('name', data.name)

      var kitty = new Cat(data)
      kitty.save(function (err) {
        tv.requestStore.get('name').should.equal(data.name)
        Cat.findOne(data, function () {
          tv.requestStore.get('name').should.equal(data.name)
          done()
        })
      })
    })
  })
})
