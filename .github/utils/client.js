// a simple "automated client to make repeated http requests using the 4 verbs
const fetch = require('node-fetch')

const hostname = '127.0.0.1'
const port = 3000

const total = parseInt(process.argv[2], 10) || 1 // how many tomes to request all 4 verbs
const pace = parseInt(process.argv[3], 10) || 1 // requests per second

const run = async (total = 1, pace = 1) => {
  let count = 0

  const sleep = async (ms = 0) => {
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  const runOnce = async () => {
    let res
    let body

    count += 1
    console.log(`${count} of ${total}`)

    // don't do much other than hit the endpoint with the verb
    res = await fetch(`http://${hostname}:${port}/`)
    body = await res.text()
    console.log(body)
    await sleep(1000 / pace)

    res = await fetch(`http://${hostname}:${port}/`, { method: 'POST', body: 'key=value' })
    body = await res.text()
    console.log(body)
    await sleep(1000 / pace)

    res = await fetch(`http://${hostname}:${port}/`, { method: 'PATCH', body: 'key=value' })
    body = await res.text()
    console.log(body)
    await sleep(1000 / pace)

    res = await fetch(`http://${hostname}:${port}/`, { method: 'DELETE' })
    body = await res.text()
    console.log(body)
    await sleep(1000 / pace)

    if (count < total) runOnce()
  }

  const waitForServer = async () => {
    try {
      await fetch(`http://${hostname}:${port}/`)
      console.log('server is live :)')

      runOnce()
    } catch {
      console.log('server not live yet...')

      // wait a sec and try again
      await sleep(1000)
      waitForServer()
    }
  }

  waitForServer()
}

run(total, pace)
