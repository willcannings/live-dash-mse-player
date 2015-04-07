// -------------------------------------------------------------
//                         Presentation
//  -----------------------------------------------------------
// |                                                           |
// |                             Source Timeline               |
// |                -----------------------------------------  |
// | Video Source  |  -----------------   -----------------  | |
// |               | | Period Timeline | | Period Timeline | | |
// |                                                           |
// |                             Source Timeline               |
// |                -----------------------------------------  |
// | Audio Source  |  -----------------   -----------------  | |
// |               | | Period Timeline | | Period Timeline | | |
//  -----------------------------------------------------------

// --------------------------------------------------
// presentation
// --------------------------------------------------
class Presentation {
    constructor(controller) {
        this.controller     = controller;
        this.player         = controller.player;
        this.state          = Presentation.uninitialised;

        // manifest models
        this.manifests      = [];
        this.manifest       = null;
        this.operationMode  = undefined;

        // sources and timelines
        this.currentTime    = 0.0;
        this.sources        = [];
    }

    destruct() {
        for (let source of this.sources)
            source.destruct();
    }

    appendManifest(manifest) {
        this.manifests.push(manifest);
        this.manifest = manifest;

        // set duration (in seconds) if the presentation duration is known
        if (manifest.mediaPresentationDuration != undefined)
            this.player.setDuration(manifest.mediaPresentationDuration);

        // the first manifest is treated specially - it's used to select and
        // create representative sources. susequent appends modify the state
        // of these sources and their timelines
        if (this.state == Presentation.uninitialised)
            this.createSources();
        else
            this.updateSources();
    }

    createSources() {
        // determine operation mode
        if (this.manifest.static) {
            this.operationMode = Presentation.staticOperation;
        } else {
            if (this.manifest.minimumUpdatePeriod)
                this.operationMode = Presentation.simpleLiveOperation;
            else
                this.operationMode = Presentation.dynamicOperation;
        }

        // create a source for each adaptation set; some will be deleted later
        // once a supported source has been found for each content type
        console.log('loading all adaptation sets as potential sources');
        let period = this.manifest.periods[0];

        for (let adaptationSet of period.adaptationSets) {
            let source = new Source(this);
            this.sources.push(source);

            // prepare the source with its initial period and adaptation set
            source.timeline.appendPeriod(period, adaptationSet);
            source.prepare();
        }

        // allow the controller to decide which sources will be used
        this.state = Presentation.sourcesCreated;
        this.controller.sourcesPrepared();
    }

    updateSources() {

    }

    seek(time) {
        for (let source of this.sources)
            source.seek(time);
        this.currentTime = time;
    }
};

// presentation states
Presentation.uninitialised  = 0;
Presentation.sourcesCreated = 1;

// presentation operation modes (dash-if live iops v0.9)
Presentation.staticOperation     = 0;   // on demand
Presentation.dynamicOperation    = 1;   // live edge
Presentation.simpleLiveOperation = 2;   // live, reloading
Presentation.mainLiveOperation   = 3;   // not supported


// --------------------------------------------------
// source / track
// --------------------------------------------------
class Source {
    constructor(presentation) {
        this.controller     = presentation.controller;
        this.presentation   = presentation;
        this.timeline       = new SourceTimeline(this);
        
        // media type information
        this.mimeType       = null;
        this.codecs         = null;
        this.mseType        = null;
        this.contentType    = null;

        // top level types, only one source may represent each type
        this.video          = false;
        this.audio          = false;
        this.text           = false;

        this.buffer         = null;
        this.bandwidth      = undefined;
        this.state          = Source.uninitialised;
    }

    destruct() {
        if (this.buffer) {
            this.presentation.player.mediaSource.
                removeSourceBuffer(this.buffer);
        }
    }

    // ---------------------------
    // initialisation
    // ---------------------------
    // to be called once, on presentation initialisation, after the initial
    // period has been added to timeline
    prepare() {
        if (this.timeline.currentPeriod == null)
            throw 'source timeline has no period';

        // select an initial representation for the source
        let firstPeriod = this.timeline.currentPeriod;
        let representation = firstPeriod.currentRepresentation;
        this.bandwidth = representation.bandwidth;

        // copy representation details - bandwidth will update during playback
        // while mimeType and codecs will remain static for the lifetime of
        // the source. these are required now to create a buffer for segments.
        this.bandwidth = representation.bandwidth;
        this.mimeType  = representation.mimeType;
        this.codecs    = representation.codecs;
        this.mseType   = representation.mseType();

        // adaptationSets can specify a contentType. if not provided, the top
        // level of the source's mimetype is used (which must match contentType)
        this.contentType = firstPeriod.adaptationSet.contentType ||
                                this.mimeType.split('/')[0];

        // determine top level type, used to limit sources to one per type
        this.video = (this.contentType == 'video');
        this.audio = (this.contentType == 'audio');
        this.text  = (this.contentType == 'text');

        // the source is now prepared allowing the controller to determine
        // whether it's compatible with the browser
        this.state = Source.prepared;
    }

    createBuffer() {
        if (this.state != Source.prepared)
            throw 'source cannot createBuffer when unprepared';

        this.buffer = this.presentation.player.mediaSource.
                                addSourceBuffer(this.mseType);
        this.state = Source.bufferCreated;
    }

    loadInitFile() {
        let initFile = new InitFile(this);
        this.controller.downloader.getMedia(
            initFile.url,
            initFile
        );
    }

    // ---------------------------
    // properties
    // ---------------------------
    width() {
        if (!this.video)
            throw 'cannot determine width of a non video source';
        return this.timeline.currentPeriod.currentRepresentation.width;
    }

    height() {
        if (!this.video)
            throw 'cannot determine height of a non video source';
        return this.timeline.currentPeriod.currentRepresentation.height;
    }

    seek(time) {
        this.timeline.seek(time);
    }
};

// source states
Source.uninitialised    = 0;    // new source, no period added to timeline
Source.prepared         = 1;    // period added, repr. selected, mimetype determined
Source.bufferCreated    = 2;    // media source buffer added
Source.initialised      = 3;    // initialisation file downloaded and buffered


// --------------------------------------------------
// whole presentation timeline for a source
// --------------------------------------------------
class SourceTimeline {
    constructor(source) {
        this.presentation   = source.presentation;
        this.source         = source;
        this.periods        = [];
        this.currentPeriod  = undefined;
    }

    appendPeriod(mpdPeriod, adaptationSet) {
        let period = new PeriodTimeline(this, adaptationSet);
        period.updatePeriod(mpdPeriod);
        this.periods.push(period);

        if (this.currentPeriod == undefined)
            this.currentPeriod = period;
    }

    appendOrUpdatePeriod(mpdPeriod) {

    }
};


// --------------------------------------------------
// timeline for a period
// --------------------------------------------------
class PeriodTimeline {
    constructor(sourceTimeline, adaptationSet) {
        this.presentation   = sourceTimeline.presentation;
        this.source         = sourceTimeline.source;
        this.sourceTimeline = sourceTimeline;

        // initial adaptation set mimetype is used to find the correct
        // adaptation set in new periods as they're added
        this.mimeType       = adaptationSet.mimeType;

        // periods added over time, and the currently selected representation
        // based on the source bandwidth
        this.mpdPeriods     = [];
        this.mpdPeriod      = null;
        this.currentRepresentation = null;

        // segments generated from each mpdPeriod
        this.timelineStart  = undefined;
        this.timelineEnd    = undefined;
        this.segments       = [];
        this.bufferIndex    = 0;
    }

    updatePeriod(mpdPeriod) {
        // find the appropriate adaptation set in the new period
        this.mpdPeriods.push(mpdPeriod);
        this.mpdPeriod = mpdPeriod;
        this.adaptationSet = mpdPeriod.adaptationSets.find(
                adaptationSet => adaptationSet.mimeType == this.mimeType
        );

        // find the new currentRepresentation based on the source's bandwidth
        // if no bandwidth has been defined, choose the middle to start with
        if (this.source.bandwidth == undefined) {
            this.currentRepresentation = this.adaptationSet.
                    representationWithMiddle('bandwidth');
        } else {
            this.currentRepresentation = this.adaptationSet.
                    representationWith('bandwidth', this.source.bandwidth);
        }

        // templates with timelines are processed differently to others
        let template = this.currentRepresentation.segmentTemplate;
        if (template.segmentTimeline)
            this.processTimeline(template);
        else
            this.processTemplate(template);
        this.sortSegments();
    }

    segmentExists(other) {
        return this.segments.find(segment => segment.equal(other));
    }

    processTemplate(template) {
        // no timeline is available, so start generating from startNumber and
        // keep generating until the segments cover the manifest's minimum
        // update period, or until the end of the presentation if known

        let duration = template.duration;
        let number = template.startNumber;
        let time = number * template.timescale;

        // convert segment duration to seconds
        let durationSeconds = duration / template.timescale;

        // round time down to the nearest segment dur
        // let rounded = Math.floor(time / duration);
        // time = (rounded * duration) * template.timescale;

        // number is the 0 based index of the current segment, where
        // segment 0 starts at 0s, 1 starts at duration, 2 starts
        // at 2 * duration etc.
        // number = rounded + template.startNumber;

        let manifest = this.presentation.manifest;
        let count = 0;

        if (manifest.minimumUpdatePeriod) {
            let updateSeconds = manifest.minimumUpdatePeriod / 1000;
            count = Math.ceil(updateSeconds / durationSeconds) + 1;
        } else {
            // FIXME: support periods with duration defined by start time
            // of next period
            let periodSeconds = 0;
            if (this.mpdPeriod.duration)
                periodSeconds = this.mpdPeriod.duration / 1000;
            else if (manifest.mediaPresentationDuration)
                periodSeconds = manifest.mediaPresentationDuration / 1000;
            else
                throw 'unable to determine period duration';
            count = Math.ceil(periodSeconds / durationSeconds);
        }

        for (let i = 0; i <= count; i++) {
            let segment = new Segment(duration, number, time, this);
            if (!this.segmentExists(segment))
                this.segments.push(segment);
            time += duration;
            number += 1;
        }
    }

    processTimeline(template) {
        let timeline = template.segmentTimeline;
        let number = template.startNumber;
        let time = timeline.ss[0].t; // FIXME

        // timelines are composed of "S" rows which may define t (time), d
        // (duration) and r (repeat). for each s, create a new segment and
        // add to the segments list if it doesn't already exist.
        for (let s of timeline.ss) {
            if (s.t != undefined)
                time = s.t;
            let duration = s.d;

            // repeats are (in the spec) called "zero-based". if r == 0 the
            // segment is added once, when r == 1, it's added twice etc.
            for (let i = 0; i <= s.r; i++) {
                let segment = new Segment(duration, number, time, this);
                if (!this.segmentExists(segment))
                    this.segments.push(segment);
                time += duration;
                number += 1;
            }
        }
    }

    sortSegments() {
        this.segments.sort((a, b) => {
            return a.time - b.time;
        });

        let first = this.segments[0];
        let last  = this.segments[this.segments.length - 1];
        this.timelineStart = first.time;
        this.timelineEnd   = last.time + last.duration;
    }

    downloadNextSegment() {
        if (this.bufferIndex >= this.segments.length)
            return;

        let nextSegment = this.segments[this.bufferIndex];
        if (nextSegment.state != Segment.pending)
            return;

        nextSegment.state = Segment.downloading;
        let url = nextSegment.url();

        this.presentation.controller.downloader.getMedia(url, nextSegment);
        console.log('downloading', this.source.contentType, 'segment', url);
    }

    downloadedSegment() {
        this.bufferIndex += 1;
    }
};
