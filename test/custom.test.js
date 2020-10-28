'use strict'
const ao = require('..')
const fs = require('fs');
const Emitter = require('events').EventEmitter
const helper = require('./helper')
const should = require('should')
const expect = require('chai').expect;
const aob = ao.addon;
const Span = ao.Span
const Event = ao.Event

const Q = require('q');
const bluebird = require('bluebird');

const makeSettings = helper.makeSettings

const soon = global.setImmediate || process.nextTick;

function psoon () {
  return new Promise((resolve, reject) => {
    soon(resolve);
  })
}

function qpsoon () {
  return Q.delay(1);
}

function bbpsoon () {
  return bluebird.delay(1);
}

// Without the native liboboe bindings present,
// the custom instrumentation should be a no-op
if (aob.version === 'not loaded') {
  describe('custom (without native bindings present)', function () {
    it('should passthrough sync instrument', function () {
      let counter = 0
      ao.instrument('test', function () {
        counter++
      })
      counter.should.equal(1)
    })
    it('should passthrough async instrument', function (done) {
      ao.instrument('test', soon, {}, done)
    })

    it('should passthrough sync startOrContinueTrace', function () {
      let counter = 0
      ao.startOrContinueTrace(null, 'test', function () {
        counter++
      })
      counter.should.equal(1)
    })
    it('should passthrough async startOrContinueTrace', function (done) {
      ao.startOrContinueTrace(null, 'test', soon, done)
    })

    it('should support callback shifting', function (done) {
      ao.instrument('test', soon, done)
    })

    it('should not fail when accessing traceId', function () {
      ao.traceId
    })
  })
  return
}

ao.requestStore.captureHooks = false;

//================================
// custom tests with addon enabled
//================================
describe('custom', function () {
  const oSpanSendNon = Span.sendNonHttpSpan
  const oEventSend = Event.send
  const conf = {enabled: true}
  let emitter
  let counter = 0
  let pfx
  let main

  after(function () {
    ao.loggers.debug(`enters ${ao.Span.entrySpanEnters} exits ${ao.Span.entrySpanExits}`);
  });


  beforeEach(function () {
    // provide up to 100 tests with a unique prefix
    pfx = ('0' + counter++).slice(-2)
    main = `${pfx}-test`
  });

  beforeEach(function () {
    if (this.currentTest.title === 'should continue from previous trace id') {
      //ao.logLevelAdd('test:*');
    } else {
      //ao.logLevelRemove('test:span');
    }
  });

  //
  // Intercept appoptics messages for analysis
  //
  beforeEach(function (done) {
    ao.sampleRate = aob.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    emitter = helper.appoptics(done)
  });
  afterEach(function (done) {
    Span.sendNonHttpSpan = oSpanSendNon
    Event.send = oEventSend
    emitter.close(done)
  });
  // clear any debug marker
  afterEach(() => delete helper.checkLogMessages.debug);


  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () {})
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit'),
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  it('should custom instrument sync code', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument(main, function () {})
      done()
    }, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should custom instrument async code', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument(main, soon, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should custom instrument native promise code', function (done) {
    helper.test(
      emitter,
      function (done) {
        ao.pInstrument(main, psoon).then(r => {
          done()
        })
      }, [
        function (msg) {
          msg.should.have.property('Layer', main)
          msg.should.have.property('Label', 'entry')
        },
        function (msg) {
          msg.should.have.property('Layer', main)
          msg.should.have.property('Label', 'exit')
        }
      ], done)
  })

  it('should custom instrument Q promise code', function (done) {
    helper.test(
      emitter,
      function (done) {
        ao.pInstrument(main, qpsoon).then(r => {
          done()
        })
      }, [
        function (msg) {
          msg.should.have.property('Layer', main)
          msg.should.have.property('Label', 'entry')
        },
        function (msg) {
          msg.should.have.property('Layer', main)
          msg.should.have.property('Label', 'exit')
        }
      ], done)
  })

  it('should custom instrument bluebird promise code', function (done) {
    helper.test(
      emitter,
      function (done) {
        ao.pInstrument(main, bbpsoon).then(r => {
          done()
        })
      }, [
        function (msg) {
          msg.should.have.property('Layer', main)
          msg.should.have.property('Label', 'entry')
        },
        function (msg) {
          msg.should.have.property('Layer', main)
          msg.should.have.property('Label', 'exit')
        }
      ], done)
  })

  it('should support spanInfo function', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument(
        function () {
          return {
            name: main,
            kvpairs: {Foo: 'bar'}
          }
        }, soon, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Foo', 'bar')
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should allow optional callback with async code', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument(main, function (doneInner) {
        soon(function () {
          doneInner()
          done()
        })
      })
    }, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should include backtrace when collectBacktraces is on', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument(main, soon, {
        collectBacktraces: true,
        enabled: true
      }, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Backtrace')
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should skip when not enabled', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument(main, soon, {
        enabled: false
      }, done)
    }, [], done)
  })

  it('should report custom info events within a span', function (done) {
    const data = {Foo: 'bar'}
    let last

    helper.test(emitter, function (done) {
      ao.instrument(function (span) {
        return {name: main}
      }, function (callback) {
        ao.reportInfo(data)
        callback()
      }, conf, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
        last = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Foo', 'bar')
        msg.Edge.should.equal(last)
        last = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
        msg.Edge.should.equal(last)
      }
    ], done)
  })

  it('should link info events correctly', function (done) {
    let outer
    const inner = []

    const checks = [
      // Outer entry
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.entry.toString())
        msg.should.have.property('Layer', 'link-test')
        msg.should.have.property('Label', 'entry')
      },
      // Inner entry #1 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[0].events.entry.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
        msg.should.have.property('Layer', 'inner-0')
        msg.should.have.property('Label', 'entry')
      },
      // Inner info #1 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[0].events.internal[0].toString())
        msg.should.have.property('Edge', inner[0].events.entry.opId)
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Index', 0)
      },
      // Outer info
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.internal[0].toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Index', 1)
      },
      // Inner entry #2 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[1].events.entry.toString())
        msg.should.have.property('Edge', outer.events.internal[0].opId)
        msg.should.have.property('Layer', 'inner-2')
        msg.should.have.property('Label', 'entry')
      },
      // Inner info #2 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[1].events.internal[0].toString())
        msg.should.have.property('Edge', inner[1].events.entry.opId)
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Index', 2)
      },
      // Outer exit
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', outer.events.internal[0].opId)
        msg.should.have.property('Layer', 'link-test')
        msg.should.have.property('Label', 'exit')
      },
      // Inner exit #1 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[0].events.exit.toString())
        msg.should.have.property('Edge', inner[0].events.internal[0].opId)
        msg.should.have.property('Layer', 'inner-0')
        msg.should.have.property('Label', 'exit')
      },
      // Inner exit #2 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[1].events.exit.toString())
        msg.should.have.property('Edge', inner[1].events.internal[0].opId)
        msg.should.have.property('Layer', 'inner-2')
        msg.should.have.property('Label', 'exit')
      },
    ]

    function after (n, cb) {
      return function () {
        if (--n <= 0) {
          cb()
        }
      }
    }

    helper.test(emitter, function (done) {

      function makeInner (data, done) {
        const name = 'inner-' + data.Index
        const span = ao.lastSpan.descend(name)
        inner.push(span)
        span.run(function (wrap) {
          const delayed = wrap(done)
          ao.reportInfo(data)
          process.nextTick(function () {
            delayed()
          })
        })
      }

      outer = ao.lastSpan.descend('link-test')
      outer.run(function () {
        const cb = after(2, done)
        makeInner({
          Index: 0
        }, cb)
        ao.reportInfo({
          Index: 1
        })
        makeInner({
          Index: 2
        }, cb)
      })
    }, checks, done)
  })

  it('should report partitioned spans', function (done) {
    const data = {Foo: 'bar', Partition: 'bar'}
    let last

    helper.test(emitter, function (done) {
      ao.instrument(function (span) {
        return {name: main}
      }, function (callback) {
        ao.reportInfo(data)
        callback()
      }, conf, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
        last = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Foo', 'bar')
        msg.should.have.property('Partition', 'bar')
        msg.Edge.should.equal(last)
        last = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
        msg.Edge.should.equal(last)
      }
    ], done)
  })

  it('standard version should fail gracefully when invalid arguments are given', function (done) {
    helper.test(emitter, function (done) {
      function build (span) {return {name: main}}
      const expected = ['ibuild', 'irun', 'sbuild', 'srun']
      const found = []
      let i = 0
      function getInc () {
        const what = expected[i++]
        return function () {
          count++
          found.push(what)
        }
      }
      function run () {}
      let count = 0

      const logChecks = [
        {level: 'error', message: 'ao.instrument() run function is'},
        {level: 'error', message: 'ao.runInstrument found no span name or span-info()'},
        {level: 'error', message: 'ao.runInstrument failed to build span'},
        {level: 'error', message: 'ao.runInstrument failed to build span'},
        {level: 'error', message: 'no name supplied to runInstrument by span-info()'},
      ];
      helper.checkLogMessages(logChecks)

      // Verify nothing bad happens when run function is missing
      ao.instrument(build)
      ao.startOrContinueTrace(null, build)

      // Verify nothing bad happens when build function is missing
      ao.instrument(null, run)
      ao.startOrContinueTrace(null, null, run)

      // Verify the runner is still run when spaninfo fails to return an object
      ao.instrument(getInc(), getInc())
      ao.startOrContinueTrace(null, getInc(), getInc())
      found.should.deepEqual(expected)
      count.should.equal(4)

      expected.push('nnrun')
      // Verify the runner is still run when spaninfo fails to return a name
      ao.instrument(function () {return {}}, getInc())
      found.should.deepEqual(expected)
      count.should.equal(5)

      done()
    }, [], done)
  })

  it('promise version should fail gracefully when invalid arguments are given', function (tdone) {
    helper.test(emitter, function (done) {
      function build (span) {return {name: main}}
      // (i)nstrument, (s)tartOrContinueTrace
      const expected = ['ibuild', 'irun', 'sbuild', 'srun']
      const found = []
      let i = 0
      function getInc () {
        const what = expected[i++]
        return function () {
          count++
          found.push(what)
        }
      }
      function run () {}
      let count = 0

      const missing = undefined;

      // just make the messages a little shorter.
      const psoct = 'pStartOrContinueTrace';
      const logChecks = [
        // verify nothing bad happens when run function is missing
        {level: 'error', message: 'ao.instrument() run function is'},
        {level: 'error', message: `${psoct} requires function, not ${typeof missing}`},
        // verify nothing bad happens when spanInfo() is missing
        {level: 'error', message: 'ao.runInstrument found no span name or span-info()'},
        {level: 'error', message: `${psoct} span argument must be a string or function, not ${typeof protoSpan}`},
        // verify the runner is still run when spanInfo fails to return a correct object
        {level: 'error', message: 'ao.runInstrument failed to build span'},
        {level: 'error', message: `${psoct} span-info bad values: name`},
        // verify the runner is still run when spanInfo() fails to return a name
        {level: 'error', message: 'no name supplied to runInstrument by span-info()'},
        {level: 'error', message: `${psoct} span-info bad values: name`},
      ];

      const [getCount] = helper.checkLogMessages(logChecks);
      //helper.checkLogMessages.debug = true;

      // Verify nothing bad happens when run function is missing
      ao.pInstrument(build, missing);
      ao.pStartOrContinueTrace(null, build, missing);

      // Verify nothing bad happens when spanInfo is missing
      ao.pInstrument(missing, run);
      ao.pStartOrContinueTrace(null, missing, run);

      // Verify the runner is still run when spanInfo() fails to return an object
      ao.pInstrument(getInc(), getInc())
      ao.pStartOrContinueTrace(null, getInc(), getInc())

      expect(found).deep.equal(expected);
      expect(count).equal(4);

      // (n)o (n)ame run...
      expected.push('nnrun');
      expected.push('nnrun');
      // Verify the runner is still run when spanInfo() fails to return a name
      ao.pInstrument(function () {return {}}, getInc());
      ao.pStartOrContinueTrace(null, () => {return {}}, getInc());

      expect(found).deep.equal(expected);
      expect(count).equal(6);

      // verify that all the log messages where checked.
      expect(getCount()).equal(logChecks.length, 'all error messages should have been checked');

      done()
    }, [], tdone);
  })

  it('should handle errors correctly between spanInfo and run functions', function (done) {
    helper.test(emitter, function (tdone) {
      const err = new Error('nope')
      function build (span) {return {name: main}}
      function nope () {count++; throw err}
      function inc () {count++}
      let count = 0

      const logChecks = [
        {level: 'error', message: 'ao.runInstrument failed to build span'},
        {level: 'error', message: 'ao.runInstrument failed to build span'},
      ]
      helper.checkLogMessages(logChecks)

      // Verify errors thrown in builder do not propagate
      ao.instrument(nope, inc)
      ao.startOrContinueTrace(null, nope, inc)
      count.should.equal(4)

      // Verify that errors thrown in the runner function *do* propagate
      count = 0
      function validateError (e) {return e === err}
      should.throws(function () {
        ao.instrument(build, nope)
      }, validateError)
      should.throws(function () {
        ao.startOrContinueTrace(null, build, nope)
      }, validateError)
      count.should.equal(2)

      tdone();
    }, [], done)
  })

  // Verify startOrContinueTrace creates a new trace when not already tracing.
  it('should start a fresh trace for sync function', function (done) {
    let last
    let metricsSent = false

    const original = Span.sendNonHttpSpan
    Span.sendNonHttpSpan = function (txname, duration, error) {
      metricsSent = true
      return txname
    }


    helper.doChecks(emitter, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('SampleSource')
        msg.should.have.property('SampleRate')
        msg.should.not.have.property('Edge')
        last = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
        msg.Edge.should.equal(last)
      }
    ], function (err) {
      Span.sendNonHttpSpan = original
      metricsSent.should.equal(true)
      done(err)
    })

    const test = 'foo'
    const res = ao.startOrContinueTrace(null, main, function () {
      return test
    }, conf)

    res.should.equal(test)
  })

  // Verify startOrContinueTrace doesn't sample or do metrics when sampling is false
  it('should not send events or metrics - unsampled x-trace, sync', function () {
    let metricsSent = 0
    let eventsSent = 0

    Span.sendNonHttpSpan = function (txname, duration, error) {
      metricsSent += 1
      return txname
    }

    Event.send = function () {
      eventsSent += 1
    }

    const test = 'foo'
    const xtrace = aob.Event.makeRandom(0).toString();
    const res = ao.startOrContinueTrace(xtrace, main, function () {return test}, conf)

    res.should.equal(test)
    metricsSent.should.equal(0)
    eventsSent.should.equal(0)

  })

  // Verify startOrContinueTrace creates a new trace when not already tracing.
  it('should start a fresh trace for async function', function (done) {

    let last
    helper.doChecks(emitter, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('SampleSource')
        msg.should.have.property('SampleRate')
        msg.should.not.have.property('Edge')
        last = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
        msg.Edge.should.equal(last)
      }
    ], done)

    const test = 'foo'
    const res = ao.startOrContinueTrace(
      null,
      main,                          // span name
      function (cb) {                // runner
        setTimeout(function () {cb(1, 2, 3, 5)}, 100)
        return test
      },
      conf,                          // configuration
      function callback () {
        arguments.should.have.property('0', 1)
        arguments.should.have.property('1', 2)
        arguments.should.have.property('2', 3)
        arguments.should.have.property('3', 5)
      }
    )

    res.should.equal(test)
  })

  it('should start a fresh trace for a promise function', function () {
    // the promise-returning function for the span
    function psoon (...args) {
      return new Promise((resolve, reject) => {
        setTimeout(() => resolve(args), 100);
      });
    }

    let last;
    const pa = new Promise((resolve, reject) => {
      helper.doChecks(emitter, [
        function (msg) {
          expect(msg).property('Layer', main);
          expect(msg).property('Label', 'entry');
          expect(msg).property('SampleSource');
          expect(msg).property('SampleRate');
          expect(msg).not.property('Edge');
          last = msg['X-Trace'].substr(42, 16);
        },
        function (msg) {
          expect(msg).property('Layer', main);
          expect(msg).property('Label', 'exit');
          expect(msg).property('Edge', last);
        }
      ], resolve);
    });

    let p;
    // pStartOrContinueTrace. psoon's ...args are used to resolve the promise.
    const res = ao.pStartOrContinueTrace(
      null,
      main,                           // span name
      () => p = psoon(1, 2, 3, 5),    // promise-returning runner
      Object.assign({forceNewTrace: true}, conf)                            // configuration
    );

    expect(res).instanceOf(Promise);

    // wait for the span and the checks to complete then verify the result.
    return Promise.all([pa, res, p]).then(r => {
      expect(r[1]).equal(r[2]);
      return res.then(res => {
        expect(res).deep.equal([1, 2, 3, 5], 'the function return value should be returned');
        return res;
      });
    });
  });

  it('should start and descend using pStartOrContinueTrace', function () {
    // the promise-returning function for the span
    let p;
    let rdResult;
    async function task () {
      const p1 = ao.pStartOrContinueTrace(null, 'psooner', psoon)
      const p2 = new Promise((resolve, reject) => {
        fs.readdir('.', (error, files) => {
          if (error) {
            reject(error);
          } else {
            rdResult = files;
            resolve(files);
          }
        });
      });
      return p = Promise.all([p1, p2]);
    }

    function psoon () {
      return new Promise((resolve, reject) => {
        setTimeout(() => resolve(), 1000);
      });
    }

    // it's possible that reading the directory could take longer than the
    // psoon 1000ms timeout. if that's the case then 1) either make the timeout
    // longer or 2) capture the order of completion and have the following
    // checks take that into consideration.
    let last;
    let psoonEntry;
    const pa = new Promise((resolve, reject) => {
      helper.doChecks(emitter, [
        function (msg) {
          expect(msg).property('X-Trace');
          expect(`${main}:${msg.Label}`).equal(`${main}:entry`);
          expect(msg).property('SampleSource');
          expect(msg).property('SampleRate');
          expect(msg).not.property('Edge');
          last = new Last(msg['X-Trace']);
        },
        function (msg) {
          expect(msg).property('X-Trace');
          expect(`${msg.Layer}:${msg.Label}`).equal('psooner:entry');
          psoonEntry = last = new Last(msg['X-Trace']);
        },
        function (msg) {
          expect(msg).property('X-Trace');
          expect(`${msg.Layer}:${msg.Label}`).equal('fs:entry');
          expect(msg).property('Spec', 'filesystem');
          expect(msg).property('Operation', 'readdir');
          expect(msg).property('FilePath', '.');
          expect(msg).property('Async', true);
          const curr = new Last(msg['X-Trace']);
          expect(curr.taskId()).equal(last.taskId(), 'task ID must match');
          expect(msg).property('Edge', last.opId());
          last = curr;
        },
        function (msg) {
          expect(msg).property('X-Trace');
          expect(`${msg.Layer}:${msg.Label}`).equal('fs:exit');
          const curr = new Last(msg['X-Trace']);
          expect(curr.taskId()).equal(last.taskId(), 'task ID must match');
          expect(msg).property('Edge', last.opId());
          last = curr;
        },
        function (msg) {
          expect(`${msg.Layer}:${msg.Label}`).equal('psooner:exit');
          expect(msg).property('Edge', psoonEntry.opId());
          last = new Last(msg['X-Trace']);
        },
        function (msg) {
          expect(msg).property('X-Trace');
          expect(msg).property('Layer', main);
          expect(msg).property('Label', 'exit');
          expect(msg).property('Edge', last.opId());
          const curr = new Last(msg['X-Trace']);
          expect(curr.taskId()).equal(last.taskId(), 'task ID must match');
          last = curr;
        }
      ], resolve);
    });

    // pStartOrContinueTrace.
    const res = ao.pStartOrContinueTrace(
      null,
      main,                           // span name
      task,                           // promise-returning runner
      Object.assign({forceNewTrace: true}, conf)                            // configuration
    );

    expect(res).instanceOf(Promise);

    // wait for the span and the checks to complete then verify the result.
    return Promise.all([pa, res, p]).then(r => {
      expect(r[1]).equal(r[2]);
      return res.then(res => {
        // because res is the result of Promise.all() only compare the second element.
        expect(res[1]).deep.equal(rdResult, 'the function return value should be returned');
        return res;
      });
    });
  });

  // Verify startOrContinueTrace continues from provided trace id.
  it('should continue from previous trace id', function (done) {
    let last
    let entry

    helper.doChecks(emitter, [
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('x-previous:entry');
        msg.should.not.have.property('Edge')
      },
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal(`${main}:entry`);
        msg.should.not.have.property('SampleSource')
        msg.should.not.have.property('SampleRate')
        msg.Edge.should.equal(entry.opId)
        last = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal(`${main}:exit`);
        msg.Edge.should.equal(last)
        last = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('x-previous:exit');
        msg.Edge.should.equal(entry.opId)
      }
    ], done)

    ao.startOrContinueTrace(
      '',                           // no xtrace ID, start a trace
      'x-previous',                 // span name
      function (pcb) {              // runner function, creates a new span
        ao.startOrContinueTrace(
          ao.lastSpan.events.entry.toString(),    // continue from the last span's id.
          () => {
            return {
              name: main,
              finalize (span, last) {
                entry = last.events.entry
              }
            }
          },
          function (cb) {           // runner function, pseudo async
            cb()
          },
          conf,                                 // config
          function () {                         // done function
          }
        )
        pcb()
      },
      Object.assign({forceNewTrace: true}, conf),                         // config
      function () {                 // done function
      }
    )
  })

  // Verify startOrContinueTrace continues from existing traces,
  // when already tracing, whether or not an xtrace is provided.
  it('should create new traces and contexts when forceNewTrace is true', function (done) {
    // make the container span.
    const previous = Span.makeEntrySpan('previous', makeSettings())
    // don't let this act like a real entry span
    previous.topSpan = undefined;

    const entry = previous.events.entry
    const taskId = previous.events.entry.taskId;
    let prevOpId, outerOpId, innerOpId

    helper.doChecks(emitter, [
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('previous:entry');
        msg.should.not.have.property('Edge')
        prevOpId = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('continue-outer:entry');
        // SampleSource and SampleRate should NOT be here due to continuation
        msg.should.not.have.property('SampleSource')
        msg.should.not.have.property('SampleRate')
        msg.should.have.property('Edge', prevOpId)
        outerOpId = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('inner:entry');
        // SampleSource and SampleRate should NOT be here due to continuation
        msg.should.not.have.property('SampleSource')
        msg.should.not.have.property('SampleRate')
        msg.should.have.property('Edge', outerOpId)
        innerOpId = msg['X-Trace'].substr(42, 16)
      },
      // there should be a new trace here
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('new-trace:entry');
        expect(msg['X-Trace'].substr(2, 40)).not.equal(taskId);
        expect(msg.Edge).not.exist;
      },
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('new-trace:exit');
        expect(msg['X-Trace'].substr(2, 40)).not.equal(taskId);
      },
      // back to the previous trace
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('inner:exit');
        expect(msg['X-Trace'].substr(2, 40)).equal(taskId);
        msg.should.have.property('Edge', innerOpId)
      },
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('continue-outer:exit');
        msg.should.have.property('Edge', outerOpId)
      },
      function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('previous:exit');
        msg.should.have.property('Edge', prevOpId)
      }
    ], done)

    previous.run(function (wrap) {
      // Verify ID-less calls continue
      ao.startOrContinueTrace(
        null,                 // no xtrace-id
        'continue-outer',     // span name
        function (cb) {       // runner
          soon(function () {
          // Verify ID'd calls continue
            ao.startOrContinueTrace(
              entry.toString(),     // xtrace-id
              'inner',              // span name
              function (cb) {       // runner pseudo-async
                ao.requestStore.set('linger', true);
                soon(function () {
                  expect(ao.requestStore.get('linger')).equal(true);
                  // Verify newContext calls DO NOT continue when no xtrace
                  ao.startOrContinueTrace(
                    //entry.toString(),     // xtrace-id (supply this to continue)
                    '',
                    'new-trace',          // span name
                    function (cb) {       // runner pseudo-async
                      expect(ao.requestStore.get('linger')).not.exist;
                      cb()
                    },
                    Object.assign({forceNewTrace: true}, conf),                 // config
                    cb                    // done
                  )
                })
              },
              conf,                 // config
              cb                    // done
            )
          })
        },
        conf,                 // config
        wrap(function () {})) // done (wrapped due to span.run)
    })
  })

  // Verify startOrContinueTrace handles a false sample check correctly.
  it('should sample properly', function () {
    const realGetTraceSettings = aob.Context.getTraceSettings;
    let called = false

    aob.Context.getTraceSettings = function () {
      called = true
      return makeSettings({source: 0, rate: 0})
    }

    // because a span is created and entered then ao.lastSpan & ao.lastEvent
    // are cleared ao.startOrContinueTrace creates a new context, so the
    // next two errors should be generated.
    const logChecks = [
      {level: 'error', message: 'task IDs don\'t match'},
      {level: 'error', message: 'outer:exit 2b-'},
    ]
    const [getCount, clearChecks] = helper.checkLogMessages(logChecks);

    return new Promise((resolve, reject) => {
      helper.test(
        emitter,
        function (done) {             // test function
          ao.lastSpan = ao.lastEvent = null;
          ao.startOrContinueTrace(null, 'sample-properly', setImmediate, conf, done);
        },
        [() => undefined, () => undefined],                           // checks
        function (err) {
          aob.Context.getTraceSettings = realGetTraceSettings;
          expect(called).equal(true, 'the sample function should be called');
          if (err) {
            reject(err);
          } else {
            expect(getCount()).equal(2, 'expected 2 log messages');
            clearChecks();
            resolve();
          }
        }
      );
    });
  });

  // Verify traceId getter works correctly
  it('should get traceId when tracing and null when not', function () {
    ao.requestStore.run(function () {
      expect(ao.traceId).not.exist;
      expect(ao.tracing).equal(false);
      ao.startOrContinueTrace(
        null,
        main,
        function (cb) {
          should.exist(ao.traceId);
          cb();
        },
        function () {
          should.exist(ao.traceId);
        }
      )
      should.not.exist(ao.traceId);
    }, {newContext: true});

  })

  // it should handle bad bind arguments gracefully and issue warnings.
  it('should handle bad bind arguments correctly', function () {
    const bind = ao.requestStore.bind;
    let threw = false;
    const sequence = [];

    ao.requestStore.run(function () {
      let called = false;

      ao.requestStore.bind = function () {
        called = true;
      }

      function noop () {}

      const logChecks = [
        {level: 'warn', message: 'ao.bind(%s) - no context', values: ['noop']},
        {level: 'warn', message: 'ao.bind(%s) - not a function', values: [null]},
      ]
      helper.checkLogMessages(logChecks);


      try {
        ao.bind(noop);
        sequence.push(called);
        called = false;
        const span = Span.makeEntrySpan(main, makeSettings());
        // don't let it try to send metrics
        span.doMetrics = false;
        span.run(function () {
          ao.bind(null);
          sequence.push(called);
          called = false;
          ao.bind(noop);
          sequence.push(called);
        });
      } catch (e) {
        threw = true;
      }
    }, {newContext: true});

    ao.requestStore.bind = bind

    expect(sequence).deep.equal([false, false, true]);
    expect(threw).equal(false, 'there should not have been an exception');
  })

  it('should bind emitters to requestStore', function () {
    const bindEmitter = ao.requestStore.bindEmitter
    let threw;
    let called = false

    function captureCall () {
      called = true
    }
    const emitter = new Emitter()

    // this is a little tricky - bind emitter errors are debounced so not every
    // error results in a log message. the count appears in brackets.
    const logChecks = [
      {level: 'warn', message: '[1]ao.bindEmitter - no context'},
      {level: 'error', message: '[1]ao.bindEmitter - non-emitter'},
    ]
    helper.checkLogMessages(logChecks)

    try {
      ao.resetRequestStore();
      // reset requestStore resets bindEmitter, so don't replace it with captureCall
      // until after resetting the request store.
      ao.requestStore.bindEmitter = captureCall;
      ao.bindEmitter(emitter)
      called.should.equal(false, 'bindEmitter should not have been called when no context');
      const span = Span.makeEntrySpan(main, makeSettings())
      span.run(function () {
        ao.bindEmitter(null)
        called.should.equal(false, 'bindEmitter should not have been called for null');
        ao.bindEmitter(emitter)
        called.should.equal(true, 'bindEmitter should be called for an emitter');
      })
    } catch (e) {
      threw = e.message;
    }

    ao.requestStore.bindEmitter = bindEmitter

    expect(threw).not.exist;
  })

  it('should support instrumentHttp', function (done) {
    // Fake response object
    const res = new Emitter()
    res.end = res.emit.bind(res, 'end')
    let last

    helper.test(emitter, function (done) {
      ao.instrumentHttp(
        () => {
          return {
            name: main
          }
        },
        function () {
          setImmediate(function () {
            res.end()
            done()
          })
        }, conf, res)
    }, [
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'entry')
        last = msg['X-Trace'].substr(42, 16)
      },
      function (msg) {
        msg.should.have.property('Layer', main)
        msg.should.have.property('Label', 'exit')
        msg.Edge.should.equal(last)
      }
    ], done)
  });

  // Verify startOrContinue trace doesn't sample or do metrics when sampling is false
  it('should not send events or metrics - unsampled x-trace, async', function (done) {
    // this is at the end because it's a little tricky to test an unsampled trace because
    // the callback will be called before all the async contexts have cleared resulting in
    // leftover contexts and resultant errors for the next test.
    let metricsSent = 0
    let eventsSent = 0

    Span.sendNonHttpSpan = function (txname, duration, error) {
      metricsSent += 1
      return txname
    }

    Event.send = function () {
      eventsSent += 1
    }

    const test = 'foo'
    const xtrace = aob.Event.makeRandom(0).toString()
    const res = ao.startOrContinueTrace(
      xtrace,
      main,                          // span name
      function (cb) {                // runner
        setTimeout(function () {cb(1, 2, 3, 5)}, 100)
        return test
      },
      conf,                          // configuration
      function () {
        arguments.should.have.property('0', 1)
        arguments.should.have.property('1', 2)
        arguments.should.have.property('2', 3)
        arguments.should.have.property('3', 5)
      }
    )

    res.should.equal(test)

    // wait for contexts to clear.
    setTimeout(function () {
      metricsSent.should.equal(0)
      eventsSent.should.equal(0)
      done()
    }, 250)
  })

  it('should not have leftover context', function () {

  })

});

class Last {
  constructor (xtrace) {
    this.xtrace = xtrace.toUpperCase();
    if (!this.xtrace.startsWith('2B')) {
      throw new Error(`doesn't start with '2B': ${xtrace}`);
    }
  }
  taskId () {
    return this.xtrace.substr(2, 40);
  }
  opId () {
    return this.xtrace.substr(42, 16);
  }
  flags () {
    return this.xtrace.slice(-2);
  }

}

