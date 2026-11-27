import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = 'https://charlotte-3ts.pages.dev';

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

// ---------- Capacitor (Android + iOS) ----------

test('capacitor config points at the live site', () => {
  const cfg = readJson('capacitor.config.json');
  assert.equal(cfg.appId, 'com.charlotte.luke');
  assert.equal(cfg.appName, 'Charlotte & Luke');
  assert.equal(cfg.server.url, LIVE);
  assert.ok(cfg.server.allowNavigation.includes('charlotte-3ts.pages.dev'));
  assert.equal(cfg.server.cleartext, false);
  assert.ok(fs.existsSync(path.join(root, cfg.webDir)), 'webDir is missing');
  assert.ok(fs.existsSync(path.join(root, cfg.webDir, 'index.html')), 'fallback page is missing');
});

test('capacitor android project exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'android/app/src/main/java/com/charlotte/luke/MainActivity.java')));
  assert.ok(fs.existsSync(path.join(root, 'android/app/src/main/AndroidManifest.xml')));
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  assert.ok(gradle.includes('applicationId "com.charlotte.luke"'), 'build.gradle has the wrong application id');
});

test('capacitor ios project exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'ios/App/App/AppDelegate.swift')));
  assert.ok(fs.existsSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj')));
  const pbx = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  assert.ok(pbx.includes('com.charlotte.luke'), 'Xcode project has the wrong bundle id');
});

// ---------- Tauri (Linux + Mac + Windows) ----------

test('tauri config points at the live site', () => {
  const cfg = readJson('src-tauri/tauri.conf.json');
  assert.equal(cfg.identifier, 'com.charlotte.luke');
  assert.equal(cfg.productName, 'Charlotte & Luke');
  assert.equal(cfg.app.windows[0].url, LIVE);
  assert.equal(cfg.build.devUrl, LIVE);
  assert.equal(cfg.app.withGlobalTauri, true, 'the site detects the native shell via window.__TAURI__');
});

test('tauri bundle targets cover linux, mac and windows', () => {
  const cfg = readJson('src-tauri/tauri.conf.json');
  for (const target of ['appimage', 'deb', 'dmg', 'app', 'msi', 'nsis']) {
    assert.ok(cfg.bundle.targets.includes(target), `missing bundle target: ${target}`);
  }
  for (const icon of cfg.bundle.icon) {
    assert.ok(fs.existsSync(path.join(root, 'src-tauri', icon)), `bundle icon missing: ${icon}`);
  }
});

test('tauri rust project exists', () => {
  const cargo = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  assert.ok(cargo.includes('name = "charlotte-luke"'));
  assert.ok(cargo.includes('tauri = '));
  assert.ok(fs.existsSync(path.join(root, 'src-tauri/src/main.rs')));
  assert.ok(fs.existsSync(path.join(root, 'src-tauri/build.rs')));
  assert.ok(fs.existsSync(path.join(root, 'src-tauri/capabilities/default.json')));
});

// ---------- Docs ----------

test('APPS.md documents every platform and the free Apple ID route', () => {
  const md = fs.readFileSync(path.join(root, 'APPS.md'), 'utf8');
  for (const heading of ['## Android', '## iOS', '## Mac', '## Windows', '## Linux']) {
    assert.ok(md.includes(heading), `APPS.md is missing ${heading}`);
  }
  assert.ok(/free Apple ID/i.test(md), 'APPS.md must say a free Apple ID is enough');
  assert.ok(!/paid Apple Developer account.*needed/i.test(md), 'APPS.md must not require a paid account');
});
