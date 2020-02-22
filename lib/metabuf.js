'use strict';

const crypto = require('crypto');

class Metabuf {
  constructor (metabuf) {
    this.mb = Buffer.allocUnsafe(30);
    this.mb[0] = 0x2b;
    if (metabuf instanceof Metabuf) {
      // a prototype was provided so use its taskId and flags but create
      // a new, random opId for it.
      metabuf.mb.copy(this.mb, 1, 1, 21);
      this.mb[29] = metabuf.mb[29];
      crypto.randomFillSync(this.mb, 21, 8);
    } else if (arguments.length === 0) {
      this.mb[29] = 0x00;
    } else {
      throw new Error('Metabuf constructor argument must be a Metabuf instance');
    }
  }

  toString (fmt) {
    return this.mb.toString('hex', 0, 1) + ':' +
      this.mb.toString('hex', 1, 21) + ':' +
      this.mb.toString('hex', 21, 29) + ':' +
      this.mb.toString('hex', 29);
  }
}

// make a random Metabuf with the sample bit indicated.
Metabuf.makeRandom = function makeRandom (sample) {
  const mb = new Metabuf();
  crypto.randomFillSync(mb.mb, 1, 28);
  mb.mb[29] = sample ? 0x01 : 0x00;

  return mb;
}

// convert a valid string xtrace to a buffer. return buffer or null if buffer not valid.
Metabuf.stringToMetabuf = function stringToMetabuf (string) {
  const b = Buffer.from(string, 'hex');
  if (b.length !== 30 || b[0] !== 0x2b || b[29] & 0xFE) {
    return null;
  }
  return b;
}

Metabuf.toHexString = function toHexString (byteArray, opts = {}) {
  const inserts = [1, 21, 29, 'dummy'];
  const chars = new Buffer.allocUnsafe(byteArray.length * 2 + inserts.length - 1);
  //const chars = new Uint8Array(byteArray.length * 2);
  const alpha = (opts.upper ? 'A' : 'a').charCodeAt(0) - 10;
  const digit = '0'.charCodeAt(0);
  const sep = (opts.separator ? opts.separator : ':').charCodeAt(0);

  let p = 0;
  for (let i = 0; i < byteArray.length; i++) {
    if (i === inserts[0]) {
      chars[p++] = sep;
      inserts.shift();
    }
    let nibble = byteArray[i] >>> 4;
    //chars[p++] = nibble > 9 ? nibble + alpha : nibble + digit;
    chars[p++] = nibble + (nibble > 9 ? alpha : digit);

    nibble = byteArray[i] & 0xF;
    //chars[p++] = nibble > 9 ? nibble + alpha : nibble + digit;
    chars[p++] = nibble + (nibble > 9 ? alpha : digit);
  }

  return chars.toString('utf8');
  //return String.fromCharCode.apply(null, chars);
}

module.exports = Metabuf;


/**
  - metabuf - new term for agent-based metadata. consider a class extending Buffer. metabuf operations:
  - new () - create unsafe buffer[30] 0x2b : unknown : unknown : 0x00
  - new (metabuf) - create 0x2b : metabuf[1-21] : random[22-28] : metabuf[29]
  - mb.setFlagBits(bits) - add these bits to the flag bits
  - mb.clearFlagBits(bit) - remove these bits from the flag bits
  - mb.toString(fmtFlags) - format as close as possible to current scheme
  - mb.makeRandom(sample) - fill in taskId and OpId with random data and set sample accordingly
 */

