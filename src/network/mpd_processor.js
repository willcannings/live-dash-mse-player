class MPDProcessor extends RequestProcessor {
    constructor(controller) {
        this.controller = controller;
        this.reloadAttempts = 0;
    }

    error(xhr) {
        console.log('error loading mpd', xhr);
        this.attemptReload();
    }

    timeout(xhr) {
        console.log('timeout loading mpd', xhr);
        this.attemptReload();
    }

    success(xhr) {
        let controller = this.controller;

        // re-attempt download if an mpd response is empty
        if (this.emptyResponse(xhr)) {
            controller.resetManifestLoading();
            return;
        }

        // ensure the mpd appears valid before parsing
        let mpds = xhr.responseXML.getElementsByTagName('MPD');
        if (this.invalidResponse(mpds)) {
            controller.resetManifestLoading();
            return;
        }

        // mpd appears valid, reset reloadAttempts for future requests
        this.reloadAttempts = 0;

        // parse the manifest; the presentation and child objects will add/
        // remove periods and segments as required
        let manifest = new Manifest(mpds[0], controller.manifestURL);
        controller.loadedManifest(manifest);
    }

    // elemental boxes can write empty mpd files temporarily. handle this by
    // re-attempting download after a short delay.
    emptyResponse(xhr) {
        if (xhr.responseXML != null) {
            return false;
        } else {
            console.log('error loading mpd, response is empty', xhr);
            this.attemptReload();
            return true;
        }
    }

    // ensure the document is an mpd
    invalidResponse(mpds) {
        if (mpds.length != 1) {
            if (mpds.length == 0)
                console.log('no mpd element found in the mpd response');
            else
                console.log('multiple mpd elements were found in the mpd response');
            return true;
        }
    }

    attemptReload() {
        let controller = this.controller;
        let options = controller.options;

        if (this.reloadAttempts <= options.mpdMaxReloadAttempts) {
            console.log(
                `attempting mpd reload (#${this.reloadAttempts})`
            );

            this.reloadAttempts += 1;
            setTimeout(function() {
                controller.loadManifest();
            }, options.mpdReloadDelay);
            
        } else {
            console.log('the maximum number of mpd reloads has been reached ' +
                        'without successfully loading the mpd file.');
            this.reloadAttempts = 0;
        }
    }
}
