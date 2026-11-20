import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class NoteFileFixture {
    constructor() {
        this.name = 'local.GrandCentralDesktop.NoteFilesTest';
        this.requests = [];
        this.pending = new Map();
        this.closed = 0;
        const xml = '<node><interface name="org.freedesktop.portal.FileChooser">' +
            ['OpenFile', 'SaveFile'].map(name => `<method name="${name}"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="a{sv}" direction="in"/><arg type="o" direction="out"/></method>`).join('') +
            '</interface></node>';
        this.object = Gio.DBusExportedObject.wrapJSObject(xml, {
            OpenFileAsync: (args, invocation) => this._choose(false, args, invocation),
            SaveFileAsync: (args, invocation) => this._choose(true, args, invocation),
        });
        this.object.export(Gio.DBus.session, '/org/freedesktop/portal/desktop');
        this.ready = new Promise(resolve => {
            this.owner = Gio.bus_own_name_on_connection(Gio.DBus.session, this.name, Gio.BusNameOwnerFlags.NONE, resolve, null);
        });
    }

    _choose(save, [parent, title, options], invocation) {
        const sender = invocation.get_sender().slice(1).replaceAll('.', '_');
        const path = `/org/freedesktop/portal/desktop/request/${sender}/${options.handle_token.deep_unpack()}`;
        this.requests.push({save, parent, title, options});
        const object = Gio.DBusExportedObject.wrapJSObject('<node><interface name="org.freedesktop.portal.Request"><method name="Close"/></interface></node>', {
            Close: () => { this.closed++; object.unexport(); this.pending.delete(path); },
        });
        object.export(Gio.DBus.session, path);
        this.pending.set(path, object);
        invocation.return_value(new GLib.Variant('(o)', [path]));
        if (this.hold) return;
        const uri = this.nextFile?.get_uri();
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            Gio.DBus.session.emit_signal(null, path, 'org.freedesktop.portal.Request', 'Response',
                new GLib.Variant('(ua{sv})', [uri ? 0 : 1, uri ? {uris: new GLib.Variant('as', [uri])} : {}]));
            object.unexport();
            this.pending.delete(path);
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        this.object.unexport();
        for (const object of this.pending.values()) object.unexport();
        this.pending.clear();
        Gio.bus_unown_name(this.owner);
    }
}
