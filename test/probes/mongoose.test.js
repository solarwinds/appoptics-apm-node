'use strict'

const should = require('should')
const {ao} = require('../1.test-common.js')

const Span = ao.Span

const mongoose = require('mongoose')
const Schema = mongoose.Schema

const pkg = require('mongoose/package')

// use built-in Promise, replaceing mongoose's own implementation (deprecated)
mongoose.Promise = Promise

let host = process.env.AO_TEST_MONGODB_2_4 || 'localhost:27017'

if (process.env.CI === 'true' && process.env.TRAVIS === 'true') {
  host = process.env.AO_TEST_MONGODB_3 || 'localhost:27017'
}

describe('probes/mongoose ' + pkg.version, function () {
  const Cat = mongoose.model('test', new Schema({
    name: String
  }))
  const mOpts = {useMongoClient: true}

  before(function (done) {
    ao.g.testing(__filename)
    mongoose.connect('mongodb://' + host + '/test', mOpts, done)
  })
  after(function () {
    mongoose.disconnect()
  })

  let savedCat

  it('should trace through mongoose adding an object', function (done) {
    const span = new Span('outer', {})
    span.run(function () {
      const data = {
        name: 'Sargeant Cuddlesby'
      }

      ao.requestStore.set('name', data.name)

      const kitty = new Cat(data)
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
    const span = new Span('outer', {})
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
