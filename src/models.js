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
            mediaPresentationDuration:  duration,
            timeShiftBufferDepth:       duration,
            minimumUpdatePeriod:        duration,
            minBufferTime:              duration,
            availabilityStartTime:      date,
            profiles:                   str,
            type:                       str
        });

        this.live    = (this.profiles.indexOf('profile:isoff-live') != -1);
        this.dynamic = (this.type == 'dynamic');

        this.init(BaseURL);
        this.init(Period);
    }
}

export class BaseURL extends Model {
    setup() {
        this.url = this.xml.textContent;
    }
}

export class Period extends Model {
    setup() {
        this.attrs({
            id:         str,
            start:      duration,
            duration:   duration
        });

        this.init(SegmentTemplate);
        this.initAll(AdaptationSet);
    }
}


// ---------------------------
// adaptation sets
// ---------------------------
export class AdaptationSet extends Model {
    setup() {
        this.attrs({
            startWithSAP:               integer,
            subsegmentStartsWithSAP:    integer,
            segmentAlignment:           bool,
            subsegmentAlignment:        bool,

            audioSamplingRate:          integer,
            maxFrameRate:               integer,
            maxWidth:                   integer,
            maxHeight:                  integer,
            par:                        str,
            
            mimeType:                   str,
            codecs:                     str,
            lang:                       str
        });

        this.initAll(ContentComponent);
        this.init(SegmentTemplate);
        this.initAll(Representation);
    }

    representationWithID(id) {
        for (let rep of this.representations) {
            if (rep.id == id)
                return rep;
        }
        return undefined;
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
            bitstreamSwitching: str,
            initialization:     str,
            index:              str,
            media:              str,
            startNumber:        integer,
            timescale:          integer,
            duration:           integer
        });

        // inherit attributes from SegmentTemplates in AdaptationSets and Periods
        // NOTE: this means the call order to init is important - Period must init
        // SegmentTemplate before AdaptationSet and so on.
        if (this.parent instanceof Representation ||
            this.parent instanceof AdaptationSet) {

            let defaults = this.parent.parent.segmentTemplate;
            let attrNames = ['bitstreamSwitching', 'initialization', 'index',
                            'media', 'startNumber', 'timescale', 'duration'];

            for (let name of attrNames)
                this[name] = this[name] || defaults[name];
        }

        // initialise template strings in base SegmentTemplates - instances in
        // Period and AdaptationSet are used only as defaults for base instances
        if (this.parent instanceof Representation) {
            let bitstreamSwitching  = new TemplateString('bitstreamSwitching', this);
            let initialization      = new TemplateString('initialization', this);
            this.index              = new TemplateString('index', this);
            this.media              = new TemplateString('media', this);

            // if any of templates are invalid, and this SegmentTemplate instance
            // is a child of a Representation, the parent Representation is invalid
            if (bitstreamSwitching.invalid ||
                initialization.invalid ||
                this.index.invalid ||
                this.media.invalid) {

                this.invalid = true;
                if (this.parent instanceof Representation)
                    this.parent.invalid = true;
            }

            // neither initialization nor bitstreamSwitching can include Time or
            // Number identifiers, so it's safe to use their pre-processed state
            this.bitstreamSwitching = bitstreamSwitching.processed;
            this.initialization = initialization.processed;
        }

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
            id:             integer,
            startWithSAP:   integer,

            frameRate:      integer,
            bandwidth:      integer,
            width:          integer,
            height:         integer,
            sar:            integer,
            
            mimeType:       str,
            codecs:         str
        });

        this.initAll(SubRepresentation);
        this.init(SegmentTemplate);
        this.init(BaseURL);
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



// --------------------------------------------------
// helpers
// --------------------------------------------------
// validate and process format strings following the specs in 5.3.9.4.4
// Template-based Segment URL construction, Table 16.
class TemplateString {
    constructor(name, segmentTemplate) {
        let parent = segmentTemplate.parent;
        let format = segmentTemplate[name];

        // not all format strings are mandatory
        if (format == undefined) {
            this.empty = true;
            return;
        }

        // templates are inherited from SegmentTemplate instances in Periods and
        // AdaptationSets. Only process the template if it belongs to an instance
        // of a SegmentTemplate appearing in a Representation.
        if (!(parent instanceof Representation))
            return;
        
        // avoid processing invalid format strings. If the string is used for
        // the media attribute, and the parent element is a Representation,
        // the entire Representation is invalidated and is ignored.
        if (this.formatIsInvalid(name, format, parent)) {
            this.invalid = true;
            return;
        }

        // pre-process the format string - '$$', '$RepresentationID$' and
        // '$Bandwidth$' can be statically replaced
        this.processed = format.replace('$$', '$');
        this.processed = this.substitute('RepresentationID', parent.id, this.processed);
        this.processed = this.substitute('Bandwidth', parent.bandwidth, this.processed);
    }

    format(number, time) {
        if (this.empty)
            return '';
        let interim = this.processed.slice(0);
        interim = this.substitute('Number', number, interim);
        return this.substitute('Time', time, interim);
    }

    substitute(identifier, value, interim) {
        let regex = `\\$${identifier}(\\%0(\\d+)d)?\\$`
        let instances = interim.match(new RegExp(regex, 'g'));
        if (!instances)
            return interim;

        for (let instance of instances) {
            var [full, _, width] = instance.match(regex);
            var val = value.toString();
            
            if (width != undefined) {
                width = parseInt(width, 10);
                if (val.length < width)
                    val = "0".repeat(width - val.length) + val;
            }

            interim = interim.replace(full, val);
        }
        
        return interim;
    }

    formatIsInvalid(name, format, parent) {
        // format strings can be invalidated by:
        // * unescaped '$' characters
        // * '$Number$' or '$Time$' appearing in initialization and
        //   bitstreamSwitching formats
        // * '$RepresentationID$' followed by a width formatting tag
        // * '$Time$' and '$Number$' appearing in the same string
        // * dollar signs enclosing an invalid identifier
        // * width formatting tags not of the format '%0[width]d'
        // * '$Time$' appearing in a template without a timeline
        if (name == 'initialization' || name == 'bitstreamSwitching')
            if (format.includes('$Number$') || format.includes('$Time$'))
                return true;

        // TODO: unescaped, RepID followed by width, Time & Number,
        // invalid identifiers, invalid widths, missing timeline
    }
}
