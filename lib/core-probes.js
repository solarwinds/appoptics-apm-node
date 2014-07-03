var Layer = require('./layer')
var Event = require('./event')
var oboe = require('./')

var realProcessNextTick = process.nextTick
var realSetImmediate = global.setImmediate
var realSetInterval = global.setInterval
var realSetTimeout = global.setTimeout

function maybeDescend (name, data, cb) {
  // TODO: Figure out why Layer.last is always undefined here
  if ( ! oboe.requestStore.get('lastLayer') || ! Event.last) {
    return cb()
  }

  var layer = oboe.requestStore.get('lastLayer').descend(name, data)
  layer.async = true

  return layer.run(cb)
}

function unpatch () {
  process.nextTick = realProcessNextTick
  global.setImmediate = realSetImmediate
  global.setInterval = realSetInterval
  global.setTimeout = realSetTimeout
}

function patch () {
  global.setTimeout = function (cb, duration) {
    return maybeDescend('setTimeout', {}, function () {
      return realSetTimeout(cb, duration)
    })
  }

  global.setInterval = function (cb, duration) {
    return maybeDescend('setInterval', {}, function () {
      return realSetInterval(cb, duration)
    })
  }

  global.setImmediate = function (cb) {
    return maybeDescend('setImmediate', {}, function () {
      return realSetImmediate(cb)
    })
  }

  process.nextTick = function (cb) {
    return maybeDescend('process.nextTick', {}, function () {
      return realProcessNextTick(cb)
    })
  }
}

exports.patch = patch
exports.unpatch = unpatch
