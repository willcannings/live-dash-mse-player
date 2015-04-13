<player-demo>
    <player-splash show={!app.route.link}></player-splash>
    <player-video if={app.route.link}></player-video>

    <script>
        var self = this;

        function updateRoute(grouping, group, link) {
            app.route.grouping = grouping;
            app.route.group = group;
            app.route.link = link;
            self.update();

            if (!app.route.link) {
                if (window.player)
                    window.player.destruct();
                window.player = null;
            } else {
                var linkObj = Link.findBySlug(grouping, group, link);
                window.player = new Player({
                    url: linkObj.url,
                    element: $('#video-stream'),
                    ignoreAudio: false,
                    showVideoEvents: false
                });
            }
        }

        // catch updates to the route once the app has booted
        riot.route(updateRoute);

        // set the initial route on app boot (if # url is
        // already present - riot doesn't do this automatically)
        // wait a small amount of time so components are rendered
        // (if a link is part of the URL, the video element needs
        // to be present before processing)
        setTimeout(function() {
            riot.route.exec(updateRoute);
        }, 100);
    </script>
</player-demo>
