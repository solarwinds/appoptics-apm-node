/**
 * @class traceview
 */

// Graceful failure
var bindings
var enabled = false
try {
  bindings = require('traceview-bindings')
  enabled = true
} catch (e) {
  console.warn("Could not find liboboe native bindings\n\n" + e.stack)
}

exports.addon = bindings

//
// Load dependencies
//
var debug = require('debug')
var log = debug('traceview:settings')
var cls = require('continuation-local-storage')
var extend = require('util')._extend
var crypto = require('crypto')
var path = require('path')
var os = require('os')
var fs = require('fs')


//
// Create a reporter
//
var reporter
try {
  reporter = exports.reporter = new bindings.UdpReporter()
} catch (e) {
  reporter = exports.reporter = {}
  log('Reporter unable to connect')
}


//
// Abstract settings with setters and getters
//
var traceMode, sampleRate, sampleSource, host, port, accessKey

/**
 * Set accessKey, which also sets rumId
 *
 * @property accessKey
 * @type String
 */
Object.defineProperty(exports, 'accessKey', {
  get: function () { return accessKey },
  set: function (value) {
    accessKey = value

    // Generate base64-encoded SHA1 hash of accessKey
    exports.rumId = crypto.createHash('sha1')
      .update('RUM' + value)
      .digest('base64')
      .replace(/\+/g,'-')
      .replace(/\//g,'_')
  }
})

// Helper to map strings to addon keys
var modeMap = {
  through: bindings ? bindings.TRACE_THROUGH : 2,
  always: bindings ? bindings.TRACE_ALWAYS : 1,
  never: bindings ? bindings.TRACE_NEVER : 0
}

/**
 * Tracing mode
 *
 * @property traceMode
 * @type String
 * @default 'through'
 */
Object.defineProperty(exports, 'traceMode', {
  get: function () { return traceMode },
  set: function (value) {
    if (typeof value !== 'number') {
      value = modeMap[value]
    }
    log('set tracing mode to ' + value)
    if (enabled) {
      bindings.Context.setTracingMode(value)
    }
    traceMode = value
  }
})

/**
 * Sample rate
 *
 * @property sampleRate
 * @type Number
 */
Object.defineProperty(exports, 'sampleRate', {
  get: function () { return sampleRate },
  set: function (value) {
    log('set sample rate to ' + value)
    if (enabled) {
      bindings.Context.setDefaultSampleRate(value)
    }
    sampleRate = value
  }
})

/*!
 * Sample source
 *
 * @property sampleSource
 * @type Number
 */
Object.defineProperty(exports, 'sampleSource', {
  get: function () { return sampleSource },
  set: function (value) {
    sampleSource = value
  }
})

/**
 * Reporter host
 *
 * @property host
 * @type String
 */
Object.defineProperty(exports, 'host', {
  get: function () { return reporter.host },
  set: function (value) {
    if (value !== host) {
      try {
        reporter.host = value
      } catch (e) {
        log('Reporter unable to connect')
      }
    }
  }
})

/**
 * Reporter port
 *
 * @property port
 * @type Number | String
 */
Object.defineProperty(exports, 'port', {
  get: function () { return reporter.port },
  set: function (value) {
    if (value !== port) {
      try {
        reporter.port = value
      } catch (e) {
        log('Reporter unable to connect')
      }
    }
  }
})

/**
 * Log settings
 *
 * @property log
 * @type String
 */
var log
Object.defineProperty(exports, 'log', {
  get: function () { return log },
  set: function (value) {
    if (value !== log) {
      log = value
      
      if (typeof value === 'string') {
        value = value.split(',')
      }
      if (Array.isArray(value)) {
        var keys = value.map(function (pattern) {
          return 'traceview:' + pattern
        }).join(',')

        var flag = process.env.DEBUG
        if (flag) {
          keys = flag + ',' + keys
        }

        debug.enable(keys)
      }
    }
  }
})

// Sugar to detect if the current mode is of a particular type
Object.keys(modeMap).forEach(function (mode) {
  Object.defineProperty(exports, mode, {
    get: function () { return traceMode === modeMap[mode] }
  })
})


//
// Load config file, if present
//
var config
try {
  config = require(process.cwd() + '/traceview')
  extend(exports, config)
} catch (e) {
  config = {}
}

// Mix module-specific configs onto the object
var moduleConfigs = require('./defaults')
Object.keys(moduleConfigs).forEach(function (mod) {
  exports[mod] = moduleConfigs[mod]
  extend(exports[mod], config[mod] || {})
})

//
// Disable module when conflicts are found
//
if ( ! exports.ignoreConflicts) {
  var modules = Object.keys(require.cache)
  var possibleConflicts = [
    'newrelic',
    'strong-agent',
    'appdynamics'
  ]
  var conflicts = possibleConflicts.filter(function (conflict) {
    return modules.filter(function (mod) {
      return (new RegExp('/node_modules/' + conflict + '/')).test(mod)
    }).length > 0
  })

  function andList (list) {
    var last = list.pop()
    return (list.length ? list.join(', ') + ', and ' : '') + last
  }

  if (conflicts.length > 0) {
    enabled = false
    console.log([
      'Users have reported that the following modules conflict with TraceView',
      'instrumentation: ' + andList(conflicts) + '.',
      'Please uninstall them and restart the application.'
    ].join(' '))
  }
}

//
// If accessKey was not defined in the config file, attempt to locate it
//
if ( ! accessKey) {
  var cuuid = process.env.TRACEVIEW_CUUID
  if (cuuid) {
    exports.accessKey = cuuid
  } else {
    // Attempt to find access_key in tracelyzer configs
    var configFile = '/etc/tracelytics.conf'
    if (fs.existsSync(configFile)) {
      var contents = fs.readFileSync(configFile)
      var lines = contents.toString().split('\n')

      // Check each line until we find a match
      var line
      while ((line = lines.shift())) {
        if (/^tracelyzer.access_key=/.test(line) || /^access_key/.test(line)) {
          var parts = line.split('=')
          exports.accessKey = parts[1].trim()
          break
        }
      }
    }
  }
}

//
// Use continuation-local-storage to follow traces through a request
//
Object.defineProperty(exports, 'requestStore', {
  get: function () {
    return (
      cls.getNamespace('tv-request-store')
      || cls.createNamespace('tv-request-store')
    )
  }
})

/**
 * Whether or not the current code path is being traced
 *
 * @property tracing
 * @type Boolean
 * @readOnly
 */
Object.defineProperty(exports, 'tracing', {
  get: function () { return !!Event.last }
})

/**
 * Generate a backtrace string
 *
 * @method backtrace
 */
exports.backtrace = function ()  {
  var e = new Error('backtrace')
  return e.stack.replace(/^.*\n\s*/, '').replace(/\n\s*/g, '\n')
}

//
// The remaining things require bindings to be present.
// TODO: Make Layer, Profile and Event exportable without liboboe
//
if ( ! enabled) {
  exports.reportError = noop
  exports.reportInfo = noop
  exports.sample = function () { return false }
  exports.instrument = function (build, run, options, callback) {
    if (typeof options === 'function') {
      callback = options
    }
    run(callback)
  }

  return
}

/*!
 * Determine if the request should be sampled
 *
 * @method sample
 * @param {String} layer  Layer name
 * @param {String} xtrace x-trace header to continuing from, or null
 * @param {String} meta   x-tv-meta header, if available
 */
exports.sample = function (layer, xtrace, meta) {
  var rv = bindings.Context.sampleRequest(layer, xtrace || '', meta || '')
  if ( ! rv[0] && exports.skipSample) return [1,1,1]
  if ( ! rv[0]) return false
  exports.sampleSource = rv[1]
  exports.sampleRate = rv[2]
  return rv
}


/**
 * Apply custom instrumentation to a function.
 *
 * The `builder` function is run only when tracing, and is used to generate
 * a layer. It can include custom data, but it can not be nested and all values
 * must be strings or numbers.
 *
 * The `runner` function runs the function which you wish to instrument. Rather
 * than giving it a callback directly, you give the done argument. This tells
 * traceview when your instrumented code is done running.
 *
 * The `callback` function is simply the callback you normally would have given
 * directly to the code you want to instrument. It receives the same arguments
 * as were received by the `done` callback for the `runner` function, and the
 * same `this` context is also applied to it.
 *
 *     function builder (last) {
 *       return last.descend('custom', { Foo: 'bar' })
 *     }
 *
 *     function runner (done) {
 *       fs.readFile('some-file', done)
 *     }
 *
 *     function callback (err, data) {
 *       console.log('file contents are: ' + data)
 *     }
 *
 *     tv.instrument(builder, runner, callback)
 *
 * @method instrument
 * @param {String} build                        Layer name or builder function
 * @param {String} run                          Code to instrument and run
 * @param {Object} [options]                    Options
 * @param {Object} [options.enabled]            Enable tracing, on by default
 * @param {Object} [options.collectBacktraces]  Enable tracing, on by default
 * @param {Object} callback                     Callback
 */
exports.instrument = function (build, run, options, callback) {
  if (typeof options !== 'object') {
    callback = options
    options = { enabled: true }
  }

  if ( ! callback && run.length) {
    callback = noop
  }

  // If not tracing, skip
  var last = Layer.last
  if ( ! last) {
    return run(callback)
  }

  // If not enabled, skip
  if ( ! options.enabled) {
    if (callback) {
      callback = exports.requestStore.bind(callback)
    }
    return run(callback)
  }

  // Prepare builder function
  var builder = typeof build === 'function' ? build : function (last) {
    return last.descend(build)
  }

  // Build layer
  var layer = builder(last)

  // Attach backtrace, if enabled
  if (options.collectBacktraces) {
    layer.events.entry.Backtrace = exports.backtrace(4)
  }

  // Detect if sync or async, and run layer appropriately
  return layer.run(callback ? function (wrap) {
    return run(wrap(callback))
  } : function () {
    return run()
  })
}

function noop () {}


/**
 * Report an error event in the current trace.
 *
 * @method reportError
 * @param {Error} error The error instance to report
 */
exports.reportError = function (error) {
  var last = Layer.last
  if (last) last.error(error)
}


/**
 * Report an info event in the current trace.
 *
 * @method reportInfo
 * @param {Object} data Data to report in the info event
 */
exports.reportInfo = function (data) {
  var last = Layer.last
  if (last) last.info(data)
}


//
// Expose lower-level components
//
var Layer = require('./layer')
var Event = require('./event')
var Profile = require('./profile')
exports.Profile = Profile
exports.Layer = Layer
exports.Event = Event


//
// Send __Init event
//
process.nextTick(function () {
  exports.requestStore.run(function () {
    var data = {
      '__Init': 1,
      'Layer': 'nodejs',
      'Label': 'entry',
      'Node.Version': process.versions.node,
      'Node.V8.Version': process.versions.v8,
      'Node.LibUV.Version': process.versions.uv,
      'Node.OpenSSL.Version': process.versions.openssl,
      'Node.Ares.Version': process.versions.ares,
      'Node.ZLib.Version': process.versions.zlib,
      'Node.HTTPParser.Version': process.versions.http_parser,
      'Node.Oboe.Version': require('../package.json').version,
    }

    var base = path.join(process.cwd(), 'node_modules')
    var modules
    try { modules = fs.readdirSync(base) }
    catch (e) {}

    if (Array.isArray(modules)) {
      modules.forEach(function (mod) {
        if (mod === '.bin' || mod[0] === '@') return
        try {
          var pkg = require(base + '/' + mod + '/package.json')
          data['Node.Module.' + pkg.name + '.Version'] = pkg.version
        } catch (e) {}
      })
    }

    var layer = new Layer('nodejs', null, data)
    layer.enter()
    layer.exit()
  })
})


//
// Enable require monkey-patcher
//
var patcher = require('./require-patch')
patcher.enable()
