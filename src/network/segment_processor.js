class Segment extends PlayerObject {
    constructor(duration, number, time, timescale, content, availableTime) {
        this.duration       = duration;
        this.number         = number;
        this.time           = time;
        this.timescale      = timescale;
        this.content        = content;
        this.availableTime  = availableTime;

        this.state          = Segment.pending;
        this._url           = null;
    }


    // ---------------------------
    // generators
    // ---------------------------
    generateNext() {
        return new Segment(
            this.duration,
            this.number + 1,
            this.time + this.duration,
            this.timescale,
            this.content
        );
    }

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

        let template = this.content.currentRepresentation.segmentTemplate;
        let number = this.number + template.startNumber;
        let path = template.media.format(number, this.time);

        let baseURL = this.content.source.presentation.manifest.base();
        let url = URI(path).absoluteTo(baseURL).toString();

        if (memoise)
            this._url = url;
        return url;
    }

    available() {
        if (this.availableTime == undefined)
            return true;
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
        console.log('error loading segment', this._url, xhr);
        throw 'error loading segment';
    }

    timeout(xhr) {
        this.state = Segment.error;
        console.log('timeout loading segment', this._url, xhr);
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
