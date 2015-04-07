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
    }

    destruct() {
        for (let request of this.requestHistory) {
            if (request.state == Request.inprogress)
                request.destruct();
        }
    }

    getMPD(url, processor) {
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
        this.requestHistory.push(
            new Request().start({
                url,
                processor,
                responseType: 'arraybuffer'
            })
        );
    }

    averageSpeed() {
        let SMOOTHING = 0.1;
        let speed = 0;

        this.requestHistory.forEach((request) => {
            if (request.state == Request.success)
                speed = (SMOOTHING * request.speed()) +
                        ((1 - SMOOTHING) * speed);
        });
    }
};


// --------------------------------------------------
// mpd processor
// --------------------------------------------------
class MPDProcessor extends RequestProcessor {
    constructor(controller) {
        this.controller = controller;
        this.reloadAttempts = 0;
    }

    error(xhr) {
        console.log('error loading mpd', xhr);
        this.attemptReload();
    }

    timeout(xhr) {
        console.log('timeout loading mpd', xhr);
        this.attemptReload();
    }

    success(xhr) {
        // re-attempt download if an mpd response is empty
        if (this.emptyResponse(xhr))
            return;

        // ensure the mpd appears valid before parsing
        let mpds = xhr.responseXML.getElementsByTagName('MPD');
        if (this.invalidResponse(mpds))
            return;

        // mpd appears valid, reset reloadAttempts for future requests
        let controller = this.controller;
        this.reloadAttempts = 0;

        // parse the manifest; the presentation and child objects will add/
        // remove periods and segments as required
        let manifest = new Manifest(mpds[0], controller.manifestURL);
        controller.loadedManifest(manifest);
    }

    // elemental boxes can write empty mpd files temporarily. handle this by
    // re-attempting download after a short delay.
    emptyResponse(xhr) {
        if (xhr.responseXML != null) {
            return false;
        } else {
            console.log('error loading mpd, response is empty', xhr);
            this.attemptReload();
            return true;
        }
    }

    // ensure the document is an mpd
    invalidResponse(mpds) {
        if (mpds.length != 1) {
            if (mpds.length == 0)
                console.log('no mpd element found in the mpd response');
            else
                console.log('multiple mpd elements were found in the mpd response');
            return true;
        }
    }

    attemptReload() {
        let controller = this.controller;
        let options = controller.options;

        if (this.reloadAttempts <= options.mpdMaxReloadAttempts) {
            console.log(
                `attempting mpd reload (#${this.reloadAttempts})`
            );

            this.reloadAttempts += 1;
            setTimeout(function() {
                controller.loadManifest();
            }, options.mpdReloadDelay);
            
        } else {
            console.log('the maximum number of mpd reloads has been reached ' +
                        'without successfully loading the mpd file.');
            this.reloadAttempts = 0;
        }
    }
}


// --------------------------------------------------
// source initialisation file processor
// --------------------------------------------------
class InitFile extends RequestProcessor {
    constructor(source) {
        this.source = source;

        // generate init url from the initial representation
        let firstPeriod = source.timeline.currentPeriod;
        let representation = firstPeriod.currentRepresentation;
        this.url = representation.segmentTemplate.initialization;

        // this.url will be a relative url. absolutify it relative to the
        // manifest base url (either defined by BaseURL or by the manifest URL)
        let baseURL = source.presentation.manifest.base();
        this.url = URI(this.url).absoluteTo(baseURL).toString();
        console.log('initialising', source.contentType, 'with', this.url);
    }

    error(xhr) {
        console.log('error loading init file', this.url, xhr);
        throw 'error loading init file';
    }

    timeout(xhr) {
        console.log('timeout loading init file', this.url, xhr);
        throw 'timeout loading init file';
    }

    success(xhr) {
        console.log('loaded init file for', this.source.contentType);
        this.source.buffer.appendBuffer(new Uint8Array(xhr.response));
        this.source.state = Source.initialised;
        this.source.controller.sourceInitialised();
    }
};


// --------------------------------------------------
// segments
// --------------------------------------------------
class Segment {
    constructor(duration, number, time, timeline) {
        //this.availabilityStartTime = availabilityStartTime;
        this.duration   = duration;
        this.number     = number;
        this.time       = time;
        this.timeline   = timeline;
        this.state      = Segment.pending;
        this._url       = null;
    }

    // lazily evaluate url so changes to currentRepresentation can apply
    url(memoise = false) {
        if (this._url)
            return this._url;

        let template = this.timeline.currentRepresentation.segmentTemplate;
        let path = template.media.format(this.number, this.time);

        let baseURL = this.timeline.presentation.manifest.base();
        let url = URI(path).absoluteTo(baseURL).toString();

        if (memoise)
            this._url = url;
        return url;
    }

    available() {
        return true;
    }

    equal(other) {
        this.duration == other.duration &&
            (this.time == other.time || this.number == other.number);
    }

    error(xhr) {
        this.state = Segment.error;
        console.log('error loading segment', this._url, xhr);
        throw 'error loading segment';
    }

    timeout(xhr) {
        this.state = Segment.error;
        console.log('timeout loading segment', this._url, xhr);
        throw 'timeout loading segment';
    }

    success(xhr) {
        console.log('loaded segment for', this.timeline.source.contentType);
        this.timeline.source.buffer.appendBuffer(new Uint8Array(xhr.response));
        this.state = Segment.downloaded;
        this.timeline.downloadedSegment();
    }
}

// segment states
Segment.pending     = 0;
Segment.downloading = 1;
Segment.downloaded  = 2;
Segment.error       = 3;
