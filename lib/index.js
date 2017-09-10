'use strict'
/**
 * @class traceview
 */

// Graceful failure
let bindings
let enabled = false
try {
  bindings = require('appoptics-bindings')
  enabled = true
} catch (e) {
  console.warn('Could not find liboboe native bindings\n\n', e.stack)
}

exports.addon = bindings

//
// Load dependencies
//
const debug = require('debug')
const log = debug('traceview:settings')
const error = debug('traceview:error')
const cls = require('continuation-local-storage')
const WeakMap = require('es6-weak-map')
const extend = require('util')._extend
const shimmer = require('shimmer')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')


// Eagerly create variables to store classes.
// ES6 does not hoist let statements.
let Event
let Layer
let Profile

//
// Create a reporter
//
let reporter
try {
  reporter = exports.reporter = new bindings.UdpReporter()
} catch (e) {
  reporter = exports.reporter = {}
  log('Reporter unable to connect')
}


//
// Abstract settings with setters and getters
//
let traceMode, sampleRate, sampleSource, host, port, accessKey

/**
 * Set accessKey, which also sets rumId
 *
 * @property accessKey
 * @type String
 */
Object.defineProperty(exports, 'accessKey', {
  get () { return accessKey },
  set (value) {
    accessKey = value

    // Generate base64-encoded SHA1 hash of accessKey
    exports.rumId = crypto.createHash('sha1')
      .update('RUM' + value)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  }
})

// Helper to map strings to addon keys
const modeMap = {
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
  get () { return traceMode },
  set (value) {
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
  get () { return sampleRate },
  set (value) {
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
  get () { return sampleSource },
  set (value) {
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
  get () { return reporter.host },
  set (value) {
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
  get () { return reporter.port },
  set (value) {
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
let logLevel
Object.defineProperty(exports, 'log', {
  get () { return logLevel },
  set (value) {
    if (value !== logLevel) {
      logLevel = value

      if (typeof value === 'string') {
        value = value.split(',')
      }
      if (Array.isArray(value)) {
        let keys = value.map(pattern => 'traceview:' + pattern).join(',')
        const flag = process.env.DEBUG
        if (flag) keys = flag + ',' + keys
        debug.enable(keys)
      }
    }
  }
})

// Sugar to detect if the current mode is of a particular type
Object.keys(modeMap).forEach(mode => {
  Object.defineProperty(exports, mode, {
    get () { return traceMode === modeMap[mode] }
  })
})


//
// Load config file, if present
//
let config
try {
  config = require(process.cwd() + '/traceview')
  extend(exports, config)
} catch (e) {
  config = {}
}

// Mix module-specific configs onto the object
const moduleConfigs = require('./defaults')
Object.keys(moduleConfigs).forEach(mod => {
  exports[mod] = moduleConfigs[mod]
  extend(exports[mod], config[mod] || {})
})

//
// Disable module when conflicts are found
//
if (!exports.ignoreConflicts) {
  const modules = Object.keys(require.cache)
  const possibleConflicts = [
    'newrelic',
    'strong-agent',
    'appdynamics'
  ]
  function checkMod (conflict, mod) {
    return (new RegExp(`/node_modules/${conflict}/`)).test(mod)
  }
  const conflicts = possibleConflicts.filter(conflict => {
    return modules.filter(mod => checkMod(conflict, mod)).length > 0
  })

  function andList (list) {
    const last = list.pop()
    return (list.length ? list.join(', ') + ', and ' : '') + last
  }

  if (conflicts.length > 0) {
    enabled = false
    console.log([
      'Users have reported that the following modules conflict',
      `with TraceView instrumentation: ${andList(conflicts)}.`,
      'Please uninstall them and restart the application.'
    ].join(' '))
  }
}

//
// If accessKey was not defined in the config file, attempt to locate it
// it should fail if the environment variable doesn't exist because
// the install script has not been changed to write appoptics.conf.
//
if (!accessKey) {
  const cuuid = process.env.APPOPTICS_ACCESS_KEY
  if (cuuid) {
    exports.accessKey = cuuid
  } else {
    // Attempt to find access_key in tracelyzer configs
    const configFile = '/etc/appoptics.conf'
    if (fs.existsSync(configFile)) {
      const contents = fs.readFileSync(configFile)
      const lines = contents.toString().split('\n')

      // Check each line until we find a match
      let line
      while ((line = lines.shift())) {
        if (/^tracelyzer.access_key=/.test(line) || /^access_key/.test(line)) {
          const parts = line.split('=')
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
const storeName = 'tv-request-store'
Object.defineProperty(exports, 'requestStore', {
  get () {
    return cls.getNamespace(storeName) || cls.createNamespace(storeName)
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
  get () { return !!Event.last }
})

/**
 * X-Trace ID of the last event
 *
 * @property traceId
 * @type String
 * @readOnly
 */
Object.defineProperty(exports, 'traceId', {
  get () {
    const last = Event && Event.last
    if (last) return last.toString()
  }
})

/**
 * Bind a function, if tracing
 *
 * @method bind
 * @param {Function} fn The function to bind to the trace context
 * @return {Function} The possibly bound function
 */
exports.bind = function (fn) {
  try {
    return exports.tracing && typeof fn === 'function'
      ? exports.requestStore.bind(fn)
      : fn
  } catch (e) {
    error('failed to bind callback', e.stack)
  }
}

/**
 * Bind an emitter, if tracing
 *
 * @method bindEmitter
 * @param {EventEmitter} em The emitter to bind to the trace context
 * @return {EventEmitter} The possibly bound emitter
 */
exports.bindEmitter = function (em) {
  try {
    return exports.tracing && em && typeof em.on === 'function'
      ? exports.requestStore.bindEmitter(em)
      : em
  } catch (e) {
    error('failed to bind emitter', e.stack)
  }
}

/**
 * Generate a backtrace string
 *
 * @method backtrace
 */
exports.backtrace = function ()  {
  const e = new Error('backtrace')
  return e.stack.replace(/^.*\n\s*/, '').replace(/\n\s*/g, '\n')
}

function noop () {}

//
// The remaining things require bindings to be present.
// TODO: Make Layer, Profile and Event exportable without liboboe
//
if (!enabled) {
  exports.reportError = noop
  exports.reportInfo = noop
  exports.sample = function () { return false }
  exports.instrument = function (build, run, opts, cb) {
    return run(typeof opts === 'function' ? opts : cb)
  }
  exports.startOrContinueTrace = function (xtrace, build, run, opts, cb) {
    return run(typeof opts === 'function' ? opts : cb)
  }
} else {
  /*!
   * Determine if the request should be sampled
   *
   * @method sample
   * @param {String} layer  Layer name
   * @param {String} xtrace x-trace header to continuing from, or null
   * @param {String} meta   x-tv-meta header, if available
   */
  exports.sample = function (layer, xtrace, meta) {
    const rv = bindings.Context.sampleRequest(layer, xtrace || '', meta || '')
    if (!rv[0] && exports.skipSample) return [1, 1, 1]
    if (!rv[0]) return false
    sampleSource = rv[1]
    sampleRate = rv[2]
    return rv
  }


  /*!
   * Patch an HTTP response object to trigger tv-response-end events
   *
   * @method patchResponse
   * @param {HTTPResponse} res HTTP Response object
   */
  const responseIsPatched = new WeakMap()
  exports.patchResponse = function (res) {
    if (!responseIsPatched.get(res)) {
      responseIsPatched.set(res, true)
      shimmer.wrap(res, 'end', fn => function () {
        // Find and run finalizers
        const finalizers = responseFinalizers.get(res) || []
        finalizers.reverse().forEach(finalizer => finalizer())

        // Cleanup after ourselves
        responseFinalizers.delete(res)
        responseIsPatched.delete(res)

        // Run the real end function
        return fn.apply(this, arguments)
      })
    }
  }


  /*!
   * Add a finalizer to trigger when the response ends
   *
   * @method addResponseFinalizer
   * @param {HTTPResponse} res HTTP Response to attach a finalizer to
   * @param {Function} finalizer Finalization function
   */
  const responseFinalizers = new WeakMap()
  exports.addResponseFinalizer = function (res, finalizer) {
    const finalizers = responseFinalizers.get(res)
    finalizers
      ? finalizers.push(finalizer)
      : responseFinalizers.set(res, [finalizer])
  }


  /*!
   * Instrument HTTP request/response
   *
   * @method instrumentHttp
   * @param {String} build                        Layer name or builder function
   * @param {String} run                          Code to instrument and run
   * @param {Object} [options]                    Options
   * @param {Object} [options.enabled]            Enable tracing, on by default
   * @param {Object} [options.collectBacktraces]  Enable tracing, on by default
   * @param {HTTPResponse} response               HTTP Response to patch
   */
  exports.instrumentHttp = function (build, run, options, res) {
    // If not tracing, skip
    const last = Layer.last
    if (!last || !options.enabled) return run()

    exports.patchResponse(res)

    let layer
    try {
      // Build layer
      layer = typeof build === 'function' ? build(last) : last.descend(build)

      // Attach backtrace, if enabled
      if (options.collectBacktraces) {
        layer.events.entry.Backtrace = exports.backtrace(4)
      }
    } catch (e) {}

    let ctx
    try {
      if (layer && !layer.descended) {
        ctx = exports.requestStore.createContext()
        exports.requestStore.enter(ctx)
      }
    } catch (e) {}

    if (layer) {
      layer.enter()
      exports.addResponseFinalizer(res, () => {
        layer.exit()
        try {
          if (ctx) exports.requestStore.exit(ctx)
        } catch (e) {}
      })
    }

    try {
      return run.call(layer)
    } catch (err) {
      if (layer) layer.setExitError(err)
      throw err
    }
  }


  /**
   * Apply custom instrumentation to a function.
   *
   * The `builder` function is run only when tracing, and is used to generate
   * a layer. It can include custom data, but it can not be nested and all
   * values must be strings or numbers.
   *
   * The `runner` function runs the function which you wish to instrument.
   * Rather than giving it a callback directly, you give the done argument.
   * This tells traceview when your instrumented code is done running.
   *
   * The `callback` function is simply the callback you normally would have
   * given directly to the code you want to instrument. It receives the same
   * arguments as were received by the `done` callback for the `runner`
   * function, and the same `this` context is also applied to it.
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
   * @param {Object} [callback]                   Callback, if async
   */
  exports.instrument = function (build, run, options, callback) {
    // Verify that a run function is given
    if (typeof run !== 'function') return

    // Normalize dynamic arguments
    try {
      if (typeof options !== 'object') {
        callback = options
        options = { enabled: true }
      }

      if (!callback && run.length) {
        callback = noop
      }
    } catch (e) {
      error('tv.instrument failed to normalize arguments', e.stack)
    }

    // If not tracing, skip
    const last = Layer.last
    if (!last) return run(callback)

    // If not enabled, skip
    if (!options.enabled) {
      return run(exports.bind(callback))
    }

    return runInstrument(last, build, run, options, callback)
  }

  // This builds a layer descending from the supplied layer using the arguments
  // expected of a tv.instrument(), tv.startTrace() or tv.continueTrace() call.
  function runInstrument (last, make, run, options, callback) {
    // Verify that a builder function or layer name is given
    if (!~['function', 'string'].indexOf(typeof make)) {
      return run(callback)
    }

    // Build layer
    let layer
    try {
      layer = typeof make === 'function' ? make(last) : last.descend(make)
    } catch (e) {
      error('tv.instrument failed to build layer', e.stack)
    }

    // Build and run layer
    return runLayer(layer, run, options, callback)
  }

  // Set backtrace, if configured to do so, and run already constructed layer
  function runLayer (layer, run, options, callback) {
    if (!layer) return run(callback)

    // Attach backtrace, if enabled
    if (options.collectBacktraces) {
      layer.events.entry.Backtrace = exports.backtrace()
    }

    // Detect if sync or async, and run layer appropriately
    return callback
      ? layer.runAsync(makeWrappedRunner(run, callback))
      : layer.runSync(run)
  }

  /**
   * Start or continue a trace
   *
   * @method startOrContinueTrace
   * @param {String}   xtrace                       X-Trace ID to continue from
   * @param {Mixed}    build                        Name or builder function
   * @param {String}   run                          Code to instrument and run
   * @param {Object}   [options]                    Options
   * @param {Boolean}  [options.enabled]            Enable tracing
   * @param {Boolean}  [options.collectBacktraces]  Collect backtraces
   * @param {Function} [callback]                   Callback, if async
   */
  exports.startOrContinueTrace = function (xtrace, build, run, opts, cb) {
    // Verify that a run function is given
    if (typeof run !== 'function') return

    // Verify that a builder function or layer name is given
    if (!~['function', 'string'].indexOf(typeof build)) {
      return run(cb)
    }

    try {
      if (typeof opts !== 'object') {
        cb = opts
        opts = { enabled: true }
      }

      if (!cb && run.length) {
        cb = noop
      }
    } catch (e) {
      error('tv.startOrContinueTrace failed to normalize arguments', e.stack)
    }

    // If not enabled, skip
    if (!opts.enabled) {
      return run(exports.bind(cb))
    }

    // If already tracing, continue the existing trace.
    const last = Layer.last
    if (last) {
      return runInstrument(last, build, run, opts, cb)
    }

    let data
    try {
      // Build data
      data = typeof build === 'function' ? build({
        descend: layerDataMaker(Layer),
        profile: layerDataMaker(Profile)
      }) : { name: build, cons: Layer }
    } catch (e) {
      error('tv.startOrContinueTrace failed to build layer', e.stack)
    }

    if (!data) {
      return run(cb)
    }

    // Allow destructuring of xtrace, if it is an object
    let xid = xtrace
    let meta
    if (xtrace && typeof xtrace === 'object') {
      xid = xtrace.xid
      meta = xtrace.meta
    }

    // Do sampling
    let sampled
    try {
      sampled = exports.sample(data.name, xid, meta)
    } catch (e) {
      error('tv.startOrContinueTrace failed to sample', e.stack)
    }

    if (!sampled) {
      return run(cb)
    }

    let layer
    try {
      // Now make the actual layer
      layer = new data.cons(data.name, xid, data.data)

      // Add sampling data to entry
      if (exports.always && !xid) {
        layer.events.entry.set({
          SampleSource: exports.sampleSource,
          SampleRate: exports.sampleRate
        })
      }
    } catch (e) {
      error('tv.startOrContinueTrace failed to build layer', e.stack)
    }

    return runLayer(layer, run, opts, cb)
  }

  // This is a helper to map layer.descend(...) and layer.profile(...) calls
  // to the data provided to them, rather than producing layers or profiles
  // directly. This allows acquiring the layer name before sampling, without
  // creating a layer until after sampling.
  function layerDataMaker (cons) {
    return function (name, data) {
      return { name: name, data: data, cons: cons }
    }
  }

  // This makes a callback-wrapping layer runner
  function makeWrappedRunner (run, callback) {
    return wrap => run(wrap(callback))
  }

  function noop () {}


  /**
   * Report an error event in the current trace.
   *
   * @method reportError
   * @param {Error} error The error instance to report
   */
  exports.reportError = function (error) {
    const last = Layer.last
    if (last) last.error(error)
  }


  /**
   * Report an info event in the current trace.
   *
   * @method reportInfo
   * @param {Object} data Data to report in the info event
   */
  exports.reportInfo = function (data) {
    const last = Layer.last
    if (last) last.info(data)
  }


  //
  // Expose lower-level components
  //
  Layer = require('./layer')
  Event = require('./event')
  Profile = require('./profile')
  exports.Profile = Profile
  exports.Layer = Layer
  exports.Event = Event


  //
  // Send __Init event
  //
  process.nextTick(function () {
    exports.requestStore.run(function () {
      const data = {
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

      const base = path.join(process.cwd(), 'node_modules')
      let modules
      try { modules = fs.readdirSync(base) }
      catch (e) {}

      if (Array.isArray(modules)) {
        modules.forEach(mod => {
          if (mod === '.bin' || mod[0] === '@') return
          try {
            const pkg = require(`${base}/${mod}/package.json`)
            data[`Node.Module.${pkg.name}.Version`] = pkg.version
          } catch (e) {}
        })
      }

      const layer = new Layer('nodejs', null, data)
      layer.enter()
      layer.exit()
    })
  })


  //
  // Enable require monkey-patcher
  //
  const patcher = require('./require-patch')
  patcher.enable()
}
