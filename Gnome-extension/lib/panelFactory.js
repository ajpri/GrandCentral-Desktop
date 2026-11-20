// SPDX-License-Identifier: GPL-3.0-or-later
import {Panel} from './panel.js';
import {CalculatorPanel} from './calculatorPanel.js';
import {AppsPanel} from './appsPanel.js';
import {DocumentsPanel} from './documentsPanel.js';
import {BrowserPanel} from './browserPanel.js';
import {NotesPanel} from './notesPanel.js';

const factories = {
    notes: (settings, host, restored) => new NotesPanel(settings, restored?.notes),
    calculator: settings => new CalculatorPanel(settings),
    apps: (settings, host, restored) => new AppsPanel(settings, item => host._activate(item), restored?.apps),
    documents: (settings, host, restored) => new DocumentsPanel(settings, item => host._activate(item), restored?.documents),
    browser: (settings, host, restored) => restored?.browser ?? new BrowserPanel(host, settings, restored?.browserUri),
};

export function createPanel(id, settings, host, restored) {
    return factories[id] ? factories[id](settings, host, restored)
        : new Panel(id, settings, item => host._activate(item));
}
