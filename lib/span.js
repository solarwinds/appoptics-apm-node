'use strict'

const util = require('util');
const Event = require('./event')
let ao;
let log;
let dbSendError;

const stats = {
  totalCreated: 0,              // total spans created
  topSpansCreated: 0,           // total entry spans (traces) created - basis for request rate
  topSpansActive: 0,            // topSpans: span.enter() called but not span.exit()
  topSpansMax: 0,               // topSpans: maximum active
  topSpansExited: 0,            // topSpans: span.exit() called - basis for response rate
  otherSpansActive: 0,          // not-topSpan: span.enter() called but not span.exit()
}

/**
 * Create an execution span.
 *
 * @class Span
 * @param {string} name Span name
 * @param {object} settings Settings returned from getTraceSettings()
 * @param {Event} [settings.traceTaskId] an addon.Event instance to create the events from.
 *     Events will have the same task ID and sample bit but unique op IDs. This value is set
 *     by getTraceSettings() and must be present.
 * @param {boolean} [settings.edge=true] the entry event of this span should edge back to the
 *     op id associated with settings.traceTaskId. The only time this is not true is when the
 *     span being created is a new top level span not being continued from an inbound X-Trace
 *     ID. This must be set explicitly to a falsey value; it's absence is true.
 * @param {object} [data] Key/Value pairs of info to add to event
 *
 * @example
 * var span = new Span('fs', ao.lastEvent, {
 *   File: file
 * })
 */
function Span (name, settings, data) {
  // most spans are not top/entry spans, so default these properties false.
  this.topSpan = false;
  this.doMetrics = false;

  this._async = false
  this.name = name
  this.events = {
    internal: [],
    entry: null,
    exit: null
  }

  this.returnXtraceHeader = ao.lambda ? !!settings.inboundXtrace : true;

  if (!name) {
    throw new TypeError(`invalid span name ${name}`)
  }

  stats.totalCreated += 1;

  // the sampling state needs to be in each span because it is used
  // to avoid expensive operations, e.g., collecting backtraces, when
  // not sampling.
  this.doSample = settings.traceTaskId.getSampleFlag()

  // it is possible to ignore some errors. the only error that customers have
  // requested to be able to ignore is ENOENT because their application looks for
  // files at startup but it's not really an error for them to not be found.
  // in order to ignore an error the probe must call Span.setErrorsToIgnoreFunction().
  this.ignoreErrorFn = undefined;

  const edge = 'edge' in settings ? settings.edge : true

  const entry = new Event(name, 'entry', settings.traceTaskId, edge)
  const exit = new Event(name, 'exit', entry.event, true)

  entry.set(data)

  this.events.entry = entry
  this.events.exit = exit
}

const getSpan = util.deprecate(() => ao.lastSpan, 'use ao.lastSpan instead of Span.last');
const setSpan = util.deprecate(span => ao.lastSpan = span, 'use ao.lastSpan instead of Span.last');

Object.defineProperty(Span, 'last', {
  get: getSpan,
  set: setSpan,
});

/**
 * Create a new entry span. An entry span is the top span in a new trace in
 * this process. It might be continued from another process, e.g., an X-Trace-ID
 * header was attached to an inbound HTTP/HTTPS request.
 *
 * @method Span.makeEntrySpan
 * @param {string} name the name for the span.
 * @param {object} settings the object returned by ao.getTraceSettings()
 * @param {object} kvpairs key/value pairs to be added to the entry event
 */
Span.makeEntrySpan = function makeEntrySpan (name, settings, kvpairs) {
  stats.topSpansCreated += 1;

  log.span('Span.makeEntrySpan %s from inbound %x', name, settings.traceTaskId)

  // use the Event from settings or make new (error getting settings or testing).
  const traceTaskId = settings.traceTaskId || ao.addon.Event.makeRandom(settings.doSample)

  const span = new Span(name, {traceTaskId, edge: settings.edge}, kvpairs);

  // if not sampling make a single skeleton span that will be used for all other spans in this
  // trace.
  span.skeleton = undefined;
  if (!span.doSample) {
    const skeleton = new Span('__skeleton__', {traceTaskId: span.events.entry.event});
    span.skeleton = skeleton;
    skeleton.isSkeleton = true;
  }

  // fill in entry-span-specific properties.
  span.topSpan = true;
  span.doMetrics = settings.doMetrics;

  // supply a default in case the user didn't provide a txname string or
  // function that returns a string. if the span is unnamed then let oboe
  // provide "unknown". there is no customTxName function by default.
  span.defaultTxName = span.name ? 'custom-' + span.name : '';
  span.customTxName = undefined;

  // if not sampling no need to set these because they won't be sent. they are only
  // to be reported when a Trace Entry Service makes a Trace Start Decision. that is
  // only true if the metadata was not derived from an inbound x-trace.
  if (span.doSample && !settings.metadataFromXtrace) {
    span.events.entry.set({
      SampleSource: settings.source,
      SampleRate: settings.rate,
      BucketRate: settings.tokenBucketRate,
      BucketCapacity: settings.tokenBucketCapacity,
    });
  }

  return span
}

/**
 * Create a new span descending from the current span
 *
 * @method Span#descend
 * @param {string} name Span name
 * @param {object} data Key/Value pairs of info to add to the entry event
 * @returns {Span} the created span
 *
 * @example
 * var inner = outer.descend('fs', {
 *   File: file
 * })
 */
Span.prototype.descend = function (name, data) {
  const last = ao.lastEvent
  log.span('span.descend %s from ao.lastEvent %e', name, last)

  // if this trace is not sampled then avoid as much work as possible.
  if (!this.doSample) {
    let span;
    // if descending from a topSpan then use the pre-constructed skeleton. if not
    // then this is the skeleton so just re-use it.
    if (this.topSpan) {
      span = this.skeleton;
      span.count += 1;
    } else {
      if (!this.isSkeleton) {
        log.debug('expected isSkeleton');
      }
      this.count += 1;
      span = this;
    }

    return span;
  }

  const span = new Span(name, {traceTaskId: last.event}, data)

  return span;
}

/**
 * Whether or not the span is async
 *
 * @property {boolean} async
 * @memberof Span
 */
Object.defineProperty(Span.prototype, 'async', {
  get () { return this._async },
  set (val) {
    try {
      this._async = val
      if (val) {
        this.events.entry.kv.Async = true
      } else {
        delete this.events.entry.kv.Async
      }
      log.span(`span ${this.name} ${val ? 'enabled' : 'disabled'} async`)
    } catch (e) {
      log.error(`${this.name} span failed to set async to ${val}`, e.stack)
    }
  }
})

/**
 * Run a function within the context of this span. Similar to mocha, this
 * identifies asynchronicity by function arity and invokes runSync or runAsync
 *
 * @method Span#run
 * @param {function} fn - function to run within the span context
 * @returns the value returned by fn()
 *
 * @example
 * span.run(function () {
 *   syncCallToTrace()
 * })
 * @example
 * span.run(function (wrap) {
 *   asyncCallToTrace(wrap(callback))
 * })
 */
Span.prototype.run = function (fn) {
  return fn.length === 1 ? this.runAsync(fn) : this.runSync(fn)
}

Span.prototype.isLambdaTopSpan = function () {
  return typeof this.topSpan === 'string';
}

//
// run a promise-returning function. if the function does not return
// a promise it doesn't fail gracefully at this time.
//
Span.prototype.runPromise = async function (pfunc, options) {
  let ctx;
  let startTime;

  if (!this.isLambdaTopSpan()) {
    this.async = true;
  }

  try {
    ctx = ao.requestStore.createContext({newContext: this.topSpan});
    ao.requestStore.enter(ctx);
  } catch (e) {
    log.error(`${this.name} span failed to enter context ${e.message}`, e.stack);
  }

  // Attach backtrace if sampling and enabled.
  if (this.doSample && options.collectBacktraces) {
    this.events.entry.set({Backtrace: ao.backtrace()})
  }

  if (this.doMetrics) {
    startTime = Date.now();
  }

  this.enter();

  let error;
  return pfunc()
    .catch(e => error = e)
    .then(r => {
      const kvpairs = {};

      if (this.topSpan && this.doMetrics) {
        const txname = this.getTransactionName();
        const et = (Date.now() - startTime) * 1000;
        const txnameUsed = Span.sendNonHttpSpan(txname, et, error);
        if (txname !== txnameUsed) {
          log.warn(`span ${this.name}.runPromise() txname used: %s vs %s`, txnameUsed, txname)
        }
        kvpairs.TransactionName = txnameUsed;
      }

      if (this.isLambdaTopSpan()) {
        // check all permutations of error returns and inject headers as specified.
        this._lambdaPreExitProcessing(r, kvpairs);
      }

      this.exitCheckingError(error, kvpairs);

      try {
        if (ctx) {
          ao.requestStore.exit(ctx);
        }
      } catch (e) {
        log.error(`${this.name} span failed to exit context`, e.stack)
      }

      if (error) {
        throw error;
      }

      return r;
    });
}

/**
 * Run an async function within the context of this span.
 *
 * @method Span#runAsync
 * @param {function} fn - async function to run within the span context
 * @returns the value returned by fn()
 *
 * @example
 * span.runAsync(function (wrap) {
 *   asyncCallToTrace(wrap(callback))
 * })
 */
Span.prototype.runAsync = function (fn) {
  const span = this;
  // don't mark the top span async in lambda because it interferes with the display
  // on the host. fundamentally, it is not this function's decision whether to mark the
  // span async or not. setting/clearing it adds/removes the KV key Async.
  if (!span.isLambdaTopSpan()) {
    span.async = true;
  }
  let ctx
  let startTime

  try {
    ctx = ao.requestStore.createContext({newContext: this.topSpan});
    ao.requestStore.enter(ctx);
  } catch (e) {
    log.error(`${this.name} span failed to enter context`, e.stack)
  }

  if (span.doMetrics) {
    startTime = Date.now();
  }

  span.enter()
  // fn is a function that accepts our wrapper, wraps the user's callback with
  // it, then runs the user's runner function. That way our wrapper is invoked
  // before the user's callback. handler is used only for memcached. No other
  // callback function supplies it.
  const ret = fn.call(span, (cb, handler) => ao.bind(function (error) {
    if (handler) {
      // handler is present only for some memcached functions.
      // TODO BAM how to handle this with customTxName...
      handler.apply(this, arguments)
    } else {
      // this is the "normal", i.e., non-memcached path.
      const et = (Date.now() - startTime) * 1000;
      const kvpairs = {};
      if (span.topSpan && span.doMetrics) {
        const txname = span.getTransactionName()
        const finaltxname = Span.sendNonHttpSpan(txname, et, error);
        kvpairs.TransactionName = finaltxname
        if (txname !== finaltxname) {
          log.warn('Span.runAsync txname mismatch: %s !== %s', txname, finaltxname)
        }
      }

      span.exitCheckingError(error, kvpairs);
    }

    return cb.apply(this, arguments)
  }));

  try {
    if (ctx) {
      ao.requestStore.exit(ctx);
    }
  } catch (e) {
    log.error(`${this.name} span failed to exit context`, e.stack)
  }

  return ret;

}

class LambdaExitError extends Error {
  constructor (code, message) {
    super(message);
    this.code = code;
  }
}
//
// internal function that makes a decision about whether to report a trace error
// for the span. the summary is "if it is an error or the statusCode is a 500-599
// then add an error to the KVs". an exception is detected prior to this function.
//
// returns the promise.
//
Span.prototype._lambdaPreExitProcessing = function (ret, kvpairs) {

  if (!ret || !ret.then) {
    log.warn(`${this.name} lambdaPreExit with ${typeof ret}`);
    return ret;
  }

  return ret
    .then(r => {
      // in lambda promises that resolve to an Error generate errors.
      if (r instanceof Error) {
        this.setExitError(r);
        return r;
      }
      // if it isn't an object then there is nothing to do
      if (!r || typeof r !== 'object') {
        log.span(`span ${this.name} resolves to non-object: ${typeof r}`);
        return r;
      }

      if (typeof r === 'object') {
        if ('statusCode' in r) {
          kvpairs.HTTPStatus = r.statusCode;
          if (r.statusCode >= 500 && r.statusCode <= 599) {
            const e = new LambdaExitError('statusCode500', `response statusCode set to ${r.statusCode}`);
            this.setExitError(e);
          }
        }
        if (this.returnXtraceHeader && typeof r.headers === 'object') {
          const lastEvent = this.events.exit;
          if (lastEvent) {
            log.debug('set ret.headers.x-trace = %e', lastEvent);
            r.headers['x-trace'] = lastEvent.toString();
          }
        }
      }
      if (log.debug.enabled) {
        log.debug(`${this.name} lambdaPreExit returning %o`, r);
      }
      return r;
    });
}

// this function is mothballed as opposed to removed because the logic might be
// needed if we want to support distributed tracing in lambda functions without
// code modification. the code needs a few tweaks but is pretty close.
//
// internal function that makes a decision about whether to report a trace error
// for the span. the summary is "report an error if the lambda runtime will return
// an error to the end user". it also detects conditions in which the lambda runtime
// will report an error.
//
//Span.prototype._injectLambdaReturn = function (ret) {
//  log.span('attempting lambda header insertion:%s', this.topSpan);
//
//  if (!ret || typeof ret.then !== 'function') {
//    log.debug('span runner return value not then-able');
//    return ret;
//  }
//
//  // there are two things that have to be done here. if span.returnXtraceHeader is
//  // set then, if possible, inject an xtrace header into the response. and if the
//  // return value indicates an error response to the end user, then add error KVs
//  // to the span.
//
//  return ret
//    .then(r => {
//      // in lambda promises that resolve to an Error generate errors.
//      if (r instanceof Error) {
//        this.setExitError(r);
//        return r;
//      }
//
//      if (!r || typeof r !== 'object') {
//        // nothing to do if it's version 1. the response must be correct or the apig will return
//        // a 500 status, so this span gets an exit error.
//        if (this.topSpan === 'lambda-api-gateway-v1') {
//          const e = new LambdaExitError('InvalidV1Response', `response not valid for V1 API Gateway ${r}`);
//          this.setExitError(e);
//          return r;
//        }
//
//        if (this.returnXtraceHeader) {
//          log.span('injecting status code and headers');
//          // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
//          // it's v2 - supply a statusCode so lambda won't interpret this object
//          // as the body and add a headers object. r is the body.
//          r = {statusCode: 200, body: r, headers: {}};
//        }
//      } else if (this.topSpan === 'lambda-api-gateway-v2' && !('statusCode' in r)) {
//        // it is an object but doesn't have a statusCode property. apig would interpret this as the
//        // body and stringify it, so do the same, wrapping it in an object with statusCode and headers.
//        if (this.returnXtraceHeader) {
//          log.span('injecting status code, headers, and stringifying');
//          try {
//            r = {statusCode: 200, body: JSON.stringify(r), headers: {}};
//          } catch (e) {
//            // if this fails it must be JSON.stringify(), so make an error on the span and don't
//            // replace r. capturing the error should be more informative than apig's 500.
//            this.setExitError(e);
//          }
//        }
//      } else if (!('headers' in r)) {
//        // it is an object, it has a statusCode property but not a headers object property.
//        if (r.statusCode >= 500 && r.statusCode <= 599) {
//          const e = new LambdaExitError('statusCode500', `response statusCode set to ${r.statusCode}`);
//          this.setExitError(e);
//        }
//        if (this.returnXtraceHeader) {
//          log.span('injecting headers');
//          r.headers = {};
//        }
//      } else if (typeof r.headers !== 'object') {
//        // TODO BAM does this generate an apig error?
//        log.span('found non-object headers, skipping injection');
//        // if headers is present but not an object don't replace it.
//        return r;
//      }
//
//      if (this.returnXtraceHeader) {
//        const lastEvent = this.events.exit;
//        if (lastEvent) {
//          log.debug('set ret.headers.x-trace = %e', lastEvent);
//          r.headers['x-trace'] = lastEvent.toString();
//        }
//      }
//      return r;
//    });
//}

/**
 * Run a sync function within the context of this span.
 *
 * @method Span#runSync
 * @param {function} fn - sync function to run withing the span context
 * @returns the value returned by fn()
 *
 * @example
 * span.runSync(function () {
 *   syncCallToTrace()
 * })
 */
Span.prototype.runSync = function (fn) {
  let ctx = null
  let error
  let startTime
  const kvpairs = {}

  try {
    if (this.topSpan) {
      if (this.doMetrics) {
        startTime = Date.now();
      }
      ctx = ao.requestStore.createContext({newContext: true});
      ao.requestStore.enter(ctx)
    }
  } catch (e) {
    log.error(`${this.name} span failed to enter context`, e.stack)
  }

  this.enter()

  let ret;
  try {
    ret = fn.call(this)
    return ret;
  } catch (err) {
    error = err
    this.setExitError(err)
    throw err
  } finally {
    if (this.topSpan && this.doMetrics) {
      const txname = this.getTransactionName()
      const et = (Date.now() - startTime) * 1000;

      const finaltxname = Span.sendNonHttpSpan(txname, et, error || ao.lambda && ret instanceof Error);
      kvpairs.TransactionName = finaltxname
      if (txname !== finaltxname) {
        log.warn('Span.runAsync txname error: %s !== %s', txname, finaltxname)
      }
    }

    this.exit(kvpairs)

    try {
      if (ctx) {
        ao.requestStore.exit(ctx)
      }
    } catch (e) {
      log.error(`${this.name} span failed to exit context`, e.stack)
    }

    if (this.topSpan && ao.lambda) {
      // TODO BAM topSpans are all async. should this check for .then or
      // just let it return a value? and what about the callback version...
      if (!ret || typeof ret.then !== 'function') {
        log.debug('ret did not pass Promise checks in span.runAsync()');
        return ret;
      }
      return ret
        .then(r => {
          if (!r || typeof r !== 'object') {
            return r;
          } else if (!('headers' in r)) {
            r.headers = {};
          } else if (typeof r.headers !== 'object') {
            return r;
          }
          const lastEvent = this.events.exit;
          if (lastEvent) {
            log.debug('set ret.headers.x-trace = %e', lastEvent);
            r.headers['x-trace'] = lastEvent.toString();
          }
          return r;
        });
    }

  }
}

/**
 * Send the enter event
 *
 * @method Span#enter
 * @param {object} data - Key/Value pairs of info to add to event
 *
 * @example
 * span.enter()
 * syncCallToTrace()
 * span.exit()
 * @example
 * // If using enter/exit to trace async calls, you must flag it as async
 * // manually and bind the callback to maintain the trace context
 * span.async = true
 * span.enter()
 * asyncCallToTrace(ao.bind(function (err, res) {
 *   span.exit()
 *   callback(err, res)
 * }))
 */
Span.prototype.enter = function (data) {
  const entry = this.events.entry;

  if (log.span.enabled) {
    let msg = 'span.enter %e';
    if (entry.kv.Spec && entry.kv.Operation) {
      msg = `span.enter %e (Spec = ${entry.kv.Spec}, Op = ${entry.kv.Operation})`;
    }
    log.span(msg, entry);
  }

  if (this.topSpan) {
    ao.requestStore.set('topSpan', this);
    stats.topSpansActive += 1;
    if (stats.topSpansActive > stats.topSpansMax) {
      stats.topSpansMax = stats.topSpansActive;
    }
    if (ao.lambda) {
      ao.lambda.invocations += 1;
      data = Object.assign({InvocationCount: ao.lambda.invocations}, data);
    }
  } else {
    stats.otherSpansActive += 1;
  }


  try {
    ao.lastSpan = this

    // Send the entry event
    entry.sendReport(data)
    // if it is a skeleton span clear any KVs that may have been set so they don't accumulate.
    if (this.isSkeleton) {
      const {Layer, Label} = this.events.entry.kv;
      this.events.entry.kv = {Layer, Label};
    }
  } catch (e) {
    log.error(`${this.name} span failed to enter`, e.stack)
  }
}

/**
 * Send the exit event
 *
 * @method Span#exit
 * @param {object} data - key-value pairs of info to add to event
 */
Span.prototype.exit = function (data) {
  const exit = this.events.exit;
  if (log.span.enabled) {
    let msg = 'span.exit %e';
    if (exit.kv.Spec && exit.kv.Operation) {
      msg = `span.exit %e (Spec = ${exit.kv.Spec}, Op = ${exit.kv.Operation})`;
    }
    log.span(msg, exit);
  }

  if (this.topSpan) {
    stats.topSpansActive -= 1;
    stats.topSpansExited += 1;
  } else {
    stats.otherSpansActive -= 1;
  }

  try {
    // Edge back to previous event, if not already connected
    const last = ao.lastEvent
    if (last && last !== this.events.entry && !exit.ignore) {
      exit.edges.push(last)
    } else if (!last) {
      log.debug('span.exit - no last event %l', this)
    } else {
      log.span('span.exit - no extra edge found for %e', exit)
    }

    // Send the exit event
    exit.sendReport(data)
    // reset the KVs so they don't accumulate across all Layer.
    if (this.isSkeleton) {
      const {Layer, Label} = this.events.entry.kv;
      this.events.entry.kv = {Layer, Label};
    }

    // send any pending buffers now so lambda won't timeout before
    // oboe has a chance to send.
    if (this.topSpan && ao.execEnv.id === 'lambda') {
      const status = ao.reporter.flush();
      if (status !== 0) {
        log.warn('reporter.flush() status: %i', status);
      }
    }
  } catch (e) {
    log.error(`${this.name} span failed to exit`, e.stack)
  }
}

/**
 * Send the exit event with an error status
 *
 * @method Span#exitCheckingError
 * @param {Error} err - Error to add to event
 * @param {object} data - Key/Value pairs of info to add to event
 */
Span.prototype.exitCheckingError = function (error, data) {
  this.setExitError(error)
  this.exit(data)
}

/**
 * Set an error to be sent with the exit event
 *
 * @method Span#setExitError
 * @param {Error} err - Error to add to event
 */
Span.prototype.setExitError = function (error) {
  try {
    error = Span.toError(error)
    if (error) {
      if (!this.ignoreErrorFn || !this.ignoreErrorFn(error)) {
        log.span(`${this.name} setting exit error ${error.message}`);
        this.events.exit.error = error;
      }
    }
  } catch (e) {
    log.error(`${this.name} span failed to set exit error`, e.stack)
  }
}

/**
 * @ignore
 * Create and send an internal event
 *
 *     span._internal('info', { Foo: 'bar' })
 *
 * @method Span#_internal
 * @param {String} label Event type label
 * @param {Object} data Key/Value pairs to add to event
 */
Span.prototype._internal = function (label, data) {
  const last = ao.lastEvent
  if (!last) {
    log.error(`${this.name} span ${label} call could not find last event`)
    return
  }

  const event = new Event(null, label, last.event, true)
  this.events.internal.push(event)

  // Send the event
  event.sendReport(data)
}

/**
 * Create and send an info event
 *
 * @method Span#info
 * @param {object} data - key-value pairs to add to event
 *
 * @example
 * span.info({Foo: 'bar'})
 */
Span.prototype.info = function (data) {
  log.span(`span.info ${this.name}`)

  try {
    // Skip sending non-objects
    if (!isRealObject(data)) {
      log.info('span.info invalid input');
      return
    }

    this._internal('info', data)
  } catch (e) {
    log.error(`${this.name} span failed to send info event`, e.stack)
  }
}

// Helper to identify object literals
function isRealObject (v) {
  return Object.prototype.toString.call(v) === '[object Object]'
}

/**
 * Create and send an error event
 *
 * @method Span#error
 * @param {object} data Key/Value pairs to add to event
 *
 * @example
 * span.error(error)
 */
Span.prototype.error = function (error) {
  log.span(`span.error on ${this.name}`);


  try {
    const orig = error;
    error = Span.toError(error)
    if (!error) {
      log.info('invalid input to span.error:', orig);
      return
    }

    this._internal('error', {error: error})
  } catch (e) {
    log.error(`${this.name} span failed to send error event`, e.stack)
  }
}

/**
 * Set a function that determines whether an error is reported or not. This
 * is for internal use only.
 *
 * @method Span#setIgnoreErrorFn
 * @param {Error} err the error to evaluate
 * @returns {boolean} truthy to ignore the error
 * @ignore
 *
 * @example
 * span.setIgnoreErrorFn(function (err) {
 *   // return true to ignore the error.
 *   return err.code === 'ENOENT';
 * })
 */
Span.prototype.setIgnoreErrorFn = function setIgnoreErrorFn (fn) {
  if (this.ignoreErrorFn) {
    log.warn(`resetting ignoreErrorFn for ${this.name}`);
  }
  this.ignoreErrorFn = fn;
}

//
// This is not really associated with a Span now so make it static.
//
Span.sendNonHttpSpan = function (txname, duration, error) {
  const args = {
    txname: txname,
    //domain: ao.cfg.domainPrefix ? ao.getDomainPrefix(req) : '',
    duration: duration,
    error: !!error
  }

  const finalTxName = ao.reporter.sendNonHttpSpan(args);

  // if it's good and not a null string return it.
  if (typeof finalTxName === 'string' && finalTxName) {
    return finalTxName;
  }

  // if it wasn't a string then it should be a numeric code. worst
  // case is that it is a null string.
  dbSendError.log(`sendNonHttpSpan() code ${finalTxName}`);


  // try to return a valid transaction name of some sort. it doesn't really
  // matter because it wasn't sent no matter what it was.
  return args.txname || 'unknown';
}

//
// return the transaction name. only topLevel spans have transaction names.
//
Span.prototype.getTransactionName = function () {
  let txname;

  if (ao.cfg.transactionName) {
    return ao.cfg.transactionName;
  }

  if (this.customTxName) {
    if (typeof this.customTxName === 'string') {
      txname = this.customTxName
    } else if (typeof this.customTxName === 'function') {
      try {
        // if the user needs context they need to create a closure.
        txname = this.customTxName()
      } catch (e) {
        log.error('customTxName function %s', e)
      }
    }
  }
  if (!txname) {
    txname = this.defaultTxName
  }
  return txname
}

//
// Convert a string to an error, return an Error instance
// or return undefined.
//
Span.toError = function (error) {
  // error can be a string or Error
  if (typeof error === 'string') {
    return new Error(error)
  }

  if (error instanceof Error) {
    return error
  }
}

// because this module is invoked before the ao object is initialized
// data required from ao must be deferred until init is called.
Span.init = function (populatedAo) {
  ao = populatedAo;
  ao._stats.span = stats;
  log = ao.loggers;
  dbSendError = new ao.loggers.Debounce('error');
}

module.exports = Span;
