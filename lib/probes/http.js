var debug = require('debug')('node-oboe:probes:http')
var addon = require('..')
var os = require('os')

module.exports = function (module) {
  var realEmit = module.Server.prototype.emit
  var realWrite = module.ServerResponse.prototype.write
  var realEnd = module.ServerResponse.prototype.end

  // Intercept 'request' event to trigger http entry
  module.Server.prototype.emit = function (type, req, res) {
    if (type === 'request') {
      addon.trace('http', function (entry, exit) {
        entry({
          'Layer': 'http',
          'Label': 'entry',
          'HTTP-Host': os.hostname(),
          'Method': req.method,
          'URL': req.url,
          'Proto': 'http'
        }, req.headers['x-trace'])

        res.exitFn = exit
      })
    }

    return realEmit.apply(this, arguments)
  }

  // Intercept first write to trigger exit and set X-Trace header
  function sendExit (res) {
    var end = res.exitFn()
    res.setHeader("X-Trace", end.toString())
    delete res.exitFn

    // Restore original methods so this only gets called once
    res.write = realWrite
    res.end = realEnd
  }

  module.ServerResponse.prototype.write = function () {
    sendExit(this)
    return realWrite.apply(this, arguments)
  }
  module.ServerResponse.prototype.end = function () {
    sendExit(this)
    return realEnd.apply(this, arguments)
  }

  return module
}
