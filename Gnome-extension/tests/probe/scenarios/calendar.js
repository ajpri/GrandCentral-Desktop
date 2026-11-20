import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, screenshot} from '../helpers.js';

export const calendarScenarios = {
    async checkCalendar(extension, assert) {
        const {TestCalendar} = await import(`file://${GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_ROOT')}/tests/calendarFixture.js`);
        const fixture = new TestCalendar();
        const settings = extension._settings;
        const widget = extension._calendar;
        const waitFor = async condition => {
            for (let i = 0; i < 200 && !condition(); i++)
                await pause(50);
        };
        assert(!widget.actor.visible, 'calendar pill hides with no upcoming events');
        try {
            await fixture.start();
            const now = new Date();
            const first = await fixture.add('Current meeting', new Date(now.getTime() - 10 * 60000), new Date(now.getTime() + 20 * 60000));
            await waitFor(() => widget.cards.length === 1);
            assert(widget.cards.length === 1 && widget.actor.visible, 'calendar reads an ongoing event from GNOME calendar data');
            assert(widget.cards[0].has_style_class_name('dp-calendar-event-ongoing') &&
                widget.cards[0].accessible_name.includes('Now ·') &&
                widget.cards[0].get_theme_node().get_background_color().red === 40,
            'ongoing timed event displays Now and a lighter charcoal background');
            const narrow = widget.actor.width;
            const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
            const second = await fixture.add('Tomorrow review', tomorrow, new Date(tomorrow.getTime() + 3600000));
            await waitFor(() => widget.cards.length === 2);
            assert(widget.cards.length === 2 && widget.actor.width > narrow, 'calendar pill grows automatically to two events');
            const today = new Date(now); today.setHours(0, 0, 0, 0);
            const nextDay = new Date(today); nextDay.setDate(nextDay.getDate() + 1);
            const third = await fixture.add('All-day event', today, nextDay, true);
            await waitFor(() => widget.cards.length === 3);
            assert(widget.cards.length === 3 && widget.actor.width > narrow * 2, 'calendar pill grows automatically to three events');
            assert(widget.cards.filter(card => card.has_style_class_name('dp-calendar-event-ongoing')).length === 1,
                'all-day and upcoming calendar events keep the neutral background');
            await pause(150);
            await screenshot('calendar');
            const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
            assert(Math.abs(widget.actor.x + widget.actor.width / 2 - area.x - area.width / 2) < 2,
                'calendar pill is centered at the top of the work area');
            const height = settings.get_int('panel-height');
            settings.set_int('panel-height', 1200);
            assert(extension._panels.filter(panel => panel.actor.visible).every(panel =>
                panel.actor.y >= widget.actor.y + widget.actor.height + 11), 'calendar pill leaves room above tall panels');
            const start = extension._start;
            extension._start = extension._panelOrder.filter(id => extension.panel(id).settings.get_boolean('enabled')).indexOf('browser');
            extension._layout();
            extension.panel('browser').settings.set_boolean('expanded', true);
            assert(extension._restoreBrowser.visible && extension._restoreBrowser.y >= widget.actor.y + widget.actor.height + 7 &&
                extension._restoreBrowser.y + extension._restoreBrowser.height < extension.panel('browser')._geometry.y,
            'floating Restore fits between the calendar and a tall expanded browser');
            extension._restoreBrowser.emit('clicked', 1);
            extension._start = start;
            extension._layout();
            settings.set_int('panel-height', height);
            settings.set_int('calendar-max-events', 1);
            assert(widget.cards.length === 1 && widget.actor.width === narrow, 'calendar maximum limits event count and pill width');
            settings.set_int('calendar-max-events', 3);
            settings.set_int('calendar-days', 1);
            await waitFor(() => widget.cards.length === 2);
            assert(widget.cards.length === 2, 'today-only setting excludes tomorrow events');
            settings.set_int('calendar-days', 2);
            await waitFor(() => widget.cards.length === 3);
            const source = widget.source;
            settings.set_boolean('show-calendar', false);
            assert(!widget.actor.visible && widget.source === null && source._destroyed && source._records.size === 0,
                'hiding calendar stops its subscriptions and hides the pill');
            settings.set_boolean('show-calendar', true);
            await waitFor(() => widget.cards.length === 3);
            assert(widget.cards.length === 3, 'calendar visibility can be restored live');
            const app = Shell.AppSystem.get_default().lookup_app('org.gnome.Calendar.desktop');
            const activate = app.activate;
            let launched = false;
            try {
                app.activate = () => { launched = true; };
                widget.cards[0].emit('clicked', 1);
                assert(launched, 'clicking calendar event opens GNOME Calendar');
            } finally { app.activate = activate; }
            await fixture.selected(false);
            await waitFor(() => widget.cards.length === 0);
            assert(!widget.actor.visible, 'calendar respects disabled calendar sources');
            await fixture.selected(true);
            await waitFor(() => widget.cards.length === 3);
            await fixture.remove(first); await fixture.remove(second); await fixture.remove(third);
            await waitFor(() => !widget.actor.visible);
            assert(!widget.actor.visible, 'removing events hides the empty calendar pill live');
            await fixture.add('Recurring review', tomorrow, new Date(tomorrow.getTime() + 3600000), false, true);
            await waitFor(() => widget.cards.length === 1);
            assert(widget.cards.length === 1, 'calendar expands recurring events within the configured range');
            settings.set_int('calendar-days', 4);
            await waitFor(() => widget.cards.length === 2);
            assert(widget.cards.length === 2, 'days ahead expands recurring events beyond tomorrow live');
            const later = new Date(tomorrow); later.setDate(later.getDate() + 2);
            await fixture.add('Later this week', later, new Date(later.getTime() + 3600000));
            await waitFor(() => widget.cards.length === 3);
            const laterLabel = new Intl.DateTimeFormat(undefined, {weekday: 'short', month: 'short', day: 'numeric'}).format(later);
            const laterCard = widget.cards.find(card => card.accessible_name.includes('Later this week'));
            assert(Boolean(laterCard?.accessible_name.includes(laterLabel)), 'events farther ahead display their actual date');
            settings.set_int('calendar-days', 2);
            await waitFor(() => widget.cards.length === 1);
            assert(widget.cards.length === 1, 'reducing days ahead removes later events live');
        } finally {
            await fixture.close();
            settings.reset('show-calendar'); settings.reset('calendar-days'); settings.reset('calendar-max-events');
        }
        await waitFor(() => !widget.actor.visible);
    },
};
