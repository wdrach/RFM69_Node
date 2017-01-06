// **********************************************************************************
// Driver definition for HopeRF RFM69W/RFM69HW/RFM69CW/RFM69HCW, Semtech SX1231/1231H
// **********************************************************************************
// Original C Code by Felix Rusu (2015): felix@lowpowerlab.com http://lowpowerlab.com
// Ported to JS by Will Drach: http://drach.co
// **********************************************************************************
// License
// **********************************************************************************
// This program is free software; you can redistribute it
// and/or modify it under the terms of the GNU General
// Public License as published by the Free Software
// Foundation; either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will
// be useful, but WITHOUT ANY WARRANTY; without even the
// implied warranty of MERCHANTABILITY or FITNESS FOR A
// PARTICULAR PURPOSE. See the GNU General Public
// License for more details.
//
// Licence can be viewed at
// http://www.gnu.org/licenses/gpl-3.0.txt
//
// Please maintain this license information along with authorship
// and copyright notices in any redistribution of this code
// **********************************************************************************

//all of the registers
var r = require('./registers.js');

//the SPI driver, using pi-spi for now
var spi = require('pi-spi');
var SPI = spi.initialize('/dev/spidev0.0');
SPI.bitOrder(spi.order.MSB_FIRST);
//async!
var async = require('async');

//A better SPI transfer (actually listen to the response)
function transfer(val, cb) {
  const buf = Buffer.from([val]);
  SPI.transfer(buf, 2, function(err, data){
    if (err) cb(err);
    cb(err, data[1]);
  });
}

//helper function that reads from a reg
function readReg(key, cb) {
  transfer(key | 0x80, cb);
}

//heper function that writes to a reg
function writeReg(key, val, cb) {
  const buf = Buffer.from([key & 0x7F, val]);
  SPI.write(buf, cb);
}

//set reg, wait for response, check response
function sync(reg, val, expected, cb) {
  var ret = false;
  var to = setTimeout(function() {
    ret = true;
    cb(false);
  }, 50);

  var response = 0;

  async.whilst(function() {
    return response == expected && !ret;
  }, function(callback) {
    //set the value
    writeReg(reg, val, function() {
      readReg(reg, function(err, data) {
        response = data;
        callback();
      });
    });
  }, function(err) {
    if (ret) return;
    clearTimeout(to);
    cb(true);
  });
}

//set only some bits of a register
function conditionalSet(reg, mask, set, cb) {
  readReg(reg, function(err, data) {
    if (err) return cb(err);
    writeReg(reg, (data & mask) | set, cb);
  })
}

function radio() {};

radio.prototype.initialize = function(freqBand, nodeID, networkID, cb) {
  var self = this;
  const CONFIG =
  [
    /* 0x01 */ [ r.REG_OPMODE, r.RF_OPMODE_SEQUENCER_ON | r.RF_OPMODE_LISTEN_OFF | r.RF_OPMODE_STANDBY ],
    /* 0x02 */ [ r.REG_DATAMODUL, r.RF_DATAMODUL_DATAMODE_PACKET | r.RF_DATAMODUL_MODULATIONTYPE_FSK | r.RF_DATAMODUL_MODULATIONSHAPING_00 ], // no shaping
    /* 0x03 */ [ r.REG_BITRATEMSB, r.RF_BITRATEMSB_55555], // default: 4.8 KBPS
    /* 0x04 */ [ r.REG_BITRATELSB, r.RF_BITRATELSB_55555],
    /* 0x05 */ [ r.REG_FDEVMSB, r.RF_FDEVMSB_50000], // default: 5KHz, (FDEV + BitRate / 2 <= 500KHz)
    /* 0x06 */ [ r.REG_FDEVLSB, r.RF_FDEVLSB_50000],

    /* 0x07 */ [ r.REG_FRFMSB, (freqBand==r.RF69_315MHZ ? r.RF_FRFMSB_315 : (freqBand==r.RF69_433MHZ ? r.RF_FRFMSB_433 : (freqBand==r.RF69_868MHZ ? r.RF_FRFMSB_868 : r.RF_FRFMSB_915))) ],
    /* 0x08 */ [ r.REG_FRFMID, (freqBand==r.RF69_315MHZ ? r.RF_FRFMID_315 : (freqBand==r.RF69_433MHZ ? r.RF_FRFMID_433 : (freqBand==r.RF69_868MHZ ? r.RF_FRFMID_868 : r.RF_FRFMID_915))) ],
    /* 0x09 */ [ r.REG_FRFLSB, (freqBand==r.RF69_315MHZ ? r.RF_FRFLSB_315 : (freqBand==r.RF69_433MHZ ? r.RF_FRFLSB_433 : (freqBand==r.RF69_868MHZ ? r.RF_FRFLSB_868 : r.RF_FRFLSB_915))) ],

    // looks like PA1 and PA2 are not implemented on RFM69W, hence the max output power is 13dBm
    // +17dBm and +20dBm are possible on RFM69HW
    // +13dBm formula: Pout = -18 + OutputPower (with PA0 or PA1**)
    // +17dBm formula: Pout = -14 + OutputPower (with PA1 and PA2)**
    // +20dBm formula: Pout = -11 + OutputPower (with PA1 and PA2)** and high power PA settings (section 3.3.7 in datasheet)
    ///* 0x11 */ [ REG_PALEVEL, RF_PALEVEL_PA0_ON | RF_PALEVEL_PA1_OFF | RF_PALEVEL_PA2_OFF | RF_PALEVEL_OUTPUTPOWER_11111],
    ///* 0x13 */ [ REG_OCP, RF_OCP_ON | RF_OCP_TRIM_95 ], // over current protection (default is 95mA)

    // RXBW defaults are [ REG_RXBW, RF_RXBW_DCCFREQ_010 | RF_RXBW_MANT_24 | RF_RXBW_EXP_5] (RxBw: 10.4KHz)
    /* 0x19 */ [ r.REG_RXBW, r.RF_RXBW_DCCFREQ_010 | r.RF_RXBW_MANT_16 | r.RF_RXBW_EXP_2 ], // (BitRate < 2 * RxBw)
    //for BR-19200: /* 0x19 */ [ REG_RXBW, RF_RXBW_DCCFREQ_010 | RF_RXBW_MANT_24 | RF_RXBW_EXP_3 ],
    /* 0x25 */ [ r.REG_DIOMAPPING1, r.RF_DIOMAPPING1_DIO0_01 ], // DIO0 is the only IRQ we're using
    /* 0x26 */ [ r.REG_DIOMAPPING2, r.RF_DIOMAPPING2_CLKOUT_OFF ], // DIO5 ClkOut disable for power saving
    /* 0x28 */ [ r.REG_IRQFLAGS2, r.RF_IRQFLAGS2_FIFOOVERRUN ], // writing to this bit ensures that the FIFO & status flags are reset
    /* 0x29 */ [ r.REG_RSSITHRESH, 220 ], // must be set to dBm = (-Sensitivity / 2), default is 0xE4 = 228 so -114dBm
    ///* 0x2D */ [ REG_PREAMBLELSB, RF_PREAMBLESIZE_LSB_VALUE ] // default 3 preamble bytes 0xAAAAAA
    /* 0x2E */ [ r.REG_SYNCCONFIG, r.RF_SYNC_ON | r.RF_SYNC_FIFOFILL_AUTO | r.RF_SYNC_SIZE_2 | r.RF_SYNC_TOL_0 ],
    /* 0x2F */ [ r.REG_SYNCVALUE1, 0x2D ],      // attempt to make this compatible with sync1 byte of RFM12B lib
    /* 0x30 */ [ r.REG_SYNCVALUE2, networkID ], // NETWORK ID
    /* 0x37 */ [ r.REG_PACKETCONFIG1, r.RF_PACKET1_FORMAT_VARIABLE | r.RF_PACKET1_DCFREE_OFF | r.RF_PACKET1_CRC_ON | r.RF_PACKET1_CRCAUTOCLEAR_ON | r.RF_PACKET1_ADRSFILTERING_OFF ],
    /* 0x38 */ [ r.REG_PAYLOADLENGTH, 66 ], // in variable length mode: the max frame size, not used in TX
    ///* 0x39 */ [ REG_NODEADRS, nodeID ], // turned off because we're not using address filtering
    /* 0x3C */ [ r.REG_FIFOTHRESH, r.RF_FIFOTHRESH_TXSTART_FIFONOTEMPTY | r.RF_FIFOTHRESH_VALUE ], // TX on FIFO not empty
    /* 0x3D */ [ r.REG_PACKETCONFIG2, r.RF_PACKET2_RXRESTARTDELAY_2BITS | r.RF_PACKET2_AUTORXRESTART_ON | r.RF_PACKET2_AES_OFF ], // RXRESTARTDELAY must match transmitter PA ramp-down time (bitrate dependent)
    //for BR-19200: /* 0x3D */ [ REG_PACKETCONFIG2, RF_PACKET2_RXRESTARTDELAY_NONE | RF_PACKET2_AUTORXRESTART_ON | RF_PACKET2_AES_OFF ], // RXRESTARTDELAY must match transmitter PA ramp-down time (bitrate dependent)
    /* 0x6F */ [ r.REG_TESTDAGC, r.RF_DAGC_IMPROVED_LOWBETA0 ], // run DAGC continuously in RX mode for Fading Margin Improvement, recommended default for AfcLowBetaOn=0
    [255, 0]
  ];

  self._address = nodeID;

  async.waterfall([
    /*function(callback) {
      sync(r.REG_SYNCVALUE1, 0xAA, 0xAA, function(success) {
        if (!success) return callback(new Error('Sync Failed on 0xAA'));
        callback(null);
      });
    },
    function(callback) {
      sync(r.REG_SYNCVALUE1, 0x55, 0x55, function(success) {
        if (!success) return callback(new Error('Sync Failed on 0x55'));
        callback(null);
      });
    },*/
    function(callback) {
      async.each(CONFIG, function(elem, each_cb) {
        writeReg(elem[0], elem[1], each_cb);
      }, callback);
    },
    function(callback) {
      //encryption is persistent between resets
      self.encrypt(0, callback);
    },
    function(a, callback) {
      console.log(callback);
      self.setHighPower(callback);
    },
    function(a, callback) {
      self.setMode(r.RF69_MODE_STANDBY, callback);
    }
    /*function(callback) {
      readReg(r.REG_IRQFLAGS1, function(err, data) {
        if (err) return callback(err);
        if (data & r.RF_IRQFLAGS1_MODEREADY == 0x00)
      }
    }*/
  ], cb);
}

radio.prototype.setMode = function(newMode, callback) {
  var self = this;

  //nothing to do here
  if (newMode == self._mode) callback(null);

  switch (newMode) {
    case r.RF69_MODE_TX:
      set(r.RF_OPMODE_TRANSMITTER, 1);
      break;
    case r.RF69_MODE_RX:
      set(r.RF_OPMODE_RECEIVER, 0);
      break;
    case r.RF69_MODE_SYNTH:
      set(r.RF_OPMODE_SYNTHESIZER, -1);
      break;
    case RF69_MODE_STANDBY:
      set(r.RF_OPMODE_STANDBY, -1);
      break;
    case RF69_MODE_SLEEP:
      set(r.RF_OPMODE_SLEEP, -1);
      break;
    default:
      return callback(new Error('Invalid Mode'));
  }

  //set the mode
  function set(mode, setHighPower) {
    conditionalSet(r.REG_OPMODE, 0xE3, mode, function(err) {
      if (err) return callback(err);
      if (setHighPower == -1) return wait(null);
      else {
        self.setHighPowerRegs(setHighPower, wait);
      }
    })
  }

  //wait for the mode ready stuff
  function wait(err) {
    var ret = false;

    async.whilst(function() {
      return !ret;
    }, function(cb) {
      readReg(r.REG_IRQFLAGS1, function(err, data) {
        ret = data & r.RF_IRQFLAGS1_MODEREADY !== 0x00;
        cb(err);
      });
    }, function(err) {
      self._mode = newMode;
      callback(null);
    });
  }
}

radio.prototype.setHighPowerRegs = function(onOff, cb) {
  writeReg(r.REG_TESTPA1, onOff ? 0x5D : 0x55, function(err) {
    if (err) return cb(err);
    writeReg(r.REG_TESTPA2, onOff ? 0x7C : 0x70, cb);
  });
}

radio.prototype.setHighPower = function(onOff, cb) {
  var self = this;
  if (cb == undefined) {
    cb = onOff;
    onOff = true;
  }

  writeReg(r.REG_OCP, onOff ? r.RF_OCP_OFF : r.RF_OCP_ON, function(err) {
    if (err) return cb(err);
    if (onOff)
      conditionalSet(r.REG_PALEVEL, 0x1F, r.RF_PALEVEL_PA1_ON | r.RF_PALEVEL_PA2_ON, cb);
    else
      writeReg(r.REG_PALEVEL, r.RF_PALEVEL_PA0_ON | r.RF_PALEVEL_PA1_OFF | r.RF_PALEVEL_PA2_OFF | self._powerLevel, cb); // enable P0 only
  });
}

//key HAS to be 16 bytes
//to disable, just enter key = false
/* TODO: Actually implement the encryption, this just disables it no matter what ATM */
radio.prototype.encrypt = function(key, cb) {
  //not actually supported yet
  key = false;

  var self = this;
  self.setMode(r.RF69_MODE_STANDBY, function(err) {
    if (err) return cb(err);
    conditionalSet(r.REG_PACKETCONFIG2, 0xFE, (key ? 1 : 0), cb);
  });
}

radio.prototype.send = function(toAddress, buf, requestACK, cb) {
  var self = this;

  conditionalSet(r.REG_PACKETCONFIG2, 0xFB, r.RF_PACKET2_RXRESTART, function(err){
    if (err) return cb(err);
    wait();
  });

  function wait() {
    var ret = false;
    var to = setTimeout(function() {
      ret = true;
      SENDERID = sender;
      self.sendFrame(toAddress, buf, requestACK, false, cb);
    }, 1000);

    var response = true;

    async.whilst(function() {
      return response;
    }, function(callback) {
      self.receiveDone(function(err) {
        if (err) return response = false;
        canSend(function(err, cs) {
          if (err) return response = false;
          response = !cs;
        })
      });
    }, function(err) {
      if (ret) return;
      clearTimeout(to);
      SENDERID = sender;
      self.sendFrame(toAddress, buf, requestACK, false, cb);
    });
  }
}

radio.prototype.sendFrame = function(toAddress, buf, requestACK, cb) {
  var self = this;
  if (buf.length > r.RF69_MAX_DATA_LEN) return cb(new Error('Data too long'));

  async.waterfall([
    function(callback) {
      self.setMode(r.RF69_MODE_STANDBY, callback);
    },
    function(callback) {
      writeReg(r.REG_DIOMAPPING1, r.RF_DIOMAPPING1_DIO0_00, callback);
    },
    function(callback) {
      var CTLbyte = 0x00;
      if (sendACK) CTLByte = r.RFM69_CTL_SENDACK;
      else if (requestACK) CTLByte = RFM69_CTL_REQACK;

      var prefix = Buffer.from([r.REG_FIFO | 0x80, buf.length + 3, toAddress, self._address, CTLbyte]);

      var sendBuf = Buffer.concat([prefix, buf], prefix.length + buf.length);

      SPI.write(sendBuf, callback);
    },
    function(callback) {
      setMode(r.RF69_MODE_TX, callback);
    },
    function(callback) {
      var result = true;
      async.whilst(function() {
        return result;
      }, function(whilst_cb) {
        readReg(r.REG_IRQFLAGS2, function(err, data) {
          if (err) return whilst_cb(err);
          result = r.RF_IRQFLAGS2_PACKETSENT & data == 0;
          whilst_cb(null);
        })
      }, callback);
    },
    function(callback) {
      setMode(r.RF69_MODE_STANDBY, callback);
    }
  ], cb);
}

radio.prototype.sendACK = function(buf, cb) {
  var self = this;

  ACK_REQUESTED = 0;
  sender = SENDERID;
  _RSSI = RSSI;
  conditionalSet(r.REG_PACKETCONFIG2, 0xFB, r.RF_PACKET2_RXRESTART, function(err) {
    if (err) return cb(err);
    wait();
  });

  function wait() {
    var ret = false;
    var to = setTimeout(function() {
      ret = true;
      SENDERID = sender;
      self.sendFrame(sender, buf, false, true, cb);
    }, 1000);

    var response = true;

    async.whilst(function() {
      return response;
    }, function(callback) {
      receiveDone(function(err) {
        if (err) return response = false;
        canSend(function(err, cs) {
          if (err) return response = false;
          response = !cs;
        })
      });
    }, function(err) {
      if (ret) return;
      clearTimeout(to);
      SENDERID = sender;
      self.sendFrame(sender, buf, false, true, cb);
    });
  }
}

radio.prototype.canSend = function(cb) {
  var self = this;
  /*TODO: RSSI checker (line 207 of original library)*/
  if (self._mode == r.RF69_MODE_RX && PAYLOADLEN == 0) {
    setMode(r.RF69_MODE_STANDBY, function(err) {
      if (err) cb(err);
      cb(null, true);
    });
  }
  else cb(null, false)
}

radio.prototype.receiveDone = function(cb) {
  if (this._mode == r.RF69_MODE_RX && PAYLOAD > 0) {
    setMode(r.RF69_MODE_STANDBY, function(err) {
      if (err) return cb(err);
      return cb(null, true);
    })
  }
  else if (this._mode == r.RF69_MODE_RX) return cb(null, false);
  else {
    receiveBegin(function(err) {
      if (err) return cb(err);
      cb(null, false);
    })
  }
}

radio.prototype.receiveBegin = function(cb) {
  DATALEN = 0;
  SENDERID = 0;
  TARGETID = 0;
  PAYLOADLEN = 0;
  ACK_REQUESTED = 0;
  ACK_RECEIVED = 0;
  RSSI = 0;
  readReg(r.REG_IRQFLAGS2, function(err, data) {
    if (err) return cb(err);
    if (data & r.RF_IRQFLAGS2_PAYLOADREADY) return conditionalSet(r.REG_PACKETCONFIG2, 0xFB, r.RF_PACKET2_RXRESTART, setupRx);
    setupRx(null);
  });

  function setupRx(err) {
    if (err) return cb(err);
    writeReg(r.REG_DIOMAPPING1, r.RF_DIOMAPPING_DIO0_01, function(err) {
      if (err) return cb(err);
      setMode(r.RF69_MODE_RX, cb);
    })
  }
}

module.exports = {radio: radio};
