'use strict'

const previous = process.env.AWS_SDK_LOAD_CONFIG
process.env.AWS_SDK_LOAD_CONFIG = true
const AWS = require('aws-sdk')
const cwl = new AWS.CloudWatchLogs()
if (previous === undefined) {
  delete process.env.AWS_SDK_LOAD_CONFIG
} else {
  process.env.AWS_SDK_LOAD_CONFIG = previous
}

const BSON = require('bson')

class LogEntries {
  constructor (requestId, logGroupName, logStreamName) {
    this.requestId = requestId
    this.logGroupName = logGroupName
    this.logStreamName = logStreamName
    this.state = 'find-start'
    this.startIx = undefined
    this.aoIx = []
    this.endIx = undefined
    this.reportIx = undefined
    this.startMarker = `START RequestId: ${requestId}`
    this.endMarker = `END RequestId: ${requestId}`
    this.reportMarker = `REPORT RequestId: ${requestId}`
    this.entries = []
  }

  find (newEntries, debug) {
    if (!Array.isArray(newEntries)) {
      throw new TypeError('newEntries must be an array')
    }
    if (debug && typeof debug !== 'function') {
      debug = function () {
        // eslint-disable-next-line no-console
        console.log.apply(null, arguments)
      }
    }
    // look for
    // START RequestId: 85b7365d-08e8-4fa5-b1b8-5bdda5eac08b
    // ...
    // END RequestId: 85b7365d-08e8-4fa5-b1b8-5bdda5eac08b
    debug && debug('starting find, state =', this.state)
    for (let i = 0; i < newEntries.length; i++) {
      if (this.state === 'find-start') {
        if (newEntries[i].message.startsWith(this.startMarker)) {
          debug && debug('found start, setting state = find-end')
          this.startIx = this.entries.length
          this.entries.push(newEntries[i])
          this.state = 'find-end'
        }
        continue
      } else if (this.state === 'find-end') {
        this.entries.push(newEntries[i])
        if (newEntries[i].message.startsWith('{"ao-data":')) {
          this.aoIx.push(this.entries.length - 1)
        } else if (newEntries[i].message.startsWith(this.endMarker)) {
          debug && debug('found end, state = done')
          this.endIx = this.entries.length - 1
          this.state = 'done'
          if (newEntries[i + 1].message.startsWith(this.reportMarker)) {
            this.reportIx = this.entries.length
            this.entries.push(newEntries[i + 1])
          }
        }
      }
      //
      if (this.state === 'done') {
        debug && debug('state = done, exiting loop')
        break
      }
    }

    return this.state
  }

  async waitUntilFind (secondsToWait, debug) {
    debug = setDebug(debug)
    const endTime = Date.now() + secondsToWait * 1000

    // handle the first fetch a little differently; the log usually
    // will not have appeared yet so it will return an error. the
    // error is misleading in that it is flagged "retryable = false"
    // but by retrying the log eventually shows up.
    let r
    while (Date.now() < endTime) {
      try {
        r = await this.getLogEvents()
        break
      } catch (e) {
        if (e.code !== 'ResourceNotFoundException') {
          for (const k of ['message', 'code', 'statusCode', 'retryable', 'retryDelay']) {
            debug && debug(k, e[k])
          }
          throw e
        }
        debug && debug('waiting for log stream to show up')
        await pause(e.retryDelay || 1000)
      }
    }

    let { events, nextForwardToken } = r
    let state = this.find(events)

    while (state !== 'done' && nextForwardToken && Date.now() < endTime) {
      debug && debug('pausing')
      await pause(2 * 1000)
      const r = await this.getLogEvents({ nextToken: nextForwardToken });
      ({ events, nextForwardToken } = r)
      state = this.find(events)
    }

    // decode the ao-data pieces and combine them
    const aoData = { events: [], metrics: [] }
    let error
    for (let i = 0; i < this.aoIx.length; i++) {
      try {
        const { 'ao-data': d } = JSON.parse(this.entries[this.aoIx[i]].message)
        if (d.events) {
          for (let j = 0; j < d.events.length; j++) {
            const b = Buffer.from(d.events[j], 'base64')
            const parsedEvent = BSON.deserialize(b, { promoteBuffers: true })
            for (const key in parsedEvent) {
              if (parsedEvent[key] instanceof Buffer) {
                parsedEvent[key] = parsedEvent[key].toString('utf8')
              }
            }
            aoData.events.push(parsedEvent)
          }
        }
        if (d.metrics) {
          for (let j = 0; j < d.metrics.length; j++) {
            const b = Buffer.from(d.metrics[j], 'base64')
            const parsedMetric = BSON.deserialize(b, { promoteBuffers: true })
            for (const key in parsedMetric) {
              if (parsedMetric[key] instanceof Buffer) {
                parsedMetric[key] = parsedMetric[key].toString('utf8')
              }
            }
            aoData.metrics.push(parsedMetric)
          }
        }
      } catch (e) {
        debug && debug('error on:', this.entries[this.aoIx[i]])
        error = e
      }
    }

    return {
      state,
      error,
      aoData,
      entries: this.entries,
      startIx: this.startIx,
      aoIx: this.aoIx,
      endIx: this.endIx,
      reportIx: this.reportIx
    }
  }

  async getLogEvents (options) {
    return new Promise((resolve, reject) => {
      const params = {
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
        startFromHead: true
      }
      Object.assign(params, options)
      cwl.getLogEvents(params, function (err, data) {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }
}

function setDebug (debug) {
  if (debug && typeof debug !== 'function') {
    debug = function () {
      // eslint-disable-next-line no-console
      console.log.apply(null, arguments)
    }
  }
  return debug
}

async function pause (ms) {
  return new Promise(resolve => {
    setTimeout(function () {
      resolve()
    }, ms)
  })
}

module.exports = LogEntries
