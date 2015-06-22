"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var MPDProcessor = (function (_RequestProcessor) {
    function MPDProcessor(controller) {
        _classCallCheck(this, MPDProcessor);

        this.controller = controller;
        this.reloadAttempts = 0;
    }

    _inherits(MPDProcessor, _RequestProcessor);

    _createClass(MPDProcessor, {
        type: {
            get: function () {
                return RequestProcessor.mpd;
            }
        },
        error: {
            value: function error(xhr) {
                console.log("error loading mpd", xhr);
                this.attemptReload();
            }
        },
        timeout: {
            value: function timeout(xhr) {
                console.log("timeout loading mpd", xhr);
                this.attemptReload();
            }
        },
        success: {
            value: function success(xhr) {
                var controller = this.controller;

                // re-attempt download if an mpd response is empty
                if (this.emptyResponse(xhr)) {
                    controller.resetManifestLoading();
                    return;
                }

                // ensure the mpd appears valid before parsing
                var mpds = xhr.responseXML.getElementsByTagName("MPD");
                if (this.invalidResponse(mpds)) {
                    controller.resetManifestLoading();
                    return;
                }

                // mpd appears valid, reset reloadAttempts for future requests
                this.reloadAttempts = 0;

                // parse the manifest; the presentation and child objects will add/
                // remove periods and segments as required
                var manifest = new Manifest(mpds[0], controller.manifestURL);
                controller.resetManifestLoading();
                controller.loadedManifest(manifest);
            }
        },
        emptyResponse: {

            // elemental boxes can write empty mpd files temporarily. handle this by
            // re-attempting download after a short delay.

            value: function emptyResponse(xhr) {
                if (xhr.responseXML != null) {
                    return false;
                } else {
                    console.log("error loading mpd, response is empty", xhr);
                    this.attemptReload();
                    return true;
                }
            }
        },
        invalidResponse: {

            // ensure the document is an mpd

            value: function invalidResponse(mpds) {
                if (mpds.length != 1) {
                    if (mpds.length == 0) console.log("no mpd element found in the mpd response");else console.log("multiple mpd elements were found in the mpd response");
                    return true;
                }
            }
        },
        attemptReload: {
            value: function attemptReload() {
                var controller = this.controller;
                var options = controller.options;

                if (this.reloadAttempts <= options.mpdMaxReloadAttempts) {
                    console.log("attempting mpd reload (#" + this.reloadAttempts + ")");

                    this.reloadAttempts += 1;
                    setTimeout(function () {
                        controller.loadManifest();
                    }, options.mpdReloadDelay);
                } else {
                    console.log("the maximum number of mpd reloads has been reached " + "without successfully loading the mpd file.");
                    this.reloadAttempts = 0;
                }
            }
        }
    });

    return MPDProcessor;
})(RequestProcessor);