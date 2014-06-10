var debug = require('debug')('node-oboe:__init')
var addon = module.exports = require('./addon')
// Enable later when I continue working on http probe
require('./require-patch')
var os = require('os')

addon.Context.init()

addon.Context.setTracingMode(addon.TRACE_ALWAYS)
addon.Context.setDefaultSampleRate(addon.MAX_SAMPLE_RATE)

var reporter = new addon.UdpReporter('127.0.0.1')
addon.reporter = reporter

var data = {
  __Init: 1,
  'Foo': 2,
  'Layer': 'nodejs',
  'Label': 'enter',
  'Node.Version': process.versions.node,
  'Node.V8.Version': process.versions.v8,
  'Node.LibUV.Version': process.versions.uv,
  'Node.OpenSSL.Version': process.versions.openssl,
  'Node.Ares.Version': process.versions.ares,
  'Node.ZLib.Version': process.versions.zlib,
  'Node.HTTPParser.Version': process.versions.http_parser,
  'Node.Oboe.Version': require('../package.json').version,
}

var enter = addon.Context.startTrace()
Object.keys(data).forEach(function (key) {
  enter.addInfo(key, data[key])
})

debug("enter sent\n" + enter.toString() + "\n")
reporter.sendReport(enter)


var exit = addon.Context.createEvent()
Object.keys(data).forEach(function (key) {
  exit.addInfo(key, data[key])
})
exit.addEdge(enter)

debug("exit sent\n" + exit.toString() + "\n")
reporter.sendReport(exit)
