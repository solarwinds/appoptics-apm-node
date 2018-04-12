'use strict'

module.exports = {
  fnName (fn) {
    return fn.name || '(anonymous)'
  },

  toError (error) {
    if (typeof error === 'string') {
      return new Error(error)
    }

    if (error instanceof Error) {
      return error
    }
  },

  once (fn) {
    let used = false
    return function () {
      if (!used) fn.apply(this, arguments)
      used = true
    }
  },

  before (a, b) {
    return function () {
      b.apply(this, arguments)
      return a.apply(this, arguments)
    }
  }
}
