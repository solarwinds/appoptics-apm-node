'use strict'

//
// this module only needs to supply functions that enable the core high-level
// instrumentation modules to run the supplied functions.
//
// Uint8Array is the cheapest way to make a filled array of fixed length but
// it's not much different than buffer (< 0.02 microseconds/execution) and
// Uint8Array.from() is much slower than Buffer.from().
//
class Event {
  constructor (parent, edge) {
    this.event = Buffer.allocUnsafe(30)
    this.event[0] = 0x2b
    this.event[29] = 0x00
  }

  getSampleFlag () {
    return this.event[this.event.length - 1] & 1
  }

  toString () {
    return this.event.toString().toUpperCase()
  }

  sendReport () {
    return 0
  }

  sendStatus () {
    return 0
  }
}

Event.makeRandom = function (sample) {
  const event = new Event()
  event[29] = sample ? 0x01 : 0x00
  return event
}

Event.makeFromBuffer = function (buffer) {
  const event = new Event()
  buffer.copy(event.event)
  return event
}

const validXtrace = (xtrace) => {
  // https://github.com/librato/trace/tree/master/docs/specs
  const regExp = /\b2B[0-9A-F]{40}[0-9A-F]{16}0[0-1]{1}\b/
  const matches = regExp.exec(xtrace)

  return matches
}

const validTraceparent = (traceparent) => {
  // https://www.w3.org/TR/trace-context/
  const regExp = /\b00-[0-9a-f]{32}-[0-9a-f]{16}-0[0-1]{1}\b/
  const matches = regExp.exec(traceparent)

  return matches
}

Event.makeFromString = function (string) {
  if (validXtrace(string)) return Event.makeFromBuffer(Buffer.from(string, 'hex'))
  if (validTraceparent(string)) return Event.makeFromBuffer(Buffer.from(string.replace(/-/g, ''), 'hex'))

  return undefined
}

//
// the skeleton addon module
//
const addon = {
  MAX_SAMPLE_RATE: 1000000,
  MAX_METADATA_PACK_LEN: 512,
  MAX_TASK_ID_LEN: 20,
  MAX_OP_ID_LEN: 8,
  TRACE_NEVER: 0,
  TRACE_ALWAYS: 1,
  oboeInit () {},
  // we're as ready to sample as we'll ever be
  isReadyToSample () { return true },
  Reporter: {
    // -1 is success
    sendMetric () { return -1 },
    sendMetrics () {
      return { errors: [] }
    },
    // it returns the transaction name, so...
    sendHttpSpan (obj) { return obj.txname ? obj.txname : '' }
  },
  Settings: {
    setTracingMode () {},
    setDefaultSampleRate (r) { return r },
    toString () { return '' },
    set () {},
    clear () {},
    isValid () {},
    getTraceSettings (xtrace, localMode) {
      const traceTaskId = Event.makeFromString(xtrace)
      return {
        traceTaskId,
        metadata: traceTaskId,
        doSample: false,
        doMetrics: false,
        edge: false,
        source: 0,
        rate: 0
      }
    }
  },
  Notifier: {
    init () { return 0 }, // OK
    stop () { return -1 }, // DISABLED
    status () { return -1 }
  },
  Sanitizer: {
    sanitize (s) { return s }
  },
  Config: {
    getVersionString () { return 'not loaded' },
    getSettings () { return {} }
  },
  Event,
  path: '',
  version: 'not loaded'
}

module.exports = addon
