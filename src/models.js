'use strict';

// --------------------------------------------------
// abstract model
// --------------------------------------------------
// attribute processors
function date(val) {
    return val;
}

function duration(val) {
    return val;
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
            mimeType: str,
            segmentAlignment: bool,
            subsegmentAlignment: bool,
            startWithSAP: integer,
            subsegmentStartsWithSAP: integer
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
            id: integer
        });
    }
}


// ---------------------------
// segments
// ---------------------------
export class SegmentTemplate extends Model {
    setup() {
        this.attrs({
            timescale: integer,
            media: str,
            initialization: str,
            duration: integer,
            startNumber: integer,
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
            id: integer,
            width: integer,
            height: integer,
            bandwidth: integer,
            codecs: str
        });

        this.initAll(SubRepresentation);
        this.init(SegmentTemplate);
    }
}

export class SubRepresentation extends Model {
    setup() {
        this.attrs({
            contentComponent: integer,
            bandwidth: integer,
            codecs: str
        });
    }
}
