"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

// --------------------------------------------------
// download manager
// --------------------------------------------------

var Downloader = (function () {
    function Downloader(controller) {
        _classCallCheck(this, Downloader);

        this.downloadHistory = [];
        this.historyLength = controller.options.downloadHistory;
        this.mpdTimeout = controller.options.mpdTimeout;
        this.baseManager = new BaseManager(controller);
    }

    _createClass(Downloader, {
        destruct: {
            value: function destruct() {
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = this.downloadHistory[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var download = _step.value;

                        if (download.state == Download.inprogress) download.destruct();
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator["return"]) {
                            _iterator["return"]();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
            }
        },
        truncateHistory: {

            // ---------------------------
            // requests
            // ---------------------------
            // truncate (from the start) downloadHistory to be at most max Download
            // History length. if there are not enough downloads in a completed state
            // this may not be possible, and the array may grow larger than allowed

            value: function truncateHistory() {
                if (this.downloadHistory.length <= this.historyLength) {
                    return;
                }var remaining = this.downloadHistory.length - this.historyLength;

                for (var i = 0; i < this.downloadHistory.length; i++) {
                    if (this.downloadHistory[i].state <= Download.inprogress) continue;

                    this.downloadHistory.splice(i, 1);
                    remaining--;

                    if (remaining <= 0) break;
                }
            }
        },
        getMPD: {
            value: function getMPD(uri, processor) {
                this.get(uri, processor, {
                    mimeType: "text/xml",
                    timeout: this.mpdTimeout
                });
            }
        },
        getMedia: {
            value: function getMedia(uri, range, processor) {
                this.get(uri, processor, {
                    range: range,
                    responseType: "arraybuffer"
                });
            }
        },
        get: {
            value: function get(uri, processor, options) {
                this.truncateHistory();
                this.downloadHistory.push(new Download(uri, processor, this.baseManager, options));
            }
        },
        valueHistory: {

            // ---------------------------
            // history
            // ---------------------------

            value: function valueHistory(attr, type) {
                var SMOOTHING = 0.1;
                var min = undefined;
                var max = undefined;
                var avg = undefined;

                this.downloadHistory.forEach(function (download) {
                    if (download.state != Download.success) return;

                    if (type && download.type != type) return;

                    var value = download[attr]();

                    if (avg == undefined) avg = value;else avg = SMOOTHING * value + (1 - SMOOTHING) * avg;

                    if (value < min || min == undefined) min = value;

                    if (value > max || max == undefined) max = value;
                });

                return { min: min, avg: avg, max: max };
            }
        },
        speedHistory: {
            value: function speedHistory() {
                var type = arguments[0] === undefined ? null : arguments[0];

                return this.valueHistory("speed", type);
            }
        },
        latencyHistory: {
            value: function latencyHistory() {
                var type = arguments[0] === undefined ? null : arguments[0];

                return this.valueHistory("latency", type);
            }
        }
    });

    return Downloader;
})();

;