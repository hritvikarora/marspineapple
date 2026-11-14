// usage: node shot.js out.png "?x=..&z=..&yaw=..&pitch=..&layer=.." [w h]
const { chromium } = require('playwright');
(async () => {
  const [out, q = '', w = 1280, h = 720] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 600)); });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  await p.goto((process.env.URL || 'http://localhost:5173/') + q);
  await p.waitForFunction(() => window.app && window.app.frame > 5, null, { timeout: 120000 }).catch(e => console.log('timeout waiting frames'));
  await p.waitForTimeout(+(process.env.WAIT || 1500));
  console.log(JSON.stringify(await p.evaluate(() => ({ stats: app.stats, frame: app.frame, pos: app.player && app.player.rig.position.toArray().map(v => +v.toFixed(1)) }))));
  if (process.env.EVAL) { console.log(JSON.stringify(await p.evaluate(process.env.EVAL))); await p.waitForTimeout(1200); }
  await p.screenshot({ path: out });
  await b.close();
})();
