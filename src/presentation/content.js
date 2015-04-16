class Content extends PlayerObject {
    constructor(source, interval) {
        this.source                 = source;
        this.interval               = interval;
        this.state                  = Content.uninitialised;

        this.currentRepresentation  = null;
        this.representations        = [];

        this.segments               = [];
        this.repeatSegment          = undefined;
    }

    addRepresentation(representation) {
        this.representations.push(representation);

        if (this.state == Content.uninitialised) {
            this.updateTimelineWith(representation);
            this.state = Content.initialised;
        }
    }

    selectRepresentation() {
        // should refer to this.source.codecs and bandwidth etc. but for now
        // always pick the representation with the 'middle' bandwidth
        let sorted = Array.from(this.representations);
        sorted.sort((a, b) => a.bandwidth - b.bandwidth);
        this.currentRepresentation = sorted[Math.floor(sorted.length / 2)];
    }

    updateTimelineWith(representation) {
        let template = representation.segmentTemplate;
        let timeline = template.segmentTimeline;

        // without a timeline, only the template is used to generate segments
        if (!timeline) {
            this.repeatSegment = new Segment(
                template.duration, 0, 0,
                template.timescale, this
            );

            console.log(`updated ${this.source.contentType} ` +
                        `interval ${this.interval.id} ` +
                        `to use repeating segment`, this.repeatSegment);
            return;
        }

        // otherwise process the timeline, generating segments until the end of
        // the timeline, or an infinitely repeating segment is encountered
        let timescale = template.timescale;
        let time = timeline.ss[0].t;
        this.segments = [];
        let number = 0;

        // timelines are composed of "S" rows which may define t (time), d
        // (duration) and r (repeat). for each s, create a new segment and
        // add to the segments list if it doesn't already exist.
        for (let s of timeline.ss) {
            if (s.t != undefined)
                time = s.t;
            let duration = s.d;

            // when the final s row repeats -1, it repeats infinitely
            if (s.r == -1) {
                this.repeatSegment = new Segment(
                    duration, number, time,
                    timescale, this
                );
            }

            // repeats are (in the spec) called "zero-based". if r == 0 the
            // segment is added once, when r == 1, it's added twice etc.
            for (let i = 0; i <= s.r; i++) {
                let segment = new Segment(
                    duration, number, time,
                    timescale, this
                );

                this.segments.push(segment);
                time += duration;
                number += 1;
            }
        }

        console.log(`updated ${this.source.contentType} ` +
                    `interval ${this.interval.id} ` +
                    `with ${this.segments.length} segments ` +
                    `${this.segments[0].start.toFixed(2)} - ` +
                    this.segments[this.segments.length - 1].end.toFixed(2)
        );
    }

    contentDerivedDuration() {
        // the duration of a period may be defined by the period's content. if
        // a timeline is provided, and the final component doesn't infinitely
        // repeat, we can calculate a fixed duration by generating segments
        if (this.repeatSegment != undefined)
            return undefined;
        
        let last = this.segments[this.segments.length - 1];
        return (last.time + last.duration) - this.interval.start;
    }

    timeOutOfBounds(time) {
        let presentation = this.source.presentation;

        // ensure time isn't greater than the presentation duration
        if (presentation.duration && time > presentation.duration)
            return presentation.duration;

        // otherwise ensure time isn't greater than live end time
        if (presentation.endTime && time > presentation.endTime)
            return presentation.endTime;

        return false;
    }

    segmentsInRange(startTime, endTime) {
        let result = [];

        // handle start/end times beyond the presentation end
        if (this.timeOutOfBounds(startTime)) {
            console.warn('startTime is out of bounds');
            return [];
        }

        if (this.timeOutOfBounds(endTime)) {
            console.warn('endTime is out of bounds');
            endTime = this.timeOutOfBounds(endTime);
        }

        // add any matching timeline segments
        for (let segment of this.segments) {
            if (segment.end > startTime && segment.start < endTime)
                result.push(segment);            
        }

        // replicate the repeat segment if the range ends after repeat start
        if (this.repeatSegment && this.repeatSegment.start < endTime) {
            let segment = this.repeatSegment;

            // move to the end of the last timeline segment if any were found,
            // otherwise move to the initial startTime
            if (result.length > 0)
                segment = segment.seekTo(result[result.length - 1].end);
            else
                segment = segment.seekTo(startTime);

            while (endTime > segment.start) {
                result.push(segment)
                segment = segment.generateNext();
            }
        }

        return result;
    }

    segmentAt(time) {
        // time cannot be beyond the presentation end
        if (this.timeOutOfBounds(time)) {
            console.warn('time is out of bounds');
            return null;
        }

        // timeline segments
        for (let segment of this.segments) {
            if (segment.start <= time && segment.end > time)
                return segment;
        }

        // fallback to a repeat segment otherwise. it's safe to seekTo time
        // directly here since we know time is within bounds and will result
        // in a valid segment
        if (this.repeatSegment) {
            return this.repeatSegment.seekTo(time);
        }

        return null;
    }
};

Content.enum('states', [
    'uninitialised',
    'initialised'
]);
