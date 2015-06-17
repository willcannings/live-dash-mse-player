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

    start(downloader, options) {
        options.url = downloader.pickHost(options.url);
        this.startRequest(options);
    }

    startRequest(options) {
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

        // range requests
        if (options.range)
            xhr.setRequestHeader('Range', `bytes=${options.range}`);


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

        // http was successful, but only 200 || 206 responses are accepted
        xhr.onload = function() {
            if (this.status == 200 || (options.range && this.status == 206)) {
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
class Host {
    constructor(host, controller) {
        this.host = host;
        this.failed = 0;
        this.re_enable = null;
        this.options = controller.options;
    }

    get online() {
        // if the host has been taken offline and the offline duration has
        // passed, re-enable the host for download
        if (this.re_enable && this.re_enable <= performance.now()) {
            this.re_enable = null;
            this.failed = 0;
        }

        // the host is considered online as long as a maximum number of error
        // requests hasn't been exceeded.
        let maxFailed = this.options.maxHostFailedRequests;
        return this.failed <= maxFailed;
    }

    failed() {
        // hosts are taken offline when a maximum number of error requests has
        // been reached, so each error is tracked on the host
        let maxFailed = this.options.maxHostFailedRequests;
        let offlineDuration = this.options.hostOfflineDuration;
        this.failed += 1;

        // when the max failed requests count is exceeded, the host is taken
        // offline for a period of time to allow it to recover
        if (this.failed > maxFailed)
            this.re_enable = performance.now() + (offlineDuration * 1000);
    }
};

class Downloader {
    constructor(controller) {
        this.hosts = [];
        this.nextHost = 0;
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

    hostAt(index) {
        var host = this.hosts[index];
        if (host.re_enable <= performance.now())
            host.online = true;
        return host;
    }

    pickHost(url) {
        let numHosts = this.hosts.length;
        let index = this.nextHost;
        let host = this.hostAt(index);

        // round robin requests between hosts. when a host is offline iterate
        // through the list to find the next online host. if no hosts are
        // online (the iteration reaches the same index as the start of the
        // loop) trigger an error condition on the request.
        while (!host.online) {
            index = (index + 1) % numHosts;
            if (index == this.nextHost)
                return null;
            host = this.hostAt(index);
        }

        // replace the host of the URL and update nextHost to point to the next
        // host in the list so requests are round robin'd
        url = URI(url).host(host.host);
        this.nextHost = (index + 1) % numHosts;
        return url.toString();
    }

    getMPD(url, processor) {
        this.truncateHistory();
        this.requestHistory.push(
            new Request().start(this, {
                url,
                processor,
                mimeType: 'text/xml',
                timeout: this.controller.options.mpdTimeout
            })
        );
    }

    getMedia(url, range, processor) {
        this.truncateHistory();
        this.requestHistory.push(
            new Request().start(this, {
                url,
                range,
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
