'use strict';

// --------------------------------------------------
// abstract model
// --------------------------------------------------
// scales used when parsing duration strings
var SECONDS = 1000;             // xs:duration seconds
var MINUTES = 60 * SECONDS;     // xs:duration minutes
var HOURS   = 60 * MINUTES;     // xs:duration hours
var DURATION_COMPONENTS = {
    'S': SECONDS,
    'M': MINUTES,
    'H': HOURS
};

// attribute processors
function date(val) {
    return Date.parse(val);
}

function duration(val) {
    if (val.slice(0, 2) != 'PT')
        throw 'can only parse durations solely composed of time components';

    // remove "PT" and match each component: count (H | M | S)
    let components = val.slice(2).match(/\d+[HMS]/g);
    let milliseconds = 0;

    components.forEach((component) => {
        let scale = DURATION_COMPONENTS[component.slice(-1)];
        let count = parseInt(component.slice(0, -1), 10);
        milliseconds += count * scale;
    });

    return milliseconds;
}

function bool(val) {
    return val == 'true';
}

function integer(val) {
    return parseInt(val, 10);
}

function str(val) {
    return val;
}

class Model {
    constructor(xml, parent = null) {
        this.attributes = xml.attributes;
        this.parent = parent;
        this.xml = xml;
        this.setup();
    }

    setup() {
        throw 'setup not overriden';
    }

    // attributes
    attr(name) {
        try {
            return this.attributes.getNamedItem(name).value;
        } catch (e) {
            return undefined;
        }
    }

    attrs(pairs) {
        for (name in pairs) {
            let val = this.attr(name);
            let processor = pairs[name];
            
            if (processor && val != undefined)
                val = processor(val);
            this[name] = val;
        }        
    }

    // elements
    titleCase(type) {
        return type.name[0].toLowerCase() + type.name.slice(1)
    }

    init(type) {
        let varName = this.titleCase(type);
        let xml = this.xml.getElementsByTagName(type.name)[0];

        if (xml == undefined) {
            this[varName] = undefined;
        } else {
            this[varName] = new type(xml, this);
        }
    }

    initAll(type) {
        let varName = this.titleCase(type) + 's';
        let elements = this.xml.getElementsByTagName(type.name);

        if (elements.length == 0) {
            this[varName] = []
        } else {
            let elementsArray = [].slice.call(elements);
            let parent = this;
            this[varName] = elementsArray.map((xml) => {
                return new type(xml, parent);
            });
        }
    }
}



// --------------------------------------------------
// models
// --------------------------------------------------
export class Manifest extends Model {
    setup() {
        this.attrs({
            suggestedPresentationDelay: duration,
            timeShiftBufferDepth:       duration,
            minimumUpdatePeriod:        duration,
            minBufferTime:              duration,
            availabilityStartTime:      date,
            profiles:                   str,
            type:                       str
        });

        this.live    = (this.profiles.indexOf('profile:isoff-live') != -1);
        this.dynamic = (this.type == 'dynamic');

        this.init(Period);
    }
}

export class Period extends Model {
    setup() {
        this.attrs({ start: duration });
        this.initAll(AdaptationSet);
    }
}


// ---------------------------
// adaptation sets
// ---------------------------
export class AdaptationSet extends Model {
    setup() {
        this.attrs({
            startWithSAP:            integer,
            subsegmentStartsWithSAP: integer,
            segmentAlignment:        bool,
            subsegmentAlignment:     bool,
            mimeType:                str
        });

        this.initAll(ContentComponent);
        this.init(SegmentTemplate);
        this.initAll(Representation);
    }
}

export class ContentComponent extends Model {
    setup() {
        this.attrs({
            contentType: str,
            id:          integer
        });
    }
}


// ---------------------------
// segments
// ---------------------------
export class SegmentTemplate extends Model {
    setup() {
        this.attrs({
            initialization: str,
            startNumber:    integer,
            timescale:      integer,
            duration:       integer,
            media:          str
        });

        this.init(SegmentTimeline);
    }
}

export class SegmentTimeline extends Model {
    setup() {
        this.initAll(S);
    }
}

export class S extends Model {
    setup() {
        this.attrs({
            t: integer,
            d: integer,
            r: integer
        });
    }
}


// ---------------------------
// representations
// ---------------------------
export class Representation extends Model {
    setup() {
        this.attrs({
            id:         integer,
            width:      integer,
            height:     integer,
            bandwidth:  integer,
            codecs:     str
        });

        this.initAll(SubRepresentation);
        this.init(SegmentTemplate);
    }
}

export class SubRepresentation extends Model {
    setup() {
        this.attrs({
            contentComponent: integer,
            bandwidth:        integer,
            codecs:           str
        });
    }
}
