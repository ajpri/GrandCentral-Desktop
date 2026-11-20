// SPDX-License-Identifier: GPL-3.0-or-later
import {folderContains} from './appFolders.js';

// Preserve the live grid order, including the user's sorting extensions.
export function appGridItems(view, apps, folders = []) {
    const eligible = new Map(apps.map(app => [app.get_id(), app]));
    const represented = new Set();
    function collect(nodes) {
        for (const node of nodes) {
            if (node.app)
                represented.add(node.app.get_id());
            else if (node.view)
                collect(node.view.getAllItems());
        }
    }
    const compare = view?._compareItems?.bind(view) ?? ((a, b) => a.name.localeCompare(b.name));
    const insert = (nodes, node, comparator) => {
        const index = nodes.findIndex(other => comparator(node, other) < 0);
        nodes.splice(index < 0 ? nodes.length : index, 0, node);
    };
    let nodes = [...(view?.getAllItems() ?? [])];
    // GNOME omits favorites even inside folders. Retain their membership here,
    // including folders whose entire contents are pinned to the dash.
    for (const folder of folders) {
        const native = nodes.find(node => node.view && node.id === folder.id);
        const children = [...(native?.view.getAllItems() ?? [])].filter(node =>
            node.app && folderContains(folder, node.app));
        const members = new Set(children.map(node => node.app.get_id()));
        const comparator = native?.view._compareItems?.bind(native.view) ?? compare;
        for (const app of apps.filter(app => folderContains(folder, app) && !members.has(app.get_id())))
            insert(children, {id: app.get_id(), name: app.get_name(), app}, comparator);
        const node = {id: folder.id, name: native?.name ?? folder.name,
            view: {getAllItems: () => children}};
        if (native)
            nodes[nodes.indexOf(native)] = node;
        else if (children.length)
            insert(nodes, node, compare);
    }
    const grouped = new Set();
    for (const node of nodes.filter(node => node.view))
        collectFolder(node.view.getAllItems());
    function collectFolder(children) {
        for (const child of children) {
            if (child.app)
                grouped.add(child.app.get_id());
        }
    }
    nodes = nodes.filter(node => !node.app || !grouped.has(node.app.get_id()));
    collect(nodes);
    // GNOME hides pinned favorites from Show Apps. Keep them available here,
    // using the grid's active comparator without moving its existing items.
    const missing = apps.filter(app => !represented.has(app.get_id())).map(app => ({
        id: app.get_id(), _id: app.get_id(), name: app.get_name(), app,
    }));
    missing.sort(compare);
    for (const node of missing) {
        insert(nodes, node, compare);
    }
    function entries(items) {
        const result = [];
        const seen = new Set();
        for (const node of items) {
            if (node.app) {
                const id = node.app.get_id();
                if (eligible.has(id) && !seen.has(id)) {
                    seen.add(id);
                    const app = eligible.get(id);
                    result.push({id, label: app.get_name(), app});
                }
            } else if (node.view) {
                const id = `folder:${node.id}`;
                const children = entries(node.view.getAllItems());
                if (children.length && !seen.has(id)) {
                    seen.add(id);
                    result.push({id, folderId: node.id, label: node.name, children});
                }
            }
        }
        return result;
    }
    return entries(nodes);
}

// Keep the flat enumeration for consumers that need a complete app list.
export function orderedApps(view, apps) {
    const result = new Map();
    function flatten(items) {
        for (const item of items) {
            if (item.children)
                flatten(item.children);
            else if (!result.has(item.id))
                result.set(item.id, item.app);
        }
    }
    flatten(appGridItems(view, apps));
    return [...result.values()];
}
