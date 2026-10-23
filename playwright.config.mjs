import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser', workers:1, timeout:30000, reporter:'list',
 outputDir:'.tools/browser-results',
 use:{baseURL:'http://127.0.0.1:8787',headless:true,viewport:{width:1440,height:960},
  launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)}},
 webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:8787',reuseExistingServer:!process.env.CI,timeout:20000}
});
