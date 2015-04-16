class PresentationController extends PlayerObject {
    constructor(player) {
        this.player             = player;
        this.options            = player.options;
        this.state              = PresentationController.uninitialised;
        this.timeBase           = performance.now();

        // source options
        this.hasAudio           = !player.options.ignoreAudio;

        // mpd downloading and processing
        this.loadingManifest    = false;
        this.downloader         = new Downloader(this);
        this.processor          = new MPDProcessor(this);
        this.presentation       = new Presentation(this);
        this.manifestURL        = player.options.url;
        this.manifestLoaded     = undefined;

        // segments
        this.videoSegments = new SegmentWindow(
            this.presentation.videoSource
        );

        this.audioSegments = new SegmentWindow(
            this.presentation.audioSource
        );

        console.log(`presentation starting at ${this.timeBase}`);
    }

    setState(newState) {
        if (this.state == newState)
            return;
        this.state = newState;
        this.player.emit('stateChanged');

        console.groupEnd();
        console.group();
        let time = performance.now() - this.timeBase;
        console.log(
            time.toFixed(2),
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

        let time = performance.now() - this.timeBase;
        console.log(
            time.toFixed(2),
            'loading manifest from', this.options.url
        );

        this.downloader.getMPD(this.options.url, this.processor);
        this.loadingManifest = true;
    }

    resetManifestLoading() {
        // dynamic manifests to be reloaded at manifestLoaded +
        // manifest.minimumUpdatePeriod
        this.manifestLoaded = performance.now();
        this.loadingManifest = false;
    }

    loadedManifest(manifest) {
        if (this.state == PresentationController.uninitialised)
            this.setState(PresentationController.firstMPDLoaded);

        // add the manifest to the presentation. presentation will process
        // the manifest and add/remove intervals as required
        console.log('loaded manifest', manifest);
        this.presentation.updateManifest(manifest);

        if (this.state >= PresentationController.sourcesInitialised)
            this.updateSegmentWindows();
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
        if (this.state != PresentationController.sourceBuffersCreated)
            return;

        // wait until all sources are successfully initialised to prevent
        // downloading segments unnecessarily
        let presentation = this.presentation;
        let audioInitialised = true;

        if (this.hasAudio)
            audioInitialised =
                    presentation.audioSource.state == Source.initialised;

        let allInitialised =
                    presentation.videoSource.state == Source.initialised &&
                    audioInitialised;

        if (!allInitialised)
            return;

        // queue segments to start buffering
        this.updateSegmentWindows();

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
    updateSegmentWindows() {
        this.videoSegments.update();
        if (this.hasAudio)
            this.audioSegments.update();
    }

    tick() {
        // reload the manifest if minimumUpdatePeriod has passed
        let presentation = this.presentation;
        if (presentation.willReloadManifest) {
            let timeSinceManifest = performance.now() - this.manifestLoaded;
            timeSinceManifest /= 1000; // seconds
            if (timeSinceManifest >= presentation.manifest.minimumUpdatePeriod)
                this.loadManifest();
        }
        
        // keep buffering until at least minBufferTime is remaining
        let video = this.player.video;
        let current = video.currentTime;
        let videoRemaining = presentation.videoSource.bufferEnd - current;
        let bufferAvailable = true;

        // update current times and remove old segments if presentation is live
        this.videoSegments.time = current;
        this.videoSegments.truncate();
        if (this.hasAudio) {
            this.audioSegments.time = current;
            this.audioSegments.truncate();
        }

        // TODO: take into account source bitrate, current download conditions
        let minBuffer = presentation.manifest.minBufferTime;

        if (videoRemaining < minBuffer) {
            this.videoSegments.downloadNextSegment();
            bufferAvailable = false;
        }

        if (this.hasAudio) {
            let audioRemaining = presentation.audioSource.bufferEnd - current;
            if (audioRemaining < minBuffer) {
                this.audioSegments.downloadNextSegment();
                bufferAvailable = false;
            }
        }

        if (bufferAvailable) {
            if (this.state == PresentationController.sourcesInitialised) {
               this.setState(PresentationController.bufferAvailable);
               video.currentTime = video.buffered.start(0);
               presentation.startTime = video.currentTime;
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
