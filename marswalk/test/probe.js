const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); p.on('console', m => console.log('[' + m.type() + ']', m.text().slice(0, 300))); p.on('pageerror', e => console.log('[pageerror]', e.message));
  await p.addInitScript(fs.readFileSync(__dirname + '/node_modules/iwer/build/iwer.min.js', 'utf8'));
  await p.addInitScript(() => { const d = new IWER.XRDevice(IWER.metaQuest2); d.installRuntime({ forceInstall: true }); window.xrdev = d; });
  await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.app && window.app.frame > 5, null, { timeout: 120000 });
  console.log(await p.evaluate(async () => ({ btn: document.getElementById('VRButton')?.textContent, sup: await navigator.xr.isSessionSupported('immersive-vr'), secure: isSecureContext })));
  console.log(await p.evaluate(async () => { try { const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] }); await app.renderer.xr.setSession(s); return 'ok ' + app.renderer.xr.isPresenting; } catch (e) { return 'ERR ' + e.message; } }));
  await p.waitForTimeout(1000); console.log(await p.evaluate(() => app.renderer.xr.isPresenting + ' ' + Object.keys(app.player.hands)));
  await b.close();
})();
