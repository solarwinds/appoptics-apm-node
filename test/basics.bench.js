var helper = require('./helper')
var tv = helper.tv
var Layer = tv.Layer

suite('basics', function () {
  bench('set trace mode', function () {
    tv.traceMode = tv.addon.TRACE_ALWAYS
  })

  bench('set trace mode as string', function () {
    tv.traceMode = 'always'
  })

  bench('set sample rate', function () {
    tv.sampleRate = 100
  })

  bench('set sample source', function () {
    tv.sampleSource = 100
  })

  bench('check if in "always" trace mode', function () {
    tv.always
  })

  bench('check if in "never" trace mode', function () {
    tv.never
  })

  bench('check if in "through" trace mode', function () {
    tv.through
  })

  bench('detect if it is in a trace', function () {
    tv.tracing
  })

  bench('sample', function () {
    tv.sample('test')
  })
})
