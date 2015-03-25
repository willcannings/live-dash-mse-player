'use strict';

import { Manifest } from 'models';

// allow 20% of a segment's duration to download the next segment
var DOWNLOAD_FUDGE = 0.8;


// --------------------------------------------------
// segment and scheduling
// --------------------------------------------------
var SEGMENT_STATES = {
    PENDING: 0,
    DOWNLOADING: 1,
    DOWNLOADED: 2
};

class Segment {
    constructor(url, time, number, availabilityStartTime) {
        this.availabilityStartTime = availabilityStartTime;
        this.number = number;
        this.time = time;
        this.url = url;

        this.state = SEGMENT_STATES.PENDING;
        this.data = null;
    }
}

class Timeline {
    constructor(player, adaptationSet, initialTime) {
        this.adaptationSet = adaptationSet;
        this.player = player;

        this.representation     = adaptationSet.representations[0];
        this.template           = this.representation.segmentTemplate;
        this.timeline           = this.template.segmentTimeline;
        this.initializationURL  = player.currentManifest.base() +
                                    this.template.initialization;

        if (this.timeline) {
            this.time   = this.timeline.ss[0].t;
            this.number = 0;
            console.log('Timeline using SegmentTimeline - time:', this.time, 'number:', this.number);
        } else {
            // convert duration to seconds
            let dur = this.template.duration / this.template.timescale;

            // round the time difference between now and availability time
            // down to the nearest dur
            let diff = initialTime - player.currentManifest.availabilityStartTime;
            let rounded = Math.floor(diff / dur);
            this.time = (rounded * dur) * this.template.timescale;

            // number is the 0 based index of the current segment, where
            // segment 0 starts at 0s, 1 starts at duration, 2 starts
            // at 2 * duration etc.
            this.number = rounded + this.template.startNumber;
            console.log('Timeline - time:', this.time, 'number:', this.number, 'original number:', rounded);
        }
    }

    tick() {
        this.number += 1;

        if (this.timeline)
            this.time += this.timeline.ss[0].d;
        else
            this.time += this.template.duration;
    }

    segmentRequest() {
        let url = this.player.currentManifest.base() +
                    this.template.media.format(this.number, this.time);
        return new Segment(url);
    }

    codecs(component = null) {
        if (this.representation.subRepresentations.length > 0)
            return this.representation.subRepresentationWithIndex(component).codecs;
        else
            return this.representation.codecs;
    }
}

class Source {
    constructor(player, adaptationSet, initialTime, index) {
        console.log('creating new source', index);
        this.timeline = new Timeline(player, adaptationSet, initialTime);
        let type = `${adaptationSet.mimeType}; codecs="${this.timeline.codecs()}"`;
        this.buffer = player.mediaSource.addSourceBuffer(type);
        this.buffer.mode = 'sequence';
        this.player = player;

        this.ident = `Source ${index} (${type}):`;
        console.log(this.ident, 'created; added buffer and created timeline', this.timeline);

        // start the queue with the first segment - this is needed to know
        // the starting currentTime playback position
        this.queue = [this.timeline.segment()];
        
        this.then = null;
        let source = this;

        this.buffer.addEventListener('update', function() {
            if (source.then)
                source.then();
            source.then = null;
        });

        this.loadInitializationFile();
    }

    loadInitializationFile() {
        console.log(this.ident, 'loading initialization file');
        let source = this;

        this.getFile(this.timeline.initializationURL, function() {
            console.log(this.ident, 'loaded initialization file, loading first segment');
            source.loadFirstSegment();
        });

                source.timeline.tick();
                source.getFile(source.timeline.mediaURL(), function() {
                    source.timeline.tick();
                    source.getFile(source.timeline.mediaURL(), function() {
                        console.log(source.ident, 'loaded 3 segments');
                        source.player.element.play();
                    })
                })
            })
        });
    }

    loadFirstSegment() {
        let source = this;

        this.getFile(this.queue.shift(), function() {
            console.log(source.ident, 'loaded first segment, now buffering minBufferTime segments');
            source.player.loadedFirstSegment();
        });
    }

    loadSegment(segment) {
        segment.downloading = true;
        this.getFile(segment.url);
    }

    getFile(url, then) {
        let source = this;
        let xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = 'arraybuffer';
        console.log(this.ident, 'loading', url);

        xhr.onreadystatechange = function() {
            if (this.readyState != this.DONE)
                return;

            if (this.status != 200) {
                console.log(source.ident, 'error loading segment or initialization file', xhr);
                return;
            }

            source.then = then;
            source.buffer.appendBuffer(new Uint8Array(this.response));
        }

        xhr.send();
    }
}


class Manager {
    constructor(player, element) {
        this.player = player;
        this.element = element;

        var manager = this;
        this.interval = setInterval(function() {
            manager.run();
        }, 100);
    }

    run() {
        let now = Date.now();

        // start downloading newly available segments
        for (let source of this.player.sources) {
            // for timelines without an end (i.e without duration and r
            // attributes), generate new segments when needed
            source.timeline.update();

            for (let segment of source.timeline.segments) {
                if (segment.availabilityStartTime <= now &&
                    segment.state == SEGMENT_STATES.PENDING)
                {
                    segment.state = SEGMENT_STATES.DOWNLOADING;
                    downloader.get(segment.url, function(data) {
                        segment.state = SEGMENT_STATES.DOWNLOADED;
                        segment.data = data;
                        source.add(segment);
                    });
                }

            }
        }
    }
}

class Downloader {
    constructor() {
        this.latencies = [];
        this.drifts = [];
        this.speeds = [];
    }
}


// --------------------------------------------------
// player
// --------------------------------------------------
var PLAYER_STATES = {
    UNINITIALISED: 0,
    LOADED_FIRST_MPD: 1,
    STARTED_FIRST_BUFFER: 2,
    ALL_FIRST_SEGMENTS_AVAILABLE: 3,
    PD_BUFFER_FILLED: 4,
    PLAYING: 5,
    STALLED: 6
};

var PLAYER_STATE_DESCRIPTIONS = [
    'uninitialised',
    'loaded first mpd',
    'started first buffer',
    'all first segments available',
    'presentation delay buffer filled',
    'playing',
    'stalled'
];

export default class {
    constructor(opts) {
        // merge default and supplied options
        this.options = jQuery.extend({
        }, opts);

        this.currentManifest = null;
        this.manifests = [];
        this.sources = [];

        this.element = this.options.element[0];
        this.mediaSource = new MediaSource();
        window.ms = this.mediaSource;
        this.element.pause();
        this.element.src = URL.createObjectURL(this.mediaSource);
        console.log('created media source');

        let player = this;

        // ---------------------------
        // media source events
        // ---------------------------
        this.mediaSource.addEventListener('sourceopen', function() {
            console.log('media source open');
            player.reloadManifest();
            player.emit('loading');
        });

        this.mediaSource.addEventListener('sourceended', function() {
            console.log('media source ended');
        });

        this.mediaSource.addEventListener('sourceclose', function() {
            console.log('media source close');
        });

        // ---------------------------
        // video element events
        // ---------------------------
        let video = this.options.element;

        video.on('loadstart emptied canplay canplaythrough ended progress' +
                 'stalled playing suspend loadedmetadata waiting abort' +
                 'loadeddata play error pause durationchange seeking seeked',
                 function(e) {
            console.log('video element:', e.type)
        });

        // catch when playback stops
        video.on('timeupdate', function() {
            if (player.playbackTimer)
                clearTimeout(player.playbackTimer);
            player.playbackTimer = setTimeout(function() {
                console.error('timeupdate not triggered for 5s, stopped?');
                clearInterval(player.updater);
                player.updater = null;
            }, 5 * 1000);
        });

        // show buffer info every second while playing
        function createUpdater() {
            player.updater = setInterval(function() {
                try {
                    let current = player.element.currentTime;
                    let last = player.element.buffered.end(0);
                    let remaining = last - current;
                    console.log('* time:', current, ' buffered:', last, 'remaining:', remaining);
                } catch (e) {
                    //console.log('could not update time:', e);
                }
            }, 2 * 1000);
        }
        
        video.on('playing', function() {
            if (!player.updater)
                createUpdater();
        });

        createUpdater();
    }

    emit(event) {
        jQuery(this.element).trigger('player:' + event);
    }

    // ---------------------------
    // buffering
    // ---------------------------
    loadedFirstSegment() {
        // each segment has an offset time that will generally be > 0 in
        // a live stream. once all tracks have loaded their first segment,
        // set the video's current playback time to the offset of the first
        // segments so playback can start.
        for (var i = 0; i < this.sources.length; i++)
            if (this.sources[i].buffered.length == 0)
                return;

        let startTime = this.element.buffered.start(0);
        this.element.currentTime = startTime;
        console.log('playback starts from', startTime);
    }

    startBuffering() {

    }

    // ---------------------------
    // manifest loading
    // ---------------------------
    reloadManifest() {
        console.log('reloading manifest from', this.options.url);
        let player = this;

        jQuery.ajax({
            url: this.options.url,
            dataType: 'xml'
        }).done(function(xml) {
            let manifestEl = xml.getElementsByTagName('MPD')[0];
            let manifest = new Manifest(manifestEl);
            manifest.url = player.options.url;
            console.log('loaded manifest', manifest);

            player.manifests.push(manifest);
            player.currentManifest = manifest;
            player.reloadSources();

        }).fail(function(xhr, status, error) {
            console.error('error loading manifest', status, error);
        });
    }

    reloadSources() {
        console.log('reloading sources');
        let period = this.currentManifest.period;

        if (this.sources.length == 0) {
            // load segments from current time - presentation delay
            let startTime = (Date.now() / 1000) - this.currentManifest.suggestedPresentationDelay;
            console.log('first load, loading segments from', startTime);

            // set the video width and height from the first adaptationSet
            // FIXME: this assume AS[0] is a video track
            this.element.width = period.adaptationSets[0].representations[0].width;
            this.element.height = period.adaptationSets[0].representations[0].height;

            for (var i in period.adaptationSets) {
                let adaptationSet = period.adaptationSets[i];
                try {
                    let source = new Source(this, adaptationSet, startTime, index);
                    this.sources.push(source);
                } catch (e) {
                    console.log('exception creating source', e);
                }
            }
        }

        console.log('loaded sources', this.sources);
    }
}
