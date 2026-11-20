// SPDX-License-Identifier: GPL-3.0-or-later
import {mediaGeometry} from './mediaModel.js';

export function weatherState(client, unit, now = Date.now() / 1000) {
    const state = {visible: Boolean(client?.available), temperature: client?.hasLocation ? client.loading ? 'Loading…' : 'Unavailable' : '—',
        location: client?.hasLocation ? 'Weather' : 'Choose a location',
        icon: 'weather-overcast-symbolic', refreshed: ''};
    if (!client?.hasLocation || !client.info)
        return state;
    const info = client.info;
    const location = info.get_location();
    state.location = location?.get_city_name() || location?.get_name() || info.get_location_name() || 'Weather';
    const valid = sample => {
        if (!sample?.is_valid())
            return false;
        const [available, value] = sample.get_value_temp(unit);
        return available && Number.isFinite(value);
    };
    let current = valid(info) ? info : null;
    // Forecast-only providers may not populate the observation itself. Use
    // the nearest hourly forecast, never a distant day's temperature.
    if (!current) {
        const nearby = (info.get_forecast_list() ?? []).filter(sample => {
            const [available, timestamp] = sample.get_value_update();
            return available && timestamp > 0 && Math.abs(timestamp - now) <= 3 * 3600 && valid(sample);
        });
        nearby.sort((a, b) => Math.abs(a.get_value_update()[1] - now) - Math.abs(b.get_value_update()[1] - now));
        current = nearby[0];
    }
    if (current) {
        const [, value] = current.get_value_temp(unit);
        const rounded = new Intl.NumberFormat(undefined, {useGrouping: false, maximumFractionDigits: 0})
            .format(Math.round(value) || 0);
        // Keep GWeather's localized unit and spacing while replacing only
        // the numeric reading with the rounded value in that same unit.
        state.temperature = current.get_temp().replace(/[-+−]?\p{Nd}+(?:[.,٫]\p{Nd}+)?/u, rounded);
        const icon = current.get_icon_name();
        state.icon = icon ? `${icon}-large` : state.icon;
        const timestamp = client._lastUpdate?.to_unix() ?? 0;
        if (timestamp > 0 && now - timestamp > 16 * 60) {
            const minutes = Math.max(0, Math.floor((now - timestamp) / 60));
            state.refreshed = `Last refreshed: ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
        }
    }
    return state;
}

export function cornerGeometry(area, scale, outerMargin, weatherVisible, mediaVisible) {
    const media = mediaGeometry(area, scale, outerMargin);
    const margin = area.x + area.width - media.x - media.width;
    const weather = {x: Math.round(area.x + margin), y: media.y,
        width: media.width, height: media.height};
    if (weatherVisible && mediaVisible) {
        const available = Math.max(1, area.width - margin * 2 - 12 * scale);
        weather.width = media.width = Math.min(media.width, available / 2);
        media.x = Math.round(area.x + area.width - margin - media.width);
    }
    return {weather, media};
}
