var helper = require('./helper')
var ao = helper.ao
var Layer = ao.Layer

suite('basics', function () {
  bench('set trace mode', function () {
    ao.sampleMode = ao.addon.TRACE_ALWAYS
  })

  bench('set trace mode as string', function () {
    ao.sampleMode = 'always'
  })

  bench('set sample rate', function () {
    ao.sampleRate = 100
  })

  bench('set sample source', function () {
    ao.sampleSource = 100
  })

  bench('check if in "always" trace mode', function () {
    ao.always
  })

  bench('check if in "never" trace mode', function () {
    ao.never
  })

  bench('check if in "through" trace mode', function () {
    ao.through
  })

  bench('detect if it is in a trace', function () {
    ao.tracing
  })

  bench('sample', function () {
    ao.sample('test')
  })
})
