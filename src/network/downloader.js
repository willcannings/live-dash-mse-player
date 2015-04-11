// --------------------------------------------------
// download requests
// --------------------------------------------------
class RequestProcessor {
    error(xhr) {
        throw 'error not overriden';
    }

    timeout(xhr) {
        throw 'timeout not overriden';
    }

    success(xhr) {
        throw 'success not overriden';
    }
};

class Request {
    constructor() {
        this.state = Request.undownloaded;

        // download speeds used to estimate best fit bitrate
        this.requestStart  = null;
        this.downloadStart = null;
        this.downloadEnd   = null;
        this.chunkTimes    = [];
        this.reportedSize  = 0;
        this.totalSize     = 0;
    }

    latency() {
        return this.downloadStart - this.requestStart;
    }

    duration() {
        return this.downloadEnd - this.downloadStart;
    }

    speed() {
        return this.totalSize / this.duration();
    }

    start(options) {
        let xhr = new XMLHttpRequest();
        xhr.open('GET', options.url);

        // force interpretation of response. used when downloading mpds since
        // some servers respond with a generic mime type rather than text/xml.
        if (options.mimeType)
            xhr.overrideMimeType(options.mimeType);

        // force xhr.response to be a certain type. e.g segments are read as
        // array buffers rather than strings.
        if (options.responseType)
            xhr.responseType = options.responseType;

        // timeout passed in seconds
        if (options.timeout)
            xhr.timeout = options.timeout * 1000;


        // track state and timings of the request. requestStart is timestamped
        // to the moment before xhr.send(), which is when a connection is
        // opened. readyState transitions to HEADERS_RECEIVED next, and
        // downloadStart is timestamped then. downloadStart - requestStart is
        // an estimate of latency. downloadEnd is timestamped when readyState
        // transitions to DONE, which is after all data has been received.
        // total request size / downloadEnd - downloadStart is an estimate of
        // the download speed of the request.
        let request = this;

        xhr.onreadystatechange = function() {
            if (this.readyState == this.HEADERS_RECEIVED)
                request.downloadStart = performance.now();
            else if (this.readyState == this.DONE)
                request.downloadEnd = performance.now();
        }

        xhr.onprogress = function(progress) {
            if (progress.lengthComputable)
                request.reportedSize = progress.total;

            request.chunkTimes.push({
                size: progress.loaded - request.totalSize,
                at: performance.now()
            });

            request.totalSize = progress.loaded;
        }

        // error states
        xhr.onerror = function() {
            request.state = Request.error;
            options.processor.error(xhr);
            this.xhr = null;
        }

        xhr.onabort = function() {
            xhr.onerror();
        }

        xhr.ontimeout = function() {
            request.state = Request.timeout;
            options.processor.timeout(xhr);
            this.xhr = null;
        }

        // http was successful, but only 200 responses are accepted
        xhr.onload = function() {
            if (this.status == 200) {
                request.state = Request.success;
                options.processor.success(xhr);
                this.xhr = null;
            } else {
                xhr.onerror();
            }
        }

        this.state = Request.inprogress;
        this.requestStart = performance.now();
        xhr.send();

        // capture xhr on the request object for the lifetime of the connection
        // it's set to null once a processor callback is fired for memory -
        // request objects are kept for timing information, and we don't want
        // to hold a strong reference to the response data for this long.
        this.xhr = xhr;
        return this;
    }

    destruct() {
        if (!this.state == Request.inprogress || !this.xhr)
            return;

        // ignore the abort during destruction, otherwise the processor's error
        // handler will be called, and another request potentially scheduled
        this.xhr.onabort = function() {}
        this.xhr.abort();
        this.state = Request.error;
    }
};

// request states
Request.undownloaded = -1;
Request.inprogress = 0;
Request.success = 1;
Request.timeout = 2;
Request.error = 3;


// --------------------------------------------------
// download manager
// --------------------------------------------------
class Downloader {
    constructor(controller) {
        this.controller = controller;
        this.requestHistory = [];
        this.maxHistoryLength = controller.player.options.maxDownloadHistory;
    }

    destruct() {
        for (let request of this.requestHistory) {
            if (request.state == Request.inprogress)
                request.destruct();
        }
    }

    // ---------------------------
    // requests
    // ---------------------------
    // truncate (from the start) requestHistory to be at most max Download
    // History length. if there are not enough requests in a completed state
    // this may not be possible, and the array may grow larger than allowed
    truncateHistory() {
        if (this.requestHistory.length <= this.maxHistoryLength)
            return;

        let remaining = this.requestHistory.length - this.maxHistoryLength;

        for (let i = 0; i < this.requestHistory.length; i++) {
            if (this.requestHistory[i].state <= Request.inprogress)
                continue;

            this.requestHistory.splice(i, 1);
            remaining--;

            if (remaining <= 0)
                break;
        }

    }

    getMPD(url, processor) {
        this.truncateHistory();
        this.requestHistory.push(
            new Request().start({
                url,
                processor,
                mimeType: 'text/xml',
                timeout: this.controller.options.mpdTimeout
            })
        );
    }

    getMedia(url, processor) {
        this.truncateHistory();
        this.requestHistory.push(
            new Request().start({
                url,
                processor,
                responseType: 'arraybuffer'
            })
        );
    }


    // ---------------------------
    // history
    // ---------------------------
    valueHistory(attr) {
        let SMOOTHING = 0.1;
        let min = undefined;
        let max = undefined;
        let avg = undefined;

        this.requestHistory.forEach((request) => {
            if (request.state != Request.success)
                return;

            let value = request[attr]();

            if (avg == undefined)
                avg = value;
            else
                avg = (SMOOTHING * value) + ((1 - SMOOTHING) * avg);

            if (value < min || min == undefined)
                min = value;

            if (value > max || max == undefined)
                max = value;
        });

        return {min, avg, max};
    }

    speedHistory() {
        return this.valueHistory('speed');
    }

    latencyHistory() {
        return this.valueHistory('latency');
    }
};
