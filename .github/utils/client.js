// a simple "automated client" to make repeated http requests using the 4 verbs
const fetch = require('node-fetch')
const arg = require('arg')

const args = arg({ '--pace': Number, '--total': Number, '--trys': Number, '--port': Number })

const pace = args['--pace'] || 1 // requests per second
let total = args['--total'] || 1 // number of times to request all 4 verbs
let trys = args['--trys'] || 10 // max number of trys to connect to server (prevents CI hangups)

const hostname = '127.0.0.1'
const port = args['--port'] || 3000

const run = async () => {
  const sleep = async (ms = 0) => {
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  const runOnce = async () => {
    let res
    let body

    console.log(`Will request ${total} times`)
    total -= 1

    // don't do much other than hit the endpoint with each verb
    res = await fetch(`http://${hostname}:${port}/`)
    body = await res.text()
    console.log(`Sent GET. Server replied: ${body}`)
    await sleep(1000 / pace)

    res = await fetch(`http://${hostname}:${port}/`, { method: 'POST', body: 'key=value' })
    body = await res.text()
    console.log(`Sent POST. Server replied: ${body}`)
    await sleep(1000 / pace)

    res = await fetch(`http://${hostname}:${port}/`, { method: 'PATCH', body: 'key=value' })
    body = await res.text()
    console.log(`Sent PATCH. Server replied: ${body}`)
    await sleep(1000 / pace)

    res = await fetch(`http://${hostname}:${port}/`, { method: 'DELETE' })
    body = await res.text()
    console.log(`Sent DELETE. Server replied: ${body}`)
    await sleep(1000 / pace)

    if (total > 0) runOnce()
  }

  const waitForServer = async () => {
    try {
      await fetch(`http://${hostname}:${port}/`)
      console.log('Connected to server')

      runOnce()
    } catch {
      console.log(`Server not responding yet... will try ${trys} times`)
      trys -= 1
      // wait a sec and try again
      await sleep(1000)
      if (trys > 0) await waitForServer()
    }
  }

  await waitForServer()
  if (trys <= 0) throw new Error('Failed to connect to server')
}

// IIFE invokes an async function with try/catch
// used to manage the UnhandledPromiseRejectionWarning warning
(async function () {
  try {
    await run()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
})()
