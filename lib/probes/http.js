var debug = require('debug')('node-oboe:probes:http')
var addon = require('..')
var os = require('os')

module.exports = function (module) {
  module.createServer = (function (createServer) {
    return function (fn) {
      return createServer(function (req, res) {
        var data = {
          'Layer': 'http',
          'Label': 'entry',
          'HTTP-Host': os.hostname(),
          'Method': req.method,
          'URL': req.url,
          'Proto': 'http'
        }

        var enter = addon.Context.createEvent()
        Object.keys(data).forEach(function (key) {
          enter.addInfo(key, data[key])
        })

        addon.reporter.sendReport(enter)
        console.log('sent http start', Date.now())

        res.on('finish', function () {
          data.Label = 'exit'
          var exit = addon.Context.createEvent()
          Object.keys(data).forEach(function (key) {
            exit.addInfo(key, data[key])
          })
          exit.addEdge(enter)

          addon.reporter.sendReport(exit)
          console.log('sent http finish', Date.now())
        })

        // Run the real request handler
        fn(req, res)
      })
    }
  })(module.createServer)

  return module
}
