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

const validateTraceparent = (traceparent) => {
  // https://www.w3.org/TR/trace-context/
  const regExp = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/
  const matches = regExp.exec(traceparent)

  return matches ? traceparent : ''
}

const validateTracestate = (tracestate) => {
  // currently no validation of incoming tracestate. only care if can find org in it.
  return tracestate || ''
}

const validate = (filtered) => {
  // each valid by itself
  const traceparent = validateTraceparent(filtered.traceparent)
  const tracestate = validateTracestate(filtered.tracestate)

  // validate the trio

  // tracestate without traceparent is not valid
  if (tracestate && !traceparent) return { traceparent: '', tracestate: '' }
  return { traceparent, tracestate }
}

/* extraction */

const extractOrgPartFromTracestate = (tracestate) => {
  const regExp = new RegExp(`${orgId}=[0-9a-f]{16}-0[0-9]{1}`)
  const matches = regExp.exec(tracestate)

  return matches ? matches[0] : ''
}

const extractSpanIdFromTracestate = (tracestate) => {
  const orgPart = extractOrgPartFromTracestate(tracestate)

  return orgPart ? orgPart.slice(3, -3) : ''
}

const tracestatefromTraceparent = (traceparent) => {
  if (!traceparent) return ''

  // traceparent delimited parts
  const parts = traceparent.split('-')

  // transform to xtrace
  // https://github.com/librato/trace/tree/master/docs/specs
  const opId = parts[2]
  const flags = parts[3]

  return `${orgId}=${opId}-${flags}`
}

/* exportable */

const orgId = 'sw'
const padding = '00000000'

const mutS = (tracestate, traceparent) => {
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
  const us = `${tracestatefromTraceparent(traceparent)}`

  return others ? truncateTracestate(`${us},${others}`) : us
}

const TfromS = (tracestate, traceparent) => {
  const regExp = new RegExp(`${orgId}=[0-9a-f]{16}-0[0-1]{1}`)
  const matches = regExp.exec(tracestate)

  // traceparent delimited parts
  const parts = traceparent.split('-')

  // from traceparent
  const taskId = matches ? parts[1] : ''

  return matches ? `00-${taskId}-${matches[0].split('=')[1]}` : ''
}

const reqType = (dirty = {}) => {
  const { traceparent, tracestate } = validate(filterObject(dirty, ['traceparent', 'tracestate', 'x-trace']))

  if (!traceparent) return 'Source'
  if (!TfromS(tracestate, traceparent) && traceparent) return 'Downstream'
  if (TfromS(tracestate, traceparent) === traceparent) return 'Flow'
  if (TfromS(tracestate, traceparent) !== traceparent) return 'Continuation'
}

const prepHeaders = (data = {}) => {
  const { traceparent, tracestate } = data

  return {
    traceparent,
    tracestate: mutS(tracestate, traceparent)
  }
}

const fromHeaders = (dirty = {}) => {
  const { traceparent, tracestate } = validate(filterObject(dirty, ['traceparent', 'tracestate']))

  return {
    traceparent: TfromS(tracestate, traceparent) || traceparent,
    tracestate,
    savedSpanId: extractSpanIdFromTracestate(tracestate),
    liboboeTracestate: tracestate.split('=')[1]
  }
}

module.exports = {
  orgId,
  padding,
  prepHeaders,
  fromHeaders,
  reqType
}
