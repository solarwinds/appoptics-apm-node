'use strict'

const shimmer = require('ximmer')
const ao = require('..')
const conf = ao.probes.fs
const log = ao.loggers

module.exports = function (fs) {
  patchFdMethods(fs)
  patchPathMethods(fs)
  patchLinkMethods(fs)
  return fs
}

function fdOf (span, name) {
  const e = span.events[name]
  return e && e.FileDescriptor
}

function fdSpan (method, fd) {
  return last => {
    const data = {
      Spec: 'filesystem',
      Operation: method,
      FileDescriptor: fd
    }

    if (fdOf(last, 'entry') === fd || fdOf(last, 'exit') === fd) {
      // if there is a file path then store it. there is at least one place
      // in node/lib/internal/fs.js for SyncWriteStream.prototype._write where
      // fs.writeSync is called. SyncWriteStream is a "temporary hack for
      // process.stdout and process.stderr when piped to files", so the need
      // for this *might* go away.
      if (last.events.entry.FilePath || last.events.entry.FilePath === '') {
        data.FilePath = last.events.entry.FilePath
      }
    }

    return last.descend('fs', data)
  }
}

// fd
function patchFdMethods (fs) {
  const methods = [
    'ftruncate',
    'fchown',
    'fchmod',
    'fstat',
    'close',
    'futimes',
    'fsync',
    'write',
    'read'
  ]

  methods.forEach(method => patchFdMethod(fs, method))
}

function patchFdMethod (fs, method) {
  if (typeof fs[method] === 'function') {
    shimmer.wrap(fs, method, fn => function (...args) {
      const cb = args.pop()
      return ao.instrument(
        fdSpan(method, args[0]),
        cb => fn.apply(this, args.concat(cb)),
        conf,
        cb
      )
    })
  } else {
    log.patching('fs.%s not a function', method)
  }

  const syncMethod = method + 'Sync'
  if (typeof fs[syncMethod] === 'function') {
    shimmer.wrap(fs, syncMethod, fn => function (...args) {
      return ao.instrument(
        fdSpan(syncMethod, args[0]),
        () => fn.apply(this, args),
        conf
      )
    })
  } else {
    log.patching('fs.%s not a function', syncMethod)
  }
}

// path
function patchPathMethods (fs) {
  const methods = [
    'truncate',
    'chown',
    'chmod',
    'stat',
    'lstat',
    'readlink',
    'realpath',
    'unlink',
    'rmdir',
    'mkdir',
    'readdir',
    'open',
    'utimes',
    'readFile',
    'writeFile',
    'appendFile',
    'exists',
    'access'
  ]

  methods.forEach(method => patchPathMethod(fs, method))
}

function patchPathMethod (fs, method) {
  if (typeof fs[method] === 'function') {
    shimmer.wrap(fs, method, fn => {
      const f = function (...args) {
        const cb = args.pop()
        let span
        return ao.instrument(
          last => (span = last.descend('fs', {
            Spec: 'filesystem',
            Operation: method,
            FilePath: args[0]
          })),
          cb => fn.apply(this, args.concat(function (err, fd) {
            if (span && method === 'open') {
              span.events.exit.FileDescriptor = fd
            }
            return cb.apply(this, arguments)
          })),
          conf,
          cb
        )
      }
      if (method === 'realpath') {
        f.native = fn.native
      }
      return f
    })
  } else {
    log.patching('fs.%s not a function', method)
  }

  const syncMethod = method + 'Sync'
  if (typeof fs[syncMethod] === 'function') {
    shimmer.wrap(fs, syncMethod, fn => {
      const f = function (...args) {
        let span
        return ao.instrument(
          last => (span = last.descend('fs', {
            Spec: 'filesystem',
            Operation: syncMethod,
            FilePath: args[0]
          })),
          () => {
            const ret = fn.apply(this, args)
            if (span && method === 'open') {
              span.events.exit.FileDescriptor = ret
            }
            return ret
          },
          conf
        )
      }
      if (method === 'realpath') {
        f.native = fn.native
      }
      return f
    })
  } else {
    log.patching('fs.%s not a function', syncMethod)
  }
}

// path, dest
function patchLinkMethods (fs) {
  const methods = [ 'rename', 'symlink', 'link' ]
  methods.forEach(method => patchLinkMethod(fs, method))
}

function patchLinkMethod (fs, method) {
  if (typeof fs[method] === 'function') {
    shimmer.wrap(fs, method, fn => function (...args) {
      const cb = args.pop()
      return ao.instrument(
        last => last.descend('fs', {
          Spec: 'filesystem',
          Operation: method,
          FilePath: args[0],
          NewFilePath: args[1]
        }),
        cb => fn.apply(this, args.concat(cb)),
        conf,
        cb
      )
    })
  } else {
    log.patching('fs.%s not a function', method)
  }

  const syncMethod = method + 'Sync'
  if (typeof fs[syncMethod] === 'function') {
    shimmer.wrap(fs, syncMethod, fn => function (...args) {
      return ao.instrument(
        last => last.descend('fs', {
          Spec: 'filesystem',
          Operation: syncMethod,
          FilePath: args[0],
          NewFilePath: args[1]
        }),
        () => fn.apply(this, args),
        conf
      )
    })
  } else {
    log.patching('fs.%s not a function', syncMethod)
  }
}
