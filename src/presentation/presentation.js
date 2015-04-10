class Presentation extends PlayerObject {
    constructor(controller) {
        this.controller     = controller;
        this.player         = controller.player;
        this.state          = Presentation.uninitialised;

        // manifest models
        this.operationMode  = undefined;
        this.manifest       = null;

        // sources and timelines
        this.videoSource    = new Source('video', this);
        this.audioSource    = new Source('audio', this);
        this.timeline       = new Timeline(this);
    }

    destruct() {
        this.videoSource.destruct();
        this.audioSource.destruct();
    }

    seek(time) {
        this.timeline.seek(time);
    }

    updateManifest(manifest) {
        this.manifest = manifest;
        this.determineOperationMode();
        this.timeline.update();

        if (Number.isNaN(this.player.duration)) {
            let manifest      = this.manifest;
            let knownDuration = (this.timeline.duration != undefined);
            let isStatic      = (manifest.static);
            let fixedDuration = (manifest.mediaPresentationDuration != undefined);

            if (knownDuration && (isStatic || fixedDuration))
                this.player.duration = this.timeline.duration;
        }

        if (this.state == Presentation.uninitialised) {
            this.controller.sourcesPrepared();
            this.state = Presentation.initialised;
        }
    }

    // ---------------------------
    // playback operation mode
    // ---------------------------
    determineOperationMode() {
        if (this.manifest.static) {
            this.operationMode = Presentation.staticOperation;
        } else {
            if (this.manifest.minimumUpdatePeriod)
                this.operationMode = Presentation.simpleLiveOperation;
            else
                this.operationMode = Presentation.dynamicOperation;
        }
    }

    get willStartAtBeginning() {
        return this.operationMode == Presentation.staticOperation;
    }

    get willStartAtLiveEdge() {
        return this.operationMode != Presentation.staticOperation;
    }

    get willReloadManifest() {
        return this.operationMode != Presentation.staticOperation &&
                this.manifest.minimumUpdatePeriod != undefined;
    }
};

Presentation.enum('states', [
    'uninitialised',
    'initialised'
]);

Presentation.enum('operationModes', [
    'staticOperation',          // on demand
    'dynamicOperation',         // live edge
    'simpleLiveOperation',      // live, reloading
    'mainLiveOperation'         // not supported
]);