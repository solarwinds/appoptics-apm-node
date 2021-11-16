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
  const regExp = /\b2B[0-9A-F]{40}[0-9A-F]{16}0[0-1]{1}\b/
  const matches = regExp.exec(xtrace)

  return matches ? xtrace : ''
}

const validateTraceparent = (traceparent) => {
  // https://www.w3.org/TR/trace-context/
  const regExp = /\b00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}\b/
  const matches = regExp.exec(traceparent)

  return matches ? traceparent : ''
}

const validateTracestate = (tracestate) => {
  // valid tracestate has it an org id = xtrace part
  const regExp = new RegExp(`${orgId}=[0-9a-f]{16}-0[0-9]{1}`)
  const matches = regExp.exec(tracestate)

  return matches ? tracestate : ''
}

const validate = (filtered) => {
  const empty = { traceparent: '', tracestate: '', xtrace: '' }

  // each valid by itself
  const traceparent = validateTraceparent(filtered.traceparent)
  const tracestate = validateTracestate(filtered.tracestate)
  const xtrace = validateXtrace(filtered['x-trace'])

  // validate the trio

  // tracestate without traceparent is not valid
  if (tracestate && !traceparent) return empty
  // xtrace and traceparent headers that are not matching are not valid
  if ((xtrace && traceparent) && (xtrace !== PtoX(traceparent))) return empty
  return { traceparent, tracestate, xtrace }
}

/* extraction */

const extractSpanIdFromTraceParent = (traceparent = '') => {
  const regExp = /00-[0-9a-f]{32}-[0-9a-f]{16}-[0-1]{2}/
  const matches = regExp.exec(traceparent)

  return matches ? matches[0].split('-')[2] : ''
}

const extractOrgPartFromTracestate = (tracestate) => {
  const regExp = new RegExp(`${orgId}=[0-9a-f]{16}-0[0-9]{1}`)
  const matches = regExp.exec(tracestate)

  return matches ? matches[0] : ''
}

const extractSpanIdFromTracestate = (tracestate) => {
  const orgPart = extractOrgPartFromTracestate(tracestate)

  return orgPart ? orgPart.slice(3, -3) : ''
}

const extractFlagsFromTracestate = (tracestate) => {
  const orgPart = extractOrgPartFromTracestate(tracestate)

  return orgPart ? orgPart.slice(-2) : ''
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

/* exportable */

const orgId = 'sw'
const padding = '00000000'

const XtoP = (xtrace) => {
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

const PtoX = (traceparent) => {
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

const mutS = (tracestate, xtrace) => {
  // https://www.w3.org/TR/trace-context/#tracestate-header-field-values
  // - limit to 32 members in list
  // additional decided internally:
  // - remove trailing/leading comma
  // - filter any entry that is not key=value

  // https://www.w3.org/TR/trace-context/#tracestate-limits
  // decided internally:
  // - do not to send anything over 512
  // - removing entries over 128 first
  const truncateTracestate = (tracestate = '') => {
    let t = tracestate

    // limit to 32 entries
    t = tracestate.split(',')
      .filter(item => item !== '')
      .filter(item => item.split('=')[1])
      .slice(0, 32)
      .join(',')

    // https://www.w3.org/TR/trace-context/#tracestate-limits
    // decided internally: not to send out anything over 512

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

  const extractOthersFromTracestate = (tracestate = '') => {
    // anything that has sw= as key is "not others" and is thus filtered out
    const others = tracestate.split(',').filter(item => item.split('=')[0] !== orgId).join(',')

    return others
  }

  const others = extractOthersFromTracestate(tracestate)
  const us = `${tracestatefromXtrace(xtrace)}`

  return others ? truncateTracestate(`${us},${others}`) : us
}
const XfromS = (tracestate, traceparent) => {
  const regExp = new RegExp(`${orgId}=[0-9a-f]{16}-0[0-1]{1}`)
  const matches = regExp.exec(tracestate)

  // traceparent delimited parts
  const parts = traceparent.split('-')

  // transform to xtrace
  // https://github.com/librato/trace/tree/master/docs/specs

  // from traceparent
  const taskId = matches ? `${parts[1]}${padding}`.toUpperCase() : ''

  // from tracestate
  const opId = matches ? matches[0].split('=')[1].split('-')[0].toUpperCase() : ''
  const flags = matches ? matches[0].split('=')[1].split('-')[1] : ''

  return matches ? `2B${taskId}${opId}${flags}` : ''
}

const reqType = (dirty = {}) => {
  const { traceparent, tracestate, xtrace } = validate(filterObject(dirty, ['traceparent', 'tracestate', 'x-trace']))

  // TODO: revisit
  // allow x-trace header only option to ensure compatibility with older agents
  if (xtrace && !traceparent) return 'Flow'

  if (!traceparent && !xtrace) return 'Source'
  if (!XfromS(tracestate, traceparent) && traceparent) return 'Downstream'
  if (XfromS(tracestate, traceparent) === PtoX(traceparent)) return 'Flow'
  if (XfromS(tracestate, traceparent) !== PtoX(traceparent)) return 'Continuation'
}

const prepHeaders = (data = {}) => {
  const { xtrace, tracestate } = data

  return {
    xtrace: xtrace,
    traceparent: XtoP(xtrace),
    tracestate: mutS(tracestate, xtrace)
  }
}

const fromHeaders = (dirty = {}) => {
  const { traceparent, tracestate, xtrace } = validate(filterObject(dirty, ['traceparent', 'tracestate', 'x-trace']))

  // TODO: revisit
  // allow x-trace header only option to ensure compatibility with older agents
  return {
    xtrace: XfromS(tracestate, traceparent) || PtoX(traceparent) || xtrace,
    tracestate,
    savedSpanId: extractSpanIdFromTracestate(tracestate)
  }
}

module.exports = {
  orgId,
  padding,
  prepHeaders,
  fromHeaders,
  reqType
}
