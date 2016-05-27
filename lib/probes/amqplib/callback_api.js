'use strict'

const probe = require('../amqplib')

module.exports = function (amqplib) {
  return probe(amqplib, true)
}
