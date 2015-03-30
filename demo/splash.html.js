<player-groups>
    <section id="groups">
        <ul>
            <li each={grouping in app.groupings}>
                <span>{grouping.name}</span>
                <ul>
                    <li
                        each={group in grouping.groups}
                        class={selected: group.selected()}
                        onclick={parent.parent.select}
                    >
                        {group.name}
                    </li>
                </ul>
            </li>
        </ul>
    </section>

    <script>
        select(event) {
            var group = event.item.group;
            riot.route(group.grouping.slug + '/' + group.slug);
        }
    </script>
</player-groups>


<player-links>
    <section id="links">
        <div each={grouping in app.groupings}>
            <article each={group in grouping.groups}>
                <ul show={group.selected()}>
                    <li each={link in group.links} onclick={parent.parent.parent.select}>
                        <p class="name">{link.name}</p>
                        <p class="url">{link.url}</p>
                    </li>
                </ul>
            </article>
        </div>
    </section>

    <script>
        select(event) {
            var link = event.item.link;
            riot.route(link.group.grouping.slug + '/' + link.group.slug + '/' + link.slug);
        }
    </script>
</player-links>


<player-splash>
    <player-groups></player-groups>
    <player-links></player-links>
</player-splash>
