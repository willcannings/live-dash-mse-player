class InitFile extends RequestProcessor {
    constructor(source) {
        this.source = source;

        // generate init url from the initial representation
        this.url = source.currentRepresentation.segmentTemplate.initialization;

        // this.url will be a relative url. absolutify it relative to the
        // manifest base url (either defined by BaseURL or by the manifest URL)
        let baseURL = source.presentation.manifest.base();
        this.url = URI(this.url).absoluteTo(baseURL).toString();
        console.log(`initialising ${source.contentType} with ${this.url}`);
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
