'use strict'

const patchEmitter = require('event-unshift')
const extend = require('util')._extend
const shimmer = require('shimmer')
const url = require('url')
const os = require('os')
const semver = require('semver')
const ao = require('..')
const Span = ao.Span
const Event = ao.Event

const log = ao.loggers

const defaultPort = {
  https: 443,
  http: 80
}

module.exports = function (module, protocol) {
  protocol = protocol || 'http'
  patchServer(module, protocol)
  patchClient(module, protocol)
  return module
}

function patchClient (module, protocol) {
  const name = protocol + '-client'
  const conf = ao.probes[name]

  function isHttpsFromHttp (options) {
    return protocol === 'http' && options._defaultAgent
  }

  // wrapper is used for http and https request but only http get. the
  // http.get function in node 8 does not call exports.request, so patching
  // request is not sufficient.
  const wrapper = fn => function (options, callback) {
    // If not tracing, disabled or a call from https.request, just bind
    const last = Span.last
    if (!last || !conf.enabled || isHttpsFromHttp(options)) {
      return fn(options, ao.bind(callback))
    }

    let span
    let data
    try {
      // Create the span entity first
      span = last.descend(name)
      span.async = true

      // Parse options object
      if (typeof options === 'string') {
        options = url.parse(options)
      }
      const parsed = extend({}, options)

      // Add X-Trace header to trace hops
      options.headers = options.headers || {}
      options.headers['X-Trace'] = span.events.entry.toString()

      // Set default protocol
      parsed.protocol = parsed.protocol || protocol + ':'

      // Fix wrong options structure for formatting url
      const i = parsed.path.indexOf('?')
      parsed.pathname = parsed.path.slice(0, i)
      parsed.search = parsed.path.slice(i)

      // Remove query properties when filtering
      if (!conf.includeRemoteUrlParams) {
        delete parsed.search
        delete parsed.query
      }

      // Send entry event
      data = {
        Spec: 'rsc',
        IsService: 'yes',
        RemoteURL: url.format(parsed),
        HTTPMethod: (options.method || 'GET').toUpperCase()
      }

      if (conf.collectBacktraces) {
        data.Backtrace = ao.backtrace()
      }
    } catch (e) {
      log.error('error in http-client request shim', e)
    }

    let ret
    ao.requestStore.run(() => {
      span.enter(data)

      // Do request
      ret = fn(options, callback)

      try {
        // Patch emitter
        patchEmitter(ret)

        // Report socket errors
        ret.unshift('error', error => span.error(error))

        // Ensure our exit is pushed to the FRONT of the event list
        ret.unshift('response', res => {
          // Continue from X-Trace header, if present
          const xtrace = res.headers['x-trace']
          // validate that task ID matches and op ID is not all zeros.
          if (xtrace) {
            // get this span's entry event's xtrace ID.
            const md = span.events.entry.toString()
            // let the task ID include the '2B' because both must match
            const task = xtrace.slice(0, 42)

            // if the xtrace ID returned is valid (same version and task ID with non-zero op ID)
            // then add it as an edge if the sample bit is set.
            if (
              md.indexOf(task) === 0
              && xtrace.indexOf('0000000000000000', 42) !== 42
              && ao.sampling(xtrace)
            ) {
              span.events.exit.edges.push(xtrace);
            }
          }

          // Patch emitter
          patchEmitter(res)

          // Report socket errors
          res.unshift('error', error => last.error(error))

          // Send exit event with response status
          span.exit({
            HTTPStatus: res.statusCode
          })
        })
      } catch (e) {
        log.error('cannot patch http-client request emitter')
      }
    })

    return ret
  }

  // wrap request for http and https
  shimmer.wrap(module, 'request', wrapper)

  // only wrap get for http if at least node 8
  if (protocol === 'http' && semver.satisfies(process.version, '>=8')) {
    shimmer.wrap(module, 'get', wrapper)
  }

}

//
// patch the server - it creates a root span
//
function patchServer (module, protocol) {
  const conf = ao.probes[protocol]

  const fowardedHeaders = [
    'X-Forwarded-For',
    'X-Forwarded-Host',
    'X-Forwarded-Port',
    'X-Forwarded-Proto'
  ]

  const proto = module.Server && module.Server.prototype

  // Intercept 'request' event to trigger http entry
  shimmer.wrap(proto, 'emit', realEmit => function (type, req, res) {
    if (type !== 'request') {
      return realEmit.apply(this, arguments)
    }

    // if it is undefined make it a string
    let xtrace = req.headers['x-trace'] || ''

    // if there is an xtrace header see if it is good by trying
    // to convert it to metadata.
    let md
    if (xtrace) {
      md = ao.stringToMetadata(xtrace)
      // if it isn't a valid xtrace set it to an empty string. if it
      // is valid then ask for a sampling decision based on it, and
      // reset the xtrace ID's sample flag as needed
      if (!md || xtrace.indexOf('0000000000000000', 42) === 42) {
        log.warn('invalid X-Trace header received: %s', xtrace)
        xtrace = ''
      } else {
        // span ('nodejs') must match makeSpan()
        const sample = ao.sample('nodejs', xtrace)
        // if the sample flag is already correct avoid allocating
        // a new string for the xtrace. also, no need to set the
        // flag.
        if (sample.sample !== md.getSampleFlag()) {
          md.setSampleFlagTo(sample.sample)
          xtrace = md.toString()
        }
      }
    }

    const args = arguments

    try {
      // Patch request and response emitters to support unshifting
      patchEmitter(req)
      patchEmitter(res)
      patchEmitter(res.socket)

      /*
      // Bind streams to the request store
      ao.bindEmitter(req)
      ao.bindEmitter(res)
      // */
    } catch (e) {
      log.error('http failed to patch request', e)
    }

    let ret
    ao.requestStore.run(() => {
      try {
        // Bind streams to the request store now that there is a context.
        ao.bindEmitter(req)
        ao.bindEmitter(res)

        // TODO BAM make this use md, not string. must rethink
        // whole new Span() because the type of the xtrace is
        // an implicit parameter to the function, e.g., if it is
        // a string then it asks for a sample decision.
        const span = res._ao_http_span = makeSpan(req, xtrace)

        // get milliseconds for metrics.
        res._ao_metrics = {start: new Date().getTime()}

        // add a counter to track how many times a custom name's been set
        res._ao_metrics.customNameFuncCalls = 0

        // start keeping the metrics information in CLS. do so in parallel
        // to until verified that it is correct.
        //ao.requestStore.set('metrics', res._ao_metrics)

        // Keep upper-most span for later
        // TODO BAM this is for RUM only and should be removed.
        ao.requestStore.set('topSpan', span)

        getRequestHeaders(span, req)
        setResponseHeaders(span, res)
        wrapRequestResponse(span, req, res)
      } catch (e) {
        log.error('error building http-server span', e)
      }

      ret = realEmit.apply(this, args)
    })

    return ret
  })

  function getHost (req) {
    return (req.headers.host || os.hostname()).split(':')[0]
  }

  function getPort (req) {
    const {host} = req.headers
    return Number(host ? host.split(':')[1] : defaultPort[protocol])
  }

  function getPath ({url}) {
    return conf.includeRemoteUrlParams ? url : url.replace(/\?.*/, '')
  }

  function makeSpan (req, xtrace) {
    return new Span('nodejs', xtrace, {
      'Spec': 'ws',
      'ClientIP': req.socket.remoteAddress,
      'HTTP-Host': getHost(req),
      'Port': getPort(req),
      'Method': req.method,
      'URL': getPath(req),
      'Proto': protocol
    })
  }

  function getRequestHeaders (span, req) {
    // Get entry event
    const {entry} = span.events
    const {headers} = req

    // Add forwarded headers
    fowardedHeaders.forEach(name => {
      const toForward = headers[name.toLowerCase()]
      if (toForward) entry[name.replace(/^X-/, '')] = toForward
    })

    // Upstream latency
    const requestStart = headers['x-request-start'] || headers['x-queue-start']
    if (requestStart) entry['Request-Start'] = requestStart

    const queueTime = headers['x-queue-time']
    if (queueTime) entry['Queue-Time'] = queueTime

    // Add some extra KV pairs to the entry event of the span
    if (ao.sampling(entry)) {
      entry.SampleRate = ao.sampleRate
      entry.SampleSource = ao.sampleSource
    }
  }

  function setResponseHeaders (span, res) {
    const {exit} = span.events
    Object.defineProperty(exit, 'ignore', {value: true})
    res.setHeader('X-Trace', exit.toString())
  }

  function wrapRequestResponse (span, req, res) {
    // Report socket errors
    req.unshift('error', error => span.error(error))
    res.unshift('error', error => span.error(error))

    // Ensure response is patched and add exit finalizer
    ao.patchResponse(res)
    ao.addResponseFinalizer(res, () => {
      const {last} = Event
      if (last && last !== span.events.entry && !last.Async) {
        span.events.exit.edges.push(last)
      } else if (!last) {
        log.debug('http.addResponseFinalizer - no last event')
      }

      // set TransactionName now as it could have been set by Express or
      // another framework. If it wasn't set then the URL is also sent
      // and oboe will do the right thing.
      const exitKeyValuePairs = {
        TransactionName: res._ao_metrics.txname,
        Status: res.statusCode
      }

      const args = {
        txname: res._ao_metrics.txname,
        url: req.url,
        domain: ao.cfg.domainPrefix ? ao.getDomainPrefix(req) : '',
        duration: (new Date().getTime() - res._ao_metrics.start) * 1000,
        status: res.statusCode,
        method: req.method,
        error: res.statusCode >= 500 && res.statusCode <= 599
      }

      // send the span. it replies with the txname that was actually used or
      // falsey on an error.
      const txname = ao.reporter.sendHttpSpan(args);

      if (txname !== args.txname) {
        log.warn(
          'sendHttpSpan() changed TransactionName from %s to %s',
          args.txname,
          txname
        )
      }

      // what to do if an error sending? don't know transaction name but shouldn't
      // matter, so don't use the return value.
      if (txname) {
        exitKeyValuePairs.TransactionName = txname
      } else {
        log.error('sendHttpSpan() returned empty TransactionName')
      }

      span.exit(exitKeyValuePairs)

    })

    span.enter()
  }

  return module
}
