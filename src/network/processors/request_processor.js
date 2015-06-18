class RequestProcessor extends PlayerObject {
    get type() {
        return RequestProcessor.undefined;
    }

    error(xhr) {
        throw 'error not overriden';
    }

    timeout(xhr) {
        throw 'timeout not overriden';
    }

    success(xhr) {
        throw 'success not overriden';
    }
};

RequestProcessor.enum('types', [
    'undefined',
    'mpd',
    'init',
    'media'
]);
