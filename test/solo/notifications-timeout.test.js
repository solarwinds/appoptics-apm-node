'use strict'

// oboe's notifier will send default log messages
process.env.APPOPTICS_DEBUG_LEVEL = 3
process.env.APPOPTICS_COLLECTOR = ''
process.env.APPOPTICS_REPORTER = 'ssl'
process.env.APPOPTICS_SERVICE_KEY = `${process.env.AO_SWOKEN_PROD}:node-notifications-test`

const ao = require('../..')
const notifications = ao.notifications
const expect = require('chai').expect

let desc = describe
let descMessage = 'notification function tests (long tests)'
if (!notifications) {
  desc = describe.skip
  descMessage = 'notifications disabled, skipping'
} else {
  notifications.on('message', function (msg) {
    messages.push(msg)
  })
}

const messages = []

desc(descMessage, function () {
  it('should receive at least 4 keep-alive messages in a minute', function (done) {
    let keepAliveCount = 0
    this.timeout(70000)
    setTimeout(function () {
      messages.forEach(m => {
        if (m.source === 'oboe' && m.type === 'keep-alive') {
          keepAliveCount += 1
        }
      })
      expect(keepAliveCount).gte(4, 'at least 4 keep-alive messages')
      done()
    }, 60000)
  })

  it('should handle restarting if keep-alive messages do not arrive', function (done) {
    this.timeout(35000)

    const timeToStop = Date.now() + 30 * 1000
    const iid = setInterval(function () {
      // fake keep-alives not arriving by setting the last message time to
      // the distant past.
      notifications.lastMessageTimestamp = 0
      if (Date.now() > timeToStop) {
        clearInterval(iid)
        throw new Error('exceeded wait time for restart count to increment')
      }
      if (notifications.startCount > 1) {
        clearInterval(iid)
        done()
      }
    }, 250)
  })
})
