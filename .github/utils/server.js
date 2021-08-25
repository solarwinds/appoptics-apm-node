// a simple AppOptics instrumented http server
const ao = require('appoptics-apm')
const http = require('http')
const arg = require('arg')

// pass -preflight to only check that server can be instrumented.
const args = arg({ '--preflight': Boolean })

const preflight = async () => {
  // server must be instrumented and will exit with error if not
  const isReady = await ao.readyToSample(1000)
  if (!isReady) throw new Error('AppOptics not ready to sample.')
}

const setServer = async () => {
  // server must be instrumented and will exit with error if not
  await preflight()

  // simple server using the native http module
  const hostname = '127.0.0.1'
  const port = 3000

  const server = http.createServer((req, res) => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end(`Got ${req.method} request`)
  })

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`)
  })
}

// iife invokes an async function with try/catch
// used to manage the UnhandledPromiseRejectionWarning warning
(async function () {
  try {
    if ((args['--preflight'])) await preflight()
    else await setServer()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
})()
