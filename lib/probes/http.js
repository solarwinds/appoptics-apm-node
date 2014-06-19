var debug = require('debug')('node-oboe:probes:http')
var oboe = require('..')
var os = require('os')

module.exports = function (module) {
  var realEmit = module.Server.prototype.emit
  var realWrite = module.ServerResponse.prototype.write
  var realEnd = module.ServerResponse.prototype.end

  // Intercept 'request' event to trigger http entry
  module.Server.prototype.emit = function (type, req, res) {
    if (type !== 'request') {
      return realEmit.apply(this, arguments)
    }

    if (req.headers['x-trace']) {
      oboe.setContext(req.headers['x-trace'])
    }

    // Sync mode
    // oboe.trace('http', function (entry, exit) {
    //   var entryEvent = entry({
    //     'Layer': 'http',
    //     'Label': 'entry',
    //     'HTTP-Host': os.hostname(),
    //     'Method': req.method,
    //     'URL': req.url,
    //     'Proto': 'http'
    //   })
    //   entryEvent.send()
    //
    //   if (oboe.traceMode !== 'always') {
    //     // Pass through the meta header
    //     var meta = req.headers['x-tv-meta']
    //     if (meta) {
    //       entryEvent.addInfo('X-TV-Meta', meta)
    //     }
    //   } else {
    //     entryEvent.addInfo('SampleRate', oboe.sampleRate)
    //   }
    //
    //   res.exitFn = exit
    // })

    // Async mode
    oboe.asyncTrace('http', function (entry, callbackEntry, callbackExit, exit) {
      var entryEvent = entry({
        'Layer': 'http',
        'Label': 'entry',
        'HTTP-Host': os.hostname(),
        'Method': req.method,
        'URL': req.url,
        'Proto': 'http'
      })
      entryEvent.send()

      if (oboe.traceMode !== 'always') {
        // Pass through the meta header
        var meta = req.headers['x-tv-meta']
        if (meta) {
          entryEvent.addInfo('X-TV-Meta', meta)
        }
      } else {
        entryEvent.addInfo('SampleRate', oboe.sampleRate)
      }

      res._trace = {
        callbackEntry: callbackEntry,
        callbackExit: callbackExit,
        exit: exit
      }
    })

    return realEmit.apply(this, arguments)
  }

  // Intercept first write to trigger exit and set X-Trace header
  function sendExit (res) {
    // Sync mode
    // var exitEvent = res.exitFn()
    // exitEvent.send()

    // Async mode
    var events = res._trace

    var callbackEntryEvent = events.callbackEntry()
    callbackEntryEvent.send()

    // Create exit event
    var callbackExitEvent = events.callbackExit()
    var exitEvent = events.exit()
    res.on('finish', function () {
      callbackExitEvent.send()
      exitEvent.send()
    })

    // Write exit header
    res.setHeader('X-Trace', exitEvent.toString())

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
