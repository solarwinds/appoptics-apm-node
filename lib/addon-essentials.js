'use strict'

//
// this module only needs to supply functions that enable the core high-level
// instrumentation modules to run the supplied functions.
//
// Uint8Array is about the cheapest way to make a filled array of fixed length.
//
class Event {
  constructor (parent, edge) {
    this.event = new Uint8Array(30)
  }
  getSampleFlag () {
    return this.event[this.event.length - 1] === 1
  }
}

class Metadata {
  constructor (xtrace) {
    this.metadata = new Uint8Array(30)
  }
}

Metadata.makeRandom = function (sample) {
  const md = new Metadata()
  if (sample) {
    md[md.length - 1] = 1
  }
  return md
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
  Reporter: {
    // 0 is success
    sendReport () {return 0},
    sendStatus () {return 0},
    // it returns the transaction name, so...
    sendHttpSpan (obj) {obj.txname ? obj.txname : ''},
    // we're as ready to sample as we'll ever be
    isReadyToSample () {return true}
  },
  Context: {
    setTracingMode () {},
    setDefaultSampleRate (r) {return r},
    sampleTrace () {},
    toString () {return ''},
    set () {},
    clear () {},
    isValid () {},
    createEventX (parent, edge) {
      return new Event(parent, edge)
    },
    getTraceSettings (xtrace, localMode) {
      return {
        metadata: new Metadata(xtrace),
        doSettings: false,
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
  // the two classes
  Metadata,
  Event,
  path: '',
  version: 'not loaded'
}

module.exports = addon
