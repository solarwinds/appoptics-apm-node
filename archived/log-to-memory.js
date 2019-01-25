// snippets of log to memory for issues with file IO during testing
/*
let toMemory = false

exports.logToMemory = function (onOff) {
  if (onOff === 'on' && !toMemory) {
    const logbuf = Buffer.alloc(1000000, 0, 'utf8')
    let bufpos = 0

    // tell debug to use this function, not the default console function
    debug.log = function (...args) {
      args.forEach(arg => {
        if (arg === undefined) return
        const text = arg.toString() + '\n'
        bufpos += logbuf.write(text, bufpos)

      })
    }

    exports._buffer = {
      getString: function () {
        return logbuf.toString('utf8', 0, bufpos)
      },
      clear: function () {
        bufpos = 0
      },
      write: function (text) {
        if (!text) return
        bufpos += logbuf.write(text + '\n', bufpos)
      },
      status: function () {
        return {count: bufpos, buffer: logbuf}
      },
      getPosition: function () {
        return bufpos
      },
      setPosition: function (position) {
        bufpos = position
      }
    }
    toMemory = true
    // return previous value
    return 'off'
  } else if (onOff === 'off' && toMemory) {
    exports._buffer = {
      getString: function () { },
      clear: function () { },
      write: function () { },
      status: function () { return {} },
      getPosition: function () { return 0 },
      setPosition: function () { }
    }
    toMemory = false
    // return previous state
    return 'on'
  } else {
    // invalid setting or already at setting; return current state
    return toMemory ? 'on' : 'off'
  }

}

// */