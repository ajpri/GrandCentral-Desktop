// SPDX-License-Identifier: GPL-3.0-or-later
// Fixed, read-only DOM inspection, evaluated in a private WebKit script world.
// Perimeter samples favor the page backdrop over centered content cards.
function pageBackground() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context || !document.documentElement)
        return null;
    const background = element => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(element).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data;
    };
    const blend = (base, rgba) => base.map((value, i) =>
        Math.round(rgba[i] * rgba[3] / 255 + value * (1 - rgba[3] / 255)));
    const hex = rgb => `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`;
    const root = document.documentElement;
    const body = document.body;
    // The HTML canvas uses the root background, or propagates the body's when
    // the root is transparent. Count the propagated body background only once.
    const rootColor = background(root);
    const propagatedBody = rootColor[3] === 0 && getComputedStyle(root).backgroundImage === 'none';
    const base = blend([255, 255, 255], propagatedBody && body ? background(body) : rootColor);
    const width = innerWidth - 1;
    const height = innerHeight - 1;
    if (width < 1 || height < 1)
        return hex(base);
    const samples = new Map();
    for (const [x, y] of [[0, 0], [width / 2, 0], [width, 0], [0, height / 2],
        [width, height / 2], [0, height], [width / 2, height], [width, height]]) {
        const ancestors = [];
        for (let element = document.elementFromPoint(x, y); element && element !== root; element = element.parentElement)
            ancestors.unshift(element);
        let color = base;
        for (const element of ancestors) {
            if (element !== body || !propagatedBody)
                color = blend(color, background(element));
        }
        const candidate = hex(color);
        samples.set(candidate, (samples.get(candidate) ?? 0) + 1);
    }
    let selected = hex(base);
    for (const [color, count] of samples) {
        if (count > (samples.get(selected) ?? 0))
            selected = color;
    }
    return selected;
}

export const PAGE_BACKGROUND_SCRIPT = `(${pageBackground.toString()})()`;
