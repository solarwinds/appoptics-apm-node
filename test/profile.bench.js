var helper = require('./helper')
var ao = helper.ao
var Profile = ao.Profile
var Span = ao.Span

var span = new Span('test', null, {})

suite('profile', function () {
  bench('construction', function () {
    new Profile('test', null, {})
  })

  bench('descend from span', function () {
    var span = new Span('test', null, {})
    span.run(profile)
  })
})

function profile () {
  span.profile('test')
}
