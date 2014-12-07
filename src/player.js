'use strict';

import { Manifest } from 'models';

export default class {
    constructor(opts) {
        // merge default and supplied options
        this.options = jQuery.extend({
        }, opts);

        this.element = jQuery(this.options.element);
        this.reloadManifest();
        this.emit('loading');
    }

    emit(event) {
        this.element.trigger('player:' + event);
    }

    reloadManifest() {
        jQuery.ajax({
            url: this.options.url,
            dataType: 'xml'
        }).done(function(xml) {
            let manifestEl = xml.getElementsByTagName('MPD')[0];
            let manifest = new Manifest(manifestEl);
            console.log(manifest);
        }).fail(function(xhr, status, error) {
            console.error('error loading manifest', status, error);
        });
    }
}
