'use strict'
/**
 * @class appoptics:
 */

// read the config file first so that if it disables appoptics then
// the bindings are not loaded.
const path = require('path')
const log = require('./loggers')
const env = process.env

const defaultUserConfigFile = path.join(process.cwd(), 'appoptics-apm')
let userConfigFile = defaultUserConfigFile
if (env.APPOPTICS_CONFIG_FILE) {
  userConfigFile = path.relative(process.cwd(), env.APPOPTICS_APM_CONFIG_NODE)
}

const configDefaults = {
  enabled: true,
  hostnameAlias: undefined,
  traceMode: undefined,
  sampleRate: undefined,
  serviceKey: undefined,
  ignoreConflicts: false,
}

const debug = require('debug')

/**
 * Log settings - load early so they work for possible errors.
 *
 * @property log
 * @type String
 */
let logLevel = []
if (env.DEBUG) {
  logLevel = env.DEBUG.split(',').filter(p => p.startsWith('appoptics:'))
    .map(p => p.slice('appoptics:'.length))
}

Object.defineProperty(exports, 'logLevel', {
  get () {return logLevel.join(',')},
  set (value) {
    if (typeof value === 'string') {
      value = value.split(',')
    }
    if (Array.isArray(value)) {
      // find any DEBUG settings that aren't appoptics.
      let notao = []
      if (env.DEBUG) {
        notao = env.DEBUG.split(',').filter(p => !p.startsWith('appoptics:'))
      }
      logLevel = value
      debug.enable(logLevel.map(p => 'appoptics:' + p).concat(notao).join(','))
    }
  }
})

//
// add log levels. log levels are specified WITHOUT the 'appoptics:'
// prefix that is used in the environment variable. that is added
// automatically.
//
exports.logLevelAdd = function (levels) {
  if (typeof levels !== 'string') {
    log.warn('logLevelAdd argument not a string: %s', typeof levels)
    return
  }
  exports.logLevel += ',' + levels
}

//
// like logLevelAdd but removes levels
//
exports.logLevelRemove = function (levels) {
  if (typeof levels !== 'string') {
    log.warn('logLevelRemove argument not a string: %s', typeof levels)
    return
  }
  levels = levels.split(',').map(l => 'appoptics:' + l)
  const after = env.DEBUG.split(',')
    .filter(p => !p.startsWith('appoptics:') || !~levels.indexOf(p))
    .map(p => p.slice('appoptics:'.length))
  exports.logLevel = after
}

// if appoptics is not specified in DEBUG then default. if it is
// specified then override the default.
if (!('DEBUG' in env) || !~env.DEBUG.indexOf('appoptics:')) {
  exports.logLevel = 'error,warn'
}

//
// read the user configuation file if it exists.
//
let config
try {
  config = require(userConfigFile)
} catch (e) {
  config = {}
  // if not found only log an error if it is a user specified file, not
  // the default
  if (e.code !== 'MODULE_NOT_FOUND' || userConfigFile !== defaultUserConfigFile) {
    log.error('Cannot read config file %s', userConfigFile)
  }
}
exports.cfg = {}

// only consider valid keys
for (const key of Object.keys(configDefaults)) {
  exports.cfg[key] = key in config ? config[key] : configDefaults[key]
}

// do the probes manually so configDefaults doesn't need to duplicate
// every probe from ./defaults.
exports.cfg.probes = config.probes

// TODO BAM consider warning if unused keys?
// replace what was read from the file with the valid configuration keys
config = exports.cfg
if (!config.probes) {
  config.probes = {}
}

exports.probes = {}

// Mix  probe-specific configs with defaults.
const probeDefaults = require('./defaults')
Object.keys(probeDefaults.probes).forEach(mod => {
  exports.probes[mod] = probeDefaults.probes[mod]
  Object.assign(exports.probes[mod], config.probes[mod] || {})
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
    log.error([
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
let serviceKey = env.APPOPTICS_SERVICE_KEY || config.serviceKey
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

if (config.traceMode !== undefined && !(config.traceMode in modeMap)) {
  enabled = false
  log.error('disabling AppOptics-APM: invalid traceMode: %s', config.traceMode)
}


if (enabled) {
  try {
    bindings = require('appoptics-bindings')
  } catch (e) {
    log.error('Can\'t load appoptics-bindings, disabling AppOptics\n\n', e.stack)
    enabled = false
  }
}

exports.addon = bindings

//
// Load dependencies
//
const cls = require('continuation-local-storage')
const WeakMap = require('es6-weak-map')
const shimmer = require('shimmer')
const fs = require('fs')
exports.version = require('../package.json').version


if (!serviceKey) {
  log.error('No serviceKey present, disabling AppOptics')
}


// Eagerly create variables to store classes.
// ES6 does not hoist let statements.
let Event
let Span
let Profile

const ao = exports

ao.noop = function () {}
//
// Create a reporter
//
try {
  exports.reporter = new bindings.Reporter()
} catch (e) {
  const zoreReporter = function () {return 0}     // zero or error
  const torfReporter = function () {return true}  // true or false
  // supply functions in case they are called
  exports.reporter = {
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
    log.settings('set traceMode to ' + value)
    value = modeMap[value]
    if (enabled) {
      bindings.Context.setTracingMode(value)
    }
    sampleMode = value
  }
})

// make it consistent with other agents.
Object.defineProperty(exports, 'traceMode', {
  get () {return exports.sampleMode},
  set (value) {exports.sampleMode = value}
})

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
      const rateUsed = bindings.Context.setDefaultSampleRate(value)
      if (rateUsed !== value && value !== -1) {
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
exports.debugLogging = function (setting) {
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
// TODO: Make Span, Profile and Event exportable without liboboe
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
  //
  // initialize liboboe
  //
  const options = {}
  if (exports.cfg.hostnameAlias) {
    options.hostnameAlias = exports.cfg.hostnameAlias
  }
  bindings.oboeInit(serviceKey, options)

  /*!
   * Determine if the request should be sampled. Store the source
   * and rate.
   *
   * @method sample
   * @param {String} span  Span name
   * @param {String} xtrace x-trace header continuing from, or null
   */
  exports.sample = function (span, xtrace) {
    const r = bindings.Context.sampleTrace(span, xtrace || '')
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

    throw new Error('Sampling called with ' + item)
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
   * @param {String} build                        Span name or builder function
   * @param {String} run                          Code to instrument and run
   * @param {Object} [options]                    Options
   * @param {Object} [options.enabled]            Enable tracing, on by default
   * @param {Object} [options.collectBacktraces]  Enable tracing, on by default
   * @param {HTTPResponse} response               HTTP Response to patch
   */
  exports.instrumentHttp = function (build, run, options, res) {
    // If not tracing, skip
    const last = Span.last
    if (!last || !options.enabled) {
      (last ? log.warn : log.info)('instrumentHttp: no last span or disabled')
      return run()
    }

    exports.patchResponse(res)

    let span
    try {
      // Build span
      span = typeof build === 'function' ? build(last) : last.descend(build)

      // Attach backtrace, if enabled
      if (options.collectBacktraces) {
        span.events.entry.Backtrace = exports.backtrace(4)
      }
    } catch (e) {
      log.error('instrumentHttp failed to build span %s', e.stack)
    }

    let ctx
    try {
      if (span && !span.descended) {
        ctx = exports.requestStore.createContext()
        exports.requestStore.enter(ctx)
      }
    } catch (e) {
      log.error('instrumentHttp failed to enter span %l', span)
    }

    if (span) {
      span.enter()
      exports.addResponseFinalizer(res, () => {
        span.exit()
        try {
          if (ctx) exports.requestStore.exit(ctx)
        } catch (e) {
          log.error('instrumentHttp failed to exit span %l', span)
        }
      })
    }

    try {
      return run.call(span)
    } catch (err) {
      if (span) span.setExitError(err)
      throw err
    }
  }


  /**
   * Apply custom instrumentation to a function.
   *
   * The `builder` function is run only when tracing, and is used to generate
   * a span. It can include custom data, but it can not be nested and all
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
   * @param {String} build                        Span name or builder function
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
    const last = Span.last
    if (!last) {
      log.force.status('ao.instrument no lastSpan')
      return run(callback)
    }

    // If not enabled, skip
    if (!options.enabled) {
      log.force.status('ao.instrument disabled by option')
      return run(exports.bind(callback))
    }

    return runInstrument(last, build, run, options, callback)
  }

  // This builds a span descending from the supplied span using the arguments
  // expected of a ao.instrument(), ao.startTrace() or ao.continueTrace() call.
  function runInstrument (last, make, run, options, callback) {
    // Verify that a builder function or span name is given
    if (!~['function', 'string'].indexOf(typeof make)) {
      log.debug('ao.runInstrument found no span name or builder')
      return run(callback)
    }

    // Build span
    let span
    try {
      span = typeof make === 'function' ? make(last) : last.descend(make)
    } catch (e) {
      log.error('ao.runInstrument failed to build span', e.stack)
    }

    // run span
    return runSpan(span, run, options, callback)
  }

  // Set backtrace, if configured to do so, and run already constructed span
  function runSpan (span, run, options, callback) {
    if (!span) return run(callback)

    // Attach backtrace, if enabled
    if (options.collectBacktraces) {
      span.events.entry.Backtrace = exports.backtrace()
    }

    // Detect if sync or async, and run span appropriately
    return callback
      ? span.runAsync(makeWrappedRunner(run, callback))
      : span.runSync(run)
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

    // Verify that a builder function or span name is given
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
    const last = Span.last
    if (last) {
      return runInstrument(last, build, run, opts, cb)
    }

    let data
    try {
      // Build data
      data = typeof build === 'function' ? build({
        descend: spanDataMaker(Span),
        profile: spanDataMaker(Profile)
      }) : { name: build, cons: Span }
    } catch (e) {
      log.error('ao.startOrContinueTrace failed to build span', e.stack)
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

    let span
    try {
      // Now make the actual span
      span = new data.cons(data.name, xid, data.data)

      // Add sampling data to entry
      if (sample.sample && !xid) {
        span.events.entry.set({
          SampleSource: sample.source,
          SampleRate: sample.rate
        })
      }
    } catch (e) {
      log.error('ao.startOrContinueTrace failed to build span', e.stack)
    }

    return runSpan(span, run, opts, cb)
  }

  // This is a helper to map span.descend(...) and span.profile(...) calls
  // to the data provided to them, rather than producing spans or profiles
  // directly. This allows acquiring the span name before sampling, without
  // creating a span until after sampling.
  function spanDataMaker (cons) {
    return function (name, data) {
      return { name: name, data: data, cons: cons }
    }
  }

  // This makes a callback-wrapping span runner
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
    const last = Span.last
    if (last) last.error(error)
  }


  /**
   * Report an info event in the current trace.
   *
   * @method reportInfo
   * @param {Object} data Data to report in the info event
   */
  exports.reportInfo = function (data) {
    const last = Span.last
    if (last) last.info(data)
  }


  //
  // Expose lower-level components
  //
  Span = require('./span')
  Event = require('./event')
  Profile = require('./profile')
  exports.Profile = Profile
  exports.Span = Span
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

      log.info('making nodejs:single event')
      const md = bindings.Metadata.makeRandom(1)
      const e = new Event('nodejs', 'single', md)

      const status = e.sendStatus(data)
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
