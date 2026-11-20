// A normal application window for compositor stacking regression tests.
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

const app = new Adw.Application({application_id: 'local.GrandCentralDesktop.ForegroundTest'});
app.connect('activate', () => {
    const window = new Adw.ApplicationWindow({application: app,
        title: 'Grand Central Desktop Foreground Test', default_width: 640, default_height: 480});
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
    box.append(new Adw.HeaderBar());
    box.append(new Gtk.Label({label: 'Application windows stay in front of the desktop panels.',
        vexpand: true, wrap: true, margin_start: 24, margin_end: 24}));
    window.set_content(box);
    window.present();
});
app.run([]);
