'use strict';

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
        // merge default and supplied options
        this.options = Object.assign({
            pauseDetectInterval: 5,
            debugInterval: 2
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
                if (player.playbackTimer)
                    clearTimeout(player.playbackTimer);

                let interval = player.options.pauseDetectInterval;
                player.playbackTimer = setTimeout(() => {
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
                player.presentationController.reloadManifest();
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
                console.log('* time:', current, ' buffered:', last, 'remaining:', remaining);
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
        this.presentationController = new PresentationController(this);
    }

    destruct() {
        console.log('player destructing');
        this.emit('destructing');

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
    }

    emit(eventType) {
        let event = new Event(`player:${eventType}`);
        this.video.dispatchEvent(event);
    }

    state() {
        return this.presentationController.state;
    }
}


// --------------------------------------------------
// presentation controller
// --------------------------------------------------
const PresentationStates = {
    uninitialised: 0,
    loadedFirstMPD: 1,
    loadedInitFiles: 2,
    loadedFirstSegments: 3,
    bufferAvailable: 4,
    stalled: 5,
    complete: 6
};

const PRESENTATION_STATE_DESCRIPTIONS = [
    'uninitialised',
    'loaded first mpd',
    'loaded all init files',
    'loaded first segments',
    'buffer available',
    'stalled',
    'complete'
];

class PresentationController {
    constructor(player) {
        this.player  = player;
        this.mpdURL  = player.options.url;
        this.state   = PresentationStates.uninitialised;

        this.currentManifest = null;
        this.manifests = [];
        this.sources = [];
    }

    setState(newState) {
        if (this.state == newState)
            return;
        this.state = newState;
        this.player.emit('stateChanged');
    }


    // ---------------------------
    // mpd file
    // ---------------------------
    reloadManifest() {
        console.log('loading manifest from', this.mpdURL);

        jQuery.ajax({
            url: this.mpdURL,
            dataType: 'xml'
        }).done(xml => {
            // parse the manifest, handling empty or error responses gracefully
            let manifestEl = xml.getElementsByTagName('MPD')[0]; // FIXME: catch empty mpd
            let manifest = new Manifest(manifestEl, this.mpdURL);
            this.manifests.push(manifest);
            this.currentManifest = manifest;
            console.log('loaded manifest', manifest);

            // set duration (in seconds) if the presentation duration is known
            if (manifest.mediaPresentationDuration != undefined)
                this.player.mediaSource.duration =
                    manifest.mediaPresentationDuration / 1000;

            // create media sources from each adaptation set
            if (this.sources.length == 0)
                this.createSources();

            // once the first MPD is loaded the presentation
            // state transitions
            if (this.state == PresentationStates.uninitialised)
                this.setState(PresentationStates.loadedFirstMPD);

        }).fail((xhr, status, error) => {
            console.error('error loading manifest', status, error);
        });
    }


    // ---------------------------
    // presentation initialisation
    // ---------------------------
    createSources() {
        let period = this.currentManifest.period;
        let dimensionsUnset = true;

        // create source objects - parse adaptation sets, select
        // an initial representation and create a timeline
        console.log('creating sources');

        for (let adaptationSet of period.adaptationSets) {
            let source = new Source(adaptationSet, this);
            this.sources.push(source);

            if (source.video() && dimensionsUnset) {
                this.player.video.width = source.currentRepresentation.width;
                this.player.video.height = source.currentRepresentation.height;
                dimensionsUnset = false;
            }
        }

        // add buffers to the player's media source object. all
        // sources contain an initialisation header file to be
        // loaded before any segments.
        console.log('creating buffers and loading init files for sources', this.sources);

        for (let source of this.sources) {
            // attempt to create a buffer with the source's mime type
            // and codec. this may fail if the browser doesn't support
            // a particular media type. TODO - support switching sources
            // based on mimetype / codec.
            try {
                source.createBuffer();
            } catch(e) {
                console.log(source.id, 'error creating buffer', e.stack, e);
                this.player.emit('errorCreatingBuffers');
            }

            // download the init file for the selected representation
            source.loadInitFile();
        }

        console.log('finished creating source buffers. waiting for init files.');
        this.player.emit('sourceBuffersCreated');
    }

    sourceInitialised() {
        // wait until all sources are successfully initialised
        // to prevent downloading segments unnecessarily
        let allInitialised =
            this.sources.every(source => source.initialised);
        if (!allInitialised)
            return;

        // transition
        this.setState(PresentationStates.loadedInitFiles);

        // seek to an initial start or live edge and begin
        // buffering segments.
        for (let source of this.sources) {
            source.seek(0);
        }
    }

    // ---------------------------
    // buffering
    // ---------------------------
    loadedFirstSegment() {
        // wait until all sources have loaded their first segment. this
        // method is called after a segment has been downloaded and
        // added to the source's buffer object
        let allLoaded =
            this.sources.every(source => source.firstSegmentLoaded);
        if (!allLoaded)
            return;

        // transition
        this.setState(PresentationStates.loadedFirstSegments);

        // each segment has an offset time that will generally be > 0
        // in a live stream. once all initial segments are loaded, set
        // the video's current playback time to the offset of the
        // first segments so playback can start.
        let startTime = this.player.video.buffered.start(0);
        this.player.video.currentTime = startTime;
        console.log('playback starts from', startTime);
        this.player.video.play();
    }
}


// --------------------------------------------------
// sources / tracks
// --------------------------------------------------
class Source {
    constructor(adaptationSet, controller) {
        this.adaptationSet = adaptationSet;
        this.controller = controller;

        this.buffer = undefined;
        this.initialised = false;
        this.firstSegmentLoaded = false;
        this.timeline = new Timeline(this);
        this.downloader = undefined;

        // start playback with the best quality representation
        this.currentRepresentation =
            adaptationSet.representationWithHighest('bandwidth');

        // id is not a required attr on AdaptationSets so we
        // generate one for use in debug messages
        let mimeType = this.currentRepresentation.mimeType;
        this.id = `Source ${adaptationSet.index} (${mimeType})`;

        this.timeline.prepareSegments();
    }

    video() {
        return this.adaptationSet.contentType == 'video' ||
                this.currentRepresentation.mimeType.includes('video/');
    }

    seek(time) {
        this.timeline.seek(time);
    }

    createBuffer() {
        // representations inherit mimeType and codecs from the
        // adaptation set if they're not specified
        let mimeType = this.currentRepresentation.mimeType;
        let codecs   = this.currentRepresentation.codecs;
        let type     = `${mimeType}; codecs="${codecs}"`;

        this.buffer = this.controller.player.mediaSource.addSourceBuffer(type);
        this.buffer.mode = 'sequence';
    }

    loadInitFile() {
        /*console.log(this.id, 'loading init file', this.timeline.initializationURL);
        let source = this;

        this.getFile(this.timeline.initializationURL, function() {
            console.log(this.ident, 'loaded initialization file, loading first segment');
            source.loadFirstSegment();
        });*/
    }
}


// --------------------------------------------------
// segments and scheduling
// --------------------------------------------------
var SegmentStates = {
    pending: 0,
    downloading: 1,
    downloaded: 2
};

class Segment {
    constructor(duration, number, time, template, manifest) {
        //this.availabilityStartTime = availabilityStartTime;
        this.duration = duration;
        this.number = number;
        this.time = time;

        this.template = template;
        this.manifest = manifest;
        this.state = SegmentStates.pending;
    }

    url() {
        let path = this.template.media.format(this.number, this.time);
        return URI(path).absoluteTo(this.manifest.base()).toString();
    }
}

class Timeline {
    constructor(source) {
        this.source = source;        
        this.reset();
    }

    seek(time) {
        this.time = time;
    }

    reset() {
        // generated segments - either pre-filled if a
        // SegmentTimeline is present, or added to as required
        this.segments = [];

        // number and time are used when generating segment URLs
        this.number = 0;
        this.time = 0;

        // when a timeline is fully specified fixed (known number
        // of segments) it's considered 'exhausted' (it cannot
        // generate any more segments, and all segments have been
        // added to the segments list)
        this.exhausted = false;
    }

    prepareSegments() {
        // segment templates are currently required
        this.template = this.source.currentRepresentation.segmentTemplate;
        this.timeline = this.template.segmentTimeline;

        if (!this.timeline) {
            // convert segment duration to seconds
            let dur = this.template.duration / this.template.timescale;

            // round time down to the nearest segment dur
            let rounded = Math.floor(this.time / dur);
            this.time = (rounded * dur) * this.template.timescale;

            // number is the 0 based index of the current segment, where
            // segment 0 starts at 0s, 1 starts at duration, 2 starts
            // at 2 * duration etc.
            this.number = rounded + this.template.startNumber;
            console.log(this.source.id, 'Timeline - time:', this.time, 'number:', this.number);

        } else {
            // a timeline is available, so we can generate all
            // segments in one go
            this.number = this.template.startNumber;

            for (let s of this.timeline.ss) {
                if (s.t != undefined)
                    this.time = parseInt(s.t, 10);

                let duration = parseInt(s.d, 10);

                for (var i = 0; i <= s.r; i++) {
                    this._addSegment(duration);
                    this.time += duration;
                    this.number += 1;
                }
            }

            this.exhausted = true;
            console.log(this.source.id, 'Timeline using SegmentTimeline - generated segments', this.segments);
        }
    }

    tick() {
        this.number += 1;
        this.time += this.template.duration;
        this._addSegment(this.template.duration);
    }

    _addSegment(duration) {
        this.segments.push(
            new Segment(
                duration,
                this.number,
                this.time,
                this.template,
                this.source.controller.currentManifest
            )
        );
    }
}
