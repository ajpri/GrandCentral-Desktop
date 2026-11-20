// SPDX-License-Identifier: GPL-3.0-or-later

function unpack(value) {
    return value?.deep_unpack ? value.deep_unpack() : value;
}

export function mediaState(read) {
    const metadata = unpack(read('Metadata')) ?? {};
    const title = unpack(metadata['xesam:title']);
    const artists = unpack(metadata['xesam:artist']);
    const art = unpack(metadata['mpris:artUrl']);
    const track = unpack(metadata['mpris:trackid']);
    return {
        status: unpack(read('PlaybackStatus')),
        title: typeof title === 'string' && title.trim() ? title.slice(0, 500) : 'Unknown title',
        artist: Array.isArray(artists) ? artists.filter(artist => typeof artist === 'string').join(', ').slice(0, 500) : '',
        art: typeof art === 'string' && /^(file|https?):\/\//i.test(art) ? art : '',
        hasTrack: Boolean((typeof title === 'string' && title.trim()) ||
            (typeof track === 'string' && track !== '/org/mpris/MediaPlayer2/TrackList/NoTrack')),
        canPlay: unpack(read('CanPlay')) === true,
        canPause: unpack(read('CanPause')) === true,
        canControl: unpack(read('CanControl')) !== false,
    };
}

export function selectMedia(players, current = null) {
    const active = players.filter(player => player.state.status === 'Playing' ||
        (player.state.status === 'Paused' && player.state.hasTrack));
    active.sort((a, b) => Number(b.state.status === 'Playing') - Number(a.state.status === 'Playing') ||
        b.started - a.started || Number(b === current) - Number(a === current));
    return active[0] ?? null;
}

export function mediaGeometry(area, scale, outerMargin) {
    const margin = Math.min(Math.max(12 * scale, outerMargin * scale), area.width / 4, area.height / 4);
    const width = Math.min(360 * scale, area.width - 2 * margin);
    const height = Math.min(80 * scale, area.height - 2 * margin);
    return {x: Math.round(area.x + area.width - margin - width),
        y: Math.round(area.y + area.height - margin - height), width, height};
}
