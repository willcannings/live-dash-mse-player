// --------------------------------------------------
// download manager
// --------------------------------------------------
class Downloader {
    constructor(controller) {
        this.downloadHistory = [];
        this.historyLength   = controller.options.downloadHistory;
        this.mpdTimeout      = controller.options.mpdTimeout;
        this.baseManager     = new BaseManager(controller);
    }

    destruct() {
        for (let download of this.downloadHistory) {
            if (download.state == Download.inprogress)
                download.destruct();
        }
    }

    // ---------------------------
    // requests
    // ---------------------------
    // truncate (from the start) downloadHistory to be at most max Download
    // History length. if there are not enough downloads in a completed state
    // this may not be possible, and the array may grow larger than allowed
    truncateHistory() {
        if (this.downloadHistory.length <= this.historyLength)
            return;

        let remaining = this.downloadHistory.length - this.historyLength;

        for (let i = 0; i < this.downloadHistory.length; i++) {
            if (this.downloadHistory[i].state <= Download.inprogress)
                continue;

            this.downloadHistory.splice(i, 1);
            remaining--;

            if (remaining <= 0)
                break;
        }
    }

    getMPD(uri, processor) {
        this.get(uri, processor, {
            mimeType: 'text/xml',
            timeout: this.mpdTimeout
        });
    }

    getMedia(uri, range, processor) {
        this.get(uri, processor, {
            range,
            responseType: 'arraybuffer'
        });
    }

    get(uri, processor, options) {
        this.truncateHistory();
        this.downloadHistory.push(
            new Download(
                uri,
                processor,
                this.baseManager,
                options
            )
        );
    }


    // ---------------------------
    // history
    // ---------------------------
    valueHistory(attr, type) {
        let SMOOTHING = 0.1;
        let min = undefined;
        let max = undefined;
        let avg = undefined;

        this.downloadHistory.forEach((download) => {
            if (download.state != Download.success)
                return;

            if (type && download.type != type)
                return;

            let value = download[attr]();

            if (avg == undefined)
                avg = value;
            else
                avg = (SMOOTHING * value) + ((1 - SMOOTHING) * avg);

            if (value < min || min == undefined)
                min = value;

            if (value > max || max == undefined)
                max = value;
        });

        return {min, avg, max};
    }

    speedHistory(type = null) {
        return this.valueHistory('speed', type);
    }

    latencyHistory(type = null) {
        return this.valueHistory('latency', type);
    }
};
