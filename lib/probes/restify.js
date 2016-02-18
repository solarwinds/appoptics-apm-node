var shimmer = require('shimmer')
var Layer = require('../layer')
var util = require('../util')
var rum = require('../rum')
var tv = require('..')
var conf = tv.restify

function argsToArray (args) {
  var length = args.length
  var res = []
  var i = 0
  for (; i < length; i++) {
    res[i] = args[i]
  }
  return res
}

function once (fn) {
  var used = false
  return function () {
    if ( ! used) fn.apply(this, arguments)
      used = true
    }
  }

function patchServer (server) {
  shimmer.wrap(server, '_handle', function (find) {
    return function (req, res, callback) {
      var run = find.bind(this, req, res)

      // Check if there is a trace to continue
      var last = Layer.last
      if ( ! last || ! conf.enabled) {
        return run(callback)
      }

      // Create and enter layer
      var layer = last.descend('restify')
      layer.enter()

      // Exit layer on response end
      shimmer.wrap(res, 'end', function (realEnd) {
        return function () {
          layer.exit()
          return realEnd.apply(this, arguments)
        }
      })

      return run(callback)
    }
  })

  var methods = [
    'del',
    'get',
    'head',
    'opts',
    'post',
    'put',
    'patch'
  ]

  methods.forEach(function (method) {
    shimmer.wrap(server, method, function (fn) {
      return function (options) {
        var args = argsToArray(arguments)

        // Pull out opts
        var opts = args.shift()

        // Map functions in remaining args to instrumented wrappers
        args = args.map(function (fn) {
          return function (req, res, next) {
            // Check if we've stored an http layer to hook into
            var httpLayer = res._http_layer
            if ( ! httpLayer || ! conf.enabled) {
              return fn.apply(this, arguments)
            }

            // Determine controller and action values
            // NOTE: express has no "controller" concept, url pattern will suffice
            var controller = method.toUpperCase() + ' ' + (opts.path || opts)
            var action = util.fnName(fn)

            // Store the latest middleware Controller/Action on exit
            var exit = httpLayer.events.exit
            exit.Controller = controller
            exit.Action = action

            // Create profile for this route function
            var layer = Layer.last.profile(controller + ' ' + action, {
              Controller: controller,
              Action: action
            })

            // We need to use manual mode
            layer.enter()

            // Create wrapper to only send exit once
            var done = once(layer.exit.bind(layer))

            // The exit point of the middleware may be res.end()
            // TODO: Figure out a better way then patching for every middleware
            shimmer.wrap(res, 'end', function (realEnd) {
              return function () {
                done()
                return realEnd.apply(this, arguments)
              }
            })

            // Or it may be the next arguments, in which case, we should
            // replace it with a wrapper to send exit, if not already sent
            var args = argsToArray(arguments)
            var realNext = args.pop()
            args.push(function () {
              done()
              return realNext.apply(this, arguments)
            })

            return fn.apply(this, args)
          }
        })

        // Put opts back into args
        args.unshift(opts)

        return fn.apply(this, args)
      }
    })
  })
}

//
// Apply restify patches
//
module.exports = function (restify) {
  shimmer.wrap(restify, 'createServer', function (createServer) {
    return function () {
      var server = createServer.apply(this, arguments)
      patchServer(server)
      return server
    }
  })

  return restify
}
