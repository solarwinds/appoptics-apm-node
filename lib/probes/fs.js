'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const conf = ao.fs

module.exports = function (fs) {
  patchFdMethods(fs)
  patchPathMethods(fs)
  patchLinkMethods(fs)
  return fs
}

function fdOf (layer, name) {
  const e = layer.events[name]
  return e && e.FileDescriptor
}

function fdLayer (method, fd) {
  return last => {
    const data = {
      Spec: 'filesystem',
      Operation: method,
      FileDescriptor: fd
    }

    if (fdOf(last, 'entry') === fd || fdOf(last, 'exit') === fd) {
      data.FilePath = last.events.entry.FilePath
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
        fdLayer(method, args[0]),
        cb => fn.apply(this, args.concat(cb)),
        conf,
        cb
      )
    })
  }

  const syncMethod = method + 'Sync'
  if (typeof fs[syncMethod] === 'function') {
    shimmer.wrap(fs, syncMethod, fn => function (...args) {
      return ao.instrument(
        fdLayer(syncMethod, args[0]),
        () => fn.apply(this, args),
        conf
      )
    })
  }
}

// path
function patchPathMethods (fs) {
  const methods = [
    'truncate',
    'chown',
    'lchown',
    'chmod',
    'lchmod',
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
    shimmer.wrap(fs, method, fn => function (...args) {
      const cb = args.pop()
      let layer
      return ao.instrument(
        last => (layer = last.descend('fs', {
          Spec: 'filesystem',
          Operation: method,
          FilePath: args[0]
        })),
        cb => fn.apply(this, args.concat(function (err, fd) {
          if (layer && method === 'open') {
            layer.events.exit.FileDescriptor = fd
          }
          return cb.apply(this, arguments)
        })),
        conf,
        cb
      )
    })
  }

  const syncMethod = method + 'Sync'
  if (typeof fs[syncMethod] === 'function') {
    shimmer.wrap(fs, syncMethod, fn => function (...args) {
      let layer
      return ao.instrument(
        last => (layer = last.descend('fs', {
          Spec: 'filesystem',
          Operation: syncMethod,
          FilePath: args[0]
        })),
        () => {
          const ret = fn.apply(this, args)
          if (layer && method === 'open') {
            layer.events.exit.FileDescriptor = ret
          }
          return ret
        },
        conf
      )
    })
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
  }
}
