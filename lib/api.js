'use strict'

let ao;
let aob;

module.exports = function (appoptics) {
  ao = appoptics;
  aob = ao.addon;

  return {
    sendMetric,
    getFormattedTraceId,
  }
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
  return aob.Reporter.sendMetric(name, options);
}

//
// format control bits
// header = 1;
// task = 2;
// op = 4;
// flags = 8;          // include all flags (2 hex chars)
// sample = 16;        // sample bit only (0 or 1)
// separators = 32;    // separate fields with '-'
// lowercase = 64;     // lowercase alpha hex chars
//
// Metadata.fmtHuman = header | task | op | flags | separators | lowercase;
// Metadata.fmtLog = task | sample | separators;
//
/**
 * Get the abbreviated trace ID format used for logs.
 *
 * @method getFormattedTraceId
 * @returns {string} - 40 character trace identifier - sample flag
 *
 * @example
 *
 * //
 * // using morgan in express
 * //
 * const ao = require('appoptics');
 * const Express = require('express');
 * const app = new Express();
 * const morgan = require('morgan');
 *
 * // define a format with a new token in it, 'trace-id' or a name of your choosing.
 * const logFormat = ':method :url :status :res[content-length] :trace-id - :response-time ms';
 * // define a token for the name used in the format. return
 * morgan.token('trace-id', function (req, res) {return ao.getFormattedTraceId();});
 * const logger = morgan(logFormat, {...});
 * app.use(logger);
 * // now the 42-character trace-id will be added to log entries.
 */
function getFormattedTraceId (options) {
  const format = options.format || aob.Metadata.fmtLog;
  return ao.Event.last ? ao.Event.last.event.toString(format) : '0000000000000000000000000000000000000000-0';
}

