var debug = require('debug')('node-oboe:probes:express')
var Layer = require('../layer')
var oboe = require('..')
var os = require('os')

module.exports = function (express) {
  // return express

  express.application.handle = (function (func) {
    return function (req, res, next) {
      // var layer = res._express_layer = new Layer('express', null, {
      var last = oboe.requestStore.get('trace')
      var layer = res._express_layer = last.descend('express', null, {
        'HTTP-Host': os.hostname(),
        'Method': req.method,
        'URL': req.url,
        'Proto': 'http'
      })

      // Hack to ensure the express exit occurs before the http exit
      var listeners = res.listeners('finish')
      res.removeAllListeners('finish')
      res.on('finish', function () {
        layer.exit()
      })

      listeners.forEach(function (listener) {
        res.on('finish', listener)
      })

      layer.enter()
      func.call(this, req, res, next)

      // TODO: Decide if express should be a sync layer over routing only
      // var self = this
      // layer.run(function () {
      //   func.call(self, req, res, next)
      // })
    }
  })(express.application.handle)

  return express
}
