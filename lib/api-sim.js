'use strict'

let ao
let aob
let cls

module.exports = function (appoptics) {
  ao = appoptics
  aob = ao.addon
  // check for property to avoid triggering node 14 warning on
  // non-existent property in unfinished module.exports
  if (Object.prototype.hasOwnProperty.call(ao, 'cls')) {
    cls = ao.cls
  }

  // define the properties (some of which are part of the API)
  definePropertiesOn(ao)

  // make these globally available
  class Event {}
  Event.init = function () {}

  class Span {
    enter () {}
  }

  Span.init = function () {}
  Span.makeEntrySpan = function makeEntrySpan (name, settings, data) {
    // use the task id from settings or (primarily used in testing) make new.
    const traceTaskId = settings.traceTaskId || ao.addon.Event.makeRandom(settings.doSample)

    const span = new Span(name, { traceTaskId, edge: settings.edge }, data)

    // fill in entry-span-specific properties.
    span.doMetrics = settings.doMetrics
    span.topSpan = true

    return span
  }

  class Metrics {
    start () {}
    stop () {}
    resetInterval () {}
  }

  // return the API
  return {
    // core classes
    Event,
    Span,
    Metrics,

    // basic functions
    readyToSample,
    getTraceSettings,
    sampling,
    traceToEvent,

    // emitter (http) instrumentation
    patchResponse,
    addResponseFinalizer,
    instrumentHttp,

    // non-emitter instrumentation
    instrument,
    pInstrument,
    startOrContinueTrace,
    pStartOrContinueTrace,

    // miscellaneous
    reportError,
    reportInfo,
    sendMetric,
    sendMetrics,
    insertLogObject,

    // lambda
    wrapLambdaHandler
  }
}

function definePropertiesOn (ao) {
  /**
   * Get and set the trace mode
   *
   * @name ao.traceMode
   * @property {string} - the sample mode
   */
  Object.defineProperty(ao, 'traceMode', {
    get () { return ao.modeToStringMap[0] },
    set (value) {
      // ignore any attempts to set traceMode.
    }
  })

  /**
   * @ignore
   * Get and set the sample rate. The number is parts of 1,000,000
   * so 100,000 represents a 10% sample rate.
   *
   * @name ao.sampleRate
   * @property {number} - this value divided by 1000000 is the sample rate.
   */
  Object.defineProperty(ao, 'sampleRate', {
    get () { return 0 },
    set (value) {
      // ignore any attempt to set the sampleRate.
    }
  })

  /**
   * Return whether or not the current code path is being traced.
   *
   * @name ao.tracing
   * @property {boolean}
   * @readOnly
   */
  Object.defineProperty(ao, 'tracing', {
    get () { return false }
  })

  /**
   * Get X-Trace ID of the last event
   *
   * @name ao.traceId
   * @property {string} - the trace ID as a string or undefined if not tracing.
   * @readOnly
   */
  Object.defineProperty(ao, 'traceId', {
    get () { return undefined }
  })

  Object.defineProperty(ao, 'lastEvent', {
    get () { return undefined }
  })

  Object.defineProperty(ao, 'lastSpan', {
    get () { return undefined }
  })

  const maps = {}
  Object.defineProperty(ao, 'maps', {
    get () { return maps }
  })

  //
  // Use continuation-local-storage to maintain context through asynchronous
  // callback chains.
  //
  const storeName = 'ao-cls-context'

  Object.defineProperty(ao, 'requestStore', {
    get () { return cls.getNamespace(storeName) || cls.createNamespace(storeName) }
  })

  ao.resetRequestStore = function () {
    cls.destroyNamespace(storeName)
  }

  ao.clsCheck = function (msg) {
    return false
  }

  //
  // ao.stack - generate a stack trace with this call removed
  //
  // text - used as Error(text)
  // n - the depth of the stack trace to generate.
  //
  ao.stack = function (test, n) {
    return ''
  }

  /**
   * Bind a function to the CLS context if tracing.
   *
   * @method ao.bind
   * @param {function} fn - The function to bind to the context
   * @return {function} The bound function or the unmodified argument if it can't
   *   be bound.
   */
  ao.bind = function (fn) {
    return fn
  }
  /**
   * Bind an emitter if tracing
   *
   * @method ao.bindEmitter
   * @param {EventEmitter} em The emitter to bind to the trace context
   * @return {EventEmitter} The bound emitter or the original emitter if an error.
   */
  ao.bindEmitter = function (em) {
    return em
  }

  /**
   * Generate a backtrace string
   *
   * @method ao.backtrace
   * @returns {string} the backtrace
   */
  ao.backtrace = function () {
    const e = new Error('backtrace')
    return e.stack.replace(/[^\n]*\n\s+/, '').replace(/\n\s*/g, '\n')
  }

  /**
   * Set a custom transaction name function for a specific probe. This is
   * most commonly used when setting custom names for all or most routes.
   *
   * @method ao.setCustomTxNameFunction
   * @param {string} probe - The probe to set the function for
   * @param {function} fn - A function that returns a string custom name or a
   *                        falsey value indicating the default should be used.
   *                        Pass a falsey value for the function to clear.
   * @returns {boolean} true if successfully set else false
   *
   * @example
   * // custom transaction function signatures for supported probes:
   * express: customFunction (req, res)
   * hapi/hapi: customFunction (request)
   */
  ao.setCustomTxNameFunction = function (probe, fn) {
    return false
  }
}

//= ===================================================================================
// none of the following can be invoked before the initialization function is called
// and sets ao.
//= ===================================================================================

/**
 * Check whether the appoptics agent is ready to sample. It will wait up to
 * the specified number of milliseconds before returning.
 * @method ao.readyToSample
 * @param {Number} ms - milliseconds to wait; default 0 means don't wait (poll).
 * @param {Object} [obj] - if present obj.status will receive low level status
 * @returns {boolean} - true if ready to sample; false if not
 */
/**
 * @ignore
 * UNKNOWN 0
 * OK 1
 * TRY_LATER 2
 * LIMIT_EXCEEDED 3
 * unused (was INVALID_API_KEY) 4
 * CONNECT_ERROR 5
 */
function readyToSample (ms, obj) {
  const status = aob.isReadyToSample(ms)
  // if the caller wants the actual status provide it
  if (obj && typeof obj === 'object') {
    obj.status = status
  }

  return status === 1
}

/**
 * @typedef {object} TraceSettings
 * @property {boolean} doSample - the sample decision
 * @property {boolean} doMetrics - the metrics decision
 * @property {Event} traceTaskId - an Event containing the task id to use
 * @property {boolean} edge - edge back to previous event if truthy
 * @property {number} source - the sample decision source
 * @property {number} rate - the sample rate used
 */

/**
 * @ignore
 * @method ao.getTraceSettings
 * @param {string} traceparent
 * @param {string} tracestate
 * @param {number} [options={}]
 * @returns {TraceSettings} settings
 */
function getTraceSettings (traceparent, tracestate, options) {
  // note: with liboboe 10.3.0 the api has changed to work with a traceparnet/tracestate duo insted of xtrace.
  // liboobe still uses the term xtrace in keys (and thus so do the bindings) even though
  // the format is now that of traceparnet (dash delimited).
  // put traceparent value into xtrace key
  const osettings = aob.Settings.getTraceSettings({ xtrace: traceparent, tracestate })
  // compatibility to avoid a synchronized bindings release
  if (!osettings.traceTaskId) {
    osettings.traceTaskId = osettings.metadata
  }
  return osettings
}

/**
 * Determine if the sample flag is set for the various forms of
 * x-trace ids.
 *
 * @method ao.sampling
 * @param {string|Event} item - the item to get the sampling flag of
 * @returns {boolean} - true if the sample flag is set else false.
 */

function sampling (item) {
  return false
}

/**
 * Convert an traceparent ID to an event containing the task ID and op ID.
 *
 * @method ao.traceToEvent
 * @param {string} traceparent - traceparent ID
 * @return {addon.Event|undefined} - addon.Event object
 *                                      containing an internal
 *                                      format of the traceparent
 *                                      if valid or undefined
 *                                      if not.
 */
function traceToEvent (traceparent) {
  return aob.Event.makeFromString(traceparent)
}

function patchResponse () {}
function addResponseFinalizer () {}

/**
 * @typedef {object} spanInfo
 * @property {string} name - the name for the span
 * @property {object} [kvpairs] - kvpairs to add to the span
 * @property {function} [finalize] - callback receiving created span
 */

/**
 * @typedef {function} spanInfoFunction
 * @returns {spanInfo}
 */

/**
 * Instrument HTTP request/response
 *
 * @method ao.instrumentHttp
 * @param {string|spanInfoFunction} span - name or function returning spanInfo
 * @param {function} run - code to instrument and run
 * @param {object} [options] - options
 * @param {object} [options.enabled] - enable tracing, on by default
 * @param {object} [options.collectBacktraces] - collect backtraces
 * @param {HTTPResponse} res - HTTP response to patch
 * @returns the value returned by the run function or undefined if it can't be run.
 */
function instrumentHttp (build, run, options, res) {
  return run()
}

/**
 * Apply custom instrumentation to a synchronous or async-callback function.
 *
 * @method ao.instrument
 * @param {string|spanInfoFunction} span - span name or span-info function
 *     If `span` is a string then a span is created with that name. If it
 *     is a function it will be run only if tracing; it must return a
 *     spanInfo-compatible object - see instrumenting-a-module.md in guides/.
 * @param {function} run - the function to instrument<br/><br/>
 *     Synchronous `run` function:<br/>
 *     the signature has no callback, e.g., `function run () {...}`. If a
 *     synchronous `run` function throws an error appoptics will report that
 *     error for the span and re-throw the error.<br/>
 *     <br/>
 *     Asynchronous `run` function:<br/>
 *     the signature must include a done callback that is used to let
 *     AppOptics know when your instrumented async code is done running,
 *     e.g., `function run (done) {...}`. In order to report an error for
 *     an async span the done function must be called with an Error object
 *     as the argument.
 * @param {object} [options] - options
 * @param {boolean} [options.enabled=true] - enable tracing
 * @param {boolean} [options.collectBacktraces=false] - collect stack traces.
 * @param {function} [callback] - optional callback, if async
 * @returns {value} the value returned by the run function or undefined if it can't be run
 *
 * @example
 * //
 * // A synchronous `run` function.
 * //
 * //   If the run function is synchronous the signature does not include
 * //   a callback, e.g., `function run () {...}`.
 * //
 *
 * function spanInfo () {
 *   return {name: 'custom', kvpairs: {Foo: 'bar'}}
 * }
 *
 * function run () {
 *   const contents = fs.readFileSync('some-file', 'utf8')
 *   // do things with contents
 * }
 *
 * ao.instrument(spanInfo, run)
 *
 * @example
 * //
 * // An asynchronous `run` function.
 * //
 * // Rather than callback directly, you give the done argument.
 * // This tells AppOptics when your instrumented code is done running.
 * //
 * // The `callback` function is the callback you normally would have given
 * // directly to the code you want to instrument. It receives the same
 * // arguments as were received by the `done` callback for the `run` function
 * // and the same `this` context is also applied to it.
 *
 * function spanInfo () {
 *   return {name: 'custom', {Foo: 'bar'}}
 * }
 *
 * function run (done) {
 *   fs.readFile('some-file', done)
 * }
 *
 * function callback (err, data) {
 *   console.log('file contents are: ' + data)
 * }
 *
 * ao.instrument(spanInfo, run, callback)
 */
function instrument (span, run, options, callback) {
  // Verify that a run function is given
  if (typeof run !== 'function') {
    ao.loggers.error(`ao.instrument() run function is ${typeof run}`)
    return
  }

  // Normalize dynamic arguments
  try {
    if (typeof options === 'function') {
      callback = options
    } else {
      if (typeof options !== 'object') {
        options = {}
      }
    }

    if (!callback && run.length) {
      callback = function () {}
    }
  } catch (e) {
    ao.loggers.error('ao.instrument failed to normalize arguments', e.stack)
  }

  return run(callback)
}

/**
 * Apply custom instrumentation to a promise-returning asynchronous function.
 *
 * @method ao.pInstrument
 * @param {string|spanInfoFunction} span - span name or span-info function
 *     If `span` is a string then a span is created with that name. If it
 *     is a function it will be run only if tracing; it must return a
 *     spanInfo-compatible object - see instrumenting-a-module.md in guides/.
 * @param {function} run - the function to instrument<br/><br/>
 *     This function must return a promise.
 * @param {object} [options] - options
 * @param {boolean} [options.enabled=true] - enable tracing
 * @param {boolean} [options.collectBacktraces=false] - collect stack traces.
 * @returns {Promise} the value returned by the run function or undefined if it can't be run
 *
 * @example
 * //
 * // A synchronous `run` function.
 * //
 * //   If the run function is synchronous the signature does not include
 * //   a callback, e.g., `function run () {...}`.
 * //
 *
 * function spanInfo () {
 *   return {name: 'custom', kvpairs: {Foo: 'bar'}}
 * }
 *
 * function run () {
 *   return axios.get('https://google.com').then(r => {
 *     ...
 *     return r;
 *   })
 * }
 *
 * ao.pInstrument(spanInfo, run).then(...)
 */
function pInstrument (name, task, options = {}) {
  if (typeof task !== 'function') {
    return instrument(...arguments)
  }
  return task()
}

/**
 * Start or continue a trace. Continue is in the sense of continuing a
 * trace based on an X-Trace ID received from an external source, e.g.,
 * HTTP headers or message queue headers.
 *
 * @method ao.startOrContinueTrace
 * @param {string} traceparent - traceparent ID to continue from or null
 * @param {string} tracestat - tracestate ID to continue from or null
 * @param {string|spanInfoFunction} span - name or function returning spanInfo
 * @param {function} run - run this function. sync if no arguments, async if one.
 * @param {object}  [opts] - options
 * @param {boolean} [opts.enabled=true] - enable tracing
 * @param {boolean} [opts.collectBacktraces=false] - collect backtraces
 * @param {string|function} [opts.customTxName] - name or function
 * @returns {value} the value returned by the run function or undefined if it can't be run
 *
 * @example
 * ao.startOrContinueTrace(
 *   null,
 *   'sync-span-name',
 *   functionToRun,           // synchronous so function takes no arguments
 *   {customTxName: 'special-span-name'}
 * )
 * @example
 * ao.startOrContinueTrace(
 *   null,
 *   'sync-span-name',
 *   functionToRun,
 *   // note - no context is provided for the customTxName function. If
 *   // context is required the caller should wrap the function in a closure.
 *   {customTxName: customNameFunction}
 * )
 * @example
 * // this is the function that should be instrumented
 * request('https://www.google.com', function realCallback (err, res, body) {...})
 * // because asyncFunctionToRun only accepts one parameter it must be
 * // wrapped, so the function to run becomes
 * function asyncFunctionToRun (cb) {
 *   request('https://www.google.com', cb)
 * }
 * // and realCallback is supplied as the optional callback parameter
 *
 * ao.startOrContinueTrace(
 *   null,
 *   'async-span-name',
 *   asyncFunctionToRun,     // async, so function takes one argument
 *   // no options this time
 *   realCallback            // receives request's callback arguments.
 * )
 */
function startOrContinueTrace (traceparent, tracestate, build, run, opts, cb) {
  // Verify that a run function is given
  if (typeof run !== 'function') return

  if (typeof opts !== 'object') {
    cb = opts
  }
  if (!cb && run.length) {
    cb = function () {}
  }
  return run(cb)
}

/**
 * Start or continue a trace running a function that returns a promise. Continue is in
 * the sense of continuing a trace based on an X-Trace ID received from an external
 * source, e.g., HTTP headers or message queue headers.
 *
 * @method ao.pStartOrContinueTrace
 * @param {string} traceparent - traceparent ID to continue from or null
 * @param {string} tracestat - tracestate ID to continue from or null
 * @param {string|spanInfoFunction} span - name or function returning spanInfo
 * @param {function} run - the promise-returning function to instrument
 * @param {object}  [opts] - options
 * @param {boolean} [opts.enabled=true] - enable tracing
 * @param {boolean} [opts.collectBacktraces=false] - collect backtraces
 * @param {string|function} [opts.customTxName] - name or function
 * @returns {Promise} the value returned by the run function or undefined if it can't be run
 *
 * @example
 *
 * function spanInfo () {
 *   return {name: 'custom', kvpairs: {Foo: 'bar'}}
 * }
 *
 * // axios returns a promise
 * function functionToRun () {
 *   return axios.get('https://google.com').then(r => {
 *     ...
 *     return r;
 *   })
 * }
 *
 * ao.pStartOrContinueTrace(
 *   null,
 *   spanInfo,
 *   functionToRun,
 * ).then(...)
 */
function pStartOrContinueTrace (traceparent, tracestate, name, task, options = {}) {
  if (typeof task !== 'function') {
    return
  }

  return task()
}

/**
 * Report an error event in the current trace.
 *
 * @method ao.reportError
 * @param {Error} error - The error instance to report
 */
function reportError (error) {

}

/**
 * Report an info event in the current trace.
 *
 * @method ao.reportInfo
 * @param {object} data - Data to report in the info event
 */
function reportInfo (data) {

}

//
// sendMetric(name, object)
//
// only the first argument is required for an increment call.
//
// name - the name of the metric
// object - an object containing optional parameters
// object.count - the number of observations being reported (default: 1)
// object.addHostTag - boolean - add {host: hostname} to tags.
// object.tags - an object containing {tag: value} pairs.
// object.value - if present this call is a valued-based call and this contains
//                the value, or sum of values if count is greater than 1, being
//                reported.
//
// there are two types of metrics:
//   1) count-based - the number of times something has occurred (no value associated with this metric)
//   2) value-based - a specific value is being reported (or a sum of values)
//
//

//
// returns -1 for success else error code. the only error now is 0.
//
/**
 * Send a custom metric. There are two types of metrics:
 * 1) count-based - the number of times something has occurred (no value is associated with this type)
 * 2) value-based - a specific value (or sum of values).
 * If options.value is present the metric being reported is value-based.
 *
 * @method ao.sendMetric
 * @param {string} name - the name of the metric
 * @param {object} [options]
 * @param {number} [options.count=1] - the number of observations being reported
 * @param {number} [options.value] - if present the metric is value based and this
 *                                   is the value, or sum of the values if count is
 *                                   greater than 1
 * @param {boolean} [options.addHostTag] - add {host: hostname} to tags
 * @param {object} [options.tags] - an object containing {tag: value} pairs
 *
 * @throws {TypeError} - if an invalid argument is supplied
 * @returns {number} - -1 for success else an error code.
 *
 * @example
 *
 * // simplest forms
 * ao.sendMetric('my.little.count')
 * ao.sendMetric('my.little.value', {value: 234.7})
 *
 * // report two observations
 * ao.sendMetric('my.little.count', {count: 2})
 * ao.sendMetric('my.little.value', {count: 2, value: 469.4})
 *
 * // to supply tags that can be used for filtering
 * ao.sendMetric('my.little.count', {tags: {status: error}})
 *
 * // to have a host name tag added automatically
 * ao.sendMetric('my.little.count', {addHostTag: true, tags: {status: error}})
 *
 */
function sendMetric (name, options) {
  return aob.Reporter.sendMetric(name, options)
}

function sendMetrics (metrics) {
  return aob.Reporter.sendMetrics(metrics)
}

/**
 * Insert the appoptics object containing a trace ID into an object. The primary intended use for this is
 * to auto-insert traceIds into JSON-like logs; it's documented so it can be used for unsupported logging
 * packages or by those wishing a higher level of control.
 *
 * @method ao.insertLogObject
 * @param {object} [object] - inserts an ao log object containing a traceId property when conditions are met.
 * @returns {object} - the object with the an additional property, ao, e.g., object.ao === {traceId: ...}.
 *
 * @example
 *
 * const ao = require('appoptics-apm');
 * const logger = require('pino')();
 *
 * // with no object as an argument ao.insertLogObject returns {ao: {traceId: ...}}
 * logger.info(ao.insertLogObject(), 'not-so-important message');
 *
 * @example
 *
 * const ao = require('appoptics-apm');
 * const winston = require('winston');
 * const logger = winston.createLogger({
 *     level: 'info',
 *     format: winston.format.combine(
 *       winston.format.splat(),
 *       winston.format.json()
 *     ),
 *     defaultMeta: {service: 'ao-log-example'},
 *     transports: [...]
 * })
 *
 * logger.info(ao.insertLogObject({
 *     message: 'this object is being modified by insertLogObject',
 *     more: 'there will be an added ao property'
 * }))
 */
function insertLogObject (o = {}) {
  return o
}

function wrapLambdaHandler (fn) {
  return fn
}
