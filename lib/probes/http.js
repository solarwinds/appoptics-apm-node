'use strict'

const patchEmitter = require('event-pre-handler')
const shimmer = require('ximmer')
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

  //
  // wrapper is used for http and https request and sometimes get.
  //
  const wrapper = fn => function (...args) {
    // If no context just execute the fn with an unbound callback
    // else execute the function with a bound callback.
    const last = Span.last
    if (!last) {
      return fn(...args)
    }

    let options = {}

    // the first argument might be a string or an url.URL
    if (typeof args[0] === 'string') {
      const urlString = args.shift()
      options = url.parse(urlString)
    } else if (args[0] instanceof url.URL || args[0].searchParams) {
      options = urlToOptions(args.shift())
    }

    if (args[0] && typeof args[0] !== 'function') {
      options = Object.assign(options, args.shift())
    }

    if (typeof args[args.length - 1] === 'function') {
      args[args.length - 1] = ao.bind(args[args.length - 1])
    }

    // put the options back into args.
    args.unshift(options)
    if (!conf.enabled || isHttpsFromHttp(options)) {
      return fn(...args)
    }

    let span
    let data
    try {
      // Create the span entity first
      span = last.descend(name)
      span.async = true

      // Add X-Trace header to trace hops
      options.headers = options.headers || {}
      options.headers['X-Trace'] = span.events.entry.toString()

      // Set default protocol
      options.protocol = options.protocol || protocol + ':'

      let filtered = options
      // Fix wrong options structure for formatting url
      //*
      const i = filtered.path.indexOf('?')
      filtered.pathname = filtered.path.slice(0, i)
      filtered.search = filtered.path.slice(i)
      // */

      // Remove query properties if filtering
      if (!conf.includeRemoteUrlParams) {
        filtered = Object.assign({}, options)
        filtered.search = ''
        filtered.query = ''
      }

      // Send entry event
      data = {
        Spec: 'rsc',
        IsService: 'yes',
        RemoteURL: url.format(filtered),
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

      // Do request. args will be different than the caller's original args
      // if no options argument was supplied because we need to add an
      // x-trace header and that requires an options argument.
      ret = fn(...args)

      try {
        // Patch emitter
        patchEmitter(ret)

        // Report socket errors
        ret._preHandle('error', error => span.error(error))

        // Ensure our exit is pushed to the FRONT of the event list
        ret._preHandle('response', res => {
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
          res._preHandle('error', error => last.error(error))

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

  // in node 8 http.get() no longer calls the exported http.request()
  // so it must be wrapped in addition to wrapping request. in
  // node 9.9.0 https.get() no longer calls the exported https.request()
  // so it must also be wrapped.
  // TODO BAM - consider wrapping _http_client.ClientRequest() where all
  // client requests get created.
  if (semver.gte(process.version, '8.0.0')) {
    if (protocol === 'http' || semver.gte(process.version, '9.9.0')) {
      shimmer.wrap(module, 'get', wrapper)
    }
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
        log.warn(`invalid X-Trace header received ${xtrace}`)
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
    let port
    if (host) {
      port = host.split(':')[1]
    }
    if (!port) {
      port = defaultPort[protocol]
    }
    return Number(port)
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
    req._preHandle('error', error => span.error(error))
    res._preHandle('error', error => span.error(error))

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

      // they have to match (except for the domain prefix)
      if (txname && args.txname && txname !== args.txname
        && ao.cfg.domainPrefix
        && txname.indexOf(args.txname) + args.txname.length !== txname.length) {
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

// Taken from node sources lib/internal/url.js
//
// Utility function that converts a URL object into an ordinary
// options object as expected by the http.request and https.request
// APIs.
function urlToOptions (url) {
  const options = {
    protocol: url.protocol,
    hostname: url.hostname.startsWith('[') ?
      url.hostname.slice(1, -1) :
      url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname}${url.search}`,
    href: url.href
  };
  if (url.port !== '') {
    options.port = Number(url.port);
  }
  if (url.username || url.password) {
    options.auth = `${url.username}:${url.password}`;
  }
  return options;
}
