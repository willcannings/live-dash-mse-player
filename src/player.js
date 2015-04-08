'use strict';

// Code Notes:
// - the classes in models.js are used to represent the raw data encoded by an
//   mpd file after a small amount of processing. e.g duration strings are
//   parsed to milliseconds, inheritence is applied, template strings are
//   processed etc.
// - the classes in player.js may also act as a model, and will sometimes wrap
//   a model object from models.js, but will extend it to help implement the
//   player. e.g Source 'wraps' an AdaptationSet, but includes logic for
//   selecting a Representation and creating buffers. some classes, like the
//   PresentationController, wrap multiple underlying models.
// - all downloads are run through a Downloader object (on a
//   PresentationController). download requests have an associated 'processor'
//   which is an object conforming to RequestProcessor. processors manage
//   responses, and are responsible for creating/removing/updating objects such
//   as Periods, and appending segment data to buffers.
// - actions which affect the state of the presentation are generally managed
//   by the PresentationController. so while an MPDProcessor creates/updates
//   Periods (which creates Sources etc.), the controller is responsible for
//   determining when to download init files, segments etc. i.e processors
//   deal with Requests and the controller deals with events generated by the
//   objects processors create.
// - some assumptions are made to simplify the code. some of these are required
//   by certain profiles (such as live and avc/h264), others exist because most
//   manifests "in the wild" satisfy the requirement. e.g: all periods will
//   contain the same number of adaptation sets. all equivalent adaptation sets
//   will contain the same number of representations, and each equivalent
//   representation will have the same mimeType and codec. bitrate/size
//   switching will be performed on representations only - adaptation sets are
//   assumed to represent tracks/sources, not representation options.


// --------------------------------------------------
// player
// --------------------------------------------------
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
        // TODO: ensure 'url' is provided
        this.options = Object.assign({
            pauseDetectInterval: 5,         // seconds
            debugInterval: 2,               // seconds

            mpdTimeout: 30,                 // seconds
            mpdReloadDelay: 0.2,            // seconds
            mpdMaxReloadAttempts: 5,

            noTimeshift: false              // true if live streams won't rewind
        }, opts);

        let player = this;

        // ---------------------------
        // video element
        // ---------------------------
        this.video = this.options.element;
        if (this.video.jquery)
            this.video = this.video[0];

        // for debugging - publicise all video events
        this.videoEventHandler = function(event) {
            console.log('video element event:', event.type);
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

            if (this.video.buffered.length > 0) {
                let last = this.video.buffered.end(0);
                let remaining = last - current;
                console.log('* time:', current, ' buffered:', last,
                            'remaining:', remaining);
            } else {
                console.log('* time:', current, ' buffered: nil');
            }
        }, this.options.debugInterval * 1000);


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
        URL.revokeObjectURL(this.video.src);
        this.mediaSource = null;

        // clear timers
        clearTimeout(this.playbackTimer);
        clearInterval(this.bufferInfo);

        // cleanup the console
        console.groupEnd();
        console.log('destruction complete');
    }


    // ---------------------------
    // states/events
    // ---------------------------
    emit(eventType) {
        let event = new Event(`player:${eventType}`);
        this.video.dispatchEvent(event);
    }

    state() {
        return this.controller.state;
    }

    set duration(newDuration) {
        this.mediaSource.duration = newDuration / 1000;
        console.log('set video duration to', this.mediaSource.duration);
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
