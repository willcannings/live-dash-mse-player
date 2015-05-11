'use strict';

// --------------------------------------------------
// abstract model + parsing
// --------------------------------------------------
// scales used when parsing duration strings
var SECONDS = 1;                // xs:duration seconds
var MINUTES = 60 * SECONDS;     // xs:duration minutes
var HOURS   = 60 * MINUTES;     // xs:duration hours
var DURATION_COMPONENTS = {
    'S': SECONDS,
    'M': MINUTES,
    'H': HOURS
};

// attribute processors
function date(val) {
    return Date.parse(val) / 1000; // treat dates as seconds
}

function duration(val) {
    if (val.slice(0, 2) != 'PT')
        throw 'can only parse durations solely composed of time components';

    // remove "PT" and match each component: count (H | M | S)
    let components = val.slice(2).match(/[\d\.]+[HMS]/g);
    let seconds = 0;

    components.forEach((component) => {
        let scale = DURATION_COMPONENTS[component.slice(-1)];
        let count = parseFloat(component.slice(0, -1));
        seconds += count * scale;
    });

    return seconds;
}

function bool(val) {
    return val == 'true';
}

function integer(val) {
    return parseInt(val, 10);
}

function dbl(val) {
    return parseFloat(val);
}

function str(val) {
    return val;
}

class Model {
    // construct models by supplying base XML to be used in
    // an overriden setup method, or another model to clone
    constructor(obj, parent = null) {
        // cloning
        if (obj instanceof Model) {
            let clone = obj;
            this.attributeDefinitions = clone.attributeDefinitions;
            this.elementAttributes = clone.elementAttributes;
            this.attributes = clone.attributes;
            this.parent = parent;
            this.xml = clone.xml;

            // attribute values
            for (name in clone.attributeDefinitions)
                this[name] = clone[name];

            // child elements
            for (let name of clone.elementAttributes)
                this[name] = clone[name];

            // allow the model to assign further attributes
            obj.clone(this);

        // new from xml
        } else {
            let xml = obj;
            this.attributeDefinitions = {};
            this.elementAttributes = [];
            this.attributes = xml.attributes;
            this.parent = parent;
            this.xml = xml;
            this.setup();
        }

        // setup is only called on models instantiated from xml,
        // postSetup is called on these models and clones
        this.postSetup();
    }

    setup() {
        throw 'setup not overriden';
    }

    postSetup() {
    }

    clone(other) {
    }

    // attributes
    attr(name) {
        try {
            return this.attributes.getNamedItem(name).value;
        } catch (e) {
            return undefined;
        }
    }

    attrs(pairs, otherPairs) {
        // track attributes and types defined on models
        jQuery.extend(this.attributeDefinitions, pairs);

        for (name in pairs) {
            let val = this.attr(name);
            let processor = pairs[name];
            
            if (processor && val != undefined)
                val = processor(val);
            this[name] = val;
        }

        // some models share common attributes
        if (otherPairs)
            this.attrs(otherPairs);
    }

    inheritFrom(type, attr, attrNames) {
        let ancestorObj = this.ancestor(type);
        if (ancestorObj == undefined)
            return;

        if (attr != null) {
            var obj = ancestorObj[attr];
            if (obj == undefined)
                return;
        } else {
            var obj = ancestorObj;
        }

        for (let name of attrNames) {
            if (this[name] == undefined)
                this[name] = obj[name];
        }
    }

    inherit(type, attrNames) {
        this.inheritFrom(type, null, attrNames);
    }

    // children
    titleCase(type) {
        return type.name[0].toLowerCase() + type.name.slice(1)
    }

    init(type) {
        let varName = this.titleCase(type);
        this.elementAttributes.push(varName);
        let xml = this.xml.getElementsByTagName(type.name)[0];

        if (xml == undefined) {
            this[varName] = undefined;
        } else {
            this[varName] = new type(xml, this);
        }
    }

    initAll(type) {
        let singularTypeName = this.titleCase(type);
        let varName = singularTypeName + 's';
        this.elementAttributes.push(varName);

        // load child elements
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

        // curried versions of accessor functions
        this[singularTypeName + 'WithLowest'] = function(attr) {
            return this.getLowest(this[varName], attr);
        }

        this[singularTypeName + 'WithMiddle'] = function(attr) {
            return this.getMiddle(this[varName], attr);
        }

        this[singularTypeName + 'WithHighest'] = function(attr) {
            return this.getHighest(this[varName], attr);
        }

        this[singularTypeName + 'With'] = function(attr, val) {
            return this.getWith(this[varName], attr, val);
        }
    }

    getWith(objects, attr, val) {
        for (let obj of objects) {
            if (obj[attr] == val)
                return obj;
        }
        return undefined;
    }

    getLowest(objects, attr) {
        let minObj = objects[0];

        for (var i = 1; i < objects.length; i++) {
            let obj = objects[i];
            let objVal = obj[attr];
            if ((objVal != undefined) && (objVal < minObj[attr]))
                minObj = obj;
        }

        return minObj;
    }

    getMiddle(unsorted, attr) {
        let sorted = Array.from(unsorted);
        sorted.sort((a, b) => a[attr] - b[attr]);
        return sorted[Math.ceil(sorted.length / 2)];
    }

    getHighest(objects, attr) {
        let maxObj = objects[0];

        for (var i = 1; i < objects.length; i++) {
            let obj = objects[i];
            let objVal = obj[attr];
            if ((objVal != undefined) && (objVal > maxObj[attr]))
                maxObj = obj;
        }

        return maxObj;
    }

    try(path) {
        let components = path.split('.');
        let obj = this;

        for (let component of components) {
            obj = obj[component];
            if (obj == undefined)
                return undefined;
        }

        return obj;
    }

    // ancestors
    ancestor(type) {
        let obj = this.parent;
        while ((obj != undefined) && !(obj instanceof type))
            obj = obj.parent;

        if ((obj == undefined) || !(obj instanceof type))
            return undefined;
        else
            return obj;
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
