import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const PATH = '/org/mpris/MediaPlayer2';
const PLAYER = 'org.mpris.MediaPlayer2.Player';
const playerXml = `<node><interface name="${PLAYER}">
<method name="PlayPause"/>
<property name="PlaybackStatus" type="s" access="read"/>
<property name="Metadata" type="a{sv}" access="read"/>
<property name="CanPlay" type="b" access="read"/>
<property name="CanPause" type="b" access="read"/>
<property name="CanControl" type="b" access="read"/>
<property name="CanGoNext" type="b" access="read"/>
<property name="CanGoPrevious" type="b" access="read"/>
</interface></node>`;
const rootXml = `<node><interface name="org.mpris.MediaPlayer2">
<method name="Raise"/><method name="Quit"/>
<property name="Identity" type="s" access="read"/>
<property name="DesktopEntry" type="s" access="read"/>
<property name="CanRaise" type="b" access="read"/>
<property name="CanQuit" type="b" access="read"/>
<property name="HasTrackList" type="b" access="read"/>
<property name="SupportedUriSchemes" type="as" access="read"/>
<property name="SupportedMimeTypes" type="as" access="read"/>
</interface></node>`;

export class TestPlayer {
    constructor(suffix, status = 'Stopped') {
        this.name = `org.mpris.MediaPlayer2.deskpanels_test_${suffix}`;
        this.status = status;
        this.title = 'Evening Light';
        this.artist = 'Test Artist';
        this.art = '';
        this.canPause = true;
        this.canPlay = true;
        this.canControl = true;
        this.calls = 0;
        this.connection = Gio.DBusConnection.new_for_address_sync(GLib.getenv('DBUS_SESSION_BUS_ADDRESS'),
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, null, null);
        this._player = Gio.DBusExportedObject.wrapJSObject(playerXml, this);
        this._root = Gio.DBusExportedObject.wrapJSObject(rootXml, {
            Identity: 'Grand Central Desktop test player', DesktopEntry: '', CanRaise: false, CanQuit: false,
            HasTrackList: false, SupportedUriSchemes: [], SupportedMimeTypes: [], Raise() {}, Quit() {},
        });
        this._player.export(this.connection, PATH);
        this._root.export(this.connection, PATH);
        this.ready = new Promise(resolve => {
            this._owner = Gio.bus_own_name_on_connection(this.connection, this.name, Gio.BusNameOwnerFlags.NONE,
                () => resolve(), null);
        });
    }

    get PlaybackStatus() { return this.status; }
    get CanPlay() { return this.canPlay; }
    get CanPause() { return this.canPause; }
    get CanControl() { return this.canControl; }
    get CanGoNext() { return false; }
    get CanGoPrevious() { return false; }
    get Metadata() {
        return {'mpris:trackid': new GLib.Variant('o', '/deskpanels/test/track'),
            'xesam:title': new GLib.Variant('s', this.title),
            'xesam:artist': new GLib.Variant('as', [this.artist]),
            'mpris:artUrl': new GLib.Variant('s', this.art)};
    }

    PlayPause() {
        this.calls++;
        this.status = this.status === 'Playing' ? 'Paused' : 'Playing';
        this.update();
    }

    update() {
        for (const [key, type, value] of [['PlaybackStatus', 's', this.status], ['Metadata', 'a{sv}', this.Metadata],
            ['CanPlay', 'b', this.canPlay], ['CanPause', 'b', this.canPause], ['CanControl', 'b', this.canControl]])
            this._player.emit_property_changed(key, new GLib.Variant(type, value));
    }

    close() {
        Gio.bus_unown_name(this._owner);
        this._player.unexport();
        this._root.unexport();
        this.connection.close_sync(null);
    }
}
