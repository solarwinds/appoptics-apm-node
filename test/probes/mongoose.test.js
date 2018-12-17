'use strict'

const expect = require('chai').expect
const {ao} = require('../1.test-common.js')
const helper = require('../helper')
const semver = require('semver')

const mongoose = require('mongoose')
const Schema = mongoose.Schema

const pkg = require('mongoose/package')

// use built-in Promise, replacing mongoose's own implementation (deprecated)
mongoose.Promise = Promise

let host = process.env.AO_TEST_MONGODB_3_0
  || process.env.AO_TEST_MONGODB_2_6
  || process.env.AO_TEST_MONGODB_2_4
  || 'localhost:27017'

if (process.env.CI === 'true' && process.env.TRAVIS === 'true') {
  host = process.env.AO_TEST_MONGODB_3_0 || 'localhost:27017'
}

const major = semver.major(pkg.version)

// use AO_IX if present. It provides a unique ID to prevent collisions
// during matrix testing. It's not needed when testing only one instance
// at a time locally.
const dbn = 'test' + (process.env.AO_IX ? '-' + process.env.AO_IX : '')

describe('probes/mongoose ' + pkg.version, function () {
  const mongoOpts = major >= 5 ? {useNewUrlParser: true} : {useMongoClient: true}

  const Cat = mongoose.model(dbn, new Schema({
    name: String
  }))
  let emitter
  let backtraces
  let fsenabled

  before(function () {
    ao.g.testing(__filename)
  })
  after(function () {
  })

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    // make them more readable
    backtraces = ao.probes['mongodb-core'].collectBacktraces
    ao.probes['mongodb-core'].collectBacktraces = false
    // and don't let file IO complicate the results
    fsenabled = ao.probes.fs.enabled
    ao.probes.fs.enabled = false
  })
  after(function (done) {
    ao.probes.fs.enabled = fsenabled
    ao.probes['mongodb-core'].collectBacktraces = backtraces
    emitter.close(done)
  })

  beforeEach(function () {
    if (this.currentTest.title.indexOf('should connect and queue queries using a') === 0) {
      //ao.logLevelAdd('test:message')
    }
  })

  afterEach(function () {
    ao.logLevelRemove('test:message')
  })
  //
  // define common checks
  //
  const check = {
    base: function (msg) {
      expect(msg).to.include({Spec: 'query'})
      expect(msg).to.include({Flavor: 'mongodb'})
      expect(msg).to.have.property('RemoteHost')
      expect(msg.RemoteHost).to.match(/:\d*$/)
    },
    common: function (msg) {
      expect(msg).to.include({Database: dbn})
    },
    entry: function (msg) {
      expect(msg).to.include({Layer: 'mongodb-core'})
      expect(msg).to.include({Label: 'entry'})
      check.base(msg)
    },
    exit: function (msg) {
      expect(msg).to.include({Layer: 'mongodb-core'})
      expect(msg).to.include({Label: 'exit'})
    }
  }

  // fake test to work around UDP dropped message issue
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () {})
      done()
    }, [
      function (msg) {
        expect(msg).to.have.property('Label').oneOf(['entry', 'exit'])
        expect(msg).to.have.property('Layer', 'fake')
      }
    ], done)
  })

  const cat1 = {
    name: 'Sargeant Cuddlesby'
  }

  const cat2 = {
    name: 'HeiHei'
  }

  const cat3 = {
    name: 'Mimi'
  };

  //
  // the following tests basically check the same thing as the mongodb-core
  // tests. mongoose itself is not instrumented; only mongodb-core is. but
  // for mongodb-core to instrument context must be maintained through the
  // mongoose api. that's what the mongoose probe does.
  //

  ['callback', 'promise'].forEach(type => {

    //
    // connect
    //
    it(`should connect correctly with a ${type}`, function (done) {
      if (type === 'callback') {
        mongoose.connect(`mongodb://${host}/${dbn}`, mongoOpts, done)
      } else {
        mongoose.connect(`mongodb://${host}/${dbn}`, mongoOpts)
          .then(r => {
            done()
          })
      }
    })


    //
    // add
    //
    function makeAddFunction (cat) {
      return function addFunction (done) {
        const kitty = new Cat(cat)

        if (type === 'callback') {
          kitty.save(function (err, item, rows) {
            done()
          })
        } else {
          kitty.save()
            .then(k => done())
        }
      }
    }

    function testAddCat (done) {

      function entry (msg) {
        check.entry(msg)
        check.common(msg)
        expect(msg).to.include({QueryOp: 'insert'})
        expect(msg.Insert_Document).to.be.a('String')
        const q = JSON.parse(msg.Insert_Document)
        expect(q).to.be.an('Array')
        expect(q[0]).to.be.an('Object')
        expect(q[0]).to.include(cat1)
      }
      function exit (msg) {
        check.exit(msg)
      }
      const steps = [entry, exit]

      helper.test(
        emitter,
        makeAddFunction(cat1),
        steps,
        done
      )
    }

    it(`should add an object using a ${type}`, testAddCat)

    //
    // find
    //

    function makeFindFunction (cat) {
      const findQuery = Object.assign({}, cat)
      return function findFunction (done) {
        if (type === 'callback') {
          Cat.findOne(findQuery, function (err, item, rows) {done(err)})
        } else {
          Cat.findOne(findQuery)
            .then(r => done())
        }
      }
    }

    function testFindCat (done) {
      const findQuery = Object.assign({}, cat1)

      function entry (msg) {
        check.entry(msg)
        check.common(msg)
        expect(msg).to.include({QueryOp: 'find'})
        expect(msg).to.include({Query: JSON.stringify(findQuery)})
      }
      function exit (msg) {
        check.exit(msg)
      }
      const steps = [entry, exit]

      helper.test(
        emitter,
        makeFindFunction(cat1),
        steps,
        done
      )
    }

    it(`should find an object using a ${type}`, testFindCat)

    //
    // delete
    //
    const mongoDelete = major >= 5 ? 'deleteOne' : 'remove'

    function makeDeleteFunction (cat) {
      const deleteQuery = Object.assign({}, cat)
      return function deleteFunction (done) {
        if (type === 'callback') {
          Cat[mongoDelete](deleteQuery, function (err, deletedCat) {done(err)})
        } else {
          Cat[mongoDelete](deleteQuery)
            .then(deletedCat => done())
        }
      }
    }


    function testDeleteCat (done) {
      const deleteQuery = JSON.stringify([cat1])

      function entry (msg) {
        check.entry(msg)
        check.common(msg)
        expect(msg).to.include({QueryOp: 'remove'})
        expect(msg).to.include({Query: deleteQuery})
      }
      function exit (msg) {
        check.exit(msg)
      }
      const steps = [entry, exit]

      helper.test(
        emitter,
        makeDeleteFunction(cat1),
        steps,
        done
      )
    }

    it(`should delete an object using a ${type}`, testDeleteCat)

    //
    // disconnect
    //
    it(`should disconnect correctly with a ${type}`, function (done) {
      if (type === 'callback') {
        mongoose.disconnect(done)
      } else {
        mongoose.disconnect()
          .then(r => {
            done()
          })
      }
    })

    //
    // force addQueue by not waiting for connect() to complete.
    //
    it(`should connect and queue queries using a ${type}`, function (done) {
      mongoose.connect(`mongodb://${host}/${dbn}`, mongoOpts)
        .then(r => {
          ao.loggers.debug('addQueue - connected')
        })

      function makeInsertEntry (cat) {
        return function (msg) {
          check.entry(msg)
          check.common(msg)
          expect(msg).to.include({QueryOp: 'insert'})
          expect(msg.Insert_Document).to.be.a('String')

          const q = JSON.parse(msg.Insert_Document)
          expect(q).to.be.an('Array')
          expect(q[0]).to.be.an('Object')
          expect(q[0]).to.include(cat)
        }
      }

      function findEntry (msg) {
        check.entry(msg)
        check.common(msg)
        expect(msg).to.include({QueryOp: 'find'})
        expect(msg).to.include({Query: JSON.stringify(cat1)})
      }

      const entry1 = makeInsertEntry(cat1)
      const entry2 = makeInsertEntry(cat2)
      const entry3 = makeInsertEntry(cat3)

      function exit (msg) {
        check.exit(msg)
      }
      function noop () {}
      const steps = [entry1, entry2, entry3, exit, exit, exit]

      ao.g.stop = true

      helper.test(
        helper.setAggregate(emitter),
        function (done) {
          let n = 0
          function three () {
            ao.loggers.debug('addQueue - three() %d', n + 1)
            if (++n >= 3) {
              //mongoose.disconnect().then(r => done())
              done()
            }
          }
          makeAddFunction(cat1)(three)
          makeAddFunction(cat2)(three)
          makeAddFunction(cat3)(three)
          // leave commented out until the reordering is understood.
          //makeFindFunction(cat1)(three)
          //makeDeleteFunction(cat1)(three)
        },
        steps,
        function testDone (err, messages) {
          expect(messages.length).to.equal(steps.length + 2)
          helper.clearAggregate(emitter)

          //messages.forEach(showMessage)
          checkMessages(steps, messages)
          done()
        }
      )
    })

  })

  function ids (x) {return [x.substr(2, 40), x.substr(42, 16)]}

  function showMessage (m) {
    const text = [`${m.Layer}:${m.Label} ${ids(m['X-Trace']).join(':')}`]
    if (m.Edge) {
      text.push(`\n  ${m.Edge}`)
    }
    if (m.Layer === 'mongodb-core' && m.Label === 'entry') {
      text.push(`\n  ${m.Spec} - ${m.QueryOp}`)
      if (m.QueryOp === 'insert') {
        const match = m.Insert_Document.match(/"name":".+?"/)
        text.push(`${match[0]}`)
      }
    }

    console.log(text.join(' '))
  }

  function checkMessages (steps, messages) {
    const m0 = messages.shift()
    const [m0tid, m0oid] = ids(m0['X-Trace'])
    const entries = {}

    for (let i = 0; i < steps.length; i++) {
      steps[i](messages[i])
      const [tid, oid] = ids(messages[i]['X-Trace'])
      // make sure task ID is the same
      expect(tid).to.equal(m0tid)

      if (messages[i].Label === 'entry') {
        // entries should edge back to the outer entry
        expect(messages[i]).to.include({Edge: m0oid})
        entries[oid] = messages[i]
      } else if (messages[i].Label === 'exit') {
        // should edge back to one of the entries
        expect(messages[i].Edge).to.be.oneOf(Object.keys(entries))
        delete entries[messages[i].Edge]
      } else {
        throw new Error(`unexpected layer found ${messages[i].Layer}`)
      }
    }

    // make sure outer exit is good too.
    const mx = messages[messages.length - 1]
    const [mxtid, mxoid] = ids(mx['X-Trace'])
    expect(mxtid).to.equal(m0tid)
    expect(mx.Edge).to.equal(m0oid)
  }

})
