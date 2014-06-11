var debug = require('debug')('node-oboe:probes:http')
var addon = require('..')
var os = require('os')

module.exports = function (module) {
  module.createServer = (function (createServer) {
    return function (fn) {
      return createServer(function (req, res) {
        addon.trace('http', function (entry, exit) {
          entry({
            'Layer': 'http',
            'Label': 'entry',
            'HTTP-Host': os.hostname(),
            'Method': req.method,
            'URL': req.url,
            'Proto': 'http'
          }, req.headers['x-trace'])

          var ended = false
          function sendExit () {
            ended = true
            exit()

            // Set X-Trace header
            res.setHeader("X-Trace", exit.toString())
          }

          // On first write to the response, send exit event
          var methods = ['write', 'end']
          methods.forEach(function (method) {
            res[method] = (function (fn) {
              return function () {
                ended || sendExit()
                return fn.apply(this, arguments)
              }
            })(res[method])
          })

          // Run the real request handler
          fn(req, res)
        })
      })
    }
  })(module.createServer)

  return module
}
