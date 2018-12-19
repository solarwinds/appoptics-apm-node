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
      //ao.logLevelAdd('test:messages')
    }
  })
  afterEach(function () {
    //ao.logLevelRemove('test:messages')
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
    // force addQueue to be called by not waiting for connect() to complete.
    //
    // this is a rather convoluted test.
    // 1. issue a connect but don't wait for it to complete
    // 2. issue multiple inserts that must be queued because the connection is pending
    // 3. wait for all inserts to complete before issuing the done.
    //
    it(`should connect and queue queries using a ${type}`, function (realDone) {
      const doneCalls = []
      function done (err) {
        doneCalls.push(new Error('done call'))
        if (doneCalls.length > 1) {
          console.log(doneCalls)
        }
        realDone(err)
      }

      mongoose.connect(`mongodb://${host}/${dbn}`, mongoOpts)
        .then(r => {
          ao.loggers.test.debug('addQueue - connected')
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

      // used only if the find function is added back to this test. it's not included
      // now because it gets executed first and it's not clear why at this time.
      // eslint-disable-next-line
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

      // steps are for the old-style checking of each message as it occurs. that creates
      // problems with this test because various versions of mongoose generate unexpected
      // queries against the admin database. left here for historical comparison.
      const steps = [entry1, entry2, entry3, exit, exit, exit]

      //
      // this is the new-style checking, still a work in progress but shaping up. it is
      // set by calling helper.setAggregate() on the emitter with the following settings.
      // the settings are only active for the current test and are cleared after being
      // acquired.
      //
      const aggregateSettings = {
        // how many messages are expected. helper.test() will take the automatically
        // generated outer layer into account by adding them; they will appear in the
        // messages array. if not supplied helper will add to aggregateSettings two
        // properties {messages: [], opIdMap: {}} when it does a shallow clone of the
        // settings.
        n: 6,
        // the ignore function is called via aggregateSettings.ignore() so this is the
        // shallow-cloned aggregateSettings object.
        //
        // ok, enough about the mechanics, ignore() exists so accesses to the admin database
        // can be ignored. those messages appear in some versions of mongoose but don't appear
        // in other versions, so we cannot expect them. the map is created as messages are
        // added. if a message is not ignored it is stored in opIdMap using the the opId as
        // the key.
        // so this ignores admin database access and exits that edge back to database accesses.
        ignore: function (m) {
          if (m.Layer === 'mongodb-core' && m.Database === 'admin' && m.Collection === '$cmd') {
            return true
          }
          if (m.Layer === 'mongodb-core' && m.Label === 'exit') {
            return !(m.Edge in this.opIdMap)
          }
          return false
        }
      }

      ao.g.stop = true

      helper.test(
        helper.setAggregate(emitter, aggregateSettings),
        function (done) {
          let n = 0
          function three () {
            ao.loggers.test.debug('addQueue - three() %d', n + 1)
            if (++n >= 3) {
              mongoose.disconnect().then(r => {
                ao.loggers.test.debug('disconnected')
                done()
              })
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
        function testDone (err, config) {
          if (!err) {
            if (ao.loggers.test.debug.enabled) {
              config.messages.forEach(showMessage)
            }
            checkMessages(steps, config)
          }
          done(err)
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

  function checkMessages (steps, config) {
    const messages = config.messages
    const m0 = messages[0]
    // verify that the first entry is outer:entry
    expect(m0).to.include({Layer: 'outer', Label: 'entry'})
    const [m0tid, m0oid] = helper.ids(m0['X-Trace'])
    const entries = {}

    // stop before the last message because it should be the outer exit.
    for (let i = 1; i < messages.length - 1; i++) {
      const m = messages[i]

      // invoke the checking function for this step
      steps[i - 1](m)
      const [tid, oid] = helper.ids(m['X-Trace'])
      // make sure task ID is the same
      expect(tid).to.equal(m0tid)

      if (m.Label === 'entry') {
        // entries should edge back to the outer entry
        expect(m).to.include({Edge: m0oid})
        entries[oid] = m
      } else if (m.Label === 'exit') {
        // should edge back to one of the entries (specific one?)
        expect(m.Edge).to.be.oneOf(Object.keys(entries))
      } else {
        throw new Error(`unexpected layer found ${m.Layer}`)
      }
    }

    // make sure outer exit is good too.
    const mx = messages[messages.length - 1]
    const [mxtid] = ids(mx['X-Trace'])
    expect(mxtid).to.equal(m0tid)
    const opids = [m0oid].concat(Object.keys(entries))
    expect(mx.Edge).to.be.oneOf(opids)
  }

})
