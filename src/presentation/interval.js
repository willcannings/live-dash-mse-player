class Interval extends PlayerObject {
    constructor(presentation, period) {
        this.presentation   = presentation;
        this.period         = period;

        // timeline
        this.id             = period.id;
        this.start          = undefined;
        this.duration       = undefined;

        // join representations from related adaptation sets together
        this.videoContent   = new Content(this.presentation.videoSource, this);
        this.audioContent   = new Content(this.presentation.audioSource, this);

        // add representations to content types. the set of representations in
        // a period will never change, so it's ok to only perform this once.
        this.initialiseRepresentations(period);
    }

    get end() {
        if (this.duration == undefined)
            return undefined;
        return this.start + this.duration;
    }

    contentDerivedDuration() {
        let videoDuration = this.videoContent.contentDerivedDuration() ||  -1;
        let audioDuration = this.videoContent.contentDerivedDuration() ||  -1;
        let max = Math.max(videoDuration, audioDuration);

        if (max == -1)
            return undefined;
        else
            return max;
    }

    contentFor(contentType) {
        if (contentType == 'video')
            return this.videoContent;
        else if (contentType == 'audio')
            return this.audioContent;
    }

    initialiseRepresentations(period) {
        for (let adaptationSet of period.adaptationSets) {
            for (let representation of adaptationSet.representations) {
                let contentType = representation.mimeContentType;
                let content = this.contentFor(contentType);
                content.addRepresentation(representation);
            }
        }

        this.videoContent.selectRepresentation();
        this.audioContent.selectRepresentation();
    }

    updateWith(period) {
        this.period = period;

        // find the first video and audio representation, and use the template
        // from each to update the content objects
        let videoUpdated = false;
        let audioUpdated = false;

        for (let adaptationSet of period.adaptationSets) {
            for (let representation of adaptationSet.representations) {
                let contentType = representation.mimeContentType;

                if (contentType == 'video' && !videoUpdated) {
                    this.videoContent.updateTimelineWith(representation);
                    videoUpdated = true;
                    break;

                } else if (contentType == 'audio' && !audioUpdated) {
                    this.audioContent.updateTimelineWith(representation);
                    audioUpdated = true;
                    break;
                }
            }
        }
    }
};
