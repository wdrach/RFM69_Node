var radio = new (require('./RFM69.js').radio)();
var whilst = require('async').whilst;

var r = require('./registers.js');

radio.initialize(r.RF69_915MHZ, 2, 0, function(err) {
  if (err) return console.log(err);
  whilst(function() {return true;},
         function(cb) {
           radio.send(1, Buffer.from("Hello World!"), false, cb);
         });
})
