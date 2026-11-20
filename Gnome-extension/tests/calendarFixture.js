import ECal from 'gi://ECal?version=2.0';
import EDataServer from 'gi://EDataServer?version=1.2';
import ICal from 'gi://ICalGLib?version=3.0';
import GLib from 'gi://GLib';

export class TestCalendar {
    async start() {
        this.registry = await new Promise((resolve, reject) => EDataServer.SourceRegistry.new(null, (_object, result) => {
            try { resolve(EDataServer.SourceRegistry.new_finish(result)); } catch (e) { reject(e); }
        }));
        const source = EDataServer.Source.new(null, null);
        source.set_display_name('Grand Central Desktop calendar fixture');
        source.get_extension(EDataServer.SOURCE_EXTENSION_CALENDAR).set_backend_name('local');
        source.get_extension(EDataServer.SOURCE_EXTENSION_CALENDAR).set_selected(true);
        await new Promise((resolve, reject) => this.registry.commit_source(source, null, (registry, result) => {
            try { registry.commit_source_finish(result); resolve(); } catch (e) { reject(e); }
        }));
        this.source = this.registry.ref_source(source.get_uid());
        this.client = await new Promise((resolve, reject) => ECal.Client.connect(this.source,
            ECal.ClientSourceType.EVENTS, 10, null, (_object, result) => {
                try { resolve(ECal.Client.connect_finish(result)); } catch (e) { reject(e); }
            }));
    }

    async add(title, start, end, allDay = false, recurring = false) {
        const format = date => allDay
            ? `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
            : date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const kind = allDay ? ';VALUE=DATE' : '';
        const uid = GLib.uuid_string_random();
        const rule = recurring ? 'RRULE:FREQ=DAILY;COUNT=2\r\n' : '';
        const component = ICal.Component.new_from_string(`BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}\r\nDTSTART${kind}:${format(start)}\r\nDTEND${kind}:${format(end)}\r\nSUMMARY:${title}\r\n${rule}END:VEVENT\r\n`);
        await new Promise((resolve, reject) => this.client.create_object(component, ECal.OperationFlags.NONE, null, (client, result) => {
            try { client.create_object_finish(result); resolve(); } catch (e) { reject(e); }
        }));
        return uid;
    }

    async selected(value) {
        this.source.get_extension(EDataServer.SOURCE_EXTENSION_CALENDAR).set_selected(value);
        await new Promise((resolve, reject) => this.source.write(null, (source, result) => {
            try { source.write_finish(result); resolve(); } catch (e) { reject(e); }
        }));
    }

    async remove(uid) {
        await new Promise((resolve, reject) => this.client.remove_object(uid, null, ECal.ObjModType.ALL,
            ECal.OperationFlags.NONE, null, (client, result) => {
                try { client.remove_object_finish(result); resolve(); } catch (e) { reject(e); }
            }));
    }

    async close() {
        if (!this.source)
            return;
        await new Promise((resolve, reject) => this.source.remove(null, (source, result) => {
            try { source.remove_finish(result); resolve(); } catch (e) { reject(e); }
        }));
    }
}
