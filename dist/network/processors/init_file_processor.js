"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var InitFile = (function (_RequestProcessor) {
    function InitFile(source) {
        _classCallCheck(this, InitFile);

        this.source = source;

        // generate init url from the initial representation
        var representation = source.currentRepresentation;
        if (representation.segmentTemplate) this.uri = representation.segmentTemplate.initialization;else this.uri = representation.segmentList.initialization.sourceURL;

        console.log("initialising " + source.contentType + " with " + this.uri);
    }

    _inherits(InitFile, _RequestProcessor);

    _createClass(InitFile, {
        type: {
            get: function () {
                return RequestProcessor.init;
            }
        },
        error: {
            value: function error(xhr) {
                console.log("error loading init file " + this.url, xhr);
                throw "error loading init file";
            }
        },
        timeout: {
            value: function timeout(xhr) {
                console.log("timeout loading init file " + this.url, xhr);
                throw "timeout loading init file";
            }
        },
        success: {
            value: function success(xhr) {
                console.log("loaded init file for " + this.source.contentType);
                this.source.appendInitFile(xhr.response);
                this.source.state = Source.initialised;
            }
        }
    });

    return InitFile;
})(RequestProcessor);

;