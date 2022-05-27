'use strict'

/* exportable */

const sanitize = (sql) => {
  return sql
  // sanitize single quoted strings

    // match any use of apostrophe inside a single quoted string
    // to detect such, look for a word with optionally space or apostrophe after
    .replace(/'\w+\s?'?''?\s?\w+'/ig, '?')
    // match any single quoted string
    .replace(/'[^']*'/ig, '?')
    // aggressively cleanup of (mostly invalid) apostrophe used in single quoted SQL values
    .replace(/\?(.*?)'/ig, '?')
    .replace(/\?(.*?)\?\?/ig, '?')
    .replace(/\?\w+/ig, '?')

  // sanitize digits

    // match digits attached to space, comma, equal or open parentheses or dot
    // will not touch digits attached to alphanumeric chars
    .replace(/[ ,=(.]\d+/ig, (match) => match[0] + '?')
}

module.exports = {
  sanitize
}
