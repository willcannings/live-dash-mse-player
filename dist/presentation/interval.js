"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Interval = (function (_PlayerObject) {
    function Interval(presentation, period) {
        _classCallCheck(this, Interval);

        this.presentation = presentation;
        this.period = period;

        // timeline
        this.id = period.id;
        this.start = undefined;
        this.duration = undefined;

        // join representations from related adaptation sets together
        this.videoContent = new Content(this.presentation.videoSource, this);
        this.audioContent = new Content(this.presentation.audioSource, this);

        // add representations to content types. the set of representations in
        // a period will never change, so it's ok to only perform this once.
        this.initialiseRepresentations(period);
    }

    _inherits(Interval, _PlayerObject);

    _createClass(Interval, {
        end: {
            get: function () {
                if (this.duration == undefined) return undefined;
                return this.start + this.duration;
            }
        },
        contentDerivedDuration: {
            value: function contentDerivedDuration() {
                var videoDuration = this.videoContent.contentDerivedDuration() || -1;
                var audioDuration = this.videoContent.contentDerivedDuration() || -1;
                var max = Math.max(videoDuration, audioDuration);

                if (max == -1) {
                    return undefined;
                } else {
                    return max;
                }
            }
        },
        contentFor: {
            value: function contentFor(contentType) {
                if (contentType == "video") {
                    return this.videoContent;
                } else if (contentType == "audio") {
                    return this.audioContent;
                }
            }
        },
        initialiseRepresentations: {
            value: function initialiseRepresentations(period) {
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = period.adaptationSets[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var adaptationSet = _step.value;
                        var _iteratorNormalCompletion2 = true;
                        var _didIteratorError2 = false;
                        var _iteratorError2 = undefined;

                        try {
                            for (var _iterator2 = adaptationSet.representations[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                var representation = _step2.value;

                                var contentType = representation.mimeContentType;
                                var content = this.contentFor(contentType);
                                content.addRepresentation(representation);
                            }
                        } catch (err) {
                            _didIteratorError2 = true;
                            _iteratorError2 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion2 && _iterator2["return"]) {
                                    _iterator2["return"]();
                                }
                            } finally {
                                if (_didIteratorError2) {
                                    throw _iteratorError2;
                                }
                            }
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

                this.videoContent.selectRepresentation();
                this.audioContent.selectRepresentation();
            }
        },
        updateWith: {
            value: function updateWith(period) {
                this.period = period;

                // find the first video and audio representation, and use the template
                // from each to update the content objects
                var videoUpdated = false;
                var audioUpdated = false;

                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = period.adaptationSets[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var adaptationSet = _step.value;
                        var _iteratorNormalCompletion2 = true;
                        var _didIteratorError2 = false;
                        var _iteratorError2 = undefined;

                        try {
                            for (var _iterator2 = adaptationSet.representations[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                var representation = _step2.value;

                                var contentType = representation.mimeContentType;

                                if (contentType == "video" && !videoUpdated) {
                                    this.videoContent.updateTimelineWith(representation);
                                    videoUpdated = true;
                                    break;
                                } else if (contentType == "audio" && !audioUpdated) {
                                    this.audioContent.updateTimelineWith(representation);
                                    audioUpdated = true;
                                    break;
                                }
                            }
                        } catch (err) {
                            _didIteratorError2 = true;
                            _iteratorError2 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion2 && _iterator2["return"]) {
                                    _iterator2["return"]();
                                }
                            } finally {
                                if (_didIteratorError2) {
                                    throw _iteratorError2;
                                }
                            }
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
            }
        }
    });

    return Interval;
})(PlayerObject);

;