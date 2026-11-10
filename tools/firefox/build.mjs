#!/usr/bin/env node
// Build the Firefox version of the extension.
//
// The repo's manifest.json targets Chrome. This script copies the extension into
// dist/firefox/, rewrites the manifest for Firefox, and zips it for AMO:
//
//     node tools/firefox/build.mjs
//
// Load dist/firefox/manifest.json in Firefox via about:debugging -> "Load Temporary Add-on".
// No dependencies; needs Node 22.2+ (for zlib.crc32).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Permanent add-on ID on addons.mozilla.org. Change it before the first AMO
// upload; it can't change afterwards.
const GECKO_ID = 'netsuite-full-tools@netsuite-full-tools';
// 140 is the current ESR. Needed for tabGroups (139+), world: MAIN (128+)
// and the data_collection_permissions key.
const GECKO_MIN_VERSION = '140.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'firefox');
const INCLUDE = ['manifest.json', 'LICENSE', '_locales', 'assets', 'popup', 'scripts', 'sidepanel', 'welcome'];

// Lives in tools/ so the Chrome tree stays identical to the Web Store build.
const COMPAT_SHIM = 'scripts/firefox_compat.js';
const COMPAT_SHIM_SRC = path.join(HERE, 'firefox_compat.js');

// Files the Chrome service worker loads with importScripts(). Firefox's MV3
// background is an event page without importScripts, so list them in the manifest.
const SW_IMPORTS = [
    'scripts/modules/_shared/nsft_defaults.js',
    'scripts/modules/_shared/nsft_grouped_tabs_colors.js',
    'scripts/modules/_shared/nsft_env.js',
];

function firefoxManifest(chrome) {
    const m = structuredClone(chrome);

    m.background = { scripts: [...SW_IMPORTS, chrome.background.service_worker] };

    // Firefox has no chrome.sidePanel; the code already falls back to in-page windows.
    m.permissions = (m.permissions || []).filter((p) => p !== 'sidePanel');

    for (const cs of m.content_scripts || []) {
        if (cs.world === 'MAIN' || !cs.js?.length) continue;
        cs.js = [COMPAT_SHIM, ...cs.js.filter((j) => j !== COMPAT_SHIM)];
    }

    m.browser_specific_settings = {
        gecko: {
            id: GECKO_ID,
            strict_min_version: GECKO_MIN_VERSION,
            // Required by AMO. "none" = nothing is sent to the developer. Review this
            // if the AI features (which send data to the user's chosen provider) need declaring.
            data_collection_permissions: { required: ['none'] },
        },
    };
    return m;
}

function listFiles(dir) {
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => path.join(e.parentPath, e.name))
        .sort();
}

// Minimal zip writer (deflate, no zip64) so the build needs no npm packages.
function writeZip(zipPath, baseDir) {
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const file of listFiles(baseDir)) {
        const name = Buffer.from(path.relative(baseDir, file).split(path.sep).join('/'));
        const data = fs.readFileSync(file);
        const packed = zlib.deflateRawSync(data, { level: 9 });
        const crc = zlib.crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);            // version needed
        local.writeUInt16LE(0x0800, 6);        // UTF-8 names
        local.writeUInt16LE(8, 8);             // deflate
        local.writeUInt32LE(0x00210000, 10);   // DOS time/date: 1980-01-01, keeps builds reproducible
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        chunks.push(local, name, packed);

        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50, 0);
        entry.writeUInt16LE(20, 4);            // version made by
        local.copy(entry, 6, 4, 30);           // shared fields: version needed .. name length
        entry.writeUInt32LE(offset, 42);
        central.push(entry, name);

        offset += local.length + name.length + packed.length;
    }

    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(central.length / 2, 8);
    end.writeUInt16LE(central.length / 2, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);

    fs.writeFileSync(zipPath, Buffer.concat([...chunks, centralBuf, end]));
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
for (const p of SW_IMPORTS) {
    if (!fs.existsSync(path.join(ROOT, p))) {
        console.error(`Missing file: ${p}`);
        process.exit(1);
    }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const name of INCLUDE) {
    const src = path.join(ROOT, name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, name), { recursive: true });
}
fs.copyFileSync(COMPAT_SHIM_SRC, path.join(OUT, COMPAT_SHIM));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(firefoxManifest(manifest), null, 4) + '\n');

const zipPath = path.join(DIST, `netsuite-full-tools-firefox-${manifest.version}.zip`);
writeZip(zipPath, OUT);

console.log(`Built ${path.relative(ROOT, OUT)}/ and ${path.relative(ROOT, zipPath)}`);
