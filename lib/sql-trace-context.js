'use strict'

/* validation */

const validTraceparent = (traceparent) => {
  if (typeof traceparent !== 'string') return ''

  // https://www.w3.org/TR/trace-context/
  const regExp = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/
  const matches = regExp.exec(traceparent)

  return matches
}

/* exportable */

const tag = (traceparent) => {
  return validTraceparent(traceparent) ? `/* traceparent='${traceparent}' */` : ''
}

module.exports = {
  tag
}
