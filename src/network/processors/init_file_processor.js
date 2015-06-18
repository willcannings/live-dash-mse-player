class InitFile extends RequestProcessor {
    constructor(source) {
        this.source = source;

        // generate init url from the initial representation
        let representation = source.currentRepresentation;
        if (representation.segmentTemplate)
            this.uri = representation.segmentTemplate.initialization;
        else
            this.uri = representation.segmentList.initialization.sourceURL;

        console.log(`initialising ${source.contentType} with ${this.uri}`);
    }

    get type() {
        return RequestProcessor.init;
    }

    error(xhr) {
        console.log(`error loading init file ${this.url}`, xhr);
        throw 'error loading init file';
    }

    timeout(xhr) {
        console.log(`timeout loading init file ${this.url}`, xhr);
        throw 'timeout loading init file';
    }

    success(xhr) {
        console.log(`loaded init file for ${this.source.contentType}`);
        this.source.appendInitFile(xhr.response);
        this.source.state = Source.initialised;
    }
};
