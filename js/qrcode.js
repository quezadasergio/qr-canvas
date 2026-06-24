/*
 * QR Code generator (byte mode) implemented from scratch in vanilla JavaScript.
 *
 * It encodes a UTF-8 string into a boolean module matrix following the
 * ISO/IEC 18004 standard: data encoding, Reed-Solomon error correction,
 * module placement with function patterns, data masking and format/version
 * information. The result is exposed through `QRCode.generate(text, ecl)`,
 * which returns an object describing the final matrix.
 *
 * Design and constant tables are based on the public-domain reference
 * implementation by Project Nayuki, re-expressed here for this project.
 */
(function (global) {
  "use strict";

  // Error-correction levels with their format-info bit values.
  var ECC = {
    LOW: { ordinal: 0, formatBits: 1 },
    MEDIUM: { ordinal: 1, formatBits: 0 },
    QUARTILE: { ordinal: 2, formatBits: 3 },
    HIGH: { ordinal: 3, formatBits: 2 },
  };

  var MIN_VERSION = 1;
  var MAX_VERSION = 40;

  // Number of error-correction codewords per block, indexed by [eccOrdinal][version].
  var ECC_CODEWORDS_PER_BLOCK = [
    // Version: 0(unused) 1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23  24  25  26  27  28  29  30  31  32  33  34  35  36  37  38  39  40
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Low
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // Medium
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Quartile
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // High
  ];

  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // Low
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // Medium
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Quartile
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // High
  ];

  function getNumRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function getNumDataCodewords(ver, ecl) {
    return (
      Math.floor(getNumRawDataModules(ver) / 8) -
      ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] *
        NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]
    );
  }

  // ---- Reed-Solomon over GF(256) ----

  function reedSolomonComputeDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var j = 0; j < degree; j++) {
      for (var k = 0; k < result.length; k++) {
        result[k] = reedSolomonMultiply(result[k], root);
        if (k + 1 < result.length) result[k] ^= result[k + 1];
      }
      root = reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  function reedSolomonComputeRemainder(data, divisor) {
    var result = divisor.map(function () {
      return 0;
    });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) {
        result[i] ^= reedSolomonMultiply(coef, factor);
      });
    });
    return result;
  }

  function reedSolomonMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }

  // ---- Bit buffer helpers ----

  function appendBits(value, len, bb) {
    for (var i = len - 1; i >= 0; i--) bb.push((value >>> i) & 1);
  }

  function toUtf8ByteArray(str) {
    str = encodeURI(str);
    var result = [];
    for (var i = 0; i < str.length; i++) {
      if (str.charAt(i) !== "%") {
        result.push(str.charCodeAt(i));
      } else {
        result.push(parseInt(str.substring(i + 1, i + 3), 16));
        i += 2;
      }
    }
    return result;
  }

  // ---- Segment (byte mode only) ----

  function makeByteSegment(text) {
    var data = toUtf8ByteArray(text);
    var bb = [];
    data.forEach(function (b) {
      appendBits(b, 8, bb);
    });
    return { numChars: data.length, bitData: bb };
  }

  function getTotalBits(numChars, version) {
    // Byte mode: 4 bits mode indicator + char-count indicator + 8 bits per char.
    var ccbits = version <= 9 ? 8 : 16;
    return 4 + ccbits + 8 * numChars;
  }

  // ---- Core matrix builder ----

  function QrMatrix(version, ecl, dataCodewords, mask) {
    this.version = version;
    this.size = version * 4 + 17;
    this.errorCorrectionLevel = ecl;
    this.modules = [];
    this.isFunction = [];

    var row;
    for (var i = 0; i < this.size; i++) {
      row = [];
      for (var j = 0; j < this.size; j++) row.push(false);
      this.modules.push(row.slice());
      this.isFunction.push(row.slice());
    }

    this.drawFunctionPatterns();
    var allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);

    if (mask < 0) {
      var minPenalty = Infinity;
      for (var m = 0; m < 8; m++) {
        this.applyMask(m);
        this.drawFormatBits(m);
        var penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          mask = m;
          minPenalty = penalty;
        }
        this.applyMask(m); // undo
      }
    }
    this.mask = mask;
    this.applyMask(mask);
    this.drawFormatBits(mask);
  }

  QrMatrix.prototype.setFunctionModule = function (x, y, isDark) {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  };

  QrMatrix.prototype.drawFunctionPatterns = function () {
    var i;
    for (i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    var alignPatPos = this.getAlignmentPatternPositions();
    var numAlign = alignPatPos.length;
    for (i = 0; i < numAlign; i++) {
      for (var j = 0; j < numAlign; j++) {
        if (
          !(
            (i === 0 && j === 0) ||
            (i === 0 && j === numAlign - 1) ||
            (i === numAlign - 1 && j === 0)
          )
        ) {
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
        }
      }
    }

    this.drawFormatBits(0);
    this.drawVersion();
  };

  QrMatrix.prototype.drawFinderPattern = function (x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx;
        var yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };

  QrMatrix.prototype.drawAlignmentPattern = function (x, y) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(
          x + dx,
          y + dy,
          Math.max(Math.abs(dx), Math.abs(dy)) !== 1
        );
      }
    }
  };

  QrMatrix.prototype.getAlignmentPatternPositions = function () {
    if (this.version === 1) return [];
    var numAlign = Math.floor(this.version / 7) + 2;
    var step =
      this.version === 32
        ? 26
        : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = this.size - 7; result.length < numAlign; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  };

  QrMatrix.prototype.drawFormatBits = function (mask) {
    var data = (this.errorCorrectionLevel.formatBits << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;

    var j;
    for (j = 0; j <= 5; j++) this.setFunctionModule(8, j, getBit(bits, j));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (j = 9; j < 15; j++)
      this.setFunctionModule(14 - j, 8, getBit(bits, j));

    for (j = 0; j < 8; j++)
      this.setFunctionModule(this.size - 1 - j, 8, getBit(bits, j));
    for (j = 8; j < 15; j++)
      this.setFunctionModule(8, this.size - 15 + j, getBit(bits, j));
    this.setFunctionModule(8, this.size - 8, true);
  };

  QrMatrix.prototype.drawVersion = function () {
    if (this.version < 7) return;
    var rem = this.version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (this.version << 12) | rem;

    for (var j = 0; j < 18; j++) {
      var bit = getBit(bits, j);
      var a = this.size - 11 + (j % 3);
      var b = Math.floor(j / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  };

  QrMatrix.prototype.addEccAndInterleave = function (data) {
    var ver = this.version;
    var ecl = this.errorCorrectionLevel;
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [];
    var rsDiv = reedSolomonComputeDivisor(blockEccLen);
    var k = 0;
    for (var i = 0; i < numBlocks; i++) {
      var datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      var dat = data.slice(k, k + datLen);
      k += datLen;
      var ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    for (var idx = 0; idx < blocks[0].length; idx++) {
      for (var b = 0; b < blocks.length; b++) {
        if (idx !== shortBlockLen - blockEccLen || b >= numShortBlocks) {
          result.push(blocks[b][idx]);
        }
      }
    }
    return result;
  };

  QrMatrix.prototype.drawCodewords = function (data) {
    var i = 0;
    for (var right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < this.size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          var x = right - jj;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };

  QrMatrix.prototype.applyMask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = false;
        }
        if (!this.isFunction[y][x] && invert) {
          this.modules[y][x] = !this.modules[y][x];
        }
      }
    }
  };

  QrMatrix.prototype.getPenaltyScore = function () {
    var size = this.size;
    var result = 0;
    var x, y, runColor, runX, runHistory;

    for (y = 0; y < size; y++) {
      runColor = false;
      runX = 0;
      runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (x = 0; x < size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += 3;
          else if (runX > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor)
            result += this.finderPenaltyCountPatterns(runHistory) * 40;
          runColor = this.modules[y][x];
          runX = 1;
        }
      }
      result +=
        this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * 40;
    }

    for (x = 0; x < size; x++) {
      runColor = false;
      var runY = 0;
      runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (y = 0; y < size; y++) {
        if (this.modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += 3;
          else if (runY > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runY, runHistory);
          if (!runColor)
            result += this.finderPenaltyCountPatterns(runHistory) * 40;
          runColor = this.modules[y][x];
          runY = 1;
        }
      }
      result +=
        this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * 40;
    }

    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var c = this.modules[y][x];
        if (
          c === this.modules[y][x + 1] &&
          c === this.modules[y + 1][x] &&
          c === this.modules[y + 1][x + 1]
        ) {
          result += 3;
        }
      }
    }

    var dark = 0;
    for (y = 0; y < size; y++)
      for (x = 0; x < size; x++) if (this.modules[y][x]) dark++;
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;
    return result;
  };

  QrMatrix.prototype.finderPenaltyCountPatterns = function (runHistory) {
    var n = runHistory[1];
    var core =
      n > 0 &&
      runHistory[2] === n &&
      runHistory[3] === n * 3 &&
      runHistory[4] === n &&
      runHistory[5] === n;
    return (
      (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
      (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
    );
  };

  QrMatrix.prototype.finderPenaltyTerminateAndCount = function (
    currentRunColor,
    currentRunLength,
    runHistory
  ) {
    if (currentRunColor) {
      this.finderPenaltyAddHistory(currentRunLength, runHistory);
      currentRunLength = 0;
    }
    currentRunLength += this.size;
    this.finderPenaltyAddHistory(currentRunLength, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  };

  QrMatrix.prototype.finderPenaltyAddHistory = function (
    currentRunLength,
    runHistory
  ) {
    if (runHistory[0] === 0) currentRunLength += this.size;
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  };

  function getBit(x, i) {
    return ((x >>> i) & 1) !== 0;
  }

  // ---- Public encode pipeline ----

  function encodeText(text, ecl) {
    var seg = makeByteSegment(text);

    // Pick smallest version that fits, possibly upgrading ECC level for free.
    var version;
    var dataUsedBits;
    var dataCapacityBits;
    for (version = MIN_VERSION; ; version++) {
      dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
      dataUsedBits = getTotalBits(seg.numChars, version);
      if (dataUsedBits <= dataCapacityBits) break;
      if (version >= MAX_VERSION) {
        throw new Error("Data too long to fit in any QR Code version");
      }
    }

    var bb = [];
    appendBits(0x4, 4, bb); // byte mode indicator
    appendBits(seg.numChars, version <= 9 ? 8 : 16, bb);
    bb = bb.concat(seg.bitData);

    // Terminator and padding.
    appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
    appendBits(0, (8 - (bb.length % 8)) % 8, bb);
    for (var padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
      appendBits(padByte, 8, bb);
    }

    var dataCodewords = [];
    for (var i = 0; i < bb.length; i += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bb[i + j];
      dataCodewords.push(byte);
    }

    return new QrMatrix(version, ecl, dataCodewords, -1);
  }

  /**
   * Generate a QR code from text.
   * @param {string} text   payload to encode
   * @param {string} eclKey one of "LOW" | "MEDIUM" | "QUARTILE" | "HIGH"
   * @returns {{size:number, modules:boolean[][], version:number}}
   */
  function generate(text, eclKey) {
    var ecl = ECC[eclKey || "MEDIUM"] || ECC.MEDIUM;
    var qr = encodeText(text == null ? "" : String(text), ecl);
    return {
      size: qr.size,
      modules: qr.modules,
      version: qr.version,
    };
  }

  global.QRCode = { generate: generate, ECC: ECC };
})(typeof window !== "undefined" ? window : this);
