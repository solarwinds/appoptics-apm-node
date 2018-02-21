'use strict'
/**
 * Define AppOptics-specific formatters for debugging and logging.
 */

// get the appoptics bindings
const ao = require('./')
const d = require('debug')
const format = require('util').format

/**
 * format like console.log when replacing stdout, stderr
 */
if (!process.stdout.isTTY || !process.stderr.isTTY) {
  d.formatters.s = s => format('%s', s)
  d.formatters.d = d => format('%d', d)
  d.formatters.i = i => format('%i', i)
  d.formatters.f = f => format('%f', f)
  d.formatters.o = o => format('%o', o)
  d.formatters.O = o => format('%O', o)
}

/**
 * Format an xtrace ID - could be a string or a layer.
 * TODO BAM remove references to this, temporary approach.
 */
d.formatters.x = xid => xid ? humanID(xid) : '<no xtrace>'

/**
 * Format metadata
 */
d.formatters.m = md => {
  return humanID(md)
}

/**
 * Format a layer
 */
d.formatters.l = layer => {
  let text = [layer.name]
  Object.keys(layer.events).forEach(n => {
    if (n === 'internal') return
    text.push(d.formatters.e(layer.events[n]))
  })
  return text.join(' ')
}

/**
 * Format an event
 */
d.formatters.e = event => {
  if (!event) {
    return '<undefined>'
  }

  if (event instanceof ao.Event) {
    return event.Layer + ':' + event.Label + ' ' + humanID(event.event);
  }

  return '?:? ' + humanID(event)
}

/**
 * Format continuation-local-storage
 */
d.formatters.c = cls => {
  let active = cls.active ? getContextLines(cls.active).join('\n ') : '<no active context>'
  let previous = []

  if (cls._set.length && cls._set[cls._set.length - 1] === active) {
    previous.push('<active and top of stack are the same>')
  }

  // walk through the set of contexts (used to be a stack)
  for (let i = cls._set.length - 1; i >= 0; i -= 1) {
    previous.push(i - cls._set.length + ':')
    previous = previous.concat(getContextLines(cls._set[i]))
  }

  /* Code for visually checking the previous output is correct
  previous.push('raw:')
  previous.push(JSON.stringify(cls.active, null, 2))
  previous.push(JSON.stringify(cls._set, null, 2))
  // */
  return `\nactive:\n ${active}\n${previous.join('\n ')}`
}

/**
 * Format an X-Trace ID in easier to look at format.
 */
function humanID (x) {
  // both events and metadata toString() return the metadata
  if (x instanceof ao.addon.Event || x instanceof ao.addon.Metadata) {
    return x.toString(1)
  }

  if (typeof x === 'string' && x.length === 60) {
    x = x.toLowerCase()
    return x.slice(0, 2) + ':' + x.slice(2, 42) + ':' + x.slice(42, 58) + ':' + x.slice(-2)
  }

  if (x instanceof ao.Event) {
    return x.event.toString(1)
  }

  // not sure what it is
  let type
  if (typeof x === 'undefined') {
    type = 'undefined'
  } else if (x === null) {
    type = 'null'
  } else if (typeof x === 'object') {
    type = Object.getPrototypeOf(x)
  } else {
    type = 'wtf'
  }
  return '-:-:-:-(' + type + ')'
}

/**
 * format one CLS context.
 */
function getContextLines (ctx) {
  let lines = []

  if (!ctx) {
    return ['null']
  }

  function hop (key) {
    return Object.prototype.hasOwnProperty.call(ctx, key)
  }

  let line = ''

  if ('tag' in ctx && !hop('tag')) {
    line = '\u2193tag:' + ctx.tag + ' '
    //lines = ['\u2193tag:' + ctx.tag]
  }

  if ('rootMetadata' in ctx && !hop('rootMetadata')) {
    line += '\u2193rootMetadata:' + ctx.rootMetadata.toString(1)
  }

  if (line) {
    lines = [line]
  }

  if (ctx.lastSpan) {
    let label = !hop('lastSpan') ? '\u2193lastSpan' : 'lastSpan'
    label += ctx.lastSpan.descended ? ' (descended):' : ':'
    lines.push(label)

    // get the object keys. the events might not be "entry" and "exit" so
    // loop through the keys ignoring "internal"
    let keys = Object.keys(ctx.lastSpan.events)
    //let keys = Object.getOwnPropertyNames(ctx.lastSpan.events)

    keys.forEach(k => {
      if (k === 'internal') return
      lines.push(d.formatters.e(ctx.lastSpan.events[k]))
    })
  }

  if (ctx.lastEvent) {
    lines.push(!hop('lastEvent') ? '\u2193lastEvent:' : 'lastEvent:')
    lines.push(d.formatters.e(ctx.lastEvent))
  }

  line = ''
  if (hop('tag')) {
    line = 'tag:' + ctx.tag + ' '
  }
  if (hop('rootMetadata')) {
    line += 'rootMetadata: ' + ctx.rootMetadata.toString(1)
  }
  if (line) {
    lines.push(line)
  }

  return lines
}
