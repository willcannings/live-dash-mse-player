class Timeline extends PlayerObject {
    constructor(presentation) {
        this.presentation    = presentation;

        this.currentInterval = undefined;
        this.currentTime     = 0.0;
        this.intervals       = [];
        this.duration        = 0;
    }

    // ---------------------------
    // manifest reloads
    // ---------------------------
    update() {
        let periods = this.presentation.manifest.periods;

        // ensure all periods in dynamic manifests have ids. these are used to
        // match periods in different manifests reloads.
        if (this.presentation.willReloadManifest) {
            let anyMissingID = periods.some((period) =>
                period.id == undefined
            );

            if (anyMissingID)
                throw 'some periods in dynamic manifest are missing an id';
        }

        // updating the set of periods involves removing periods that no longer
        // appear in the manifest, updating periods that still exist, and
        // adding new periods. periods appear in time order, so remove all
        // existing periods (intervals) until we see the first common period id
        // in the old and new manifests.
        let firstID = periods[0].id;
        let firstIndex = this.intervals.findIndex((i) => i.id == firstID);

        if (firstIndex == -1 && this.intervals.length > 0)
            throw 'cannot update manifest, no common periods were found';

        // remove deleted intervals
        this.intervals.splice(0, firstIndex);

        // if the new manifest has fewer periods, after removing old periods
        // from the start of the presentation, newer periods have gone missing
        if (this.intervals.length > periods.length)
            throw 'cannot update manifest, new manifest is missing periods';


        // only the final period is permitted to be modified (and only its
        // duration can be extended). update the interval for this period,
        // and add any new intervals required, performing a simple sanity
        // check on the period ids.
        let lastIndex = this.intervals.length - 1;

        for (let i = 0; i < periods.length; i++) {
            if (i < this.intervals.length) {
                if (this.intervals[i].id != periods[i].id)
                    throw 'cannot update manifest, out of order periods';
                if (i == lastIndex)
                    this.intervals[i].updateWith(periods[i]);
            } else {
                let interval = new Interval(this.presentation, periods[i]);
                this.intervals.push(interval);
            }
        }

        // update the duration of the last interval in the current manifest if
        // present, then the start and duration times for all new intervals
        if (lastIndex == -1)
            lastIndex = 0;

        this.calculateStartAndDuration(this.intervals.slice(lastIndex));

        // we can now determine the presentation duration
        let manifest = this.presentation.manifest;
        let finalInterval = this.intervals[this.intervals.length - 1];

        if (manifest.mediaPresentationDuration)
            this.duration = manifest.mediaPresentationDuration;
        else if (finalInterval.duration != undefined)
            this.duration = finalInterval.end;
        else
            this.duration = undefined;

        // ensure a currentInterval is always available
        if (this.currentInterval == undefined)
            this.currentInterval = this.intervals[0];
    }


    // ---------------------------
    // timing
    // ---------------------------
    calculateStartAndDuration(updatedIntervals) {
        // calculate the start time and duration of each interval. this is a
        // multi step process. assign simple to determine values initially,
        // i.e if a period defines a start and duration, use those, and if
        // duration can be determined from the content of an interval,
        // generate segments to calculate duration.
        for (let i = 0; i < updatedIntervals.length; i++) {
            let interval = updatedIntervals[i];

            if (interval.period.start != undefined)
                interval.start = interval.period.start;
            else if (i == 0 && interval.start == undefined)
                interval.start = 0.0;

            if (interval.period.duration != undefined)
                interval.duration = interval.period.duration;
            else
                interval.duration = interval.contentDerivedDuration();
        }

        // in the second step "fill in the gaps" - interval start may be
        // defined as the end time of the previous interval, duration as the
        // difference between start and the next intervals's start etc.
        let lastIndex = updatedIntervals.length - 1;
        for (let i = 0; i < updatedIntervals.length; i++) {
            let interval = updatedIntervals[i];

            if (interval.start == undefined) {
                let previous = updatedIntervals[i - 1];
                if (!previous.duration)
                    throw 'cannot calculate interval start';
                interval.start = previous.start + previous.duration;
            }

            if (interval.duration == undefined) {
                // the last period's duration may be defined by the
                // presentation duration if available. if not, the presentation
                // is a live stream and duration remains undefined
                if (i == lastIndex) {
                    let manifest = this.presentation.manifest;
                    if (manifest.mediaPresentationDuration)
                        interval.duration = manifest.mediaPresentationDuration -
                                                interval.start;
                } else {
                    let next = updatedIntervals[i + 1];
                    if (!next.start)
                        throw 'cannot calculate interval duration';
                    interval.duration = next.start - interval.start;
                }
            }
        }
    }

    seek(time) {
        let previousCurrent = this.currentInterval;
        let newCurrent = this.intervals.find((interval) =>
            (interval.start <= time) && (time < interval.end)
        );

        if (previousCurrent != newCurrent) {
            this.currentInterval = newCurrent;
            previousCurrent.unseek();
        }

        this.currentInterval.seek(time);
    }
};
