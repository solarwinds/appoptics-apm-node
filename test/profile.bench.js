var helper = require('./helper')
var tv = helper.tv
var Profile = tv.Profile
var Layer = tv.Layer

var layer = new Layer('test', null, {})

suite('profile', function () {
  bench('construction', function () {
    new Profile('test', null, {})
  })

  bench('descend from layer', function () {
    var layer = new Layer('test', null, {})
    layer.run(profile)
  })
})

function profile () {
  layer.profile('test')
}
