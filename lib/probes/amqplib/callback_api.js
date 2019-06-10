'use strict'

const probe = require('../amqplib')

module.exports = function (amqplib, name) {
  return probe(amqplib, {name, amqplib: {callbacks: true}})
}
