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

    seek(time) {
        for (let source of this.sources)
            source.seek(time);
        this.currentTime = time;
    }


    // ---------------------------
    // manifests
    // ---------------------------
    appendManifest(manifest) {
        this.manifests.push(manifest);
        this.manifest = manifest;
        this.determineOperationMode();

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
        // create a source for each adaptation set; some may be deleted later
        // once a supported source has been found for each content type
        console.log('loading all adaptation sets as potential sources');
        let periods = this.manifest.periods;
        let firstPeriod = periods[0];

        for (let adaptationSet of firstPeriod.adaptationSets) {
            let source = new Source(this, adaptationSet.mimeType);
            this.sources.push(source);

            // prepare the source with its initial period and adaptation set
            source.timeline.updatePeriods(periods);
            source.prepare();
        }

        // allow the controller to decide which sources will be used
        this.state = Presentation.sourcesCreated;
        this.controller.sourcesPrepared();
    }

    updateSources() {
        let periods = this.manifest.periods;
        let firstPeriod = periods[0];

        for (let adaptationSet of firstPeriod.adaptationSets) {
            let source = this.sources.find((source) =>
                source.mimeType == adaptationSet.mimeType
            );

            if (source)
                source.timeline.updatePeriods(periods);
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

// ---------------------------
// presentation states
// ---------------------------
Presentation.uninitialised  = 0;
Presentation.sourcesCreated = 1;

// ---------------------------
// presentation operation
// modes (dash-if live iops)
// ---------------------------
Presentation.staticOperation     = 0;   // on demand
Presentation.dynamicOperation    = 1;   // live edge
Presentation.simpleLiveOperation = 2;   // live, reloading
Presentation.mainLiveOperation   = 3;   // not supported



// --------------------------------------------------
// source / track
// --------------------------------------------------
class Source {
    constructor(presentation, mimeType) {
        this.controller     = presentation.controller;
        this.presentation   = presentation;
        this.timeline       = new SourceTimeline(this);
        
        // media type information
        this.mimeType       = mimeType;
        this.codecs         = null;
        this.mseType        = null;
        this.contentType    = null;

        // top level types, only one source may represent each type
        this.video          = false;
        this.audio          = false;
        this.text           = false;

        // media content
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

    seek(time) {
        this.timeline.seek(time);
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

        // copy representation details - bandwidth will update during playback
        // while mseType and codecs will remain static for the lifetime of the
        // source. these are required now to create a buffer for segments.
        this.bandwidth = representation.bandwidth;
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
    get width() {
        if (!this.video)
            throw 'cannot determine width of a non video source';
        return this.timeline.currentPeriod.currentRepresentation.width;
    }

    get height() {
        if (!this.video)
            throw 'cannot determine height of a non video source';
        return this.timeline.currentPeriod.currentRepresentation.height;
    }
};

// ---------------------------
// source states
// ---------------------------
Source.uninitialised    = 0;    // new source, no period added to timeline
Source.prepared         = 1;    // period added, repr. selected, mimetype determined
Source.bufferCreated    = 2;    // media source buffer added
Source.initialised      = 3;    // initialisation file downloaded and appended



// --------------------------------------------------
// presentation timeline for a source
// --------------------------------------------------
class SourceTimeline {
    constructor(source) {
        this.presentation   = source.presentation;
        this.source         = source;
        this.periods        = [];
        this.currentPeriod  = undefined;
    }

    // ---------------------------
    // manifest reloads
    // ---------------------------
    updatePeriods(mpdPeriods) {
        // ensure all periods in dynamic manifests have ids. these are used to
        // match periods in different manifests reloads.
        if (this.presentation.willReloadManifest) {
            let anyMissingID = mpdPeriods.some((period) =>
                period.id == undefined
            );

            if (anyMissingID)
                throw 'some periods in dynamic manifest are missing an id';
        }

        // updating the set of periods involves removing periods that no longer
        // appear in the manifest, updating periods that still exist, and
        // adding new periods. the id to period map helps check for the
        // presence of a period in the current and new manifests.
        let existing = new Map([
            for (period of this.periods)
                [period.id, period]
        ]);

        // subsequent manifests can extend the duration of the last period
        // only. if it exists, store a reference to its id, so new start and
        // duration times can be calculated only on it and any new periods.
        let lastID = null;
        if (this.periods.length > 0)
            lastID = this.periods[this.periods.length - 1].id;

        // add or update periods. as a period is discovered in the existing map
        // its id is deleted. any ids remaining refer to periods which no
        // longer exist in the new manifest.
        for (let mpdPeriod of mpdPeriods) {
            if (existing.has(mpdPeriod.id)) {
                existing.get(mpdPeriod.id).updateWith(mpdPeriod);
                existing.delete(period.id);
            } else {
                let period = new PeriodTimeline(this, mpdPeriod);
                this.periods.push(period);
            }
        };

        // delete existing periods up until the first period in the new
        // manifest. TODO: determine whether the current playback time makes
        // this safe to do (i.e current time - time shift > period end)
        let firstID = mpdPeriods[0].id
        let firstIndex = this.periods.findIndex((p) => p.id == firstID);

        // the second parameter to splice is count, so when the first periods
        // in this.periods and mpdPeriods are the same, nothing will be deleted
        this.periods.splice(0, firstIndex);

        // update the duration of the last period in the current manifest if
        // present, then the start and duration times for all new periods
        let lastIndex = 0;
        if (lastID) {
            lastIndex = this.periods.findIndex((p) => p.id == lastID);
            if (lastIndex == -1)
                throw 'current and new manifests have no common periods';
        }

        this.calculateStartAndDuration(this.periods.slice(lastIndex));

        // pick the first period to use when preparing this.source. since the
        // player only supports multi period presentations where each period
        // contains the same number of adaptation sets, all of which contain
        // the same number of representations, this is safe to do, even if
        // currentPeriod may not be periods[0] on the live edge.
        if (!this.currentPeriod)
            this.currentPeriod = this.periods[0];
    }


    // ---------------------------
    // timing
    // ---------------------------
    calculateStartAndDuration(updatedPeriods) {
        // calculate the start time and duration of each period. this is a
        // multi step process. assign simple to determine values initially,
        // i.e if a period defines a start and duration, use those, and if
        // duration can be determined from the segments defined by a period,
        // generate segments to calculate duration.
        for (let i = 0; i < updatedPeriods.length; i++) {
            let period = updatedPeriods[i];

            if (period.mpdPeriod.start != undefined)
                period.start = period.mpdPeriod.start;
            else if (i == 0 && period.start == undefined)
                period.start = 0.0;

            if (period.mpdPeriod.duration != undefined)
                period.duration = period.mpdPeriod.duration;
            else
                period.duration = period.contentDerivedDuration();
        }

        // in the second step "fill in the gaps" - period start may be defined
        // as the end time of the previous period, duration as the difference
        // between start and the next period's start etc.
        let lastIndex = updatedPeriods.length - 1;
        for (let i = 0; i < updatedPeriods.length; i++) {
            let period = updatedPeriods[i];

            if (period.start == undefined) {
                let previous = updatedPeriods[i - 1];
                if (!previous.duration)
                    throw 'cannot calculate period start';
                period.start = previous.start + previous.duration;
            }

            if (period.duration == undefined) {
                // the last period's duration may be defined by the
                // presentation duration if available. if not, the presentation
                // is a live stream and duration remains undefined
                if (i == lastIndex) {
                    let manifest = this.presentation.manifest;
                    if (manifest.mediaPresentationDuration)
                        period.duration = manifest.mediaPresentationDuration -
                                            period.start;
                } else {
                    let next = updatedPeriods[i + 1];
                    if (!next.start)
                        throw 'cannot calculate period duration';
                    period.duration = next.start - period.start;
                }
            }
        }
    }

    seek(time) {
        let previousCurrent = this.currentPeriod;
        let newCurrent = this.periods.find((period) =>
            (period.start <= time) && (time < period.end)
        );

        if (previousCurrent != newCurrent) {
            this.currentPeriod = newCurrent;
            previousCurrent.unseek();
        }

        this.currentPeriod.seek(time);
    }
};



// --------------------------------------------------
// timeline for a period
// --------------------------------------------------
class PeriodTimeline {
    constructor(sourceTimeline, mpdPeriod) {
        this.presentation   = sourceTimeline.presentation;
        this.source         = sourceTimeline.source;
        this.sourceTimeline = sourceTimeline;

        // initial adaptation set mimetype is used to find the correct
        // adaptation set in new periods as they're added
        this.mimeType       = this.source.mimeType;

        // periods added over time, and the currently selected representation
        // based on the source bandwidth
        this.mpdPeriods     = [];
        this.mpdPeriod      = null;
        this.id             = null;

        // segments generated from each mpdPeriod
        this.start          = undefined;
        this.duration       = undefined;
        this.segments       = [];
        this.bufferIndex    = 0;

        this.updateWith(mpdPeriod);
    }

    seek(time) {
    }

    unseek() {
    }

    get end() {
        return this.start + this.duration;
    }

    updateWith(mpdPeriod) {
        this.mpdPeriods.push(mpdPeriod);
        this.mpdPeriod = mpdPeriod;
        this.id = mpdPeriod.id;

        // find the appropriate adaptation set in the new period
        this.adaptationSet = mpdPeriod.adaptationSets.find(
                adaptationSet => adaptationSet.mimeType == this.mimeType
        );

        // select a representation for the period. if no bandwidth has been
        // defined, choose the middle bandwidth to start with
        if (this.source.bandwidth == undefined) {
            this.currentRepresentation = this.adaptationSet.
                    representationWithMiddle('bandwidth');
        } else {
            this.currentRepresentation = this.adaptationSet.
                    representationWith('bandwidth', this.source.bandwidth);
        }
    }

    contentDerivedDuration() {
        // the duration of a period may be defined by the period's content. if
        // a timeline is provided, and the final component doesn't infinitely
        // repeat, we can calculate a fixed duration by generating segments
        let template = this.currentRepresentation.segmentTemplate;
        if (!template.segmentTimeline)
            return undefined;

        let segments = template.segmentTimeline.ss
        let finalSegment = segments[segments.length - 1];
        if (finalSegment.r == -1)   // infinitely repeat
            return undefined;

        this.generateSegments();
        let last  = this.segments[this.segments.length - 1];
        return (last.time + last.duration) - this.start;
    }

    generateSegments() {
        // segments may be generated while calculating period duration and
        // when preparing the timeline. prevent multiple generation steps.
        if (this.mpdPeriod.generated)
            return;

        // templates with timelines are processed differently to others
        let template = this.currentRepresentation.segmentTemplate;
        if (template.segmentTimeline)
            this.processTimeline(template);
        else
            this.processTemplate(template);

        this.sortSegments();
        this.mpdPeriod.generated = true;
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
