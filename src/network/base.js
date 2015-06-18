// --------------------------------------------------
// base uri
// --------------------------------------------------
class Base {
    constructor(uri, controller) {
        this.uri         = uri;
        this.failures    = [];
        this.reenableAt  = null;

        this.maxFailed   = controller.options.maxBaseFailedRequests;
        this.offlineSecs = controller.options.baseOfflineDuration;
        this.windowSecs  = controller.options.baseFailureWindow;
    }

    mutate(uri) {
        return URI(uri).absoluteTo(this.uri).toString()
    }

    get online() {
        // re-enable the base if it was offline and offlineSecs has passed
        if (this.reenableAt && this.reenableAt <= performance.now()) {
            this.failures.length = 0;
            this.reenableAt = null;
        }

        return this.failures.length <= this.maxFailed;
    }

    failed() {
        // remove expired failures
        var min = performance.now() - (this.windowSecs * 1000);
        this.failures = this.failures.filter((ts) => ts >= min);

        // add the new failure
        this.failures.push(performance.now());

        // when the max failed requests count is exceeded, the base is taken
        // offline for a period of time to allow it to recover
        if (this.failures.length > this.maxFailed)
            this.reenableAt = performance.now() + (this.offlineSecs * 1000);
    }
};

class IdentityBase {
    mutate(uri) {
        return uri;
    }
};


// --------------------------------------------------
// base manager
// --------------------------------------------------
class BaseManager {
    constructor(controller) {
        this.bases = [];
        this.nextIndex = 0;
        this.controller = controller;

        // overrideBaseURIs is a list of hosts/paths to use when requesting
        // resources. if the list is empty, the BaseURL element in the first
        // loaded mpd, or an inferred base url is used instead.
        let overrides = controller.options.overrideBaseURIs;
        if (overrides.length > 0) {
            for (let uri of overrides)
                this.bases.push(new Base(uri, controller));
        }
    }

    nextBase(attempted) {
        // no override URIs have been defined if there are no bases when
        // this function is called. we may be in one of two states:
        // - no mpd has been loaded, and nextBase was called to select
        //   a base to use to download the mpd
        // - an mpd has been loaded but no overrides were defined. we can
        //   generate a base from the mpd file at this stage.
        // in the first case a special IdentityBase object is returned. the
        // mpd uri must be a fully formed url, so this object simply returns
        // the unmodified uri in response to mutate.
        // in the second case we can generate a base object to use. the base
        // uri will either come from a BaseURL element contained in the mpd, or
        // it will be the path containing the mpd itself.
        let numBases = this.bases.length;
        if (numBases == 0) {
            let manifest = this.controller.presentation.manifest;
            if (manifest == null) {
                return new IdentityBase();
            } else {
                let generated = new Base(manifest.base(), this.controller);
                this.bases.push(generated);
                return generated;
            }
        }

        // round robin requests between bases. when a base is offline iterate
        // through the list to find the next online base that hasn't been
        // attempted. if no bases are online (the iteration reaches the same
        // index as the start of the loop) trigger an error condition.
        let index = this.nextIndex;
        let base = this.bases[index];
        while (!base.online || attempted.indexOf(base) > -1) {
            index = (index + 1) % numBases;
            if (index == this.nextIndex)
                return null;
            base = this.bases[index];
        }

        this.nextIndex = (index + 1) % numBases;
        return base;
    }
};
