'use strict'
/**
 * @class appoptics:
 */

// read the config file first so that if it disables appoptics then
// the bindings are not loaded.
const path = require('path')
const log = require('./loggers')

let defaultUserConfigFile = path.join(process.cwd(), 'appoptics-apm')
let userConfigFile = defaultUserConfigFile
if (process.env.APPOPTICS_CONFIG_FILE) {
  userConfigFile = path.relative(process.cwd(), process.env.APPOPTICS_CONFIG_FILE)
}

debugger

let configDefaults = {
  enabled: true,
  sampleMode: undefined,
  sampleRate: undefined,
  serviceKey: undefined,
  ignoreConflicts: false,
}

//
// read the user configuation file if it exists.
//
let config
try {
  config = require(userConfigFile)
} catch (e) {
  config = {}
  if (e.code !== 'MODULE_NOT_FOUND' || userConfigFile !== defaultUserConfigFile) {
    log.error('Cannot read config file %s', userConfigFile)
  }
}
exports.cfg = {}

// only consider valid keys
for (let key of Object.keys(configDefaults)) {
  exports.cfg[key] = key in config ? config[key] : configDefaults[key]
}
// TODO BAM consider warning if unused keys?
// replace what was read from the file with the valid configuration keys
config = exports.cfg


exports.probes = {}

// Mix  probe-specific configs with defaults.
const probeDefaults = require('./defaults')
Object.keys(probeDefaults.probes).forEach(mod => {
  exports.probes[mod] = probeDefaults.probes[mod]
  Object.assign(exports.probes[mod], config[mod] || {})
})

//
// Disable module when conflicts are found
//
if (!config.ignoreConflicts) {
  const modules = Object.keys(require.cache)
  const possibleConflicts = [
    'newrelic',
    'strong-agent',
    'appdynamics'
  ]
  function checkMod(conflict, mod) {
    return (new RegExp(`/node_modules/${conflict}/`)).test(mod)
  }
  const conflicts = possibleConflicts.filter(conflict => {
    return modules.filter(mod => checkMod(conflict, mod)).length > 0
  })

  function andList(list) {
    const last = list.pop()
    return (list.length ? list.join(', ') + ', and ' : '') + last
  }

  if (conflicts.length > 0) {
    enabled = false
    console.log([
      'Users have reported that the following modules conflict',
      `with AppOptics instrumentation: ${andList(conflicts)}.`,
      'Please uninstall them and restart the application.'
    ].join(' '))
  }
}

//
// if the service key is defined in the environment then use that. if
// not see if it is defined in the config file.
//
let serviceKey = process.env.APPOPTICS_SERVICE_KEY || config.serviceKey
exports.serviceKey = serviceKey

// map valid modes to oboe values for an easy way to validate/convert.
const modeMap = {
  0: bindings ? bindings.TRACE_NEVER : 0,
  1: bindings ? bindings.TRACE_ALWAYS : 1,
  never: bindings ? bindings.TRACE_NEVER : 0,
  always: bindings ? bindings.TRACE_ALWAYS : 1
}

//
// Try to load bindings if not disabled. Handle failure or disabled
// gracefully.
//
let bindings
let enabled = serviceKey && config.enabled

if (config.sampleMode !== undefined && !(config.sampleMode in modeMap)) {
  enabled = false
  log.error('disabling AppOptics-APM: invalid sampleMode:', config.sampleMode)
}


if (enabled) {
  try {
    bindings = require('appoptics-bindings')
  } catch (e) {
    console.warn('Could not find liboboe native bindings\n\n', e.stack)
    enabled = false
  }
}

exports.addon = bindings

//
// Load dependencies
//
const debug = require('debug')
const error = debug('appoptics:error')
const init = debug('appoptics:init-message')
const cls = require('continuation-local-storage')
const WeakMap = require('es6-weak-map')
const shimmer = require('shimmer')
const crypto = require('crypto')
const fs = require('fs')

if (!serviceKey) {
  log.error('No serviceKey present, disabling AppOptics')
}


// Eagerly create variables to store classes.
// ES6 does not hoist let statements.
let Event
let Layer
let Profile

let ao = exports

ao.noop = function () {}
//
// Create a reporter
//
let reporter
try {
  reporter = exports.reporter = new bindings.Reporter()
} catch (e) {
  var zoreReporter = function () {return 0}     // zero or error
  var torfReporter = function () {return true}  // true or false
  // supply functions in case they are called
  reporter = exports.reporter = {
    sendReport: zoreReporter,
    sendStatus: zoreReporter,
    sendHttpSpanName: torfReporter,
    sendHttpSpanUrl: torfReporter
  }
  if (enabled) {
    log.error('Reporter unable to connect')
  }
}


//
// Abstract settings with setters and getters
//
let sampleMode, sampleRate, sampleSource

/**
 * Set serviceKey, which also sets rumId
 *
 * @property serviceKey
 * @type String
 */
Object.defineProperty(exports, 'serviceKey', {
  get () { return serviceKey },
  set (value) {
    serviceKey = value

    exports.rumId = undefined
    // Generate base64-encoded SHA1 hash of serviceKey
    /*
    exports.rumId = crypto.createHash('sha1')
      .update('RUM' + value)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    // */
  }
})

/**
 * Sample mode
 *
 * @property sampleMode
 * @type String
 * @default 'always'
 */
Object.defineProperty(exports, 'sampleMode', {
  get () { return sampleMode },
  set (value) {
    if (!(value in modeMap)) {
      log.error('invalid traceMode', value)
      return
    }
    log.settings('set trace mode to ' + value)
    value = modeMap[value]
    if (enabled) {
      bindings.Context.setTracingMode(value)
    }
    sampleMode = value
  }
})

// make it consistent with other agents.
exports.traceMode = exports.sampleMode

/*!
 * Sample source
 *
 * @property sampleSource
 * @type Number
 */
Object.defineProperty(exports, 'sampleSource', {
  get () {return sampleSource},
  set (value) {sampleSource = value}
})

/**
 * Sample rate
 *
 * @property sampleRate
 * @type Number
 */
Object.defineProperty(exports, 'sampleRate', {
  get () {return sampleRate},
  set (value) {
    log.settings('set sample rate to ' + value)
    if (enabled) {
      let rateUsed = bindings.Context.setDefaultSampleRate(value)
      if (rateUsed !== value) {
        if (rateUsed === -1) {
          // value was not a valid number, don't use it
          log.warn('Invalid sample rate: %s, not changed', value)
          return;
        }
        //
        log.warn('Sample rate (%s) out of range, using %s', value, rateUsed)
      }
      sampleRate = rateUsed
    }
  }
})


/**
 * Reporter host
 *
 * @property host
 * @type String
 */
/*
Object.defineProperty(exports, 'host', {
  get () { return reporter.host },
  set (value) {
    if (value !== host) {
      try {
        reporter.host = value
      } catch (e) {
        log.settings('Reporter unable to connect')
      }
    }
  }
})
// */

/**
 * Reporter port
 *
 * @property port
 * @type Number | String
 */
/*
Object.defineProperty(exports, 'port', {
  get () { return reporter.port },
  set (value) {
    if (value !== port) {
      try {
        reporter.port = value
      } catch (e) {
        log.settings('Reporter unable to connect')
      }
    }
  }
})
// */

/**
 * Log settings
 *
 * @property log
 * @type String
 */
let logLevel
Object.defineProperty(exports, 'logLevel', {
  get () { return logLevel },
  set (value) {
    if (value !== logLevel) {
      logLevel = value

      if (typeof value === 'string') {
        value = value.split(',')
      }
      if (Array.isArray(value)) {
        let keys = value.map(pattern => 'appoptics:' + pattern).join(',')
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
    get () { return sampleMode === modeMap[mode] }
  })
})


//
// Use continuation-local-storage to follow traces through a request
//
const storeName = 'ao-request-store'
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
 * Expose debug logging global and create a function to turn
 * debug logging on/off.
 */
exports.loggers = log
exports.debugLogging = function(setting) {
  log.enabled = setting
}

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
    log.error('failed to bind callback', e.stack)
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
    log.error('failed to bind emitter', e.stack)
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
  exports.sample = function () {
    return {sample: false, source: 1, rate: 1}
  }
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
   * @param {String} xtrace x-trace header continuing from, or null
   */
  exports.sample = function (layer, xtrace) {
    const r = bindings.Context.sampleTrace(layer, xtrace || '')
    sampleSource = r.source
    sampleRate = r.rate
    return r
  }

  exports.sampling = function (item) {
    if (typeof item === 'string') {
      return item.slice(-1) === '1'
    }

    if (item instanceof Event) {
      return item.event.getSampleFlag()
    }

    if (item instanceof bindings.Metadata) {
      return item.getSampleFlag()
    }

    let type = typeof item === 'object' ? Object.getPrototypeOf(item) : item
    throw new Error("Sampling called with " + item)
  }

  exports.stringToMetadata = function (mdString) {
    // if the conversion fails undefined is returned
    return bindings.Metadata.fromString(mdString)
  }


  /*!
   * Patch an HTTP response object to trigger ao-response-end events
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
    if (!last || !options.enabled) {
      log.info('instrumentHttp: no last layer or disabled')
      return run()
    }

    exports.patchResponse(res)

    let layer
    try {
      // Build layer
      layer = typeof build === 'function' ? build(last) : last.descend(build)

      // Attach backtrace, if enabled
      if (options.collectBacktraces) {
        layer.events.entry.Backtrace = exports.backtrace(4)
      }
    } catch (e) {
      log.error(`instrumentHttp failed to build layer %s`, e.stack)
    }

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
   * This tells AppOptics when your instrumented code is done running.
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
   *     ao.instrument(builder, runner, callback)
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
      log.error('ao.instrument failed to normalize arguments', e.stack)
    }

    // If not tracing, skip
    const last = Layer.last
    if (!last) {
      log.force.status('ao.instrument no lastLayer')
      return run(callback)
    }

    // If not enabled, skip
    if (!options.enabled) {
      log.force.status('ao.instrument disabled by option')
      return run(exports.bind(callback))
    }

    return runInstrument(last, build, run, options, callback)
  }

  // This builds a layer descending from the supplied layer using the arguments
  // expected of a ao.instrument(), ao.startTrace() or ao.continueTrace() call.
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
      log.error('ao.runInstrument failed to build layer', e.stack)
    }

    // run layer
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
      log.error('ao.startOrContinueTrace failed to normalize arguments', e.stack)
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
      log.error('ao.startOrContinueTrace failed to build layer', e.stack)
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
    let sample
    try {
      sample = exports.sample(data.name, xid, meta)
    } catch (e) {
      log.error('ao.startOrContinueTrace failed to sample', e.stack)
    }

    if (!sample.sample) {
      return run(cb)
    }

    let layer
    try {
      // Now make the actual layer
      layer = new data.cons(data.name, xid, data.data)

      // Add sampling data to entry
      if (sample.sample && !xid) {
        layer.events.entry.set({
          SampleSource: sample.source,
          SampleRate: sample.rate
        })
      }
    } catch (e) {
      log.error('ao.startOrContinueTrace failed to build layer', e.stack)
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
  exports.noop = noop


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
        'Label': 'single',
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

      // TODO find out why the following code
      // doesn't work.
      // get an event for the init message
      //*
      init('making event')
      let md = bindings.Metadata.makeRandom(1)
      const e = new Event('nodejs', 'single', md)
      log.flow('sending status for event %e with context %s', e, bindings.Context.toString(1))

      let status = e.sendStatus(data)
      if (status < 0) {
        log.error(`init.sendStatus() failed (${status})`)
      } else {
        log.status('init.sendStatus() succeeded')
      }

    })
  })

  //
  // Enable require monkey-patcher
  //
  const patcher = require('./require-patch')
  patcher.enable()
}
