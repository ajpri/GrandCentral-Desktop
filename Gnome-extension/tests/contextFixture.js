// Services only on the disposable integration bus; never opens real app windows.
import Gio from 'gi://Gio';

export class ContextServices {
    constructor() { this.calls = []; this.owners = []; this.exports = []; }

    async start() {
        const connection = Gio.DBus.session;
        const fileXml = `<node><interface name="org.freedesktop.FileManager1">
            <method name="ShowItems"><arg type="as" direction="in"/><arg type="s" direction="in"/></method>
            <method name="ShowItemProperties"><arg type="as" direction="in"/><arg type="s" direction="in"/></method>
            </interface></node>`;
        const files = Gio.DBusExportedObject.wrapJSObject(fileXml, {
            ShowItems: uris => { this.calls.push({method: 'ShowItems', uris}); },
            ShowItemProperties: uris => { this.calls.push({method: 'ShowItemProperties', uris}); },
        });
        files.export(connection, '/org/freedesktop/FileManager1');
        this.exports.push(files);
        const softwareXml = `<node><interface name="org.gtk.Actions"><method name="Activate">
            <arg type="s" direction="in"/><arg type="av" direction="in"/><arg type="a{sv}" direction="in"/>
            </method></interface></node>`;
        const software = Gio.DBusExportedObject.wrapJSObject(softwareXml, {
            Activate: (action, parameters) => {
                this.calls.push({method: 'AppDetails', action, app: parameters[0].deep_unpack()[0]});
            },
        });
        software.export(connection, '/org/gnome/Software');
        this.exports.push(software);
        for (const name of ['org.freedesktop.FileManager1', 'org.gnome.Software']) {
            await new Promise((resolve, reject) => {
                const id = Gio.bus_own_name_on_connection(connection, name, Gio.BusNameOwnerFlags.NONE,
                    () => resolve(), () => reject(new Error(`Context fixture cannot own ${name}`)));
                this.owners.push(id);
            });
        }
    }

    close() {
        for (const object of this.exports) object.unexport();
        for (const owner of this.owners) Gio.bus_unown_name(owner);
    }
}
