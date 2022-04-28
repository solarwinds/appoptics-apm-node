'use strict'

// allow empty log settings to suppress all logging.
const initial = 'SW_APM_LOG_SETTINGS' in process.env ? process.env.SW_APM_LOG_SETTINGS : 'error,warn'
const opts = {
  defaultLevels: initial,
  envName: 'SW_APM_LOG_SETTINGS'
}

const logger = new (require('./debug-custom'))('solarwinds-apm', opts)
require('./log-formatters')(logger.debug)

//
// these loggers are enabled by default.
//
const loggers = {
  error: logger.make('error'),
  warn: logger.make('warn'),
  debug: logger.make('debug'),
  span: logger.make('span'),
  info: logger.make('info'),
  patching: logger.make('patching'), // show errors patching
  probes: logger.make('probes'), // show probe information
  bind: logger.make('bind') // show binding errors
}

//
// suppress showing up to deltaCount messages in a deltaTime interval.
//
function Debounce (level, options) {
  options = options || {}
  this.dTime = 'deltaTime' in options ? options.deltaTime : 5000
  this.dCount = 'deltaCount' in options ? options.deltaCount : 100
  this.showDelta = 'showDelta' in options ? options.showDelta : true
  this.count = 0
  this.lastTime = -this.dTime
  this.lastCount = -this.dCount

  if (!loggers[level]) {
    throw new Error(`Debounce: level '${level}' doesn't exist`)
  }
  this.level = loggers[level]
}

Debounce.prototype.show = function () {
  const now = Date.now()
  // has the count of errors exceeded the delta limit or the time
  // window been exceeded?
  if ((this.count - this.lastCount) > this.dCount || (now - this.lastTime) > this.dTime) {
    this.lastCount = this.count
    this.lastTime = now
    return true
  }
  return false
}

Debounce.prototype.log = function () {
  this.count += 1
  if (this.show()) {
    // if appropriate modify to show delta count
    if (typeof arguments[0] === 'string' && this.showDelta) {
      arguments[0] = '[' + this.count + ']' + arguments[0]
    }
    this.level(...arguments)
  }
}

loggers.Debounce = Debounce

const added = {}

/**
 * Add a group for logging.
 *
 * @method addGroup
 * @param {object} def - definition of group to add.
 *
 * @return {Object} loggers or undefined if an error
 *
 * def is {
 *   groupName: 'event',            // the name of the group to be added
 *   subNames: ['send', 'enter', 'change', ...]
 * }
 * 'solarwinds-apm' will be used as a prefix and loggers will be constructed for
 * each subName in the form 'solarwinds-apm:event:send', 'solarwinds-apm:event:enter', etc.
 */
loggers.addGroup = function (def) {
  if (loggers[def.groupName]) {
    return undefined
  }
  const g = {}
  const groupPrefix = def.groupName + ':'

  def.subNames.forEach(function (name) {
    g[name] = logger.make(groupPrefix + name, def.activate)
  })
  loggers[def.groupName] = g
  added[def.groupName] = true

  return loggers
}

/**
 * Delete a group for logging
 */
loggers.deleteGroup = function (groupName) {
  if (added[groupName]) {
    delete loggers[groupName]
    delete added[groupName]
    return true
  }
  return undefined
}

module.exports = { logger, loggers }
