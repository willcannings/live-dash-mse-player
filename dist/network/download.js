"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

// Download objects are a wrapper around Requests. When multiple bases are
// available, Download will use BaseManager to round robin requests between
// the bases. If a request fails, Download will use the next available base
// to re-try. Each request is stored in requests, and the proxy methods are
// passed through to the last (latest) request object.

var Download = (function () {
    function Download(uri, processor, baseManager, options) {
        _classCallCheck(this, Download);

        this.state = Request.undownloaded;
        this.type = processor.type;
        this.requests = [];

        // these references will be cleared once the download is complete
        this.uri = uri;
        this.processor = processor;
        this.baseManager = baseManager;
        this.options = options;
        this.attempted = [];
        this.lastResponse = "error";
        this.lastXHR = null;
        this.perform();
    }

    _createClass(Download, {
        cleanup: {
            value: function cleanup() {
                this.processor = null;
                this.baseManager = null;
                this.options = null;
                this.attempted = null;
                this.lastResponse = null;
                this.lastXHR = null;
            }
        },
        perform: {

            // ---------------------------
            // request handling
            // ---------------------------

            value: function perform() {
                this.state = Download.inprogress;

                // find the next base to attempt the request with. if none are
                // available, fire the last response back to the processor
                var base = this.baseManager.nextBase(this.attempted);
                if (base == null) {
                    this.processor[this.lastResponse](this.lastXHR);
                    if (this.lastResponse == "error") this.state = Download.error;else this.state = Download.timeout;
                    this.cleanup();
                    return;
                }

                // using the next base to mutate the original URI, start a new request
                // to the base. base is added to the attempted list to prevent trying
                // the same base more than once for a download.
                this.attempted.push(base);
                this.requests.push(new Request().start(base.mutate(this.uri), this.options, this));
            }
        },
        reattempt: {
            value: function reattempt(response, xhr) {
                this.attempted[this.attempted.length - 1].failed();
                this.lastResponse = response;
                this.lastXHR = xhr;
                this.perform();
            }
        },
        error: {
            value: function error(xhr) {
                this.reattempt("error", xhr);
            }
        },
        timeout: {
            value: function timeout(xhr) {
                this.reattempt("timeout", xhr);
            }
        },
        success: {
            value: function success(xhr) {
                this.state = Download.success;
                this.processor.success(xhr);
                this.cleanup();
            }
        },
        proxy: {

            // ---------------------------
            // proxy methods
            // ---------------------------

            value: function proxy(method) {
                var defaultValue = arguments[1] === undefined ? -1 : arguments[1];

                if (this.requests.length > 0) {
                    var latest = this.requests[this.requests.length - 1];
                    return latest[method]();
                } else {
                    return defaultValue;
                }
            }
        },
        latency: {
            value: function latency() {
                return this.proxy("latency");
            }
        },
        duration: {
            value: function duration() {
                return this.proxy("duration");
            }
        },
        speed: {
            value: function speed() {
                return this.proxy("speed");
            }
        },
        destruct: {
            value: function destruct() {
                this.proxy("destruct");
            }
        }
    });

    return Download;
})();

;

// ---------------------------
// download/request states
// ---------------------------
// TODO: switch to enum, and change `if (this.lastResponse == 'error')`
Download.undownloaded = -1;
Download.inprogress = 0;
Download.success = 1;
Download.timeout = 2;
Download.error = 3;