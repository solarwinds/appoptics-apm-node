'use strict';

const crypto = require('crypto');

class RandomBytes {
  constructor (opts = {}) {
    this.available = [];
    this.bufferCount = opts.bufferCount || 2;
    this.bufferSize = opts.bufferSize || 1024;
    this.syncFills = 0;
    this.asyncFills = 0;

    for (let i = 0; i < this.bufferCount; i++) {
      const buffer = Buffer.allocUnsafe(this.bufferSize);
      // push an empty randomBytes object that will be filled asynchronously
      const randomBytes = {p: buffer.Size, remaining: 0, buffer, pending: true};
      this._randomFill(randomBytes);
      this.available.push(randomBytes);
    }
  }

  fillWithRandomBytes (buf, offset, size) {
    for (let i = 0; i < this.available.length; i++) {
      const randomBytes = this.available[i];
      // if there aren't enough bytes left then refill. it's possible
      // that a shorter request for bytes could succeed but this only
      // allocates task ids of 20 bytes and op ids of 8 bytes so only
      // 12 bytes can be wasted. if this seems important then two
      // instances of RandomBytes can be created - one for task ids and
      // one for op ids.
      if (size > randomBytes.remaining) {
        this._randomFill(randomBytes);
        continue;
      }
      // there's enough to satisfy this request for bytes
      randomBytes.buffer.copy(buf, offset, randomBytes.p, randomBytes.p + size);
      randomBytes.remaining -= size;
      randomBytes.p += size;
      return;
    }
    // if we fell out of the loop then none of the randomBytes buffers
    // has available bytes so fill the request synchronously.
    crypto.randomFillSync(buf, offset, size);
    this.syncFills += 1;
  }

  _randomFill (randomBytes) {
    // TODO BAM refill only the bytes used.
    randomBytes.remaining = 0;
    crypto.randomFill(randomBytes.buffer, (err, buf) => {
      if (err) {
        throw new Error('cannot fill buffer');
      }
      // update with bytes available
      randomBytes.p = 0;
      randomBytes.remaining = this.bufferSize;
      this.asyncFills += 1;
    });
  }
}

module.exports = RandomBytes;
