import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GWeather from 'gi://GWeather?version=4.0';
import Shell from 'gi://Shell';

export const pause = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));
export const output = GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_OUTPUT');
export const TestMountMonitor = GObject.registerClass({Signals: {
    'mount-added': {}, 'mount-removed': {}, 'mount-changed': {},
}}, class TestMountMonitor extends GObject.Object {
    get_mounts() { return this.mounts ?? []; }
});
export const TestWeatherClient = GObject.registerClass({Signals: {'changed': {}}}, class TestWeatherClient extends GObject.Object {
    _init() {
        super._init();
        this.available = true;
        this.hasLocation = true;
        this.loading = false;
        this.valid = true;
        this._lastUpdate = GLib.DateTime.new_now_utc();
        this.units = new Gio.Settings({schema_id: 'org.gnome.GWeather4'});
        this.location = GWeather.Location.new_detached('Test City', null, 40, -74);
        this.updateCalls = this.activateCalls = 0;
        const client = this;
        this.info = {
            get location() { return client.location; },
            get_location: () => client.location,
            get_location_name: () => client.location.get_name(),
            is_valid: () => client.valid,
            get_value_temp: () => [client.valid, client.units.get_string('temperature-unit') === 'fahrenheit' ? 71.6 : 22],
            get_temp: () => client.units.get_string('temperature-unit') === 'fahrenheit' ? '71.6 °F' : '22.0 °C',
            get_symbolic_icon_name: () => 'weather-clear-symbolic',
            get_icon_name: () => 'weather-clear',
            get_forecast_list: () => [], network_error: () => !client.valid,
        };
    }
    update() { this.updateCalls++; this._lastUpdate = GLib.DateTime.new_now_utc(); }
    activateApp() { this.activateCalls++; }
});
export function readBrowserState(browser) {
    return new Promise((resolve, reject) => browser._proxy.call('GetState', null, Gio.DBusCallFlags.NONE, 3000, null, (proxy, result) => {
        try {
            resolve(JSON.parse(proxy.call_finish(result).deep_unpack()[0]));
        } catch (e) {
            reject(e);
        }
    }));
}
export async function screenshot(name) {
    const stream = Gio.File.new_for_path(`${output}/${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    try {
        await new Shell.Screenshot().screenshot(false, stream);
    } finally {
        stream.close(null);
    }
}

export async function pressKey(symbol) {
    const keyboard = global.stage.get_context().get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    try {
        keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.PRESSED);
        await pause(40);
        keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.RELEASED);
        await pause(80);
    } finally { keyboard.run_dispose(); }
}

// Exercise GNOME's real drag engine, grab, picking, and drop dispatch. Native
// input supplies a sprite; explicit target coordinates avoid headless pointer
// positioning limitations. The gesture's threshold is not simulated here.
export async function dragApp(panel, source, target, assert, cancel = false) {
    const pointer = global.stage.get_context().get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    let press;
    const capture = global.stage.connect('captured-event', (_actor, event) => {
        if ([Clutter.EventType.BUTTON_PRESS, Clutter.EventType.BUTTON_RELEASE].includes(event.type())) {
            if (event.type() === Clutter.EventType.BUTTON_PRESS)
                press = event.copy();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    try {
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await pause(40);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await pause(40);
    } finally {
        global.stage.disconnect(capture);
    }
    const sourceTooltip = source._grandCentralDesktopTooltip;
    sourceTooltip?.label.show();
    const draggable = source._grandCentralDesktopDraggable;
    const gesture = draggable._dndGesture;
    const begin = gesture.get_point_begin_event;
    const trigger = gesture.get_drag_triggering_event;
    try {
        assert(Boolean(press), 'native drag fixture captures a pointer event');
        gesture.get_point_begin_event = () => press;
        gesture.get_drag_triggering_event = () => press;
        draggable._gestureRecognized();
        await pause(80);
        assert(panel._dragging && Boolean(panel._dragIcon) && Boolean(draggable._grab),
            'GNOME drag engine creates an icon and modal pointer grab');
        assert(!sourceTooltip?.label?.visible && !sourceTooltip?._timer, 'dragging dismisses icon tooltips before target picking');
        if (cancel) {
            panel._dragIcon.destroy();
        } else {
            const [x, y] = target.get_transformed_position();
            const [width, height] = target.get_transformed_size();
            draggable._dragX = x + width / 2;
            draggable._dragY = y + height / 2;
            draggable._updateDragHover();
            const picked = draggable._pickTargetActor();
            assert(panel._dropTarget === target, `native drag picking highlights the app under the drop coordinates (picked ${picked}, target ${target}, at ${x},${y} ${width}×${height})`);
            draggable._dragActorDropped({get_coords: () => [x + width / 2, y + height / 2],
                get_time: () => global.get_current_time()});
        }
        await pause(80);
        assert(!draggable._grab && !panel._dragging && !panel._dragMonitor && !panel._dragIcon,
            cancel ? 'native cancelled drag releases its grab, clone, and monitor' : 'native successful drop releases its grab, clone, and monitor');
    } finally {
        panel._dragIcon?.destroy();
        gesture.get_point_begin_event = begin;
        gesture.get_drag_triggering_event = trigger;
        pointer.run_dispose();
    }
}
