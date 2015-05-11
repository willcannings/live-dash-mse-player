class Segment extends PlayerObject {
    constructor(duration, number, time, timescale, content, url, range) {
        this.duration       = duration;
        this.number         = number;
        this.time           = time;
        this.timescale      = timescale;
        this.content        = content;
        this.listURL        = url;
        this.range          = range;

        this.state          = Segment.pending;
        this._url           = null;
    }


    // ---------------------------
    // generators
    // ---------------------------
    // assuming this is a repeating segment, produce the segment immediately
    // following this segment
    generateNext() {
        return new Segment(
            this.duration,
            this.number + 1,
            this.time + this.duration,
            this.timescale,
            this.content
        );
    }

    // assuming this is a repeating segment, produce the segment that contains
    // 'time' in its interval (start inclusive, end non inclusive)
    seekTo(time) {
        let number = Math.floor((time * this.timescale) / this.duration);
        return new Segment(
            this.duration,
            number,
            number * this.duration,
            this.timescale,
            this.content
        );
    }

    // ---------------------------
    // attributes
    // ---------------------------
    // lazily evaluate url so changes to currentRepresentation can apply
    url(memoise = false) {
        if (this._url)
            return this._url;

        if (this.listURL) {
            var path = this.listURL;
        } else {
            let template = this.content.currentRepresentation.segmentTemplate;
            let number = this.number + template.startNumber;
            var path = template.media.format(number, this.time);
        }

        let baseURL = this.content.source.presentation.manifest.base();
        let url = URI(path).absoluteTo(baseURL).toString();

        if (memoise)
            this._url = url;
        return url;
    }

    available() {
        let presentation = this.content.source.presentation;

        // all presentations, including static, may have an availability time
        if (!presentation.hasAvailabilityStartTime)
            return true;

        // live edge is 0 when current time == availability time. the segment
        // will become available once its duration is complete, i.e the first
        // segment can't be accessed until it's recorded
        return presentation.liveEdge() >= this.end;
    }

    equal(other) {
        return this.duration == other.duration &&
               this.time == other.time;
    }

    get start() {
        return this.time / this.timescale;
    }

    get end() {
        return (this.time + this.duration) / this.timescale;
    }

    get durationSeconds() {
        return this.duration / this.timescale;
    }


    // ---------------------------
    // network callbacks
    // ---------------------------
    error(xhr) {
        this.state = Segment.error;
        console.log(`error loading segment ${this._url}`, xhr);
        throw 'error loading segment';
    }

    timeout(xhr) {
        this.state = Segment.error;
        console.log(`timeout loading segment ${this._url}`, xhr);
        throw 'timeout loading segment';
    }

    success(xhr) {
        this.data = xhr.response;
        this.content.source.appendSegment(this);
        this.state = Segment.downloaded;
    }
}

Segment.enum('states', [
    'pending',
    'downloading',
    'downloaded',
    'error'
]);
