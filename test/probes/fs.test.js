/* global it, describe, before, after */
'use strict'

const helper = require('../helper')
const { ao } = require('../1.test-common')
const expect = require('chai').expect

const path = require('path')
const fs = require('fs')

ao.probes.fs.collectBacktraces = false

describe('probes.fs', function () {
  let emitter
  let mode

  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit')
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  //
  // Define some general message checks
  //
  const checks = {
    entry: function (msg) {
      const explicit = `${msg.Layer}:${msg.Label}`
      expect(explicit).equal('fs:entry', 'Layer and Label must match')
    },
    exit: function (msg) {
      const explicit = `${msg.Layer}:${msg.Label}`
      expect(explicit).equal('fs:exit', 'Layer and Label must match')
    }
  }

  function entry (name) {
    name = mode === 'sync' ? name + 'Sync' : name
    // If a requested op does not exist yet, create it
    if (!checks[name + '-entry']) {
      checks[name + '-entry'] = function (msg) {
        checks.entry(msg)
        expect(msg).property('Operation', name)
      }
      checks[name + '-entry'].realName = name
      checks[name + '-exit'] = function (msg) {
        checks.exit(msg)
      }
      checks[name + '-exit'].realName = name
    }
    return checks[name + '-entry']
  }
  function exit (name) {
    name = mode === 'sync' ? name + 'Sync' : name
    return checks[name + '-exit']
  }
  function span (name) {
    return [entry(name), exit(name)]
  }

  function result (v) {
    return typeof v === 'function' ? v() : v
  }

  //
  // Intercept messages for analysis
  //
  before(function (done) {
    emitter = helper.backend(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  const resolved = path.resolve('fs-output/foo.bar.link')
  let fd

  //
  // This describes the inputs and behaviour of each function
  //
  const calls = [
    // fs.mkdir
    {
      type: 'path',
      name: 'mkdir',
      args: ['fs-output']
    },
    // fs.readdir
    {
      type: 'path',
      name: 'readdir',
      args: ['fs-output']
    },
    // fs.exists
    {
      type: 'path',
      name: 'exists',
      args: ['fs-output/foo.bar'],
      subs: function () {
        if (mode === 'sync') {
          return undefined
        }

        return [span('access')]
      }
    },
    // fs.access
    {
      type: 'path',
      name: 'access',
      args: ['fs-output/foo.bar']
    },
    // fs.writeFile
    {
      type: 'path',
      name: 'writeFile',
      args: ['fs-output/foo.bar', 'some data'],
      subs: function () {
        if (mode === 'promises') {
          return []
        }
        return [span('open'), span('write'), span('close')]
      }
    },
    // fs.readFile
    {
      type: 'path',
      name: 'readFile',
      args: ['fs-output/foo.bar'],
      subs: function () {
        if (mode !== 'sync') {
          return []
        }
        const expected = [span('open')]
        return expected.concat([span('read'), span('close')])
      }
    },
    // fs.truncate
    {
      type: 'path',
      name: 'truncate',
      args: ['fs-output/foo.bar', 0],
      subs: function () {
        if (mode === 'promises') {
          return []
        }
        if (mode === 'sync') {
          return [span('open'), span('ftruncate'), span('close')]
        } else {
          return [span('open'), span('close')]
        }
      }
    },
    // fs.appendFile
    {
      type: 'path',
      name: 'appendFile',
      args: ['fs-output/foo.bar', 'some data'],
      subs: function () {
        if (mode === 'promises') {
          return []
        }
        return [entry('writeFile'), span('open'), span('write'), span('close'), exit('writeFile')]
      }
    },
    // fs.stat
    {
      type: 'path',
      name: 'stat',
      args: ['fs-output/foo.bar']
    },
    // fs.chown
    {
      type: 'path',
      name: 'chown',
      args: ['fs-output/foo.bar', process.getuid(), process.getgid()]
    },
    // fs.chmod
    {
      type: 'path',
      name: 'chmod',
      args: ['fs-output/foo.bar', 0o777]
    },
    // fs.utimes
    {
      type: 'path',
      name: 'utimes',
      args: ['fs-output/foo.bar', Date.now(), Date.now()]
    },
    // fs.symlink
    {
      type: 'link',
      name: 'symlink',
      args: function () {
        // reversed arguments for sync vs. async
        if (mode === 'sync') {
          return ['fs-output/foo.bar', 'fs-output/foo.bar.symlink']
        }
        return ['fs-output/foo.bar.symlink', 'fs-output/foo.bar']
      }
    },
    // fs.link
    {
      type: 'link',
      name: 'link',
      args: function () {
        // reversed arguments for sync vs. async
        if (mode === 'sync') {
          return ['fs-output/foo.bar', 'fs-output/foo.bar.link']
        }
        return ['fs-output/foo.bar.link', 'fs-output/foo.bar']
      }
    },
    // fs.readlink
    {
      type: 'path',
      name: 'readlink',
      args: ['fs-output/foo.bar.symlink']
    },
    // fs.realpath
    {
      type: 'path',
      name: 'realpath',
      args: ['fs-output/foo.bar.link'],
      subs: function () {
        if (mode === 'promises') {
          return []
        }
        if (mode === 'sync') {
          return []
        }
        return resolved.split('/').slice(1).map(function () { return span('lstat') })
      }
    },
    // fs.lstat
    {
      type: 'path',
      name: 'lstat',
      args: ['fs-output/foo.bar.link']
    },
    // fs.rename
    {
      type: 'link',
      name: 'rename',
      args: ['fs-output/foo.bar.link', 'fs-output/foo.bar.link.renamed']
    },
    // fs.open
    {
      type: 'path',
      name: 'open',
      args: ['fs-output/foo.bar', 'w+'],
      after: function (err, _fd) {
        fd = _fd
      }
    },
    // fs.ftruncate
    {
      type: 'fd',
      name: 'ftruncate',
      args: function () { return [fd] }
    },
    // fs.fchown
    {
      type: 'fd',
      name: 'fchown',
      args: function () { return [fd, process.getuid(), process.getgid()] }
    },
    // fs.fchmod
    {
      type: 'fd',
      name: 'fchmod',
      args: function () { return [fd, 0o777] }
    },
    // fs.fstat
    {
      type: 'fd',
      name: 'fstat',
      args: function () { return [fd] }
    },
    // fs.futimes
    {
      type: 'fd',
      name: 'futimes',
      args: function () { return [fd, Date.now(), Date.now()] }
    },
    // fs.fsync
    {
      type: 'fd',
      name: 'fsync',
      args: function () { return [fd] }
    },
    // fs.write
    {
      type: 'fd',
      name: 'write',
      args: function () {
        const buf = Buffer.from('some data')
        return [fd, buf, 0, 'some data'.length, 0]
      }
      // args: function () { return [fd, 'some data'] }
    },
    // fs.read
    {
      type: 'fd',
      name: 'read',
      args: function () {
        const buf = Buffer.alloc('some data'.length)
        return [fd, buf, 0, 'some data'.length, 0]
      }
    },
    // fs.close
    {
      type: 'fd',
      name: 'close',
      args: function () { return [fd] }
    },
    // fs.unlink
    {
      type: 'path',
      name: 'unlink',
      args: ['fs-output/foo.bar']
    },
    // fs.access
    {
      type: 'path',
      name: 'rmdir',
      args: ['fs-output'],
      before: function () {
        // Need to clean up our linking mess before removing the directory
        try {
          fs.unlinkSync('fs-output/foo.bar.symlink')
          fs.unlinkSync('fs-output/foo.bar.link.renamed')
        } catch (e) {}
      }
    }
  ]

  describe('async promises', function () {
    before(function () {
      mode = 'promises'
    })

    calls.forEach(function (call) {
      if (typeof fs.promises[call.name] !== 'function') return

      it('should support ' + call.name, function (done) {
        const args = result(call.args)
        emitter.log = call.log

        // First step is to expect the message for the operation we are making
        const steps = [
          function (msg) {
            checks.entry(msg)
            expect(msg).property('Operation', call.name)
            expect(msg).property('Flavor', 'promise')
            if (call.type === 'path') {
              expect(msg).property('FilePath', args[0])
            } else if (call.type === 'fd') {
              expect(msg).property('FileDescriptor', args[0])
            }
          }
        ]

        // Include checks for all expected sub-spans
        function add (step) {
          steps.push(step)
        }

        const subs = result(call.subs)
        if (Array.isArray(subs)) {
          subs.forEach(function (sub) {
            if (Array.isArray(sub)) {
              sub.forEach(add)
            } else {
              add(sub)
            }
          })
        }

        // Before starting test, run any required tasks
        if (call.before) call.before()

        helper.test(emitter, function (done) {
          // Make call and pass callback args to after handler, if present
          fs.promises[call.name].apply(fs.promises, args).finally(_ => {
            if (call.after) call.after.apply(this, arguments)
            done()
          })
        }, steps, function (e) {
          done(e)
        })
      })
    })
  })

  describe('async callbacks', function () {
    before(function () {
      mode = 'callbacks'
    })

    calls.forEach(function (call) {
      if (typeof fs[call.name] !== 'function') return

      it('should support ' + call.name, function (done) {
        const args = result(call.args)
        emitter.log = call.log

        // First step is to expect the message for the operation we are making
        const steps = [
          function (msg) {
            checks.entry(msg)
            expect(msg).property('Operation', call.name)
            expect(msg).property('Flavor', 'callback')
            if (call.type === 'path') {
              expect(msg).property('FilePath', args[0])
            } else if (call.type === 'fd') {
              expect(msg).property('FileDescriptor', args[0])
            }
          }
        ]

        // Include checks for all expected sub-spans
        function add (step) {
          steps.push(step)
        }

        const subs = result(call.subs)
        if (Array.isArray(subs)) {
          subs.forEach(function (sub) {
            if (Array.isArray(sub)) {
              sub.forEach(add)
            } else {
              add(sub)
            }
          })
        }

        // Push the exit check
        steps.push(function (msg) {
          checks.exit(msg)
          if (call.name === 'open') {
            expect(msg).property('FileDescriptor')
          }
        })

        // Before starting test, run any required tasks
        if (call.before) call.before()

        helper.test(emitter, function (done) {
          // Make call and pass callback args to after handler, if present
          fs[call.name].apply(fs, args.concat(function () {
            if (call.after) call.after.apply(this, arguments)
            done()
          }))
        }, steps, function (e) {
          done(e)
        })
      })
    })
  })

  describe('sync', function () {
    before(function () {
      mode = 'sync'
    })

    calls.forEach(function (call) {
      const name = call.name + 'Sync'
      if (typeof fs[name] !== 'function') return

      it('should support ' + name, function (done) {
        const args = result(call.args)
        emitter.log = call.log

        // First step is to expect the message for the operation we are making
        const steps = [
          function (msg) {
            checks.entry(msg)
            expect(msg).property('Operation', name)
            expect(msg).to.not.have.property('Flavor')
            switch (call.type) {
              case 'path':
                expect(msg).property('FilePath', args[0])
                break
            }
          }
        ]

        // Include checks for all expected sub-spans
        function add (step) {
          steps.push(step)
        }

        const subs = result(call.subs)
        if (Array.isArray(subs)) {
          subs.forEach(function (sub) {
            if (Array.isArray(sub)) {
              sub.forEach(add)
            } else {
              add(sub)
            }
          })
        }

        // Push the exit check
        steps.push(function (msg) {
          checks.exit(msg)
        })

        // Before starting test, run any required tasks
        if (call.before) call.before()

        helper.test(emitter, function (done) {
          // Make call and pass result or error to after handler, if present
          try {
            const res = fs[name].apply(fs, args)
            if (call.after) call.after(null, res)
          } catch (e) {
            if (call.after) call.after(e)
          }
          process.nextTick(done)
        }, steps, function (e) {
          done(e)
        })
      })
    })
  })

  it('should fail openSync calls gracefully', function (done) {
    const previousIgnoreErrors = ao.probes.fs.ignoreErrors
    delete ao.probes.fs.ignoreErrors
    function reset (err) {
      ao.probes.fs.ignoreErrors = previousIgnoreErrors
      done(err)
    }
    helper.test(emitter, function (done) {
      try {
        fs.openSync('does-not-exist', 'r')
      } catch (e) {}
      process.nextTick(done)
    }, [
      function (msg) {
        checks.entry(msg)
        expect(msg).property('Operation', 'openSync')
        expect(msg).property('FilePath', 'does-not-exist')
      },
      function (msg) {
        checks.exit(msg)
        expect(msg).property('ErrorClass', 'Error')
        expect(msg).property('Backtrace')
        expect(msg).property('ErrorMsg').a('string').match(/^ENOENT/)
      }
    ], reset)
  })

  it('should suppress openSync errors when requested', function (done) {
    const previousIgnoreErrors = ao.probes.fs.ignoreErrors
    ao.probes.fs.ignoreErrors = { open: { ENOENT: true } }
    function reset (err) {
      ao.probes.fs.ignoreErrors = previousIgnoreErrors
      done(err)
    }
    helper.test(emitter, function (done) {
      try {
        fs.openSync('does-not-exist', 'r')
      } catch (e) {}
      process.nextTick(done)
    }, [
      function (msg) {
        checks.entry(msg)
        expect(msg).property('Operation', 'openSync')
        expect(msg).property('FilePath', 'does-not-exist')
      },
      function (msg) {
        checks.exit(msg)
        expect(msg).not.property('ErrorClass')
        expect(msg).not.property('Backtrace')
        expect(msg).not.property('ErrorMsg')
      }
    ], reset)
  })

  it('should suppress statSync errors when requested', function (done) {
    const previousIgnoreErrors = ao.probes.fs.ignoreErrors
    ao.probes.fs.ignoreErrors = { stat: { ENOENT: true } }
    function reset (err) {
      ao.probes.fs.ignoreErrors = previousIgnoreErrors
      done(err)
    }
    helper.test(emitter, function (done) {
      try {
        fs.statSync('does-not-exist', 'r')
      } catch (e) { }
      process.nextTick(done)
    }, [
      function (msg) {
        checks.entry(msg)
        expect(msg).property('Operation', 'statSync')
        expect(msg).property('FilePath', 'does-not-exist')
      },
      function (msg) {
        checks.exit(msg)
        expect(msg).not.property('ErrorClass')
        expect(msg).not.property('Backtrace')
        expect(msg).not.property('ErrorMsg')
      }
    ], reset)
  })

  it('should report open errors', function (done) {
    const previousIgnoreErrors = ao.probes.fs.ignoreErrors
    delete ao.probes.fs.ignoreErrors
    function reset (err) {
      ao.probes.fs.ignoreErrors = previousIgnoreErrors
      done(err)
    }
    helper.test(emitter, function (done) {
      fs.open('does-not-exist', 'r', function (err) {
        done()
      })
    }, [
      function (msg) {
        checks.entry(msg)
        expect(msg).property('Operation', 'open')
        expect(msg).property('FilePath', 'does-not-exist')
      },
      function (msg) {
        checks.exit(msg)
        expect(msg).property('ErrorClass', 'Error')
        expect(msg).property('Backtrace')
        expect(msg).property('ErrorMsg').a('string').match(/^ENOENT/)
      }
    ], reset)
  })

  it('should suppress open errors when requested', function (done) {
    const previousIgnoreErrors = ao.probes.fs.ignoreErrors
    ao.probes.fs.ignoreErrors = { open: { ENOENT: true } }
    function reset (err) {
      ao.probes.fs.ignoreErrors = previousIgnoreErrors
      done(err)
    }
    helper.test(emitter, function (done) {
      fs.open('does-not-exist', 'r', function (err) {
        done()
      })
    }, [
      function (msg) {
        checks.entry(msg)
        expect(msg).property('Operation', 'open')
        expect(msg).property('FilePath', 'does-not-exist')
      },
      function (msg) {
        checks.exit(msg)
        expect(msg).not.property('ErrorClass')
        expect(msg).not.property('Backtrace')
        expect(msg).not.property('ErrorMsg')
      }
    ], reset)
  })

  it('should suppress stat errors when requested', function (done) {
    const previousIgnoreErrors = ao.probes.fs.ignoreErrors
    ao.probes.fs.ignoreErrors = { stat: { ENOENT: true } }
    function reset (err) {
      ao.probes.fs.ignoreErrors = previousIgnoreErrors
      done(err)
    }
    helper.test(emitter, function (done) {
      fs.stat('does-not-exist', 'r', function (err) {
        done()
      })
    }, [
      function (msg) {
        checks.entry(msg)
        expect(msg).property('Operation', 'stat')
        expect(msg).property('FilePath', 'does-not-exist')
      },
      function (msg) {
        checks.exit(msg)
        expect(msg).not.property('ErrorClass')
        expect(msg).not.property('Backtrace')
        expect(msg).not.property('ErrorMsg')
      }
    ], reset)
  })
})
