'use strict'

/* utility */

// based on classic from: https://stackoverflow.com/a/38750895
const filterObject = (unfiltered, allowed = []) => {
  return Object.keys(unfiltered)
    .filter(key => allowed.includes(key))
    .reduce((obj, key) => {
      obj[key] = unfiltered[key]
      return obj
    }, {})
}

/* validation */

const validateXtrace = (xtrace) => {
  // https://github.com/librato/trace/tree/master/docs/specs
  const regExp = /\b2B[0-9A-F]{40}[0-9A-F]{16}[0-1]{2}\b/
  const matches = regExp.exec(xtrace)

  return matches ? matches[0] : ''
}

const validateTraceparent = (traceparent) => {
  // https://www.w3.org/TR/trace-context/
  const regExp = /\b00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}\b/
  const matches = regExp.exec(traceparent)

  return matches ? matches[0] : ''
}

const validateTracestate = (tracestate) => {
  // https://www.w3.org/TR/trace-context/#tracestate-header-field-values
  // limit to 32 members in list
  // additional validations as decided internally
  // remove trailing/leading comma
  // filter any entry that is not key=value
  return tracestate
    ? tracestate.split(',')
      .filter(item => item !== '')
      .filter(item => item.split('=')[1])
      .slice(0, 32)
      .join(',')
    : ''
}

const validate = (filtered) => {
  return {
    traceparent: validateTraceparent(filtered.traceparent),
    tracestate: validateTracestate(filtered.tracestate),
    xtrace: validateXtrace(filtered.xtrace)
  }
}

/* extraction */

const extractSpanIdFromTraceParent = (traceparent = '') => {
  const regExp = /00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}/
  const matches = regExp.exec(traceparent)

  return matches ? matches[0].split('-')[2] : ''
}

const extractOrgPartFromTracestate = (tracestate) => {
  // TODO: discuss format
  const regExp = new RegExp(`${orgId}=[0-9a-f]{16}-[0-9]{2}`)
  const matches = regExp.exec(tracestate)

  return matches ? matches[0] : ''
}

const extractOthersFromTracestate = (tracestate) => {
  const orgPart = extractOrgPartFromTracestate(tracestate)
  const others = tracestate.split(',').filter(item => item !== orgPart).toString()

  return others
}

const extractSpanIdFromTracestate = (tracestate) => {
  const orgPart = extractOrgPartFromTracestate(tracestate)

  return orgPart ? orgPart.slice(3, -3) : ''
}

const extractFlagsFromTracestate = (tracestate) => {
  const orgPart = extractOrgPartFromTracestate(tracestate)

  return orgPart ? orgPart.slice(-2) : ''
}

/* manipulation */

// https://www.w3.org/TR/trace-context/#tracestate-limits
// decided internally not to send out anything over 512
const truncateTracestate = (tracestate) => {
  let t = tracestate

  // only if too long
  if (t.length > 512) {
    // find the last (right) entry that is over 128 chars (if any) and filter it out
    // repeat as long as too long and there are any such entries
    while (t.length > 512 && t.split(',').reverse().find(item => item.length > 128)) {
      t = t.split(',').filter(item => item !== t.split(',').reverse().find(item => item.length > 128)).join(',')
    }

    // while still too long, remove last (right) entry
    // repeat as long as too long
    while (t.length > 512) {
      t = t.split(',').slice(0, -1).join(',')
    }
  }

  return t
}

/* conversion */

// note: all inputs considered validated
const xtraceFromtraceparent = (traceparent) => {
  if (!traceparent) return ''

  // traceparent delimited parts
  const parts = traceparent.split('-')

  // transform to xtrace
  // https://github.com/librato/trace/tree/master/docs/specs
  const taskId = `${parts[1]}${padding}`.toUpperCase()
  const opId = parts[2].toUpperCase()
  const flags = parts[3]

  return `2B${taskId}${opId}${flags}`
}

const xtraceFromTracestate = (traceparent, tracestate) => {
  const parts = traceparent.split('-')

  // transform to xtrace
  // https://github.com/librato/trace/tree/master/docs/specs
  const taskId = `${parts[1]}${padding}`.toUpperCase()
  const opId = extractSpanIdFromTracestate(tracestate).toUpperCase()
  const flags = extractFlagsFromTracestate(tracestate).toUpperCase()

  return `2B${taskId}${opId}${flags}`
}

const traceparentFromXtrace = (xtrace) => {
  if (!xtrace) return ''

  // xtrace parts
  // https://github.com/librato/trace/tree/master/docs/specs
  const taskId = xtrace.slice(2, -18)
  const opId = xtrace.slice(-18, -2)
  const flags = xtrace.slice(-2)

  // transform to traceparent
  // https://www.w3.org/TR/trace-context/
  const traceId = taskId.toLowerCase().slice(0, -8)
  const spanId = opId.toLowerCase()

  return `00-${traceId}-${spanId}-${flags}`
}

const tracestatefromXtrace = (xtrace) => {
  if (!xtrace) return ''

  // https://github.com/librato/trace/tree/master/docs/specs
  const opId = xtrace.slice(-18, -2)
  const flags = xtrace.slice(-2)

  // transform to trace parent
  // https://www.w3.org/TR/trace-context/
  const spanId = opId.toLowerCase()

  return `${orgId}=${spanId}-${flags}`
}

/* logic */

const detectContinuation = (traceparent, tracestate) => {
  const tracestateSpanId = extractSpanIdFromTracestate(tracestate)
  const traceparentSpanId = extractSpanIdFromTraceParent(traceparent)

  // Continuation is when:
  // there is a valid span id from traceparent
  // there is a valid org span id in tracestate
  // 1 and 2 DO NOT atch
  return !!traceparentSpanId && !!tracestateSpanId && (tracestateSpanId !== traceparentSpanId)
}

const detectFlow = (traceparent, tracestate) => {
  const tracestateSpanId = extractSpanIdFromTracestate(tracestate)
  const traceparentSpanId = extractSpanIdFromTraceParent(traceparent)

  // Flow is when:
  // there is a valid span id from traceparent
  // there is a valid org span id in tracestate
  // 1 and 2 match
  return traceparentSpanId && tracestateSpanId && (tracestateSpanId === traceparentSpanId)
}

const getType = (xtrace, traceparent, tracestate) => {
  // TODO: revisit
  // allow x-trace header to ensure compatibility with older agents
  if (xtrace && !traceparent) return 'Flow'

  // when the request chain was AppOptics to this
  if (detectFlow(traceparent || '', tracestate || '')) return 'Flow'
  // when the request chain was AppOptics to OTel to this
  if (detectContinuation(traceparent || '', tracestate || '')) return 'Continuation'
  // when the request chain chain is OTel to this
  if (traceparent) return 'Downstream'
  // else
  return 'Source'
}

const getTraceparent = (traceparent, xtrace) => {
  return traceparent || traceparentFromXtrace(xtrace)
}

const getXtrace = (xtrace, traceparent, tracestate) => {
  // in Continuation - the opId in xtrace is taken from tracestate
  if (detectContinuation(traceparent, tracestate)) return xtraceFromTracestate(traceparent, tracestate)

  return xtrace || xtraceFromtraceparent(traceparent)
}

// note: incoming values may be either from headers (server patch) OR from data object (client patch)
// function encapsulates both use cases
const getTracestate = (tracestate, traceparent, xtrace) => {
  if (traceparent) return tracestate || ''
  if (!xtrace) return ''

  // passing xtrace and no traceparent means either legacy or generation from xtrace
  const others = extractOthersFromTracestate(tracestate)
  const us = tracestatefromXtrace(xtrace)

  return others ? truncateTracestate(`${us},${others}`) : us
}

/* exportable */

const orgId = 'sw'
const padding = '00000000'

const fromHeaders = (dirty = {}) => {
  const { traceparent, tracestate } = validate(filterObject(dirty, ['traceparent', 'tracestate']))
  // TODO: revisit
  // allow x-trace header to ensure compatibility with older agents
  const xtrace = validateXtrace(dirty['x-trace']) ? dirty['x-trace'] : ''

  return {
    traceparent: getTraceparent(traceparent, xtrace),
    tracestate: getTracestate(tracestate, traceparent, xtrace),
    xtrace: getXtrace(xtrace, traceparent, tracestate),
    info: {
      type: getType(xtrace, traceparent, tracestate),
      spanId: extractSpanIdFromTraceParent(traceparent),
      savedSpanId: extractSpanIdFromTracestate(tracestate),
      savedFlags: extractFlagsFromTracestate(tracestate)
    }
  }
}

const fromData = (dirty = {}) => {
  const { xtrace, tracestate } = validate(filterObject(dirty, ['xtrace', 'tracestate']))

  return {
    traceparent: getTraceparent('', xtrace),
    tracestate: getTracestate(tracestate, '', xtrace),
    xtrace: getXtrace(xtrace, '', tracestate),
    info: {
      // TODO: need any?
    }
  }
}

module.exports = {
  fromHeaders,
  fromData,
  orgId,
  padding
}
