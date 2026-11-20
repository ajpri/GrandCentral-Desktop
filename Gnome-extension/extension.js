// SPDX-License-Identifier: GPL-3.0-or-later
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {RuntimeLoader} from './lib/runtimeLoader.js';

export default class GrandCentralDesktop extends Extension {
    enable() {
        this._grandCentralDesktopLoader ??= new RuntimeLoader(this);
        this._grandCentralDesktopLoader.start();
    }

    disable() {
        this._grandCentralDesktopLoader?.stop();
    }
}
