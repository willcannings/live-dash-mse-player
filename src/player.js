'use strict';

import { Manifest } from 'models';

// allow 20% of a segment's duration to download the next segment
var DOWNLOAD_FUDGE = 0.8;


// --------------------------------------------------
// segment and scheduling
// --------------------------------------------------
class Segment {
    constructor(url, availabilityStartTime) {
        this.availabilityStartTime = availabilityStartTime;
        this.url = url;
    }

    isAvailable() {
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

    mediaURL() {
        return this.player.currentManifest.base() +
                 this.template.media.format(this.number, this.time);
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
        
        this.then = null;
        let source = this;

        this.buffer.addEventListener('update', function() {
            if (source.then)
                source.then();
            source.then = null;
        });

        this.initialise();
    }

    initialise() {
        console.log(this.ident, 'start initialise');
        let source = this;

        this.getFile(this.timeline.initializationURL, function() {
            console.log(this.ident, 'done initialise, starting first segment request');
            source.getFile(source.timeline.mediaURL(), function() {
                console.log(source.ident, 'loaded first segment, seeking and starting regular updates');
                try {
                    source.player.element.currentTime = source.player.element.buffered.start(0);
                } catch (e) {}
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


// --------------------------------------------------
// player
// --------------------------------------------------
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
                let current = player.element.currentTime;
                let last = player.element.buffered.end(0);
                let remaining = last - current;
                console.log('* time:', current, ' buffered:', last, 'remaining:', remaining);
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
        let manifest = this.currentManifest;
        let now = Date.now() / 1000;

        if (this.sources.length == 0) {
            console.log('first load');
            this.element.width = period.adaptationSets[0].representations[0].width;
            this.element.height = period.adaptationSets[0].representations[0].height;
            let index = 0;

            for (let adaptationSet of period.adaptationSets) {
                try {
                    let source = new Source(this, adaptationSet, now, index);
                    this.sources.push(source);
                } catch (e) {
                    console.log('exception creating source', e);
                }
                index += 1;
            }
        }

        console.log('loaded sources', this.sources);
    }
}
