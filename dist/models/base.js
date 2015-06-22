"use strict";

var _slicedToArray = function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { var _arr = []; for (var _iterator = arr[Symbol.iterator](), _step; !(_step = _iterator.next()).done;) { _arr.push(_step.value); if (i && _arr.length === i) break; } return _arr; } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } };

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

// --------------------------------------------------
// abstract model + parsing
// --------------------------------------------------
// scales used when parsing duration strings
var SECONDS = 1; // xs:duration seconds
var MINUTES = 60 * SECONDS; // xs:duration minutes
var HOURS = 60 * MINUTES; // xs:duration hours
var DURATION_COMPONENTS = {
    S: SECONDS,
    M: MINUTES,
    H: HOURS
};

// attribute processors
function date(val) {
    return Date.parse(val) / 1000; // treat dates as seconds
}

function duration(val) {
    if (val.slice(0, 2) != "PT") throw "can only parse durations solely composed of time components";

    // remove "PT" and match each component: count (H | M | S)
    var components = val.slice(2).match(/[\d\.]+[HMS]/g);
    var seconds = 0;

    components.forEach(function (component) {
        var scale = DURATION_COMPONENTS[component.slice(-1)];
        var count = parseFloat(component.slice(0, -1));
        seconds += count * scale;
    });

    return seconds;
}

function bool(val) {
    return val == "true";
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

var Model = (function () {
    // construct models by supplying base XML to be used in
    // an overriden setup method, or another model to clone

    function Model(obj) {
        var parent = arguments[1] === undefined ? null : arguments[1];

        _classCallCheck(this, Model);

        // cloning
        if (obj instanceof Model) {
            var clone = obj;
            this.attributeDefinitions = clone.attributeDefinitions;
            this.elementAttributes = clone.elementAttributes;
            this.attributes = clone.attributes;
            this.parent = parent;
            this.xml = clone.xml;

            // attribute values
            for (name in clone.attributeDefinitions) this[name] = clone[name];

            // child elements
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = clone.elementAttributes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var _name = _step.value;

                    this[_name] = clone[_name];
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator["return"]) {
                        _iterator["return"]();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            // allow the model to assign further attributes
            obj.clone(this);

            // new from xml
        } else {
            var xml = obj;
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

    _createClass(Model, {
        setup: {
            value: function setup() {
                throw "setup not overriden";
            }
        },
        postSetup: {
            value: function postSetup() {}
        },
        clone: {
            value: function clone(other) {}
        },
        attr: {

            // attributes

            value: function attr(name) {
                try {
                    return this.attributes.getNamedItem(name).value;
                } catch (e) {
                    return undefined;
                }
            }
        },
        attrs: {
            value: function attrs(pairs, otherPairs) {
                // track attributes and types defined on models
                jQuery.extend(this.attributeDefinitions, pairs);

                for (name in pairs) {
                    var val = this.attr(name);
                    var processor = pairs[name];

                    if (processor && val != undefined) val = processor(val);
                    this[name] = val;
                }

                // some models share common attributes
                if (otherPairs) this.attrs(otherPairs);
            }
        },
        inheritFrom: {
            value: function inheritFrom(type, attr, attrNames) {
                var ancestorObj = this.ancestor(type);
                if (ancestorObj == undefined) {
                    return;
                }if (attr != null) {
                    var obj = ancestorObj[attr];
                    if (obj == undefined) {
                        return;
                    }
                } else {
                    var obj = ancestorObj;
                }

                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = attrNames[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var _name = _step.value;

                        if (this[_name] == undefined) this[_name] = obj[_name];
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator["return"]) {
                            _iterator["return"]();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
            }
        },
        inherit: {
            value: function inherit(type, attrNames) {
                this.inheritFrom(type, null, attrNames);
            }
        },
        titleCase: {

            // children

            value: function titleCase(type) {
                return type.name[0].toLowerCase() + type.name.slice(1);
            }
        },
        init: {
            value: function init(type) {
                var varName = this.titleCase(type);
                this.elementAttributes.push(varName);
                var xml = this.xml.getElementsByTagName(type.name)[0];

                if (xml == undefined) {
                    this[varName] = undefined;
                } else {
                    this[varName] = new type(xml, this);
                }
            }
        },
        initAll: {
            value: function initAll(type) {
                var _this = this;

                var singularTypeName = this.titleCase(type);
                var varName = singularTypeName + "s";
                this.elementAttributes.push(varName);

                // load child elements
                var elements = this.xml.getElementsByTagName(type.name);
                if (elements.length == 0) {
                    this[varName] = [];
                } else {
                    (function () {
                        var elementsArray = [].slice.call(elements);
                        var parent = _this;
                        _this[varName] = elementsArray.map(function (xml) {
                            return new type(xml, parent);
                        });
                    })();
                }

                // curried versions of accessor functions
                this[singularTypeName + "WithLowest"] = function (attr) {
                    return this.getLowest(this[varName], attr);
                };

                this[singularTypeName + "WithMiddle"] = function (attr) {
                    return this.getMiddle(this[varName], attr);
                };

                this[singularTypeName + "WithHighest"] = function (attr) {
                    return this.getHighest(this[varName], attr);
                };

                this[singularTypeName + "With"] = function (attr, val) {
                    return this.getWith(this[varName], attr, val);
                };
            }
        },
        getWith: {
            value: function getWith(objects, attr, val) {
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = objects[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var obj = _step.value;

                        if (obj[attr] == val) return obj;
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator["return"]) {
                            _iterator["return"]();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }

                return undefined;
            }
        },
        getLowest: {
            value: function getLowest(objects, attr) {
                var minObj = objects[0];

                for (var i = 1; i < objects.length; i++) {
                    var obj = objects[i];
                    var objVal = obj[attr];
                    if (objVal != undefined && objVal < minObj[attr]) minObj = obj;
                }

                return minObj;
            }
        },
        getMiddle: {
            value: function getMiddle(unsorted, attr) {
                var sorted = Array.from(unsorted);
                sorted.sort(function (a, b) {
                    return a[attr] - b[attr];
                });
                return sorted[Math.ceil(sorted.length / 2)];
            }
        },
        getHighest: {
            value: function getHighest(objects, attr) {
                var maxObj = objects[0];

                for (var i = 1; i < objects.length; i++) {
                    var obj = objects[i];
                    var objVal = obj[attr];
                    if (objVal != undefined && objVal > maxObj[attr]) maxObj = obj;
                }

                return maxObj;
            }
        },
        "try": {
            value: function _try(path) {
                var components = path.split(".");
                var obj = this;

                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = components[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var component = _step.value;

                        obj = obj[component];
                        if (obj == undefined) return undefined;
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator["return"]) {
                            _iterator["return"]();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }

                return obj;
            }
        },
        ancestor: {

            // ancestors

            value: function ancestor(type) {
                var obj = this.parent;
                while (obj != undefined && !(obj instanceof type)) obj = obj.parent;

                if (obj == undefined || !(obj instanceof type)) {
                    return undefined;
                } else {
                    return obj;
                }
            }
        }
    });

    return Model;
})();

// --------------------------------------------------
// helpers
// --------------------------------------------------
// validate and process format strings following the specs in 5.3.9.4.4
// Template-based Segment URL construction, Table 16.

var TemplateString = (function () {
    function TemplateString(name, segmentTemplate) {
        _classCallCheck(this, TemplateString);

        var parent = segmentTemplate.parent;
        var format = segmentTemplate[name];

        // not all format strings are mandatory
        if (format == undefined) {
            this.empty = true;
            return;
        }

        // templates are inherited from SegmentTemplate instances in Periods and
        // AdaptationSets. Only process the template if it belongs to an instance
        // of a SegmentTemplate appearing in a Representation.
        if (!(parent instanceof Representation)) {
            return;
        } // avoid processing invalid format strings. If the string is used for
        // the media attribute, and the parent element is a Representation,
        // the entire Representation is invalidated and is ignored.
        if (this.formatIsInvalid(name, format, parent)) {
            this.invalid = true;
            return;
        }

        // pre-process the format string - '$$', '$RepresentationID$' and
        // '$Bandwidth$' can be statically replaced
        this.processed = format.replace("$$", "$");
        this.processed = this.substitute("RepresentationID", parent.id, this.processed);
        this.processed = this.substitute("Bandwidth", parent.bandwidth, this.processed);
    }

    _createClass(TemplateString, {
        format: {
            value: function format(number, time) {
                if (this.empty) {
                    return "";
                }var interim = this.processed.slice(0);
                interim = this.substitute("Number", number, interim);
                return this.substitute("Time", time, interim);
            }
        },
        substitute: {
            value: function substitute(identifier, value, interim) {
                var regex = "\\$" + identifier + "(\\%0(\\d+)d)?\\$";
                var instances = interim.match(new RegExp(regex, "g"));
                if (!instances) {
                    return interim;
                }var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = instances[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var instance = _step.value;

                        var _instance$match = instance.match(regex);

                        var _instance$match2 = _slicedToArray(_instance$match, 3);

                        var full = _instance$match2[0];
                        var _ = _instance$match2[1];
                        var width = _instance$match2[2];

                        var val = value.toString();

                        if (width != undefined) {
                            width = parseInt(width, 10);
                            if (val.length < width) val = "0".repeat(width - val.length) + val;
                        }

                        interim = interim.replace(full, val);
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator["return"]) {
                            _iterator["return"]();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }

                return interim;
            }
        },
        formatIsInvalid: {
            value: function formatIsInvalid(name, format, parent) {
                // format strings can be invalidated by:
                // * unescaped '$' characters
                // * '$Number$' or '$Time$' appearing in initialization and
                //   bitstreamSwitching formats
                // * '$RepresentationID$' followed by a width formatting tag
                // * '$Time$' and '$Number$' appearing in the same string
                // * dollar signs enclosing an invalid identifier
                // * width formatting tags not of the format '%0[width]d'
                // * '$Time$' appearing in a template without a timeline
                if (name == "initialization" || name == "bitstreamSwitching") if (format.includes("$Number$") || format.includes("$Time$")) {
                    return true;

                    // TODO: unescaped, RepID followed by width, Time & Number,
                    // invalid identifiers, invalid widths, missing timeline
                }
            }
        }
    });

    return TemplateString;
})();