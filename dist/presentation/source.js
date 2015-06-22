"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Source = (function (_PlayerObject) {
    function Source(contentType, presentation) {
        _classCallCheck(this, Source);

        this.presentation = presentation;
        this.contentType = contentType;
        this.state = Source.uninitialised;

        // current buffer media type
        this.mimeType = null;
        this.codecs = null;
        this.mseType = null;
        this.buffer = null;

        // buffer data queue
        this.appending = false;
        this.appendQueue = [];

        // segments queued for download
        this.queuedSegments = [];
        this.queueIndex = 0;
    }

    _inherits(Source, _PlayerObject);

    _createClass(Source, {
        destruct: {
            value: function destruct() {
                if (this.buffer) {
                    this.presentation.player.mediaSource.removeSourceBuffer(this.buffer);
                }
            }
        },
        createBuffer: {

            // ---------------------------
            // buffer
            // ---------------------------

            value: function createBuffer() {
                var _this = this;

                // initialise the buffer with the mime type and codec of the initially
                // selected representation of the current (1st at this point) interval
                var representation = this.currentRepresentation;
                this.mimeType = representation.mimeType;
                this.codecs = representation.codecs;
                this.mseType = representation.mseType;

                var mediaSource = this.presentation.player.mediaSource;
                this.buffer = mediaSource.addSourceBuffer(this.mseType);
                this.state = Source.bufferCreated;

                this.buffer.addEventListener("update", function () {
                    // segments are added through the appendQueue
                    if (_this.appendQueue.length > 0) {
                        // determine the real end time of the segment
                        var segment = _this.appendQueue[0];
                        segment.realEnd = _this.bufferEnd;
                        segment.data = null;

                        // debug log
                        var filename = URI(segment.uri()).filename();
                        var duration = segment.realEnd - segment.realStart;
                        var time = performance.now() - _this.presentation.controller.timeBase;
                        var range = segment.range ? "(" + segment.range + ")" : "";
                        console.log("" + time.toFixed(2) + " " + ("loaded " + _this.contentType + " ") + ("segment " + filename + " " + range) + ("added " + duration.toFixed(2) + "s"));

                        // remove it from the queue - we're done appending it
                        _this.appendQueue.splice(0, 1);
                        _this.appending = false;

                        // init files are added directly to the buffer
                    } else {
                        _this.presentation.controller.sourceInitialised();
                    }

                    if (_this.appendQueue.length > 0) _this._appendNextSegment();
                });
            }
        },
        _appendNextSegment: {
            value: function _appendNextSegment() {
                var segment = this.appendQueue[0];
                segment.realStart = this.bufferEnd;
                this.buffer.appendBuffer(new Uint8Array(segment.data));
            }
        },
        appendSegment: {
            value: function appendSegment(segment) {
                this.appendQueue.push(segment);
                if (!this.appending) this._appendNextSegment();
            }
        },
        removeSegment: {
            value: function removeSegment(segment) {
                console.log("deleting " + segment.start.toFixed(2) + " to " + ("" + segment.end.toFixed(2) + " in " + this.contentType + " buffer"));
                this.buffer.remove(segment.start, segment.end);
            }
        },
        appendInitFile: {
            value: function appendInitFile(data) {
                this.buffer.appendBuffer(new Uint8Array(data));
            }
        },
        loadInitFile: {
            value: function loadInitFile() {
                var initFile = new InitFile(this);
                this.presentation.controller.downloader.getMedia(initFile.uri, undefined, initFile);
            }
        },
        segmentAt: {

            // ---------------------------
            // segments
            // ---------------------------

            value: function segmentAt(time) {
                if (this.video) {
                    return this.presentation.timeline.videoSegmentAt(time);
                } else if (this.audio) {
                    return this.presentation.timeline.audioSegmentAt(time);
                }
            }
        },
        segmentsInRange: {
            value: function segmentsInRange(start, end) {
                if (this.video) {
                    return this.presentation.timeline.videoSegmentsInRange(start, end);
                } else if (this.audio) {
                    return this.presentation.timeline.audioSegmentsInRange(start, end);
                }
            }
        },
        contentAt: {
            value: function contentAt(time) {
                if (this.video) {
                    return this.presentation.timeline.intervalAt(time).videoContent;
                } else {
                    return this.presentation.timeline.intervalAt(time).audioContent;
                }
            }
        },
        content: {

            // ---------------------------
            // properties
            // ---------------------------

            get: function () {
                var interval = this.presentation.timeline.currentInterval;
                return interval.contentFor(this.contentType);
            }
        },
        currentRepresentation: {
            get: function () {
                return this.content.currentRepresentation;
            }
        },
        video: {
            get: function () {
                return this.contentType == "video";
            }
        },
        audio: {
            get: function () {
                return this.contentType == "audio";
            }
        },
        width: {
            get: function () {
                if (!this.video) throw "cannot determine width of a non video source";
                return this.currentRepresentation.width;
            }
        },
        height: {
            get: function () {
                if (!this.video) throw "cannot determine height of a non video source";
                return this.currentRepresentation.height;
            }
        },
        bandwidth: {
            get: function () {
                return this.currentRepresentation.bandwidth;
            }
        },
        bufferStart: {
            get: function () {
                if (!this.buffer || this.buffer.buffered.length == 0) return -1;
                return this.buffer.buffered.start(0);
            }
        },
        bufferEnd: {
            get: function () {
                try {
                    if (!this.buffer || this.buffer.buffered.length == 0) return -1;
                    return this.buffer.buffered.end(this.buffer.buffered.length - 1);
                } catch (ignore) {
                    return -1;
                }
            }
        }
    });

    return Source;
})(PlayerObject);

;

Source["enum"]("states", ["uninitialised", // new source, no period added to timeline
"bufferCreated", // media source buffer added
"initialised" // initialisation file downloaded and appended
]);