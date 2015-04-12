class SegmentWindow extends PlayerObject {
    constructor(source) {
        this.source         = source;
        this.presentation   = source.presentation;
        this.timeline       = source.presentation.timeline;

        this.segments       = [];
        this.playIndex      = undefined;
        this.loadIndex      = undefined;
        this.nextRangeStart = -1;
    }

    // ---------------------------
    // update segment list
    // ---------------------------
    update() {
        if (this.presentation.willStartAtBeginning)
            this.updateStatic();
        else
            this.updateDynamic();
    }

    // called once at presentation start - generate and load all segments
    updateStatic() {
        let duration = this.timeline.duration;
        if (duration == undefined)
            throw 'cannot play static presentation with unknown duration';

        this.segments = this.source.segmentsInRange(0, duration);
        this.loadIndex = 0;
    }

    // called every time the manifest is loaded
    updateDynamic() {
        console.group();
        console.log(
            'updating', this.source.contentType,
            'segments from', this.nextRangeStart.toFixed(2)
        );

        // add segments from the end of the last segment to the new live edge
        let liveEdge = this.presentation.liveEdge();
        let edgeSegment = this.source.segmentAt(liveEdge);
        let rangeStart = this.nextRangeStart;
        let rangeEnd = liveEdge;

        // if no segments have ever been added, choose a start based on the
        // live edge, moving back a little to help ensure continuous streaming
        if (rangeStart == -1) {
            // because of slight timing differences, the edge segment may not
            // always be found. try and use the last available timeline segment
            // if it makes sense, or change the search to the pres. end time.
            if (!edgeSegment) {
                let content = this.source.contentAt(liveEdge);
                if (content.repeatSegment) {
                    edgeSegment = content.segmentAt(this.presentation.endTime);
                } else {
                    let candidates = content.segments;
                    edgeSegment = candidates[candidates.length - 1];
                }
            }

            rangeStart = edgeSegment.start;

            // we need to ensure start doesn't fall outside the timeshift range
            let manifest = this.presentation.manifest;
            let timeshift = manifest.timeShiftBufferDepth;
            let minStart = rangeStart - timeshift;

            // if a suggested delay is provided, move back by that many seconds
            if (manifest.suggestedPresentationDelay) {
                rangeStart -= manifest.suggestedPresentationDelay;

            // otherwise use the timeshift buffer to determine the start time
            } else {
                rangeStart -= timeshift / 2;
            }

            // ensure rangeStart falls on a valid segment
            rangeStart = Math.max(rangeStart, minStart);    // time >= now - timeshift
            rangeStart = Math.max(rangeStart, 0);           // time >= 0
            let startDiff = liveEdge - rangeStart;
            console.log('starting', startDiff.toFixed(2), 'from live edge');
        }        

        // grab the segments in the range and start to merge into the existing
        // segments list. the initial update will assign the first set of
        // segments to the list, subsequent updates are based on the end time
        // of the last segment added previously, so no overlaps should occur
        // other than the last and first new segments being equal.
        console.log('queueing', rangeStart.toFixed(2), rangeEnd.toFixed(2));
        let newSegments = this.source.segmentsInRange(rangeStart, rangeEnd);

        if (newSegments.length == 0) {
            console.warn('no segments produced over this range');
            console.groupEnd();
            return;
        }

        console.log(`got ${newSegments.length} segment(s), starting `,
            newSegments[0].start.toFixed(2),
            newSegments[newSegments.length - 1].end.toFixed(2)
        );

        if (this.segments.length > 0) {
            let lastSegment = this.segments[this.segments.length - 1];
            if (lastSegment.equal(newSegments[0]))
                newSegments.splice(0, 1);

            let lastEnd = lastSegment.end;
            if (lastEnd != newSegments[0].start)
                console.error('discontiguous segments');

            this.segments = this.segments.concat(newSegments);
        } else {
            this.segments = newSegments;
        }

        // the next update will load from the end of the last segment
        this.nextRangeStart = newSegments[newSegments.length - 1].end;
        this.loadIndex = this.loadIndex || 0;

        // debug output
        let duration = 0.0;
        for (let segment of newSegments)
            duration += segment.durationSeconds;

        let time = performance.now() - this.presentation.controller.timeBase;
        console.log(time.toFixed(2),
            `queued ${newSegments.length} ${this.source.contentType} ` +
            `segment(s) adding ${duration.toFixed(2)}s`
        );
        
        console.groupEnd();
    }


    // ---------------------------
    // segment management
    // ---------------------------
    downloadNextSegment() {
        if (this.loadIndex == undefined)
            return;

        let segment = this.segments[this.loadIndex];

        // if the segment is downloading, allow it to continue
        if (segment.state == Segment.downloading)
            return;

        // if the segment is downloaded (or errored) attempt to move to the
        // next segment for downloading
        if (segment.state >= Segment.downloaded) {
            if ((this.loadIndex + 1) == this.segments.length) {
                console.warn(
                    performance.now() - this.presentation.controller.timeBase,
                    this.source.contentType,
                    'queue has run empty, last segment is downloaded'
                );
                return;
            } else {
                this.loadIndex += 1;
                segment = this.segments[this.loadIndex];
            }
        }

        // wait until the segment can be downloaded
        if (!segment.available())
            return;

        // only remaining segment state is pending. start to download.
        segment.state = Segment.downloading;

        // cache the url, this locks it to the current representation
        let url = segment.url(true);

        this.presentation.controller.downloader.getMedia(url, segment);
        console.log('downloading', this.source.contentType, 'segment', url);
    }

    undownloadedSegmentsRemaining() {
        this.segments.length - this.loadIndex - 1;
    }


};
