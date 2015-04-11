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
                                        template.duration,
                                        template.startNumber,
                                        0,
                                        template.timescale,
                                        this
                                     );
            console.log('updated', this.source.contentType,
                        'interval', this.interval.id,
                        'to use repeating segment', this.repeatSegment);
            return;
        }

        // otherwise process the timeline, generating segments until the end of
        // the timeline, or an infinitely repeating segment is encountered
        let number = template.startNumber;
        let timescale = template.timescale;
        let time = timeline.ss[0].t;
        this.segments = [];

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

        console.log('updated', this.source.contentType,
                    'interval', this.interval.id,
                    'with', this.segments.length, 'segments',
                    this.segments[0].start,
                    this.segments[this.segments.length - 1].end);
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

    segmentsInRange(startTime, endTime) {
        let result = [];

        for (let segment of this.segments) {
            // ignore the segment if it starts and finishes before the range
            if (segment.start < startTime && segment.end < startTime)
                continue;

            // ignore the segment if it starts after the range
            if (segment.start >= endTime)
                continue;

            // otherwise it falls within the range
            result.push(segment);
        }

        // replicate the repeat segment if the range ends after repeat start
        if (this.repeatSegment) {
            let segment = this.repeatSegment;

            // skip to startTime
            while (startTime >= segment.end)
                segment = segment.generateNext();

            while (endTime > segment.start) {
                result.push(segment)
                segment = segment.generateNext();
            }
        }

        return result;
    }
};

Content.enum('states', [
    'uninitialised',
    'initialised'
]);
