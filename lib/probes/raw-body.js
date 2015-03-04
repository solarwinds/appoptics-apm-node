var slice = require('sliced')
var tv = require('..')
var conf = tv['raw-body']

module.exports = function (rawBody) {
  return function (stream, options, done) {
    var args = slice(arguments)
    var layer

    function thunk (done) {
      return tv.instrument(function (last) {
        layer = last.descend('body-parser')
        return layer
      }, function (done) {
        return rawBody(stream, options, function (err, buf) {
          if (layer && buf && buf.length) {
            layer.events.exit.RequestBodyBytes = buf.length
          }
          return done.apply(this, arguments)
        })
      }, conf, function () {
        return done.apply(this, arguments)
      })
    }

    var last = args[args.length - 1]
    return typeof last === 'function' ? thunk(last) : thunk
  }
}
