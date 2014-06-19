var log = require('./log')

// Public: Trace a given block of code. Detect any exceptions thrown by
// the block and report errors.
//
// layer - The layer the block of code belongs to.
// opts - A hash containing key/value pairs that will be reported along
// with the first event of this layer (optional).
// protect_op - specify the operating being traced.  Used to avoid
// double tracing between operations that call each other
//
// Example
//
//   def computation(n)
//     fib(n)
//     raise Exception.new
//   end
//
//   def computation_with_oboe(n)
//     trace('fib', { :number => n }) do
//       computation(n)
//     end
//   end
//
//   result = computation_with_oboe(1000)
//
// Returns the result of the block.
var trace = module.exports = exports = function (layer, opts, protect_op, fn) {
  opts = opts || {}
  log.entry(layer, opts, protect_op)
  try {
    fn()
  } catch (e) {
    log.exception(layer, e)
    throw e
  } finally {
    log.exit(layer, {}, protect_op)
  }
}

trace.async = function (layer, opts, protect_op, fn) {
  opts = opts || {}
  log.entry(layer, opts, protect_op)
  function done (err) {
    if (err) {
      log.exception(layer, err)
      return err
    }
    log.exit(layer, {}, protect_op)
  }
  fn(done)
}

// Public: Trace a given block of code which can start a trace depending
// on configuration and probability. Detect any exceptions thrown by the
// block and report errors.
//
// When start_trace returns control to the calling context, the oboe
// context will be cleared.
//
// layer - The layer the block of code belongs to.
// opts - A hash containing key/value pairs that will be reported along
// with the first event of this layer (optional).
//
// Example
//
//   def handle_request(request, response)
//     # ... code that modifies request and response ...
//   end
//
//   def handle_request_with_oboe(request, response)
//     result, xtrace = start_trace('rails', request['X-Trace']) do
//       handle_request(request, response)
//     end
//     result
//   rescue Exception => e
//     xtrace = e.xtrace
//   ensure
//     response['X-trace'] = xtrace
//   end
//
// Returns a list of length two, the first element of which is the result
// of the block, and the second element of which is the oboe context that
// was set when the block completed execution.
trace.start = function (layer, xtrace, opts, fn) {
  opts = opts || {}
  log.start(layer, xtrace, opts)

  var result
  try {
    result = fn()
  } catch (e) {
    log.exception(layer, e)
    e.xtrace = log.end(layer)
    throw e
  }
  xtrace = log.end(layer)

  return [result, xtrace]
}
