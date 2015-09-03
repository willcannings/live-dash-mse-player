class Source extends PlayerObject {
    constructor(contentType, presentation) {
        this.presentation   = presentation;
        this.contentType    = contentType;
        this.state          = Source.uninitialised;
        
        // current buffer media type
        this.mimeType       = null;
        this.codecs         = null;
        this.mseType        = null;
        this.buffer         = null;

        // buffer data queue
        this.updating       = false;
        this.updateQueue    = [];

        // segments queued for download
        this.queuedSegments = [];
        this.queueIndex     = 0;
    }

    destruct() {
        if (this.buffer) {
            this.presentation.player.mediaSource.
                removeSourceBuffer(this.buffer);
        }
    }


    // ---------------------------
    // buffer
    // ---------------------------
    createBuffer() {
        // initialise the buffer with the mime type and codec of the initially
        // selected representation of the current (1st at this point) interval
        let representation = this.currentRepresentation;
        this.mimeType = representation.mimeType;
        this.codecs   = representation.codecs;
        this.mseType  = representation.mseType;

        let mediaSource = this.presentation.player.mediaSource;
        this.buffer = mediaSource.addSourceBuffer(this.mseType);
        this.state = Source.bufferCreated;

        this.buffer.addEventListener('update', () => {
            // segments are added/removed through the updateQueue
            if (this.updateQueue.length > 0) {
                // remove the item from the queue
                let item = this.updateQueue[0];

                // remove it from the queue
                this.updateQueue.splice(0, 1);
                this.updating = false;

                // perform some post processing on appended segments - clear
                // unused memory and assign their end time
                if (item.op == 'append') {
                    // determine the real end time of the segment
                    let segment = item.segment;
                    segment.realEnd = this.bufferEnd;
                    segment.data = null;

                    // debug log
                    let filename = URI(segment.uri()).filename();
                    let duration = segment.realEnd - segment.realStart;
                    let time = performance.now() - this.presentation.controller.timeBase;
                    let range = segment.range ? `(${segment.range})` : '';
                    console.log(`${time.toFixed(2)} ` +
                                `loaded ${this.contentType} ` +
                                `segment ${filename} ${range}` +
                                `added ${duration.toFixed(2)}s`
                    );
                }

            // init files are added directly to the buffer
            } else {
                this.presentation.controller.sourceInitialised();
            }

            if (this.updateQueue.length > 0)
                this.processUpdate();
        });
    }

    appendUpdate(item) {
        this.updateQueue.push(item);
        if (!this.updating)
            this.processUpdate();
    }

    processUpdate() {
        this.updating = true;
        let item = this.updateQueue[0];
        let segment = item.segment;
        if (item.op == 'append')
            this._appendNextSegment(segment);
        else
            this._removeSegment(segment);
    }

    _appendNextSegment(segment) {
        segment.realStart = this.bufferEnd;
        if (segment.realStart == -1)
            console.error('segment realStart is set to -1');
        this.buffer.appendBuffer(new Uint8Array(segment.data));
    }

    appendSegment(segment) {
        this.appendUpdate({
            op: 'append',
            segment
        });
    }

    _removeSegment(segment) {
        console.log(`deleting ${segment.start.toFixed(2)} to ` +
                    `${segment.end.toFixed(2)} in ${this.contentType} buffer`);
        this.buffer.remove(segment.start, segment.end);
    }

    removeSegment(segment) {
        this.appendUpdate({
            op: 'remove',
            segment
        });
    }

    appendInitFile(data) {
        this.buffer.appendBuffer(new Uint8Array(data));
    }

    loadInitFile() {
        let initFile = new InitFile(this);
        this.presentation.controller.downloader.getMedia(
            initFile.uri,
            undefined,
            initFile
        );
    }


    // ---------------------------
    // segments
    // ---------------------------
    segmentAt(time) {
        if (this.video)
            return this.presentation.timeline.videoSegmentAt(time);
        else if (this.audio)
            return this.presentation.timeline.audioSegmentAt(time);
    }

    segmentsInRange(start, end) {
        if (this.video)
            return this.presentation.timeline.videoSegmentsInRange(start, end);
        else if (this.audio)
            return this.presentation.timeline.audioSegmentsInRange(start, end);
    }

    contentAt(time) {
        if (this.video)
            return this.presentation.timeline.intervalAt(time).videoContent;
        else
            return this.presentation.timeline.intervalAt(time).audioContent;
    }


    // ---------------------------
    // properties
    // ---------------------------
    get content() {
        let interval = this.presentation.timeline.currentInterval;
        return interval.contentFor(this.contentType);
    }

    get currentRepresentation() {
        return this.content.currentRepresentation;
    }

    get video() {
        return this.contentType == 'video';
    }

    get audio() {
        return this.contentType == 'audio';
    }

    get width() {
        if (!this.video)
            throw 'cannot determine width of a non video source';
        return this.currentRepresentation.width;
    }

    get height() {
        if (!this.video)
            throw 'cannot determine height of a non video source';
        return this.currentRepresentation.height;
    }

    get bandwidth() {
        return this.currentRepresentation.bandwidth;
    }

    get bufferStart() {
        if (!this.buffer || this.buffer.buffered.length == 0)
            return -1;
        return this.buffer.buffered.start(0);
    }

    get bufferEnd() {
        try {
            if (!this.buffer || this.buffer.buffered.length == 0)
                return 0;
            return this.buffer.buffered.end(this.buffer.buffered.length - 1);
        } catch (ignore) {
            return -1;
        }
    }
};

Source.enum('states', [
    'uninitialised',        // new source, no period added to timeline
    'bufferCreated',        // media source buffer added
    'initialised'           // initialisation file downloaded and appended
]);
