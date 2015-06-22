"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Segment = (function (_RequestProcessor) {
    function Segment(duration, number, time, timescale, content, url, range) {
        _classCallCheck(this, Segment);

        this.duration = duration;
        this.number = number;
        this.time = time;
        this.timescale = timescale;
        this.content = content;
        this.listURL = url;
        this.range = range;

        this.state = Segment.pending;
        this._url = null;
    }

    _inherits(Segment, _RequestProcessor);

    _createClass(Segment, {
        type: {
            get: function () {
                return RequestProcessor.media;
            }
        },
        generateNext: {

            // ---------------------------
            // generators
            // ---------------------------
            // assuming this is a repeating segment, produce the segment immediately
            // following this segment

            value: function generateNext() {
                return new Segment(this.duration, this.number + 1, this.time + this.duration, this.timescale, this.content);
            }
        },
        seekTo: {

            // assuming this is a repeating segment, produce the segment that contains
            // 'time' in its interval (start inclusive, end non inclusive)

            value: function seekTo(time) {
                var number = Math.floor(time * this.timescale / this.duration);
                return new Segment(this.duration, number, number * this.duration, this.timescale, this.content);
            }
        },
        uri: {

            // ---------------------------
            // attributes
            // ---------------------------
            // lazily evaluate url so changes to currentRepresentation can apply

            value: function uri() {
                var memoise = arguments[0] === undefined ? false : arguments[0];

                if (this._uri) {
                    return this._uri;
                }if (this.listURL) {
                    var path = this.listURL;
                } else {
                    var template = this.content.currentRepresentation.segmentTemplate;
                    var number = this.number + template.startNumber;
                    var path = template.media.format(number, this.time);
                }

                if (memoise) this._uri = path;
                return path;
            }
        },
        available: {
            value: function available() {
                var presentation = this.content.source.presentation;

                // all presentations, including static, may have an availability time
                if (!presentation.hasAvailabilityStartTime) {
                    return true;
                } // live edge is 0 when current time == availability time. the segment
                // will become available once its duration is complete, i.e the first
                // segment can't be accessed until it's recorded
                return presentation.liveEdge() >= this.end;
            }
        },
        equal: {
            value: function equal(other) {
                return this.duration == other.duration && this.time == other.time;
            }
        },
        start: {
            get: function () {
                return this.time / this.timescale;
            }
        },
        end: {
            get: function () {
                return (this.time + this.duration) / this.timescale;
            }
        },
        durationSeconds: {
            get: function () {
                return this.duration / this.timescale;
            }
        },
        error: {

            // ---------------------------
            // network callbacks
            // ---------------------------

            value: function error(xhr) {
                this.state = Segment.error;
                console.log("error loading segment " + this._url, xhr);
                throw "error loading segment";
            }
        },
        timeout: {
            value: function timeout(xhr) {
                this.state = Segment.error;
                console.log("timeout loading segment " + this._url, xhr);
                throw "timeout loading segment";
            }
        },
        success: {
            value: function success(xhr) {
                this.data = xhr.response;
                this.content.source.appendSegment(this);
                this.state = Segment.downloaded;
            }
        }
    });

    return Segment;
})(RequestProcessor);

Segment["enum"]("states", ["pending", "downloading", "downloaded", "error"]);