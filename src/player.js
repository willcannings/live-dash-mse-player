'use strict';

// the Player class acts as a controller between the video
// element/media source object, and an instance of a
// PresentationController. The majority of the playback logic
// sits in the controller and other classes.
const VIDEO_EVENTS = [  'loadstart', 'emptied', 'canplay', 'canplaythrough',
                        'ended', 'progress', 'stalled', 'playing', 'suspend',
                        'loadedmetadata', 'waiting', 'abort', 'loadeddata',
                        'play', 'error', 'pause', 'durationchange', 'seeking',
                        'seeked'
                     ];

class Player {
    constructor(opts) {
        this.options = Object.assign({
            // manifest/mpd
            mpdTimeout: 30,                 // seconds
            mpdReloadDelay: 0.2,            // seconds
            mpdMaxReloadAttempts: 5,

            // playback
            noTimeshift: false,             // true if live streams won't rewind
            ignoreAudio: false,             // skip audio source when true
            overrideDelay: undefined,       // seconds; when !undefined, override suggestedPresentationDelay

            // network
            downloadHistory: 100,           // max number of recent requests to cache
            maxBaseFailedRequests: 2,       // max number of failed requests to a base before it's taken offline
            baseOfflineDuration: 60,        // seconds; when base is taken offline it won't receive requests for this duration
            overrideBaseTransforms: [],     // list of base uris to balance requests betwen
            baseFailureWindow: 60 * 60,     // seconds; window a failed request will affect a base. helps long running players.
            shuffleAfter: 60,               // seconds; bases list will be shuffled every N seconds to prevent one base always responding to 1 request type

            // workarounds/debugging
            chromeDOMFixInterval: 0,        // seconds; when > 0 add DOM elements to fix Chrome bug
            pauseDetectInterval: 1,         // seconds
            debugInterval: 2,               // seconds
            showVideoEvents: true
        }, opts);

        if (!this.options.url)
            throw 'manifest url must be provided in the "url" option';


        // ---------------------------
        // video element
        // ---------------------------
        this.video = this.options.element;
        if (this.video.jquery)
            this.video = this.video[0];

        this.video.player = this;
        let player = this;

        // for debugging - publicise all video events
        this.videoEventHandler = function(event) {
            if (player.options.showVideoEvents)
                console.log(`video element event: ${event.type}`);
        }

        for (let eventType of VIDEO_EVENTS) {
            this.video.addEventListener(eventType, this.videoEventHandler);
        }

        // detect when playback stops
        this.video.addEventListener('timeupdate',
            this.videoTimeUpdateEventHandler = function() {
                // every time currentTime changes, clear the timer and reset it
                // for pauseDetectInterval seconds. if playback continues it'll
                // be cleared again and again until playback stalls
                if (player.playbackTimer)
                    clearTimeout(player.playbackTimer);

                let interval = player.options.pauseDetectInterval;

                player.playbackTimer = setTimeout(() => {
                    // pause and end states validly stop playback
                    if (player.video.paused || player.video.ended)
                        return;
                    console.error(
                        `timeupdate not triggered for ${interval}s, playback stopped?`
                    );
                    if (player.options.pauseDetectCallback)
                        player.options.pauseDetectCallback();
                }, interval * 1000);
            }
        );


        // ---------------------------
        // backing media source
        // ---------------------------
        this.mediaSource = new MediaSource();
        this.video.src   = URL.createObjectURL(this.mediaSource);

        this.mediaSource.addEventListener('sourceopen',
            this.mseOpenHandler = function() {
                console.log('media source open');
                player.controller.loadManifest();
                player.emit('loading');
            }
        );

        this.mediaSource.addEventListener('sourceended',
            this.mseEndedHandler = function() {
                console.log('media source ended');
            }
        );

        this.mediaSource.addEventListener('sourceclose',
            this.mseCloseHandler = function() {
                console.log('media source closed');
            }
        );


        // ---------------------------
        // debug information
        // ---------------------------
        // show buffer info every second while playing
        this.bufferInfo = setInterval(() => {
            let current = this.video.currentTime;
            let offset  = current - this.controller.presentation.startTime;

            if (this.video.buffered.length > 0) {
                let last = this.video.buffered.end(0);
                let remaining = last - current;
                let downloader = this.controller.downloader;
                let avgSpeed = downloader.speedHistory(RequestProcessor.media).avg;
                avgSpeed *= 1000; // seconds
                avgSpeed /= 1024; // kilobytes

                console.log(`\t time: ${current.toFixed(2)} ` +
                            `(${offset.toFixed(2)}), ` +
                            `buffered: ${last.toFixed(2)}, ` +
                            `remaining: ${remaining.toFixed(2)}, ` +
                            `avg speed: ${avgSpeed.toFixed(2)}kbps`);
            } else {
                console.log(`\t time: ${current.toFixed(2)}, buffered: nil`);
            }
        }, this.options.debugInterval * 1000);


        // ---------------------------
        // chrome fix
        // ---------------------------
        // when playing a live stream for a long time (10+hrs) a bug in Chrome
        // 41+ causes repaints of the video element to stop. video.currenTime
        // continues to increase, and so does webkitDecodedFrameCount. A 'fix'
        // is to jiggle the DOM by adding a sibling element and positioning it,
        // before removing it again later.
        if (this.options.chromeDOMFixInterval > 0) {
            this.chromeDOMInterval = setInterval(() => {
                // create a simple, positioned element
                let element = document.createElement('div');
                element.style.cssText = `
                    position: absolute;
                    top: 0px;
                    left: 0px;
                    width: 100%;
                    height: 100%;
                `;

                // add the element to the DOM to re-start video paints. remove
                // the element after a second as it's not needed
                console.log('adding empty element to restart Chrome paints');
                document.body.appendChild(element);
                setTimeout(() => {
                    console.log('removing element, paints should be running');
                    document.body.removeChild(element);
                }, 1000);

            }, this.options.chromeDOMFixInterval * 1000);
        }


        // ---------------------------
        // controller
        // ---------------------------
        // instantiate the controller after the video element
        // and MS object are prepared. the sourceopen event
        // from the MS object starts the presentation.
        this.controller = new PresentationController(this);
    }


    // ---------------------------
    // destruction
    // ---------------------------
    destruct() {
        console.log('player destructing');
        this.emit('destructing');

        // allow the controller and presentation to destruct
        this.controller.destruct();
        this.controller = null;

        // detach video element event handlers
        this.video.removeEventListener('timeupdate', this.videoTimeUpdateEventHandler);
        for (let eventType of VIDEO_EVENTS) {
            this.video.removeEventListener(eventType, this.videoEventHandler);
        }

        // detach mse event handlers
        this.mediaSource.removeEventListener('sourceopen', this.mseOpenHandler);
        this.mediaSource.removeEventListener('sourceended', this.mseEndedHandler);
        this.mediaSource.removeEventListener('sourceclose', this.mseCloseHandler);

        // free the media source object and url
        this.video.pause();
        this.video.player = null;
        URL.revokeObjectURL(this.video.src);
        this.mediaSource = null;

        // clear timers
        if (this.chromeDOMInterval)
            clearInterval(this.chromeDOMInterval);
        clearTimeout(this.playbackTimer);
        clearInterval(this.bufferInfo);

        // cleanup the console
        console.groupEnd();
        console.log('destruction complete');
    }


    // ---------------------------
    // states/events
    // ---------------------------
    emit(type) {
        let eventType = `player:${type}`;

        try {
            var event = new Event(eventType);
        } catch (ignore) {
            var event = document.createEvent('Event');
            event.initEvent(eventType, true, true);
        }

        this.video.dispatchEvent(event);
    }

    state() {
        return this.controller.state;
    }

    set duration(newDuration) {
        this.mediaSource.duration = newDuration;
        console.log(`set video duration to ${this.mediaSource.duration}`);
        this.emit('durationChange');
    }

    get duration() {
        return this.mediaSource.duration;
    }

    setDimensions(width, height) {
        this.videoWidth = width;
        this.videoHeight = height;
        this.emit('dimensionChange');
    }
}
