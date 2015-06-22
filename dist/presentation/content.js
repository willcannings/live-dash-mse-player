"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Content = (function (_PlayerObject) {
    function Content(source, interval) {
        _classCallCheck(this, Content);

        this.source = source;
        this.interval = interval;
        this.state = Content.uninitialised;

        this.currentRepresentation = null;
        this.representations = [];

        this.segments = [];
        this.repeatSegment = undefined;
    }

    _inherits(Content, _PlayerObject);

    _createClass(Content, {
        addRepresentation: {
            value: function addRepresentation(representation) {
                this.representations.push(representation);

                if (this.state == Content.uninitialised) {
                    this.updateTimelineWith(representation);
                    this.state = Content.initialised;
                }
            }
        },
        selectRepresentation: {
            value: function selectRepresentation() {
                // should refer to this.source.codecs and bandwidth etc. but for now
                // always pick the representation with the 'middle' bandwidth
                var sorted = Array.from(this.representations);
                sorted.sort(function (a, b) {
                    return a.bandwidth - b.bandwidth;
                });
                this.currentRepresentation = sorted[Math.floor(sorted.length / 2)];
            }
        },
        updateTimelineWith: {
            value: function updateTimelineWith(representation) {
                if (representation.segmentTemplate) this.updateTimelineWithTemplate(representation);else this.updateTimelineWithList(representation);
            }
        },
        updateTimelineWithTemplate: {
            value: function updateTimelineWithTemplate(representation) {
                var template = representation.segmentTemplate;
                var timeline = template.segmentTimeline;

                // without a timeline, only the template is used to generate segments
                if (!timeline) {
                    this.repeatSegment = new Segment(template.duration, 0, 0, template.timescale, this);

                    console.log("updated " + this.source.contentType + " " + ("interval " + this.interval.id + " ") + "to use repeating segment", this.repeatSegment);
                    return;
                }

                // otherwise process the timeline, generating segments until the end of
                // the timeline, or an infinitely repeating segment is encountered
                var timescale = template.timescale;
                var time = timeline.ss[0].t;
                this.segments = [];
                var number = 0;

                // timelines are composed of "S" rows which may define t (time), d
                // (duration) and r (repeat). for each s, create a new segment and
                // add to the segments list if it doesn't already exist.
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = timeline.ss[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var s = _step.value;

                        if (s.t != undefined) time = s.t;
                        var duration = s.d;

                        // when the final s row repeats -1, it repeats infinitely
                        if (s.r == -1) {
                            this.repeatSegment = new Segment(duration, number, time, timescale, this);
                        }

                        // repeats are (in the spec) called "zero-based". if r == 0 the
                        // segment is added once, when r == 1, it's added twice etc.
                        for (var i = 0; i <= s.r; i++) {
                            var segment = new Segment(duration, number, time, timescale, this);

                            this.segments.push(segment);
                            time += duration;
                            number += 1;
                        }
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

                console.log("updated " + this.source.contentType + " " + ("interval " + this.interval.id + " ") + ("with " + this.segments.length + " segments ") + ("" + this.segments[0].start.toFixed(2) + " - ") + this.segments[this.segments.length - 1].end.toFixed(2));
            }
        },
        updateTimelineWithList: {
            value: function updateTimelineWithList(representation) {
                var list = representation.segmentList;
                var timescale = list.timescale;
                var duration = list.duration;
                var number = 0;
                var time = 0;

                this.segments = [];

                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = list.segmentURLs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var segmentURL = _step.value;

                        var segment = new Segment(duration, number, time, timescale, this, segmentURL.media, segmentURL.mediaRange);

                        this.segments.push(segment);
                        time += duration;
                        number += 1;
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

                console.log("updated " + this.source.contentType + " " + ("interval " + this.interval.id + " ") + ("with " + this.segments.length + " segments ") + ("" + this.segments[0].start.toFixed(2) + " - ") + this.segments[this.segments.length - 1].end.toFixed(2));
            }
        },
        contentDerivedDuration: {
            value: function contentDerivedDuration() {
                // the duration of a period may be defined by the period's content. if
                // a timeline is provided, and the final component doesn't infinitely
                // repeat, we can calculate a fixed duration by generating segments
                if (this.repeatSegment != undefined) {
                    return undefined;
                }var last = this.segments[this.segments.length - 1];
                return last.time + last.duration - this.interval.start;
            }
        },
        timeOutOfBounds: {
            value: function timeOutOfBounds(time) {
                var presentation = this.source.presentation;

                // ensure time isn't greater than the presentation duration
                if (presentation.duration && time > presentation.duration) {
                    return presentation.duration;
                } // otherwise ensure time isn't greater than live end time
                if (presentation.endTime && time > presentation.endTime) {
                    return presentation.endTime;
                }return false;
            }
        },
        segmentsInRange: {
            value: function segmentsInRange(startTime, endTime) {
                var result = [];

                // handle start/end times beyond the presentation end
                if (this.timeOutOfBounds(startTime)) {
                    console.warn("startTime is out of bounds");
                    return [];
                }

                if (this.timeOutOfBounds(endTime)) {
                    console.warn("endTime is out of bounds");
                    endTime = this.timeOutOfBounds(endTime);
                }

                // add any matching timeline segments
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = this.segments[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var segment = _step.value;

                        if (segment.end > startTime && segment.start < endTime) result.push(segment);
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

                // replicate the repeat segment if the range ends after repeat start
                if (this.repeatSegment && this.repeatSegment.start < endTime) {
                    var segment = this.repeatSegment;

                    // move to the end of the last timeline segment if any were found,
                    // otherwise move to the initial startTime
                    if (result.length > 0) segment = segment.seekTo(result[result.length - 1].end);else segment = segment.seekTo(startTime);

                    while (endTime > segment.start) {
                        result.push(segment);
                        segment = segment.generateNext();
                    }
                }

                return result;
            }
        },
        segmentAt: {
            value: function segmentAt(time) {
                // time cannot be beyond the presentation end
                if (this.timeOutOfBounds(time)) {
                    console.warn("time is out of bounds");
                    return null;
                }

                // timeline segments
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = this.segments[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var segment = _step.value;

                        if (segment.start <= time && segment.end > time) return segment;
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

                // fallback to a repeat segment otherwise. it's safe to seekTo time
                // directly here since we know time is within bounds and will result
                // in a valid segment
                if (this.repeatSegment) {
                    return this.repeatSegment.seekTo(time);
                }

                return null;
            }
        }
    });

    return Content;
})(PlayerObject);

;

Content["enum"]("states", ["uninitialised", "initialised"]);