'use strict'

const prefixLen = 'APPOPTICS_'.length;

// portion of env var after 'APPOPTICS_': {bindings-name, type: [s]tring, [i]nteger, or [b]oolean}
const keyMap = {
  // these have been documented for end-users; the names should not be changed
  SERVICE_KEY: {name: 'serviceKey', type: 's'},
  TRUSTEDPATH: {name: 'trustedPath', type: 's'},
  HOSTNAME_ALIAS: {name: 'hostnameAlias', type: 's'},
  DEBUG_LEVEL: {name: 'logLevel', type: 'i'},
  TRIGGER_TRACE: {name: 'triggerTrace', type: {enable: 1, disable: 0}},
  LOG_SETTINGS: {name: 'logSettings', type: 's', unused: true},      // not needed but here so it won't show up as invalid.

  // feel free to rationalize the following

  // used by node agent
  REPORTER: {name: 'reporter', type: 's'},
  COLLECTOR: {name: 'endpoint', type: 's'},
  TOKEN_BUCKET_CAPACITY: {name: 'tokenBucketCapacity', type: 'i'},      // file and udp reporter
  TOKEN_BUCKET_RATE: {name: 'tokenBucketRate', type: 'i'},              // file and udp reporter

  // not used by node agent
  BUFSIZE: {name: 'bufferSize', type: 'i'},
  LOGNAME: {name: 'logFilePath', type: 's'},
  TRACE_METRICS: {name: 'traceMetrics', type: 'b'},
  HISTOGRAM_PRECISION: {name: 'histogramPrecision', type: 'i'},
  MAX_TRANSACTIONS: {name: 'maxTransactions', type: 'i'},
  FLUSH_MAX_WAIT_TIME: {name: 'flushMaxWaitTime', type: 'i'},
  EVENTS_FLUSH_INTERVAL: {name: 'eventsFlushInterval', type: 'i'},
  EVENTS_FLUSH_BATCH_SIZE: {name: 'eventsFlushBatchSize', type: 'i'},
  REPORTER_FILE_SINGLE: {name: 'oneFilePerEvent', type: 'b'},           // file reporter
}


function convert (string, type) {
  if (type === 's') {
    return string;
  }
  if (type === 'i') {
    const v = +string;
    return Number.isNaN(v) ? undefined : v;
  }
  if (type === 'b') {
    return ['1', 'true', 'yes', 'on', 'y'].indexOf(string.toLowerCase()) >= 0
  }
  if (typeof type === 'object' && string.toLowerCase() in type) {
    return type[string.toLowerCase()];
  }
  return undefined;
}

function fetch () {
  const valid = {};
  const invalid = [];

  Object.keys(process.env).forEach(k => {
    if (!k.startsWith('APPOPTICS_')) {
      return;
    }
    const keyEntry = keyMap[k.slice(prefixLen)];
    if (!keyEntry) {
      invalid.push(`${k}=${process.env[k]}`);
      return;
    }
    const value = convert(process.env[k], keyEntry.type);
    if (value !== undefined) {
      if (!keyEntry.unused) {
        valid[keyEntry.name] = value;
      }
    } else {
      invalid.push(`${k}=${process.env[k]}`);
    }
  });

  return {valid, invalid};
}

module.exports = {fetch};
