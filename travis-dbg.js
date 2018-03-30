
// simple tester to check out travis.
console.error(process.env)

console.error(process.versions)

console.error()
console.error(process.cwd())

console.error('trying to require appoptics')
var ao = require('appoptics-apm')

console.error('got appoptics, addon=', ao.addon)

console.error('trying to require bindings')
var aob = require('appoptics-bindings')

