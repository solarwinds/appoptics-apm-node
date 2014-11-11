
// Graceful failure
var oboe
try { oboe = require('./addon') }
catch (e) {
  console.warn(e.message)
  return
}

var debug = require('debug')
var log = debug('traceview:settings')
var cls = require('continuation-local-storage')
var extend = require('util')._extend
var crypto = require('crypto')
var path = require('path')
var os = require('os')
var fs = require('fs')


//
// Create a reporter
// 
var reporter
try {
  reporter = exports.reporter = new oboe.UdpReporter()
} catch (e) {
  log('Reporter unable to connect')
}


//
// Abstract settings with setters and getters
//
var traceMode, sampleRate, sampleSource, host, port, accessKey

// Set accessKey, which also sets rumId
Object.defineProperty(exports, 'accessKey', {
  get: function () { return accessKey },
  set: function (value) {
    accessKey = value

    // Generate base64-encoded SHA1 hash of accessKey
    exports.rumId = crypto.createHash('sha1')
      .update('RUM' + value)
      .digest('base64')
      .replace(/\+/g,'-')
      .replace(/\//g,'_')
  }
})

// Helper to map strings to addon keys
var modeMap = {
  through: oboe.TRACE_THROUGH,
  always: oboe.TRACE_ALWAYS,
  never: oboe.TRACE_NEVER
}

// Adjust tracing mode
Object.defineProperty(exports, 'traceMode', {
  get: function () { return traceMode },
  set: function (value) {
    if (typeof value !== 'number') {
      value = modeMap[value]
    }
    log('set tracing mode to ' + value)
    oboe.Context.setTracingMode(value)
    traceMode = value
  }
})

// Adjust sample rate
Object.defineProperty(exports, 'sampleRate', {
  get: function () { return sampleRate },
  set: function (value) {
    log('set sample rate to ' + value)
    oboe.Context.setDefaultSampleRate(value)
    sampleRate = value
  }
})

// Adjust sample source
Object.defineProperty(exports, 'sampleSource', {
  get: function () { return sampleSource },
  set: function (value) {
    sampleSource = value
  }
})

// If host or port changes, the reporter is regenerated automatically
Object.defineProperty(exports, 'host', {
  get: function () { return reporter.host },
  set: function (value) {
    if (value !== host) {
      try {
        reporter.host = value
      } catch (e) {
        log('Reporter unable to connect')
      }
    }
  }
})
Object.defineProperty(exports, 'port', {
  get: function () { return reporter.port },
  set: function (value) {
    if (value !== port) {
      try {
        reporter.port = value
      } catch (e) {
        log('Reporter unable to connect')
      }
    }
  }
})

// Sugar to detect if the current mode is of a particular type
Object.keys(modeMap).forEach(function (mode) {
  Object.defineProperty(exports, mode, {
    get: function () { return traceMode === modeMap[mode] }
  })
})


//
// Set default settings
//
exports.traceMode = 'through'


//
// Load config file, if present
//
var config
try {
  config = require(process.cwd() + '/traceview')
  extend(exports, config)
} catch (e) {
  config = {}
}

var moduleConfigs = {
  mongodb: {
    enabled: true,
    collectBacktraces: true
  },
  'http-client': {
    enabled: true,
    collectBacktraces: true
  },
  'https-client': {
    enabled: true,
    collectBacktraces: true
  },
  mysql: {
    enabled: true,
    collectBacktraces: true
  },
  pg: {
    enabled: true,
    collectBacktraces: true
  },
  'node-cassandra-cql': {
    enabled: true,
    collectBacktraces: true
  },
  'cassandra-driver': {
    enabled: true,
    collectBacktraces: true
  }
}

// Mix module-specific configs onto the object
Object.keys(moduleConfigs).forEach(function (mod) {
  exports[mod] = moduleConfigs[mod]
  extend(exports[mod], config[mod] || {})
})

// If a log list is provided, enable logging for all patterns
if (typeof exports.log === 'string') {
  exports.log = exports.log.split(',')
}
if (Array.isArray(exports.log)) {
  var keys = exports.log.map(function (pattern) {
    return 'traceview:' + pattern
  }).join(',')

  var flag = process.env.DEBUG
  if (flag) {
    keys = flag + ',' + keys
  }

  debug.enable(keys)
}

//
// If accessKey was not defined in the config file, attempt to locate it
//
if ( ! accessKey) {
  var cuuid = process.env.TRACEVIEW_CUUID
  if (cuuid) {
    exports.accessKey = cuuid
  } else {
    // Attempt to find access_key in tracelyzer configs
    var configFile = '/etc/tracelytics.conf'
    if (fs.existsSync(configFile)) {
      var contents = fs.readFileSync(configFile)
      var lines = contents.toString().split('\n')

      // Check each line until we find a match
      var line
      while ((line = lines.shift())) {
        if (/^tracelyzer.access_key=/.test(line) || /^access_key/.test(line)) {
          var parts = line.split('=')
          exports.accessKey = parts[1].trim()
          break
        }
      }
    }
  }
}

//
// Use continuation-local-storage to follow traces through a request
//
Object.defineProperty(exports, 'requestStore', {
  get: function () {
    return (
      cls.getNamespace('tv-request-store')
      || cls.createNamespace('tv-request-store')
    )
  }
})

// Detect if there is a running trace
Object.defineProperty(exports, 'tracing', {
  get: function () { return !!exports.trace }
})
Object.defineProperty(exports, 'trace', {
  get: function () { return Event.last }
})


//
// Generate a backtrace string
//
exports.backtrace = function (n)  {
  var e = new Error('backtrace')
  return e.stack.replace(/^.*\n\s*/, '').replace(/\n\s*/g, '\n')
}


//
// Sample a request
//
exports.sample = function (layer, xtrace, meta) {
  var rv = oboe.Context.sampleRequest(layer, xtrace || '', meta || '')
  if ( ! rv[0]) return false
  exports.sampleSource = rv[1]
  exports.sampleRate = rv[2]
  return rv
}


//
// Expose lower-level components
//
var Layer = require('./layer')
var Event = require('./event')
var Profile = require('./profile')
exports.addon = oboe
exports.Profile = Profile
exports.Layer = Layer
exports.Event = Event


//
// Send __Init event
//
process.nextTick(function () {
  exports.requestStore.run(function () {
    var data = {
      '__Init': 1,
      'Layer': 'nodejs',
      'Label': 'entry',
      'Node.Version': process.versions.node,
      'Node.V8.Version': process.versions.v8,
      'Node.LibUV.Version': process.versions.uv,
      'Node.OpenSSL.Version': process.versions.openssl,
      'Node.Ares.Version': process.versions.ares,
      'Node.ZLib.Version': process.versions.zlib,
      'Node.HTTPParser.Version': process.versions.http_parser,
      'Node.Oboe.Version': require('../package.json').version,
    }

    var base = path.join(process.cwd(), 'node_modules')
    fs.readdirSync(base).forEach(function (mod) {
      if (mod === '.bin') return
      var pkg = require(base + '/' + mod + '/package.json')
      data['Node.Module.' + pkg.name] = pkg.version
    })

    var layer = new Layer('nodejs', null, data)
    layer.enter()
    layer.exit()
  })
})


//
// Enable require monkey-patcher
//
var patcher = require('./require-patch')
patcher.enable()
