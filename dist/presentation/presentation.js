"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Presentation = (function (_PlayerObject) {
    function Presentation(controller) {
        _classCallCheck(this, Presentation);

        this.controller = controller;
        this.player = controller.player;
        this.state = Presentation.uninitialised;

        // manifest models
        this.operationMode = undefined;
        this.manifest = null;

        // sources and timelines
        this.videoSource = new Source("video", this);
        this.audioSource = new Source("audio", this);
        this.timeline = new Timeline(this);
        this.startTime = undefined;
        this.endTime = undefined;
    }

    _inherits(Presentation, _PlayerObject);

    _createClass(Presentation, {
        destruct: {
            value: function destruct() {
                this.videoSource.destruct();
                this.audioSource.destruct();
            }
        },
        liveEdge: {

            // seconds since the start of the presentation. liveEdge == 0 is the start
            // of the presentation. the live edge is used when calculating the time
            // segments become available for download, and when determining the time
            // ranges to use when queueing segments

            value: function liveEdge() {
                var available = this.manifest.availabilityStartTime;
                var now = Date.now() / 1000;
                return now - available;
            }
        },
        hasAvailabilityStartTime: {
            get: function () {
                return this.manifest.availabilityStartTime != undefined;
            }
        },
        hasSuggestedDelay: {
            get: function () {
                return this.controller.options.overrideDelay != undefined || this.manifest.suggestedPresentationDelay != 0;
            }
        },
        suggestedDelay: {
            get: function () {
                return this.controller.options.overrideDelay || this.manifest.suggestedPresentationDelay;
            }
        },
        updateManifest: {
            value: function updateManifest(manifest) {
                this.manifest = manifest;
                this.determineOperationMode();

                // increase the presentation end time
                if (this.operationMode >= Presentation.simpleLiveOperation) this.endTime = this.liveEdge() + manifest.minimumUpdatePeriod;

                this.timeline.update();

                if (Number.isNaN(this.player.duration)) {
                    var _manifest = this.manifest;
                    var knownDuration = this.timeline.duration != undefined;
                    var isStatic = _manifest["static"];
                    var fixedDuration = _manifest.mediaPresentationDuration != undefined;

                    if (knownDuration && (isStatic || fixedDuration)) this.player.duration = this.timeline.duration;
                }

                if (this.state == Presentation.uninitialised) {
                    this.controller.sourcesPrepared();
                    this.state = Presentation.initialised;
                }
            }
        },
        determineOperationMode: {

            // ---------------------------
            // playback operation mode
            // ---------------------------

            value: function determineOperationMode() {
                if (this.manifest["static"]) {
                    this.operationMode = Presentation.staticOperation;
                } else {
                    if (this.manifest.minimumUpdatePeriod) this.operationMode = Presentation.simpleLiveOperation;else this.operationMode = Presentation.dynamicOperation;
                }
            }
        },
        willStartAtBeginning: {
            get: function () {
                return this.operationMode == Presentation.staticOperation;
            }
        },
        willStartAtLiveEdge: {
            get: function () {
                return this.operationMode != Presentation.staticOperation;
            }
        },
        willReloadManifest: {
            get: function () {
                return this.operationMode != Presentation.staticOperation && this.manifest.minimumUpdatePeriod != undefined;
            }
        },
        hasKnownDuration: {
            get: function () {
                return this.manifest["static"];
            }
        }
    });

    return Presentation;
})(PlayerObject);

;

Presentation["enum"]("states", ["uninitialised", "initialised"]);

Presentation["enum"]("operationModes", ["staticOperation", // on demand
"dynamicOperation", // live edge
"simpleLiveOperation", // live, reloading
"mainLiveOperation" // not supported
]);