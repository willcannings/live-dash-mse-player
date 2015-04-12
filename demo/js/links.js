// --------------------------------------------------
// classes - slugs are used to generate URL routes
// --------------------------------------------------
class Sluggable {
    constructor(name) {
        this.name = name;
        this.slug = name.replace(/\W+/g, '_')
                        .replace(/\s+/g, '_')
                        .toLowerCase();
    }
};

class Grouping extends Sluggable {
    constructor(name, cons) {
        this.groups = [];
        super(name);
        cons(this);
    }

    newGroup(name, cons) {
        let group = new Group(name, this);
        this.groups.push(group);
        cons(group);
    }

    findGroupBySlug(slug) {
        for (var i = 0; i < this.groups.length; i++)
            if (this.groups[i].slug == slug)
                return this.groups[i];
        return undefined;
    }
};

class Group extends Sluggable {
    constructor(name, grouping) {
        this.grouping = grouping;
        this.links = [];
        super(name);
    }

    newLink(name, url) {
        let link = new Link(name, url, this);
        this.links.push(link);
    }

    selected() {
        return  app.route.grouping == this.grouping.slug &&
                app.route.group == this.slug;
    }

    findLinkBySlug(slug) {
        for (var i = 0; i < this.links.length; i++)
            if (this.links[i].slug == slug)
                return this.links[i];
        return undefined;
    }
};

class Link extends Sluggable {
    constructor(name, url, group) {
        this.group = group;
        this.url = url;
        super(name);
    }

    static findBySlug(groupingSlug, groupSlug, linkSlug) {
        var grouping = null;
        for (var i = 0; i < app.groupings.length; i++)
            if (app.groupings[i].slug == groupingSlug)
                grouping = app.groupings[i];

        if (!grouping)
            return undefined;

        var group = grouping.findGroupBySlug(groupSlug);
        if (!group)
            return undefined;

        return group.findLinkBySlug(linkSlug);
    }
};

window.Link = Link;


// --------------------------------------------------
// links
// --------------------------------------------------
var staticMPDs = new Grouping('Static, fixed length', (grouping) => {
    grouping.newGroup('Multi resolution, multi rate', (group) => {
        group.newLink(
            "Unified Streaming - Caminandes",
            "http://demo.unified-streaming.com/video/caminandes/caminandes.ism/caminandes.mpd"
        );
        group.newLink(
            "Akamai - Elephant's Dream",
            "http://dash.edgesuite.net/dash264/TestCases/2c/qualcomm/1/MultiResMPEG2.mpd"
        );
        group.newLink(
            "Akamai - Envivio Demo",
            "http://dash.edgesuite.net/envivio/dashpr/clear/Manifest.mpd"
        );
        group.newLink(
            "Digital Primates - Counter Sequence (Segment Template)",
            "http://www.digitalprimates.net/dash/streams/mp4-live-template/mp4-live-mpd-AV-BS.mpd"
        );
        group.newLink(
            "HbbTV 5min Demo",
            "http://akamai-progressive.irt.de/irt_dash_hbbtv_5min/video_format_switching_progressive.mpd"
        );
        group.newLink(
            "YouTube Demo - Car",
            "http://yt-dash-mse-test.commondatastorage.googleapis.com/media/car-20120827-manifest.mpd"
        );
    });
});

var dynamicMPDs = new Grouping('Dynamic, live', (grouping) => {
    grouping.newGroup('Single resolution, single rate', (group) => {
        group.newLink(
            "MobiTV - Colour Bars (2s segments)",
            "http://54.201.151.65/livesim/tfdt_32/testpic_2s/Manifest.mpd"
        );
        group.newLink(
            "MobiTV - Colour Bars (6s segments)",
            "http://eu1.eastmark.net/pdash/testpic_6s/Manifest.mpd"
        );
        group.newLink(
            "Microsoft East US Channel 1",
            "http://B028.wpc.azureedge.net/80B028/Samples/a38e6323-95e9-4f1f-9b38-75eba91704e4/5f2ce531-d508-49fb-8152-647eba422aec.ism/Manifest(format=mpd-time-csf)"
        );
        
    });

    grouping.newGroup('Multi resolution, multi rate', (group) => {
        group.newLink(
            "Unified Streaming - Loop",
            "http://live.unified-streaming.com/loop/loop.isml/loop.mpd?format=mp4&session_id=25020"
        );
        group.newLink(
            "Akamai Test Live Stream",
            "http://24x7dash-i.akamaihd.net/dash/live/900080/elemental/dash.mpd"
        );
    });
});


// --------------------------------------------------
// riot app init
// --------------------------------------------------
window.app = {
    groupings: [staticMPDs, dynamicMPDs],
    route: {
        grouping: null,
        group: null,
        link: null
    }
};

riot.mount('*');
