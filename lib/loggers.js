'use strict'

const logger = new (require('./logger'))('appoptics')
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
  patching: logger.make('patching'),            // show errors patching
  probes: logger.make('probes')                 // show probe information
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
  // TODO BAM check that this is valid too
  this.level = loggers[level]
}

Debounce.prototype.show = function () {
  // have the number of incremental errors exceeded the delta limit?
  if ((this.count - this.lastCount) > this.dCount) {
    this.lastCount = this.count
    return true
  }
  // has it been dTime miliseconds since the last?
  const now = Date.now()
  if ((now - this.lastTime) > this.dTime) {
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
 * 'appoptics' will be used as a prefix and loggers will be constructed for
 * each subName in the form 'appoptics:event:send', 'appoptics:event:enter', etc.
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


module.exports = {logger, loggers}
