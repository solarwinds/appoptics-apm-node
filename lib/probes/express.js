var debug = require('debug')('node-oboe:probes:express')
var Layer = require('../layer')
var oboe = require('..')
var os = require('os')

module.exports = function (express) {
  // return express

  express.application.handle = (function (func) {
    return function (req, res, next) {
      var self = this
      function action () {
        func.call(self, req, res, next)
      }

      if ( ! oboe.tracing || ! Layer.last) {
        action()
        return
      }

      Layer.last.descend('express', {
        'HTTP-Host': os.hostname(),
        'Method': req.method,
        'URL': req.url,
        'Proto': 'http'
      }).run(action)
    }
  })(express.application.handle)

  return express
}
