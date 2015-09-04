"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var SegmentWindow = (function (_PlayerObject) {
    function SegmentWindow(source) {
        _classCallCheck(this, SegmentWindow);

        this.source = source;
        this.presentation = source.presentation;
        this.timeline = source.presentation.timeline;

        this.segments = [];
        this.currentTime = undefined;
        this.playIndex = undefined;
        this.loadIndex = undefined;
        this.nextRangeStart = undefined;
    }

    _inherits(SegmentWindow, _PlayerObject);

    _createClass(SegmentWindow, {
        update: {

            // ---------------------------
            // update segment list
            // ---------------------------

            value: function update() {
                if (this.presentation.willStartAtBeginning) this.updateStatic();else this.updateDynamic();
            }
        },
        updateStatic: {

            // called once at presentation start - generate and load all segments

            value: function updateStatic() {
                var duration = this.timeline.duration;
                if (duration == undefined) throw "cannot play static presentation with unknown duration";

                this.segments = this.source.segmentsInRange(0, duration);
                this.loadIndex = 0;
            }
        },
        updateDynamic: {

            // called every time the manifest is loaded

            value: function updateDynamic() {
                console.group();
                console.log("updating " + this.source.contentType + " segments");
                if (this.nextRangeStart != undefined) console.log("from " + this.nextRangeStart.toFixed(2));

                // add segments from the end of the last segment to the new live edge
                var liveEdge = this.presentation.liveEdge();
                var edgeSegment = this.source.segmentAt(liveEdge);
                var rangeStart = this.nextRangeStart;
                var rangeEnd = liveEdge;

                // if no segments have ever been added, choose a start based on the
                // live edge, moving back a little to help ensure continuous streaming
                if (rangeStart == undefined) {
                    // because of slight timing differences, the edge segment may not
                    // always be found. try and use the last available timeline segment
                    // if possible, or change the search to the presentation end time.
                    if (!edgeSegment) {
                        var content = this.source.contentAt(liveEdge);
                        if (content.repeatSegment) {
                            edgeSegment = content.segmentAt(this.presentation.endTime);
                        } else {
                            var candidates = content.segments;
                            edgeSegment = candidates[candidates.length - 1];
                        }
                    }

                    rangeStart = edgeSegment.start;

                    // we need to ensure start doesn't fall outside the timeshift range
                    var manifest = this.presentation.manifest;
                    var timeshift = manifest.timeShiftBufferDepth;
                    var minStart = rangeStart - timeshift;

                    // if a suggested delay is provided, move back by that many seconds
                    if (this.presentation.hasSuggestedDelay) {
                        rangeStart -= this.presentation.suggestedDelay;

                        // otherwise use the timeshift buffer to determine the start time
                        // divide the timeshift in half as a heuristic so we're not too
                        // far off the actual live edge
                    } else {
                        rangeStart -= timeshift / 2;
                    }

                    // ensure rangeStart falls on a valid segment
                    rangeStart = Math.max(rangeStart, minStart); // start >= now - timeshift
                    rangeStart = Math.max(rangeStart, 0); // start >= 0
                    var startDiff = liveEdge - rangeStart;
                    console.log("queueing " + startDiff.toFixed(2) + "s from live edge");
                }

                // if queueSegments was called before a manifest reload, and extra
                // segments were available to be queued (either repeating segments
                // or extra segments in a timeline) we've already queued segments
                // after the old live edge. rather than adding new segments here,
                // the manifest reload has extended the presentation end time, which
                // helps in future calls to queueSegments.
                if (rangeEnd <= rangeStart) {
                    console.log("already queued segments in live edge window " + ("" + rangeEnd.toFixed(2) + " to " + rangeStart.toFixed(2)));
                } else {
                    this.queueSegments(rangeStart, rangeEnd, liveEdge);
                }

                console.groupEnd();
            }
        },
        queueSegments: {
            value: function queueSegments(rangeStart, rangeEnd, liveEdge) {
                // grab the segments in the range and start to merge into the existing
                // segments list. the initial update will assign the first set of
                // segments to the list, subsequent updates are based on the end time
                // of the last segment added previously, so no overlaps should occur
                // other than the last and first new segments being equal.
                console.log("queueing " + rangeStart.toFixed(2) + " to " + ("" + rangeEnd.toFixed(2)));
                var newSegments = this.source.segmentsInRange(rangeStart, rangeEnd);

                if (newSegments.length == 0) {
                    console.warn("no segments produced over this range");
                    return;
                }

                var startOffset = liveEdge - newSegments[0].start;
                console.log("got " + newSegments.length + " segment(s), starting " + ("" + newSegments[0].start.toFixed(2) + " ending ") + ("" + newSegments[newSegments.length - 1].end.toFixed(2) + ", ") + ("" + startOffset.toFixed(2) + "s from live edge"));

                if (this.segments.length > 0) {
                    var lastSegment = this.segments[this.segments.length - 1];
                    if (lastSegment.equal(newSegments[0])) newSegments.splice(0, 1);

                    var lastEnd = lastSegment.end;
                    if (lastEnd != newSegments[0].start) console.error("discontiguous segments");

                    this.segments = this.segments.concat(newSegments);
                } else {
                    this.segments = newSegments;
                }

                // the next update will load from the end of the last segment
                this.nextRangeStart = newSegments[newSegments.length - 1].end;
                this.loadIndex = this.loadIndex || 0;

                // debug output
                var duration = 0;
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = newSegments[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var segment = _step.value;

                        duration += segment.durationSeconds;
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator["return"]) {
                            _iterator["return"]();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }

                var time = performance.now() - this.presentation.controller.timeBase;
                console.log("" + time.toFixed(2) + " " + ("queued " + newSegments.length + " " + this.source.contentType + " ") + ("segment(s) adding " + duration.toFixed(2) + "s ") + ("window is now " + this.segments.length + " wide"));
            }
        },
        downloadNextSegment: {

            // ---------------------------
            // segment management
            // ---------------------------

            value: function downloadNextSegment() {
                // ignore the call if fired before any segments have been added to the
                // segment download queue
                if (this.loadIndex === undefined) {
                    return;
                }if (this.segments.length === 0) {
                    console.warn("no segments available for download");
                    return;
                }

                var presentation = this.presentation;
                var controller = presentation.controller;
                var liveEdge = presentation.liveEdge();

                // if the segment is downloading, allow it to continue
                var segment = this.segments[this.loadIndex];
                if (segment.state == Segment.downloading) {
                    return;
                } // if the segment is downloaded (or errored) attempt to move to the
                // next segment for downloading
                if (segment.state >= Segment.downloaded) {

                    // if this is the last segment in the queue...
                    if (this.atLastSegment()) {
                        // sometimes there is a mismatch between a presentation's
                        // reported duration (mpd) and the duration specified in the
                        // movie header (init) - catch this state here
                        if (this.presentation.hasKnownDuration) {
                            return;
                        } // the last segment may be the last segment available in the
                        // presentation. don't perform any processing in this case.
                        var duration = presentation.timeline.duration;
                        if (duration && segment.end >= duration) {
                            return;
                        } // if we're already attempting to load new segments, allow the
                        // manifest re-load to continue
                        if (controller.loadingManifest) {
                            return;
                        } // debug info
                        var time = performance.now() - controller.timeBase;
                        console.group();
                        console.warn("" + time.toFixed(2) + " " + this.source.contentType + " " + "queue has run empty, last segment is downloaded");

                        // attempt to load more segments from the manifest. if the
                        // period uses a segment template or ends in a repeating
                        // segment we can generate new segments from liveEdge to
                        // the presentation end time.
                        this.queueSegments(this.nextRangeStart, presentation.endTime, liveEdge);

                        // if no new segments could be found in the existing manifest,
                        // try reloading the manifest early
                        if (this.atLastSegment()) {
                            console.log("no segments remain in manifest, reloading");
                            console.groupEnd();
                            controller.loadManifest();
                            return;
                        } else {
                            console.groupEnd();
                        }
                    }

                    // we can cleanly move to the next segment in the queue - either
                    // one already existed, or one was just added above
                    this.loadIndex += 1;
                    segment = this.segments[this.loadIndex];
                }

                // wait until the segment can be downloaded
                if (!segment.available()) {
                    var remaining = segment.end - liveEdge;
                    console.log("next segment isnt available yet " + ("" + remaining.toFixed(2) + "s to go"));
                    return;
                }

                // only remaining segment state is pending. start to download.
                segment.state = Segment.downloading;

                // cache the url, this locks it to the current representation
                var uri = segment.uri(true);
                controller.downloader.getMedia(uri, segment.range, segment);

                if (segment.range) console.log("downloading " + this.source.contentType + " segment: " + uri + " (" + segment.range + ")");else console.log("downloading " + this.source.contentType + " segment: " + uri);
            }
        },
        atLastSegment: {
            value: function atLastSegment() {
                return this.loadIndex == this.segments.length - 1;
            }
        },
        time: {
            set: function (newTime) {
                this.currentTime = newTime;

                // skip the search if the current segment still covers newTime
                if (this.playIndex != undefined) {
                    var segment = this.segments[this.playIndex];
                    if (segment.start <= newTime && segment.end > newTime) return;
                }

                // otherwise search for the segment; perform a search here for now
                // rather than anything more intelligent as we may have queued non
                // contiguous segments if the user skips to different time points
                // so simply incrementing to the next segment may not be enough
                this.playIndex = undefined;

                for (var i = 0; i < this.segments.length; i++) {
                    var segment = this.segments[i];
                    if (segment.start <= newTime && segment.end > newTime) {
                        this.playIndex = i;
                        return;
                    }
                }
            }
        },
        truncate: {
            value: function truncate() {
                // keep the segment preceding the current segment and beyond. remove
                // the remainder. truncate is called regularly, so will generally
                // remove one segment at a time from the buffer.
                // TODO: keep up to timeshift window if noTimeshift is false

                // static presentations aren't truncated
                if (this.presentation.willStartAtBeginning) {
                    return;
                } // when the current segment is the 3rd segment or higher there is at
                // least one segment to remove
                if (this.playIndex == undefined || this.playIndex < 2) {
                    return;
                } // remove the first segment to the segment before the current segment
                if (this.source.state === Source.initialised) {
                    var removed = this.segments.splice(0, this.playIndex - 1);
                    var count = removed.length;

                    // update the indexes now segments have been removed
                    this.playIndex -= count;
                    this.loadIndex -= count;
                    if (this.loadIndex < 0) this.loadIndex = 0;

                    // remove each segment from the source's buffer. do this one by one to
                    // handle non contiguous segments (rather than first.start - last.end)
                    console.log("truncating " + count + " " + this.source.contentType + " segments");
                    var _iteratorNormalCompletion = true;
                    var _didIteratorError = false;
                    var _iteratorError = undefined;

                    try {
                        for (var _iterator = removed[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                            var segment = _step.value;

                            this.source.removeSegment(segment);
                        }
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion && _iterator["return"]) {
                                _iterator["return"]();
                            }
                        } finally {
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }
                }
            }
        }
    });

    return SegmentWindow;
})(PlayerObject);

;