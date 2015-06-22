"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var RequestProcessor = (function (_PlayerObject) {
    function RequestProcessor() {
        _classCallCheck(this, RequestProcessor);

        if (_PlayerObject != null) {
            _PlayerObject.apply(this, arguments);
        }
    }

    _inherits(RequestProcessor, _PlayerObject);

    _createClass(RequestProcessor, {
        type: {
            get: function () {
                return RequestProcessor.undefined;
            }
        },
        error: {
            value: function error(xhr) {
                throw "error not overriden";
            }
        },
        timeout: {
            value: function timeout(xhr) {
                throw "timeout not overriden";
            }
        },
        success: {
            value: function success(xhr) {
                throw "success not overriden";
            }
        }
    });

    return RequestProcessor;
})(PlayerObject);

;

RequestProcessor["enum"]("types", ["undefined", "mpd", "init", "media"]);