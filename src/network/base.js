// --------------------------------------------------
// base url transformer
// --------------------------------------------------
class Base {
    constructor(transforms, controller) {
        this.transforms  = transforms;
        this.controller  = controller;
        this.failures    = [];
        this.reenableAt  = null;

        this.maxFailed   = controller.options.maxBaseFailedRequests;
        this.offlineSecs = controller.options.baseOfflineDuration;
        this.windowSecs  = controller.options.baseFailureWindow;
    }

    get inspect() {
        return JSON.stringify(this.transforms);
    }

    // uris may be absolute paths or relative to a manifest's BaseURL or mpd
    // url. the input uri is first transformed relative to the base url of the
    // current mpd, then transformed by this.transforms. each transform key is
    // a function that affects the URI object such as 'directory' or 'host'.
    mutate(uri) {
        let manifest = this.controller.presentation.manifest;
        let url = URI(uri).absoluteTo(manifest.base());

        for (let transform of Object.keys(this.transforms))
            url = url[transform](this.transforms[transform])

        return url.toString()
    }

    get online() {
        // re-enable the base if it was offline and offlineSecs has passed
        if (this.reenableAt && this.reenableAt <= performance.now()) {
            console.log(`base ${this.inspect} is back online`);
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
        if (this.failures.length > this.maxFailed) {
            console.warn(`base ${this.inspect} is being taken offline after failing ` +
                         `${this.failures.length} requests`);
            this.reenableAt = performance.now() + (this.offlineSecs * 1000);
        }
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

        // overrideBaseTransforms is a list of URI transform functions to use
        // when constructing a resource URL. if the list is empty, the BaseURL
        // element or the url of the manifest file is used instead.
        let transforms = controller.options.overrideBaseTransforms;
        if (transforms.length > 0) {
            for (let transform of transforms)
                this.bases.push(new Base(transform, controller));

            // start from a random base to avoid mutiple players switching
            // between bases in sync
            this.nextIndex = Math.floor(Math.random() * this.bases.length);
        }
    }

    nextBase(attempted) {
        // nextBase will first be called the first time an mpd is loaded. since
        // the base transform functions are designed to work by modifying urls
        // that are relative to a manifest's base url they can't be used yet.
        // the IdentityBase is used to simply return the mpd's url in response
        // to the mutate function.
        // after the initial mpd is loaded a base url can be generated (either
        // from a BaseURL element, or the url of the mpd itself). if the
        // overrideBaseTransforms option is empty a single Base object is used
        // (with an empty transform list). round-robin requests are then
        // performed on this single Base entry, or the entries already is bases.
        if (this.controller.presentation.manifest == null)
            return new IdentityBase();

        let numBases = this.bases.length;
        if (numBases == 0) {
            let generated = new Base([], this.controller);
            this.bases.push(generated);
            return generated;
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
