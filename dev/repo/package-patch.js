const pkg = require('../../package.json')

const patch = {
  name: "appoptics-apm-dev",
}

// output new package.json for shell script to capture
console.log(JSON.stringify({...pkg, ...patch}, null, 2))
