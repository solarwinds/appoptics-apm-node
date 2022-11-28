'use strict'

const shimmer = require('shimmer')
const url = require('url')
const os = require('os')

const ao = require('..')
const w3cTraceContext = require('../w3c-trace-context')

const log = ao.loggers
// avoid issuing too many errors on bad transactions
const dbSendError = new log.Debounce('error')

const ule = Symbol('UnexpectedLastEvent')

const defaultPort = {
  https: 443,
  http: 80
}

module.exports = function (module, options, protocol = 'http') {
  patchServer(module, options, protocol)
  patchClient(module, options, protocol)
  return module
}

function patchClient (module, options, protocol) {
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
    const last = ao.lastSpan
    if (!last) {
      return fn(...args)
    }

    let options = {}

    // the first argument might be a string or an url.URL
    if (typeof args[0] === 'string') {
      const urlString = args.shift()
      options = url.parse(urlString)
    } else if (typeof url.URL === 'function' && (args[0] instanceof url.URL || args[0].searchParams)) {
      options = urlToOptions(args.shift())
    } else if (typeof url.URL !== 'function') {
      log.error('url.URL is not a function, url keys:', url === undefined ? 'undefined' : Object.keys(url))
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

      // generate w3c headers from event data
      const w3c = w3cTraceContext.prepHeaders({
        traceparent: span.events.entry.toString(),
        tracestate: ao.requestStore.get('tracestatestate')
      })
      options.headers = options.headers || {}
      // Add traceparent/tracestate header to trace hops unless omit is set. this should be set when a package
      // checksums headers. if there is no error, it's not generally a problem, but on errors a
      // retry will get a different x-trace value and will fail authentication at the remote end.
      // this was added to handle the AWS api.
      if (!options.headers[ao.omitTraceId]) {
        options.headers.traceparent = w3c.traceparent
        options.headers.tracestate = w3c.tracestate
      }

      // Set default protocol
      options.protocol = options.protocol || protocol + ':'

      // don't modify the callers options
      const filtered = Object.assign({}, options)

      // Fix wrong options structure for formatting url
      let i = filtered.path.indexOf('?')
      if (i < 0) {
        i = filtered.path.length
      }
      filtered.pathname = filtered.path.slice(0, i)
      filtered.search = filtered.path.slice(i + 1)

      // Remove query properties if filtering
      if (!conf.includeRemoteUrlParams) {
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

      if (conf.collectBacktraces && last.doSample) {
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
        // make sure the span is exited on a socket error.
        ret.prependListener('error', error => {
          span.error(error)
          span.exit()
        })
        // it doesn't appear that this needs to listen for the 'abort' event.
        // in all cases i've been able to reproduce either the 'end' or the
        // 'error' event is called.

        // Handle Websocket upgrade
        ret.prependListener('upgrade', (res, socket, head) => {
          // and exit the span immediately. it's not possible to know how long
          // the websocket session will exist. documentation-wise we'll need
          // to note that we only instrument the upgrade and that any
          // instrumentation of transactions over an open web socket must use
          // the custom instrumentation API. also note that if the server
          // provides a bad sec-websocket-accept header value then the client
          // can (and should) reject the connection but we won't know that here
          // because the 'upgrade' listener is expected to perform that check.
          //
          // the upgrade event is only emitted if the status code is 101 so it
          // be hardcoded. but the message is whatever the server sets it to.
          span.exit({
            Message: res.statusMessage || 'Upgrading HTTP connection to websocket',
            HTTPStatus: res.statusCode
          })
        })

        // Ensure our exit is pushed to the FRONT of the event list
        ret.prependListener('response', res => {
          // Continue from X-Trace header, if present
          const xtraceHeader = res.headers['x-trace']

          // validate that task ID matches and op ID is not all zeros.
          if (xtraceHeader) {
            // get this span's entry event's xtrace ID.
            const md = span.events.entry.toString()
            // let the task ID include the '2B' because both must match
            const task = xtraceHeader.slice(0, 42)

            // if the xtrace ID returned is valid (same version and task ID with non-zero op ID)
            // then add it as an edge if the sample bit is set.
            if (
              md.indexOf(task) === 0 &&
              xtraceHeader.indexOf('0000000000000000', 42) !== 42 &&
              ao.sampling(xtraceHeader)
            ) {
              span.events.exit.edges.push(xtraceHeader)
            }
          }

          // report socket errors. only the 'error' event is needed for this.
          // the 'aborted' event can occur if req.abort() is called but that
          // doesn't matter because the 'response' event has already occurred.
          res.prependListener('error', error => {
            last.error(error)
          })

          // Send exit event with response status
          span.exit({
            HTTPStatus: res.statusCode
          })
        })
      } catch (e) {
        log.error('cannot patch http-client request emitter', e)
      }
    })

    return ret
  }

  // wrap request for http and https
  shimmer.wrap(module, 'request', wrapper)

  // TODO BAM - consider wrapping _http_client.ClientRequest() where all
  // client requests get created.
  shimmer.wrap(module, 'get', wrapper)
}

//
// patch the server - it creates a topLevel span
//
function patchServer (module, options, protocol) {
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
    //
    // ignore upgrade requests. it's possible to create a span and exit it
    // immediately but there is little value in that. the challenge is that
    // it's not a normal node http response that is returned - it's an http
    // response written as a stream to a socket. in order to capture useful
    // information (how long, status, etc.) socket.write() would need to be
    // patched and the agent code would need to capture the response from
    // the byte stream. while it's doable it's very invasive and doesn't add
    // much value. the client span will see the timing and the status. and
    // if the goal is to add distributed tracing to the upgrade request the
    // agent would need to insert an x-trace id into the socket byte stream
    // which is even more invasive.
    //
    if (type !== 'request' || !conf.enabled) {
      return realEmit.apply(this, arguments)
    }

    // setup for metrics
    res._ao_metrics = { doMetrics: true }

    // get xtrace options headers too. these are used for trigger-trace,
    // i.e., forcing a trace, as well as providing KV pairs to be added
    // to a trace.
    const xtraceOpts = req.headers['x-trace-options']
    const xtraceOptsSig = req.headers['x-trace-options-signature']

    const xtraceOptsHash = {}
    let xtraceOptsResponse = ''
    const ignoredKeys = []

    let ttRequested = false
    let xtraceOptsTimestamp = 0

    if (xtraceOpts) {
      // when keys are consumed from xtraceOptsHash they are deleted so that when done
      // processing valid keys those remaining are the ignored keys.
      xtraceOpts.split(';').forEach(s => {
        // use indexOf rather than split because 'custom-name=abc=xyz' is valid. also,
        // trigger trace is not a KV pair, just the value 'trigger-trace'.
        s = s.trim()
        if (!s) {
          return
        }
        const ix = s.indexOf('=')
        let key
        let value
        if (ix < 0) {
          key = s
        } else {
          key = s.substring(0, ix).trim()
          value = s.substring(ix + 1).trim()
        }
        // no spaces in keys and use the first instance if a key is repeated.
        if (key.indexOf(' ') >= 0) {
          ignoredKeys.push(key)
        } else if (!(key in xtraceOptsHash)) {
          xtraceOptsHash[key] = value
        }
      })

      // now check for trigger trace. it's only valid without a value, e.g., trigger-trace=1 is
      // *not* valid.
      if ('trigger-trace' in xtraceOptsHash && xtraceOptsHash['trigger-trace'] === undefined) {
        ttRequested = true
        delete xtraceOptsHash['trigger-trace']
      }

      // if there is a timestamp then try to convert it to an integer. Use Number()
      // because parseInt() will yield a valid number even if there is only one digit
      // followed by non-digits.
      if (xtraceOptsHash.ts) {
        xtraceOptsTimestamp = Number(xtraceOptsHash.ts)
        if (Number.isNaN(xtraceOptsTimestamp)) {
          xtraceOptsTimestamp = 0
        }
        delete xtraceOptsHash.ts
      }
    }

    // these settings are the options for getTraceSettings().
    const settingsOptions = {
      typeRequested: ttRequested ? 1 : 0,
      xtraceOpts: xtraceOpts || '',
      xtraceOptsSig: xtraceOptsSig || '',
      xtraceOptsTimestamp,
      customTriggerMode: ao.cfg.triggerTraceEnabled ? 1 : 0
    }

    // add any URL filter (if none will be undefined which is ignored).
    settingsOptions.mode = getUrlFilterMode(req)

    // take whatever headers received and create a full w3c set from them
    const w3c = w3cTraceContext.fromHeaders(req.headers)
    const reqType = w3cTraceContext.reqType(req.headers)

    // traceparent will be defined in any case where either x-trace or transparent are received via header
    // validate by creating an event.
    const traceparent = ao.traceToEvent(w3c.traceparent) ? w3c.traceparent : ''

    // get decisions about sampling, metrics, trigger-trace, etc. i.e., life,
    // the universe, and everything.
    // note:
    // the call goes via api and bindings abstractions to liboboe
    // it is the only interface to liboboe's oboe_tracing_decisions and the only such call in this probe.
    // it is also the only such call in any probe.
    const settings = ao.getTraceSettings(traceparent, w3c.liboboeTracestate, settingsOptions)

    const args = arguments

    // if there is leftover context around log it. this appears to be because
    // a previous context has not received the destroy callback in the context
    // manager but until the issue is resolved debug output provides clues.
    if (ao.lastEvent) {
      log.debug('http: ule %e', ao.lastEvent)
      res[ule] = ao.lastEvent
    }

    // ao.requestStore.run(fn, {newContext: true}) forces a new context that doesn't
    // inherit from an existing context. that prevents any leftover context from affecting
    // this trace.
    let ret
    ao.requestStore.run(() => {
      try {
        // Bind streams to the request store now that there is a context.
        ao.bindEmitter(req)
        ao.bindEmitter(res)

        const kvpairs = {
          Spec: 'ws',
          ClientIP: getClientIP(req, conf),
          'HTTP-Host': getHost(req),
          Port: getPort(req),
          HTTPMethod: req.method,
          URL: getPath(req),
          Proto: protocol
        }

        // sw.w3c.tracestate is only set for Downstream requests when there is value to set (spec case 5)
        if (reqType === 'Downstream' && w3c.tracestate) {
          kvpairs['sw.w3c.tracestate'] = w3c.tracestate
        }

        // sw.tracestate_parent_id is only set for Flow and Continuation requests (spec case 4).
        if (reqType === 'Continuation' || reqType === 'Flow') {
          kvpairs['sw.tracestate_parent_id'] = w3c.savedSpanId
        }

        // keep tracestate so that it can be picked by client and forwarded downstream
        ao.requestStore.set('tracestatestate', w3c.tracestate)

        // helper to add x-trace-options-specified keys to the kvpairs.
        function addKeysToKVPairs () {
          if (xtraceOptsHash['pd-keys']) {
            kvpairs.PDKeys = xtraceOptsHash['pd-keys']
            delete xtraceOptsHash['pd-keys']
          }
          for (const k in xtraceOptsHash) {
            if (k.startsWith('custom-')) {
              kvpairs[k] = xtraceOptsHash[k]
              delete xtraceOptsHash[k]
            }
          }
        }

        // if there is an x-trace-options header set an x-trace-options-response header. if there
        // is an x-trace we need to handle the response as oboe doesn't generate appopriate responses
        // for those cases. in that case if the authStatus is OK then fill out the rest the response.
        if (xtraceOpts) {
          const responseParts = []

          // if there is an auth message we always generate a reply.
          if (xtraceOptsSig) {
            responseParts.push(`auth=${settings.authMessage}`)
          }

          // if there is an x-trace header then oboe does not generate the message. if there is not an
          // x-trace header then oboe's message should be right.
          if (traceparent) {
            if (settings.typeProvisioned !== 0) {
              // eslint-disable-next-line max-len
              log.warn(`x-trace with x-trace-options provisioned as ${settings.typeProvisioned} authStatus = ${settings.authStatus}`)
            }
            if (settings.authStatus <= 0) {
              responseParts.push(`trigger-trace=${ttRequested ? 'ignored' : 'not-requested'}`)
            }
            addKeysToKVPairs()
          } else if (settings.authStatus <= 0) {
            responseParts.push(`trigger-trace=${ttRequested ? settings.message : 'not-requested'}`)
            if (ttRequested) {
              kvpairs.TriggeredTrace = true
            }
            addKeysToKVPairs()
            // finally add any ignored keys to the response header
            const ignored = ignoredKeys.concat(Object.keys(xtraceOptsHash)).join(',')
            if (ignored) {
              responseParts.push(`ignored=${ignored}`)
            }
          }

          xtraceOptsResponse = responseParts.join(';')
        }

        const span = res._ao_http_span = ao.Span.makeEntrySpan('nodejs', settings, kvpairs)

        // add a counter to track how many times a custom name's been set
        res._ao_metrics.customNameFuncCalls = 0

        // TODO BAM start keeping the metrics information in CLS. do so in parallel
        // until verified that it is correct.
        // ao.requestStore.set('metrics', res._ao_metrics)

        getRequestHeaders(span, req)
        setResponseHeaders(span, res, xtraceOptsResponse)
        wrapRequestResponse(span, req, res)

        // reset start time for metrics after all our work is done.
        res._ao_metrics.start = Date.now()
      } catch (e) {
        // make sure a metrics start time is set even if an error occurs.
        res._ao_metrics.start = Date.now()
        log.error('error building http-server span', e)
      }

      ret = realEmit.apply(this, args)
    }, { newContext: true })

    return ret
  })

  function getClientIP (req, conf) {
    let ClientIP = req.socket.remoteAddress

    if (conf['client-ip-header'] && req.headers[conf['client-ip-header']]) {
      ClientIP = req.headers[conf['client-ip-header']]
    }
    // KV set logs an error if undefined.
    if (!ClientIP) ClientIP = ''

    return ClientIP
  }

  function getHost (req) {
    return (req.headers.host || os.hostname()).split(':')[0]
  }

  function getPort (req) {
    const { host } = req.headers
    let port
    if (host) {
      port = host.split(':')[1]
    }
    if (!port) {
      port = defaultPort[protocol]
    }
    return Number(port)
  }

  function getPath ({ url }) {
    return conf.includeRemoteUrlParams ? url : url.replace(/\?.*/, '')
  }

  function getRequestHeaders (span, req) {
    // Get entry event
    const { entry } = span.events
    const { headers } = req

    // Add forwarded headers
    fowardedHeaders.forEach(name => {
      const toForward = headers[name.toLowerCase()]
      if (toForward) entry.kv[name.replace(/^X-/, '')] = toForward
    })

    // Upstream latency
    const requestStart = headers['x-request-start'] || headers['x-queue-start']
    if (requestStart) entry.kv['Request-Start'] = requestStart

    const queueTime = headers['x-queue-time']
    if (queueTime) entry.kv['Queue-Time'] = queueTime
  }

  function setResponseHeaders (span, res, optionsResponse) {
    const { exit } = span.events
    exit.ignore = true
    res.setHeader('X-Trace', exit.toString())

    if (optionsResponse) {
      res.setHeader('X-Trace-Options-Response', optionsResponse)
    }
  }

  function wrapRequestResponse (span, req, res) {
    // Report socket errors
    req.prependListener('error', error => span.error(error))
    res.prependListener('error', error => span.error(error))

    // there shouldn't be any context here. cls.run() has been called to create
    // a new context. but don't log again if it's the same last-event as was seen
    // previously.
    if (ao.lastEvent && ao.lastEvent !== res[ule]) {
      log.debug('http.wrapRequestResponse: ule %e', ao.lastEvent)
    }

    // Ensure response is patched and add exit finalizer
    ao.patchResponse(res)

    // use requestStore.bind() because there should be no context here and
    // there isn't a need to check whether the argument really is a function.
    ao.addResponseFinalizer(res, ao.requestStore.bind(() => {
      const last = ao.lastEvent
      if (last === res[ule]) {
        log.debug('http.responseFinalizer: ule lingering - ao.lastEvent %e', last)
      }

      if (last && last !== span.events.entry && !last.Async) {
        span.events.exit.edges.push(last)
      } else if (!last) {
        log.debug('http.addResponseFinalizer - no last event')
      }

      const exitKeyValuePairs = {
        Status: res.statusCode
      }

      // if an exception is thrown within the koa framework and no
      // user code handles it then koa's default handler clears any
      // headers that have already been set. this means we can't return
      // a header to the client so check and set if necessary. checking
      // headers sent is necessary or an error could be thrown; checking
      // whether the header is already set appears cheaper than formatting
      // the event and going through node's validation logic for setting a
      // header.
      if (!res.headersSent && !res.getHeader('x-trace')) {
        res.setHeader('x-trace', span.events.exit.toString())
      }

      // if this trace has metrics enabled then send them.
      if (span.doMetrics) {
        // set this value only if doing metrics.
        exitKeyValuePairs.TransactionName = res._ao_metrics.txname

        if (!res._ao_metrics.start) {
          log.error(`res._ao_metrics.start invalid value: ${res._ao_metrics.start}`)
        }

        const args = {
          txname: res._ao_metrics.txname,
          url: req.url,
          domain: ao.cfg.domainPrefix ? ao.getDomainPrefix(req) : '',
          duration: (Date.now() - res._ao_metrics.start) * 1000,
          status: res.statusCode,
          method: req.method,
          error: res.statusCode >= 500 && res.statusCode <= 599
        }

        // the return value can be an integer code if there was an error. if no
        // error then it will be the txname that was used, which might not match
        // the txname the user specified if it wasn't valid.
        const txname = ao.reporter.sendHttpSpan(args)

        if (typeof txname === 'string') {
          // see if the name used doesn't match the name provided
          if (args.txname && txname !== args.txname) {
            // here the names don't match so we might need to log a warning. if
            // the only difference is that oboe added a domain prefix then don't
            // log.
            if (!txname.endsWith(args.txname)) {
              log.warn(`sendHttpSpan() changed TransactionName from ${args.txname} to ${txname}`)
            }
          }

          // it's a string so the worst it can be is an empty string.
          exitKeyValuePairs.TransactionName = txname
        } else {
          // sendHttpSpan() returned an error code. the metrics message probably
          // wasn't sent but make a best guess at the transaction name.
          exitKeyValuePairs.TransactionName = args.txname || 'unknown'
          let message = 'sendHttpSpan()'
          if (txname) message += `code ${txname}`
          dbSendError.log(message)
        }
      }

      span.exit(exitKeyValuePairs)
    }))

    span.enter()
  }

  return module
}

//
// helpers
//

// getUrlFilterMode
//
// lookup/match the URL in the specialUrls config key
//
// returns the mode synthesized from the components or undefined if no match.
//
// internally the options in the specialUrls config are doSample and doMetrics but
// oboe_tracing_decisions() expects a single value, mode, which is effectively
// 'always' or 'never', but as integer values, 1 or 0.

function getUrlFilterMode (req) {
  if (!ao.specialUrls) {
    return undefined
  }

  const url = req.url

  for (const s of ao.specialUrls) {
    if (s.string) {
      if (s.string === url) {
        return +(s.doSample && s.doMetrics)
      }
    } else if (s.regex) {
      if (url.match(s.regex)) {
        return +(s.doSample && s.doMetrics)
      }
    } else {
      ao.loggers.warn('url-specific filter has neither string nor regex properties')
    }
  }

  return undefined
}

// Taken from node sources lib/internal/url.js
//
// Utility function that converts a URL object into an ordinary
// options object as expected by the http.request and https.request
// APIs.
function urlToOptions (url) {
  const options = {
    protocol: url.protocol,
    hostname: url.hostname.startsWith('[')
      ? url.hostname.slice(1, -1)
      : url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname}${url.search}`,
    href: url.href
  }
  if (url.port !== '') {
    options.port = Number(url.port)
  }
  if (url.username || url.password) {
    options.auth = `${url.username}:${url.password}`
  }
  return options
}
