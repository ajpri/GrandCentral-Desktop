// SPDX-License-Identifier: GPL-3.0-or-later

export function calendarRange(now, days) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return {start, end};
}

export function upcomingEvents(events, now, days, maximum) {
    const range = calendarRange(now, days);
    const seen = new Set();
    return events.filter(event => {
        const valid = event.id && Number.isFinite(event.start) && Number.isFinite(event.end) &&
            event.end >= event.start && event.start < range.end.getTime() &&
            (event.end > now.getTime() || (event.end === event.start && event.start >= now.getTime()));
        if (!valid || seen.has(event.id))
            return false;
        seen.add(event.id);
        return true;
    }).sort((a, b) => Number(b.start <= now.getTime()) - Number(a.start <= now.getTime()) ||
        a.start - b.start || a.end - b.end || a.id.localeCompare(b.id)).slice(0, maximum);
}

export function isOngoing(event, now) {
    return !event.allDay && event.start <= now.getTime() && now.getTime() < event.end;
}

export function eventTime(event, now, clockFormat) {
    const tomorrow = calendarRange(now, 1).end.getTime();
    const afterTomorrow = calendarRange(now, 2).end.getTime();
    const dateFormat = new Intl.DateTimeFormat(undefined, {weekday: 'short', month: 'short', day: 'numeric'});
    const dayLabel = timestamp => timestamp < tomorrow ? 'Today'
        : timestamp < afterTomorrow ? 'Tomorrow' : dateFormat.format(new Date(timestamp));
    const day = dayLabel(event.start);
    if (event.allDay)
        return `${day} · All day`;
    const format = new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit', hour12: clockFormat === '12h'});
    const start = format.format(new Date(event.start));
    const end = format.format(new Date(event.end));
    const endDay = dayLabel(event.end) !== day ? `${dayLabel(event.end)} ` : '';
    const status = isOngoing(event, now) ? 'Now' : day;
    return event.start === event.end ? `${status} · ${start}` : `${status} · ${start}–${endDay}${end}`;
}

export function calendarGeometry(area, scale, margin, count) {
    const edge = Math.min(Math.max(12 * scale, margin * scale), area.width / 4, area.height / 4);
    const width = Math.min(count * 260 * scale, area.width - edge * 2);
    return {x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + edge),
        width, height: Math.min(80 * scale, area.height - edge * 2)};
}
