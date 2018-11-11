suite('probes/fs', function () {
  //
  // NOTE: There's not really a reasonable way to benchmark fs effectively.
  // The tremendous degree of side-effects caused by fs operations make it
  // basically impossible to reliable narrow the scope to specific calls.
  //
  before(function () {
    console.error('fs is too side-effect-y to benchmark reliably')
  })
})
