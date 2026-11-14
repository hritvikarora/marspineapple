// Emulated Quest 2 session (IWER): enters VR, drives head + thumbsticks, checks for runtime errors.
// usage: node xr.js out_prefix "?query"
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [out, q = ''] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 560 } });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') { errs.push(m.text()); console.log('[error]', m.text().slice(0, 500)); } });
  p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message); });
  await p.addInitScript(fs.readFileSync(__dirname + '/node_modules/iwer/build/iwer.min.js', 'utf8'));
  await p.addInitScript(() => { const d = new IWER.XRDevice(IWER.metaQuest2); d.installRuntime({ forceInstall: true }); d.stereoEnabled = true; window.xrdev = d;
    d.position.set(0, 1.7, 0); });
  await p.goto((process.env.URL || 'http://localhost:5173/') + q);
  await p.waitForFunction(() => window.app && window.app.frame > 5, null, { timeout: 120000 });
  await p.click('#VRButton'); await p.waitForTimeout(1500);
  const st = () => p.evaluate(() => ({ xr: app.renderer.xr.isPresenting, rig: app.player.rig.position.toArray().map(v => +v.toFixed(2)), head: app.player.head().toArray().map(v => +v.toFixed(2)), yaw: +app.player.headYaw().toFixed(2), hands: Object.keys(app.player.hands), stats: app.stats, extra: window.__t ? window.__t() : null }));
  console.log('enter', JSON.stringify(await st())); await p.screenshot({ path: out + '_a.png' });
  const steps = (process.env.STEPS ? JSON.parse(process.env.STEPS) : [
    ['walk', "xrdev.controllers.left.updateAxes('thumbstick', 0, -1)", 2000, "xrdev.controllers.left.updateAxes('thumbstick', 0, 0)"],
    ['snap', "xrdev.controllers.right.updateAxes('thumbstick', 1, 0)", 300, "xrdev.controllers.right.updateAxes('thumbstick', 0, 0)"],
    ['aim', "xrdev.controllers.right.position.set(0.25,1.3,-0.3); xrdev.controllers.right.quaternion.set(-0.15,0,0,0.99).normalize(); xrdev.controllers.right.updateAxes('thumbstick', 0, -1)", 700, null],
    ['teleport', "xrdev.controllers.right.updateAxes('thumbstick', 0, 0)", 500, null],
  ]);
  for (const [name, on, wait, off] of steps) { await p.evaluate(on); await p.waitForTimeout(wait); if (name === 'aim' || /shot/.test(name)) await p.screenshot({ path: out + '_' + name + '.png' }); if (off) await p.evaluate(off); await p.waitForTimeout(200); console.log(name, JSON.stringify(await st())); }
  await p.screenshot({ path: out + '_z.png' });
  console.log(errs.length ? 'ERRORS ' + errs.length : 'NO ERRORS'); await b.close();
})();
