'use strict'

const shimmer = require('shimmer')
const util = require('../util')
const tv = require('..')
const conf = tv.director

/**
 * NOTE: The insert method calls itself recursively, but we only care about
 * the outer call, so this unpatches while executing the original function.
 */
function wrapAndUnwrap (obj, method, replacer) {
  const original = obj[method]
  const alt = obj[method] = replacer(wrapped)

  function wrapped () {
    obj[method] = original
    const ret = original.apply(this, arguments)
    obj[method] = alt
    return ret
  }
}

function wrapHandler (path, handler) {
  return function () {
    return tv.instrumentHttp(
      last => {
        // Get middleware Controller/Action and store on exit
        const httpLayer = this.res._http_layer
        const exit = httpLayer.events.exit
        const Controller = exit.Controller = '/' + path
        const Action = exit.Action = util.fnName(handler)

        return last.profile(`${Controller} ${Action}`, {
          Controller,
          Action
        })
      },
      () => handler.apply(this, arguments),
      conf,
      this.res
    )
  }
}

function patchInsert (proto) {
  if (typeof proto.insert !== 'function') return
  wrapAndUnwrap(proto, 'insert', fn => function (method, path, route, parent) {
    const {delimiter} = this
    const wrap = handler => wrapHandler(path.join(delimiter), handler)
    route = Array.isArray(route) ? route.map(wrap) : wrap(route)
    return fn.call(this, method, path, route, parent)
  })
}

function patchDispatch (proto) {
  if (typeof proto.dispatch !== 'function') return
  shimmer.wrap(proto, 'dispatch', dispatch => function (req, res, handler) {
    tv.bindEmitter(req)
    tv.bindEmitter(res)
    return tv.instrumentHttp(
      last => last.descend('director'),
      () => dispatch.call(this, req, res, tv.bind(handler)),
      conf,
      res
    )
  })
}

module.exports = function (director) {
  const {Router} = director.http || {}
  const proto = Router && Router.prototype
  if (proto) {
    patchInsert(proto)
    patchDispatch(proto)
  }

  return director
}
