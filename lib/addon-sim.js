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
    this.event = Buffer.allocUnsafe(30);
    this.event[0] = 0x2b;
    this.event[29] = 0x00;
  }
  getSampleFlag () {
    return this.event[this.event.length - 1] & 1
  }
  toString () {
    return this.event.toString().toUpperCase();
  }
  sendReport () {
    return 0;
  }
  sendStatus () {
    return 0;
  }
}

Event.makeRandom = function (sample) {
  const event = new Event();
  event[29] = sample ? 0x01 : 0x00;
  return event;
}

Event.makeFromBuffer = function (buffer) {
  const event = new Event();
  buffer.copy(event.event);
  return event;
}

Event.makeFromString = function (string) {
  if (string.length != 60) {
    return undefined;
  }
  const b = Buffer.from(string, 'hex');
  if (b.length !== 30 || b[0] !== 0x2b || b[29] & 0xFE) {
    return undefined;
  }
  // an all zero op id is not valid.
  if (string.startsWith('0'.repeat(16), 42)) {
    return undefined;
  }

  return Event.makeFromBuffer(b);
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
  isReadyToSample () {return true},
  Reporter: {
    // -1 is success
    sendMetric () {return -1},
    sendMetrics () {
      return {errors: []}
    },
    // it returns the transaction name, so...
    sendHttpSpan (obj) {return obj.txname ? obj.txname : ''},
  },
  Settings: {
    setTracingMode () {},
    setDefaultSampleRate (r) {return r},
    sampleTrace () {},
    toString () {return ''},
    set () {},
    clear () {},
    isValid () {},
    getTraceSettings (xtrace, localMode) {
      return {
        metadata: Event.makeFromString(xtrace),
        doSample: false,
        doMetrics: false,
        edge: false,
        source: 0,
        rate: 0
      }
    }
  },
  Sanitizer: {
    sanitize (s) {return s}
  },
  Config: {
    getVersionString () {return 'not loaded'},
    getSettings () {return {}}
  },
  Event,
  path: '',
  version: 'not loaded'
}

module.exports = addon
