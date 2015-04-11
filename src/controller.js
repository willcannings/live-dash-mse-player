class PresentationController extends PlayerObject {
    constructor(player) {
        this.player             = player;
        this.options            = player.options;
        this.state              = PresentationController.uninitialised;

        // source options
        this.hasAudio           = !player.options.ignoreAudio;

        // mpd downloading and processing
        this.loadingManifest    = false;
        this.downloader         = new Downloader(this);
        this.processor          = new MPDProcessor(this);
        this.presentation       = new Presentation(this);
        this.manifestURL        = player.options.url;
        this.manifestLoaded     = undefined;
        this.nextStartTime      = undefined;
    }

    setState(newState) {
        if (this.state == newState)
            return;
        this.state = newState;
        this.player.emit('stateChanged');

        console.groupEnd();
        console.group();
        console.log(
            performance.now().toFixed(2),
            'state now:', PresentationController.states[newState]
        );
    }

    destruct() {
        if (this.tickInterval)
            clearInterval(this.tickInterval);
        this.downloader.destruct();
        this.presentation.destruct();
    }


    // ---------------------------
    // manifests
    // ---------------------------
    loadManifest() {
        if (this.loadingManifest)
            return;

        console.log('loading manifest from', this.options.url);
        this.downloader.getMPD(this.options.url, this.processor);
        this.loadingManifest = true;
    }

    loadedManifest(manifest) {
        if (this.state == PresentationController.uninitialised)
            this.setState(PresentationController.firstMPDLoaded);

        // dynamic manifests to be reloaded at manifestLoaded +
        // manifest.minimumUpdatePeriod
        this.manifestLoaded = performance.now();
        console.log('loaded manifest', manifest);
        this.loadingManifest = false;

        // add the manifest to the presentation. presentation will process
        // the manifest and add/remove intervals as required
        this.presentation.updateManifest(manifest);

        if (this.state >= PresentationController.sourcesInitialised)
            this.queueSegments();
    }

    // ---------------------------
    // presentation initialisation
    // ---------------------------
    sourcesPrepared() {
        console.log('initialising sources and creating buffers');

        let videoSource = this.presentation.videoSource;
        this.player.setDimensions(videoSource.width, videoSource.height);
        videoSource.createBuffer();

        if (this.hasAudio) {
            var audioSource = this.presentation.audioSource;
            audioSource.createBuffer();
        }

        this.setState(PresentationController.sourceBuffersCreated);
        console.log('buffers created, waiting for init files');

        // all sources have an initialisation 'header' file to be loaded to the
        // source's buffer before any content segments are appended
        videoSource.loadInitFile();
        console.log(
            'starting', videoSource.contentType,
            'with bandwidth:', videoSource.bandwidth,
            'width:', videoSource.width,
            'height:', videoSource.height
        );

        if (this.hasAudio) {
            audioSource.loadInitFile();
            console.log(
                'starting', audioSource.contentType,
                'with bandwidth:', audioSource.bandwidth
            );
        }
    }

    sourceInitialised() {
        let presentation = this.presentation;

        // wait until all sources are successfully initialised to prevent
        // downloading segments unnecessarily
        let audioInitialised = true;

        if (this.hasAudio)
            audioInitialised = presentation.audioSource.state ==
                                                    Source.initialised;
        let allInitialised =
            presentation.videoSource.state == Source.initialised &&
            audioInitialised;
            

        if (!allInitialised)
            return;

        // queue segments to start buffering
        this.queueSegments();

        // transition
        this.setState(PresentationController.sourcesInitialised);
        console.log('all sources initialised, buffering segments');

        // seek to an initial start or live edge and begin buffering segments
        this.tickInterval = setInterval(() => {
            this.tick();
        }, 100);
    }


    // ---------------------------
    // buffering
    // ---------------------------
    queueSegments() {
        // move to live edge if required
        let presentation = this.presentation;
        let manifest = presentation.manifest;
        let endTime = presentation.timeline.duration / 1000;
        let startTime = this.nextStartTime || 0;

        if (presentation.willStartAtLiveEdge) {
            let available = manifest.availabilityStartTime;
            let now = Date.now() / 1000;
            let liveOffset = now - available;
            endTime = liveOffset; // end buffering at live edge

            if (this.nextStartTime == undefined) {
                startTime = liveOffset;

                // start some amount of time before the live edge. if the
                // manifest specifies a duration, use it, otherwise as a
                // heuristic move back half of the timeshift window + min
                // buffer time, the manifest update period + 20% or just half
                // the timeshift window otherwise

                // ensure start doesn't fall outside the timeshift range
                let timeshift = manifest.timeShiftBufferDepth / 1000;
                let minStart = startTime - timeshift;

                if (manifest.suggestedPresentationDelay) {
                    startTime -= manifest.suggestedPresentationDelay / 1000;
                } else {
                    if (manifest.minBufferTime) {
                        let bufferTime = manifest.minBufferTime / 1000;
                        startTime -= (timeshift + bufferTime) / 2;
                    } else if (manifest.minimumUpdatePeriod) {
                        startTime -= (manifest.minimumUpdatePeriod / 1000) * 1.2;
                    } else {
                        startTime -= timeshift / 2;
                    }
                }

                startTime = Math.max(startTime, minStart);
                startTime = Math.max(startTime, 0);
            }
        }

        this.nextStartTime = presentation.videoSource.queueSegments(startTime, endTime);

        if (this.hasAudio) {
            let audioEnd = presentation.audioSource.queueSegments(startTime, endTime);
            this.nextStartTime = Math.min(this.nextStartTime, audioEnd);
        }
    }

    tick() {
        let presentation = this.presentation;

        // reload the manifest if minimumUpdatePeriod has passed
        if (presentation.willReloadManifest) {
            let timeSinceManifest = performance.now() - this.manifestLoaded;
            if (timeSinceManifest >= presentation.manifest.minimumUpdatePeriod)
                this.loadManifest();
        }
        
        // keep buffering until at least minBufferTime is remaining
        let video = this.player.video;
        let current = video.currentTime;
        let videoRemaining = presentation.videoSource.bufferEnd - current;
        let bufferAvailable = true;

        // TODO: take into account source bitrate, current download conditions
        let minBuffer = (presentation.manifest.minBufferTime / 1000);

        if (videoRemaining < minBuffer) {
            presentation.videoSource.downloadNextSegment();
            bufferAvailable = false;
        }

        if (this.hasAudio) {
            let audioRemaining = presentation.audioSource.bufferEnd - current;
            if (audioRemaining < minBuffer) {
                presentation.audioSource.downloadNextSegment();
                bufferAvailable = false;
            }
        }

        if (bufferAvailable) {
            if (this.state == PresentationController.sourcesInitialised) {
               this.setState(PresentationController.bufferAvailable);
               video.currentTime = video.buffered.start(0);
               video.play();
           }
        }
    }
}



// ---------------------------
// controller states
// ---------------------------
PresentationController.enum('states', [
    'uninitialised',
    'firstMPDLoaded',
    'sourceBuffersCreated',
    'sourcesInitialised',
    'bufferAvailable'
]);
