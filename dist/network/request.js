"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

// --------------------------------------------------
// single connection request
// --------------------------------------------------

var Request = (function () {
    function Request() {
        _classCallCheck(this, Request);

        this.state = Download.undownloaded;

        // download speeds used to estimate best fit bitrate
        this.requestStart = null;
        this.downloadStart = null;
        this.downloadEnd = null;
        this.chunkTimes = [];
        this.reportedSize = 0;
        this.totalSize = 0;
    }

    _createClass(Request, {
        latency: {
            value: function latency() {
                return this.downloadStart - this.requestStart;
            }
        },
        duration: {
            value: function duration() {
                return this.downloadEnd - this.downloadStart;
            }
        },
        speed: {
            value: function speed() {
                return this.totalSize / this.duration();
            }
        },
        start: {
            value: function start(uri, options, download) {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", uri);

                // force interpretation of response. used when downloading mpds since
                // some servers respond with a generic mime type rather than text/xml.
                if (options.mimeType) xhr.overrideMimeType(options.mimeType);

                // force xhr.response to be a certain type. e.g segments are read as
                // array buffers rather than strings.
                if (options.responseType) xhr.responseType = options.responseType;

                // timeout passed in seconds
                if (options.timeout) xhr.timeout = options.timeout * 1000;

                // range requests
                if (options.range) xhr.setRequestHeader("Range", "bytes=" + options.range);

                // track state and timings of the request. requestStart is timestamped
                // to the moment before xhr.send(), which is when a connection is
                // opened. readyState transitions to HEADERS_RECEIVED next, and
                // downloadStart is timestamped then. downloadStart - requestStart is
                // an estimate of latency. downloadEnd is timestamped when readyState
                // transitions to DONE, which is after all data has been received.
                // total request size / downloadEnd - downloadStart is an estimate of
                // the download speed of the request.
                var request = this;

                xhr.onreadystatechange = function () {
                    if (this.readyState == this.HEADERS_RECEIVED) request.downloadStart = performance.now();else if (this.readyState == this.DONE) request.downloadEnd = performance.now();
                };

                xhr.onprogress = function (progress) {
                    if (progress.lengthComputable) request.reportedSize = progress.total;

                    request.chunkTimes.push({
                        size: progress.loaded - request.totalSize,
                        at: performance.now()
                    });

                    request.totalSize = progress.loaded;
                };

                // error states
                xhr.onerror = function () {
                    request.state = Download.error;
                    download.error(xhr);
                    request.xhr = null;
                };

                xhr.onabort = function () {
                    xhr.onerror();
                };

                xhr.ontimeout = function () {
                    request.state = Download.timeout;
                    download.timeout(xhr);
                    request.xhr = null;
                };

                // http was successful, but only 200 || 206 responses are accepted
                xhr.onload = function () {
                    if (this.status == 200 || options.range && this.status == 206) {
                        request.state = Download.success;
                        download.success(xhr);
                        request.xhr = null;
                    } else {
                        xhr.onerror();
                    }
                };

                this.state = Download.inprogress;
                this.requestStart = performance.now();
                xhr.send();

                // capture xhr on the request object for the lifetime of the connection
                // it's set to null once a processor callback is fired for memory -
                // request objects are kept for timing information, and we don't want
                // to hold a strong reference to the response data for this long.
                this.xhr = xhr;
                return this;
            }
        },
        destruct: {
            value: function destruct() {
                if (!this.state == Download.inprogress || !this.xhr) {
                    return;
                } // ignore the abort during destruction, otherwise the processor's error
                // handler will be called, and another request potentially scheduled
                this.xhr.onabort = function () {};
                this.xhr.abort();
                this.state = Download.error;
            }
        }
    });

    return Request;
})();

;