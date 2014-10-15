var inherits = require('util').inherits
var shimmer = require('shimmer')
var tv = require('..')

module.exports = function (mongoose) {
  shimmer.wrap(mongoose.Collection.prototype, 'addQueue', function (addQueue) {
    return function (name, args) {
      // Try to patch queued calls, if possible
      var last = args[args.length - 1]
      if (typeof last === 'function') {
        args[args.length - 1] = tv.requestStore.bind(last)
      }
      return addQueue.call(this, name, args)
    }
  })

  return mongoose
}
