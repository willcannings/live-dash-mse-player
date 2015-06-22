"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var PlayerObject = (function () {
    function PlayerObject() {
        _classCallCheck(this, PlayerObject);
    }

    _createClass(PlayerObject, null, {
        "enum": {
            value: function _enum(name, values) {
                this[name] = values;
                for (var i = 0; i < values.length; i++) {
                    this[values[i]] = i;
                }
            }
        }
    });

    return PlayerObject;
})();

;