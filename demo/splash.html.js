<player-groups>
    <section id="groups">
        <ul>
            <li each={opts.groupings}>
                {name}
                <ul>
                    <li
                        each={groups}
                        class={selected: selected}
                        onclick={parent.parent.select}
                    >
                        {name}
                    </li>
                </ul>
            </li>
        </ul>
    </section>

    select(evt) {
        opts.groupings.forEach(function(grouping) {
            grouping.groups.forEach(function(group) {
                group.selected = false;
            });
        });
        evt.item.selected = true;
        riot.update();
    }
</player-groups>


<player-links>
    <section id="links">
        <div each={opts.groupings}>
            <article each={groups}>
                <ul show={selected}>
                    <li
                        each={links}
                        onclick={parent.parent.parent.select}
                    >
                        <p class="name">{name}</p>
                        <p class="url">{url}</p>
                    </li>
                </ul>
            </article>
        </div>
    </section>

    select(evt) {
        var url = evt.item.url;
        opts.state.mpd = url;
        opts.state.splash = false;
        riot.update();

        var player = new Player({
                    url: url,
                    element: $('#video-stream')
            });
    }
</player-links>


<player-splash>
    <div show={opts.state.splash}>
        <player-groups groupings={opts.groupings}></player-groups>
        <player-links groupings={opts.groupings} state={opts.state}></player-links>
    </div>
</player-splash>
