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
    }

    loadInitFile() {
        let initFile = new InitFile(this);
        this.presentation.controller.downloader.getMedia(
            initFile.url,
            initFile
        );
    }


    // ---------------------------
    // download queue
    // ---------------------------
    queueSegments(startTime, endTime) {
        console.log(this.contentType, 'queueing', startTime, endTime);
        console.log(this.content.segments[0].start, this.content.segments[this.content.segments.length - 1].end);
        let segments = this.content.segmentsInRange(startTime, endTime);

        if (segments.length == 0) {
            console.warn(this.contentType, 'produced no segments between',
                         startTime, endTime, this.content);
            return;
        }

        // segments and queuedSegments may share some segments. find the first
        // new segment and append from there.
        let queueLength = this.queuedSegments.length;
        let lastQueued = this.queuedSegments[queueLength - 1];
        let firstIndex = 0;

        if (lastQueued) {
            firstIndex = segments.findIndex((s) => s.equal(lastQueued));
            if (firstIndex == -1 && lastQueued.end != segments[0].start)
                console.error('no matching segments found after re-queue');

            // start appending from the next segment
            firstIndex += 1;
        }

        this.queuedSegments = this.queuedSegments.
                                    concat(segments.slice(firstIndex));
        console.log('queued', segments.length - firstIndex,
                    this.contentType, 'segments');

        return segments[segments.length - 1].end;
    }

    downloadNextSegment() {
        let segment = this.queuedSegments[this.queueIndex];
        if (segment == undefined) {
            console.warn(this.contentType, 'queue has run empty 1', this.queueIndex, this.queuedSegments.length);
            return;
        }

        if (segment.state == Segment.downloading)
            return;

        if (segment.state == Segment.downloaded ||
            segment.state == Segment.error) {
            if ((this.queueIndex + 1) == this.queuedSegments.length) {
                console.warn(this.contentType, 'queue has run empty 2', this.queueIndex, this.queuedSegments.length);
                return;
            } else {
                this.queueIndex += 1;
                segment = this.queuedSegments[this.queueIndex];
            }
        }

        // wait until the segment can be downloaded
        if (!segment.available())
            return;

        // segment is pending, start to download
        segment.state = Segment.downloading;
        let url = segment.url(true);

        this.presentation.controller.downloader.getMedia(url, segment);
        console.log('downloading', this.contentType, 'segment', url);
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
        if (!this.buffer || this.buffer.buffered.length == 0)
            return -1;
        return this.buffer.buffered.end(this.buffer.buffered.length - 1);
    }
};

Source.enum('states', [
    'uninitialised',        // new source, no period added to timeline
    'bufferCreated',        // media source buffer added
    'initialised'           // initialisation file downloaded and appended
]);
