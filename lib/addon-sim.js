'use strict'

//
// this module only needs to supply functions that enable the core high-level
// instrumentation modules to run the supplied functions.
//
// Uint8Array is about the cheapest way to make a filled array of fixed length.
//
class Event {
  constructor (parent, edge) {
    this.event = new Uint8Array(30);
    this.event[0] = 0x2b;
  }
  getSampleFlag () {
    return this.event[this.event.length - 1] === 1
  }
}

class Metadata {
  constructor (xtrace) {
    this.metadata = new Uint8Array(30);
    this.metadata[0] = 0x2b;
    this.formatted = Buffer.alloc(60);
    const alpha = 'a'.charCodeAt(0) - 10;
    const digit = '0'.charCodeAt(0);

    let p = 0;
    for (let i = 0; i < this.metadata.length; i++) {
      let nibble = this.metadata[i] >>> 4;
      this.formatted[p++] = nibble > 9 ? nibble + alpha : nibble + digit;
      nibble = this.metadata[i] & 0xF;
      this.formatted[p++] = nibble > 9 ? nibble + alpha : nibble + digit;
    }
  }
  toString () {
    return this.formatted.toString('utf8');
  }
}

Metadata.makeRandom = function (sample) {
  const metadata = new Metadata();
  const md = metadata.metadata;
  if (sample) {
    md[md.length - 1] = 1;
  }
  return metadata;
}

Metadata.fromString = function (xtrace) {
  return new Metadata();
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
    // -1 is success
    sendMetric () {return -1},
    // it returns the transaction name, so...
    sendHttpSpan (obj) {return obj.txname ? obj.txname : ''},
    // we're as ready to sample as we'll ever be
    isReadyToSample () {return true}
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
        metadata: new Metadata(xtrace),
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
  // the two classes
  Metadata,
  Event,
  path: '',
  version: 'not loaded'
}

module.exports = addon
