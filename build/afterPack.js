// Embeds the app icon into the exe (electron-builder's own step needs symlink privileges on some Windows setups)
const path = require('path');
exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== 'win32') return;
  const rcedit = require('rcedit');
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  await rcedit(exe, { icon: path.join(__dirname, 'icon.ico'), 'version-string': { ProductName: 'Desk Buddy', FileDescription: 'Desk Buddy', LegalCopyright: 'MIT License' } });
};
