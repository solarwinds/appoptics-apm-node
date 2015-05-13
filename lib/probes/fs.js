var slice = require('sliced')
var shimmer = require('shimmer')
var Layer = require('../layer')
var tv = require('..')
var conf = tv.fs

// fd
var fdMethods = [
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

// path
var pathMethods = [
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

// path, dest
var linkMethods = [
  'rename',
  'symlink',
  'link',
]

// var watchMethods = [
//   'watchFile',
//   'unwatchFile',
//   'watch',
// ]

// var streamMethods = [
//   'createReadStream',
//   'createWriteStream'
// ]

module.exports = function (fs) {
  function fdOf (layer, name) {
    var e = layer.events[name]
    return e && e.FileDescriptor
  }

  function fdLayer (method, fd) {
    return function (layer) {
      var data = {
        Operation: method,
        FileDescriptor: fd
      }

      if (fdOf(layer, 'entry') === fd || fdOf(layer, 'exit') === fd) {
        data.FilePath = layer.events.entry.FilePath
      }

      return layer.descend('fs', data)
    }
  }

  fdMethods.forEach(function (method) {
    if ( ! fs[method]) return
    shimmer.wrap(fs, method, function (fn) {
      return function (fd) {
        var args = slice(arguments)
        var cb = args.pop()
        var self = this

        return tv.instrument(fdLayer(method, fd), function (cb) {
          return fn.apply(self, args.concat(cb))
        }, conf, cb)
      }
    })

    var syncMethod = method + 'Sync'
    shimmer.wrap(fs, syncMethod, function (fn) {
      return function (fd) {
        var args = arguments
        var self = this

        return tv.instrument(fdLayer(syncMethod, fd), function () {
          return fn.apply(self, args)
        }, conf)
      }
    })
  })

  pathMethods.forEach(function (method) {
    if ( ! fs[method]) return
    shimmer.wrap(fs, method, function (fn) {
      return function (path) {
        var args = slice(arguments)
        var cb = args.pop()
        var self = this

        var inner
        return tv.instrument(function (layer) {
          inner = layer.descend('fs', {
            Operation: method,
            FilePath: path
          })
          return inner
        }, function (cb) {
          return fn.apply(self, args.concat(function (err, fd) {
            if (inner && method === 'open') {
              inner.events.exit.FileDescriptor = fd
            }
            return cb.apply(this, arguments)
          }))
        }, conf, cb)
      }
    })

    var syncMethod = method + 'Sync'
    shimmer.wrap(fs, syncMethod, function (fn) {
      return function (path) {
        var args = arguments
        var self = this

        var inner
        return tv.instrument(function (layer) {
          inner = layer.descend('fs', {
            Operation: syncMethod,
            FilePath: path
          })
          return inner
        }, function () {
          var ret = fn.apply(self, args)
          if (inner && method === 'open') {
            inner.events.exit.FileDescriptor = ret
          }
          return ret
        }, conf)
      }
    })
  })

  linkMethods.forEach(function (method) {
    if ( ! fs[method]) return
    shimmer.wrap(fs, method, function (fn) {
      return function (path, dest) {
        var args = slice(arguments)
        var cb = args.pop()
        var self = this

        return tv.instrument(function (layer) {
          return layer.descend('fs', {
            Operation: method,
            FilePath: path,
            NewFilePath: dest
          })
        }, function (cb) {
          return fn.apply(self, args.concat(cb))
        }, conf, cb)
      }
    })

    var syncMethod = method + 'Sync'
    shimmer.wrap(fs, syncMethod, function (fn) {
      return function (path, dest) {
        var args = arguments
        var self = this

        return tv.instrument(function (layer) {
          return layer.descend('fs', {
            Operation: syncMethod,
            FilePath: path,
            NewFilePath: dest
          })
        }, function () {
          return fn.apply(self, args)
        }, conf)
      }
    })
  })

  return fs
}
