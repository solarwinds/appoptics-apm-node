var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var semver = require('semver')
var path = require('path')
var fs = require('fs')

describe('probes.fs', function () {
  var emitter
  var mode

  //
  // Define some general message checks
  //
  var checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'fs')
      msg.should.have.property('Label', 'entry')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'fs')
      msg.should.have.property('Label', 'exit')
    }
  }

  function entry (name) {
    name = mode === 'sync' ? name + 'Sync' : name
    // If a requested op does not exist yet, create it
    if ( ! checks[name + '-entry']) {
      checks[name + '-entry'] = function (msg) {
        checks.entry(msg)
        msg.should.have.property('Operation', name)
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
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  var resolved = path.resolve('fs-output/foo.bar.link')
  var fd

  //
  // This is used to describe the inputs and behaviour of each function
  //
  var calls = [
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
      args: ['fs-output/foo.bar']
    },
    // fs.access
    {
      type: 'path',
      name: 'access',
      args: ['fs-output/foo.bar'],
      exclude: function () {
        return typeof fs['access' + (mode === 'sync' ? 'Sync' : '')] !== 'function'
      }
    },
    // fs.writeFile
    {
      type: 'path',
      name: 'writeFile',
      args: ['fs-output/foo.bar', 'some data'],
      subs: function () {
        return [span('open'), span('write'), span('close')]
      }
    },
    // fs.readFile
    {
      type: 'path',
      name: 'readFile',
      args: ['fs-output/foo.bar'],
      subs: function () {
        if (semver.satisfies(process.versions.node, '>1.0.0') && mode !== 'sync') {
          return []
        }
        return [span('open'), span('fstat'), span('read'), span('close')]
      }
    },
    // fs.truncate
    {
      type: 'path',
      name: 'truncate',
      args: ['fs-output/foo.bar', 0],
      subs: function () {
        if (mode === 'sync') {
          return [span('open'), span('ftruncate'), span('close')]
        }
        return [span('open')]
      }
    },
    // fs.appendFile
    {
      type: 'path',
      name: 'appendFile',
      args: ['fs-output/foo.bar', 'some data'],
      subs: function () {
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
      args: ['fs-output/foo.bar', 0777]
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
        // Wait...what?
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
        // Wait...what?
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
      // realpath walks up every level of the path and does an lstat at each
      subs: function () {
        return resolved.split('/').slice(1).map(function () {
          return span('lstat')
        })
      }
    },
    // fs.lstat
    {
      type: 'path',
      name: 'lstat',
      args: ['fs-output/foo.bar.link']
    },
    // fs.lchown
    {
      type: 'path',
      name: 'lchown',
      args: ['fs-output/foo.bar.link', process.getuid(), process.getgid()]
    },
    // fs.lchmod
    {
      type: 'path',
      name: 'lchmod',
      args: ['fs-output/foo.bar.link', 0777]
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
      args: function () { return [fd, 0777] }
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
        var buf = new Buffer('some data')
        return [fd, buf, 0, 'some data'.length, 0]
      }
      // args: function () { return [fd, 'some data'] }
    },
    // fs.read
    {
      type: 'fd',
      name: 'read',
      args: function () {
        var buf = new Buffer('some data'.length)
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

  describe('async', function () {

    calls.forEach(function (call) {
      if (result(call.exclude)) return

      it('should support ' + call.name, function (done) {
        var args = result(call.args)
        emitter.log = call.log

        // First step is to expect the message for the operation we are making
        var steps = [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Operation', call.name)
            switch (call.type) {
              case 'path':
                msg.should.have.property('FilePath', args[0])
                break
              case 'fd':
                msg.should.have.property('FileDescriptor', args[0])
                break
            }
          }
        ]

        // Include checks for all expected sub-layers
        function add (step) {
          steps.push(step)
        }

        var subs = result(call.subs)
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

        helper.httpTest(emitter, function (done) {
          // Make call and pass callback args to after handler, if present
          fs[call.name].apply(fs, args.concat(function () {
            if (call.after) call.after.apply(this, arguments)
            done()
          }))
        }, steps, function (e) {
          emitter.log = false
          done(e)
        })
      })
    })

  })

  describe('sync', function () {

    // Turn on sync mode to adjust the call list values
    before(function () {
      mode = 'sync'
    })

    calls.forEach(function (call) {
      if (result(call.exclude)) return

      var name = call.name + 'Sync'

      it('should support ' + name, function (done) {
        var args = result(call.args)
        emitter.log = call.log

        // First step is to expect the message for the operation we are making
        var steps = [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Operation', name)
            switch (call.type) {
              case 'path':
                msg.should.have.property('FilePath', args[0])
                break
            }
          }
        ]

        // Include checks for all expected sub-layers
        function add (step) {
          steps.push(step)
        }

        var subs = result(call.subs)
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

        helper.httpTest(emitter, function (done) {
          // Make call and pass result or error to after handler, if present
          try {
            var res = fs[name].apply(fs, args)
            if (call.after) call.after(null, res)
          } catch (e) {
            if (call.after) call.after(e)
          }
          process.nextTick(done)
        }, steps, function (e) {
          emitter.log = false
          done(e)
        })
      })
    })

  })

  it('should fail sync calls gracefully', function (done) {
    helper.httpTest(emitter, function (done) {
      try { fs.openSync('does-not-exist', 'r') }
      catch (e) {}
      process.nextTick(done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Operation', 'openSync')
        msg.should.have.property('FilePath', 'does-not-exist')
      },
      function (msg) {
        checks.exit(msg)
        msg.should.have.property('ErrorClass', 'Error')
        msg.should.have.property('Backtrace')
        msg.should.have.property('ErrorMsg')
          .and.startWith('ENOENT')
      }
    ], done)
  })

})
