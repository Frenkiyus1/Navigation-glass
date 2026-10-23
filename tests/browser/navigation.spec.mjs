import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const fixture=await readFile(new URL('../../web/data/demo-route.json',import.meta.url),'utf8');
const blank=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCn0AAAAASUVORK5CYII=','base64');
async function mockServices(page){
 await page.route('**/routing.openstreetmap.de/**',route=>route.fulfill({status:200,contentType:'application/json',body:fixture}));
 await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:blank}));
}
async function plan(page){
 await page.locator('#originInput').fill('10.7725, 106.6980');await page.getByRole('button',{name:'Tìm điểm xuất phát',exact:true}).click();
 await page.locator('#destinationInput').fill('10.7798, 106.6990');await page.getByRole('button',{name:'Tìm điểm đến',exact:true}).click();
 await page.locator('#routeButton').click();await expect(page.locator('#routeSummary')).toBeVisible();
}
async function mockHardware(page){
 await page.addInitScript(()=>{
  window.__writes=[];
  const good=()=>({coords:{latitude:10.7725,longitude:106.6980,accuracy:8,speed:2},timestamp:Date.now()});
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success){success(good());},watchPosition(success){window.__gps=success;return 9;},clearWatch(){window.__gps=null;}}});
  const characteristic={properties:{writeWithoutResponse:true,write:false},async writeValueWithoutResponse(value){window.__writes.push(value[0]);}};
  const device={name:'NavigationGlasses',addEventListener(){},gatt:{connected:false,async connect(){this.connected=true;return{async getPrimaryService(){return{async getCharacteristic(){return characteristic;}};}};},disconnect(){this.connected=false;}}};
  Object.defineProperty(navigator,'bluetooth',{value:{async requestDevice(){return device;}}});
 });
}
test('desktop map loads, renders a real demo route and stops simulation',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page).toHaveTitle(/Navi Glass/);
 await expect(page.locator('#routeButton')).toBeDisabled();
 await page.locator('#demoButton').click();await expect(page.locator('#stopButton')).toBeVisible();
 await expect(page.locator('#guidanceCard')).toHaveClass(/active/);await expect(page.locator('#gpsStatus')).toContainText('5×');
 await expect.poll(()=>page.locator('.leaflet-tile-loaded').count(),{timeout:12000}).toBeGreaterThan(4);
 await page.screenshot({path:'.tools/screenshots/desktop.png',fullPage:true});
 await page.locator('#stopButton').click();await expect(page.locator('#deviceHud')).toHaveAttribute('data-command','0');
 await expect(page.locator('#guidanceCard')).not.toHaveClass(/active/);expect(errors).toEqual([]);
});
test('coordinate planning and changing modes invalidate the previous route',async({page})=>{
 await mockServices(page);await page.goto('/');await plan(page);
 await expect(page.locator('#routeDistance')).toContainText('1.1 km');
 await page.getByRole('button',{name:'Đi bộ',exact:true}).click();await expect(page.locator('#routeSummary')).toBeHidden();
 await expect(page.locator('#routeButton')).toBeEnabled();
 await page.locator('#routeButton').click();await expect(page.locator('#routeSummary')).toBeVisible();
 await expect(page.locator('#routeModeLabel')).toContainText('ĐI BỘ');
});
test('search renders provider text safely and selects a destination',async({page})=>{
 await mockServices(page);
 await page.route('**/photon.komoot.io/**',route=>route.fulfill({json:{features:[{geometry:{type:'Point',coordinates:[106.6990,10.7798]},properties:{name:'<img src=x onerror=alert(1)>',city:'TP.HCM'}}]}}));
 await page.goto('/');await page.locator('#destinationInput').fill('Nhà thờ Đức Bà');
 await page.getByRole('button',{name:'Tìm điểm đến',exact:true}).click();
 await expect(page.locator('.search-result')).toHaveCount(1);await expect(page.locator('.search-result img')).toHaveCount(0);
 await page.locator('.search-result').click();await expect(page.locator('#destinationInput')).toHaveValue('<img src=x onerror=alert(1)>');
});
test('GPS guidance sends to BLE, clears for weak GPS, and stops safely',async({page})=>{
 await mockServices(page);await mockHardware(page);await page.goto('/');await plan(page);
 await page.locator('#connectButton').click();await expect(page.locator('#connectButton')).toContainText('Ngắt kính');
 await page.locator('#startButton').click();await expect(page.locator('#stopButton')).toBeVisible();
 await expect(page.locator('#guidanceCard')).toHaveClass(/active/);
 await expect.poll(()=>page.evaluate(()=>window.__writes.length)).toBeGreaterThan(1);
 await page.evaluate(()=>window.__gps({coords:{latitude:10.7725,longitude:106.6980,accuracy:120,speed:0},timestamp:Date.now()}));
 await expect(page.locator('#deviceHud')).toHaveAttribute('data-command','0');await expect(page.locator('#statusMessage')).toContainText('GPS chính xác');
 await page.locator('#stopButton').click();await expect.poll(()=>page.evaluate(()=>window.__writes.at(-1))).toBe(0);
 await expect(page.locator('#stopButton')).toBeHidden();
});
test('GPS failure does not start guidance',async({page})=>{
 await mockServices(page);await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,error){error({code:1});}}}));
 await page.goto('/');await plan(page);await page.locator('#startButton').click();
 await expect(page.locator('#toast')).toContainText('GPS chưa được cho phép');await expect(page.locator('#guidanceCard')).not.toHaveClass(/active/);
 await expect(page.locator('#deviceHud')).toHaveAttribute('data-command','0');
});
test('hiding the tab immediately clears the simulated BLE command',async({page})=>{
 await mockServices(page);await page.goto('/');await page.locator('#demoButton').click();await expect(page.locator('#stopButton')).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('#deviceHud')).toHaveAttribute('data-command','0');
});
test('mobile layout fits the viewport and the help dialog works',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('#map')).toBeVisible();await page.locator('#helpButton').click();await expect(page.locator('#helpDialog')).toBeVisible();
 await page.locator('#closeHelp').click();await expect(page.locator('#helpDialog')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'.tools/screenshots/mobile.png',fullPage:true});
});

test('Stop cancels a pending GPS request and ignores its late completion',async({page})=>{
 await mockServices(page);await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success){window.__lateGPS=success;},clearWatch(){}}}));
 await page.goto('/');await plan(page);await page.locator('#startButton').click();await expect(page.locator('#stopButton')).toBeVisible();
 await page.locator('#stopButton').click();
 await page.evaluate(()=>window.__lateGPS({coords:{latitude:10.7725,longitude:106.6980,accuracy:5,speed:0},timestamp:Date.now()}));
 await expect(page.locator('#startButton')).toBeVisible();await expect(page.locator('#guidanceCard')).not.toHaveClass(/active/);
 await expect(page.locator('#deviceHud')).toHaveAttribute('data-command','0');
});
test('manual LED tests turn off automatically after four seconds',async({page})=>{
 await mockServices(page);await mockHardware(page);await page.goto('/');await page.locator('#connectButton').click();
 await page.clock.install();await page.getByRole('button',{name:'Thử rẽ trái',exact:true}).click();
 await expect(page.locator('#deviceHud')).toHaveAttribute('data-command','1');
 await page.clock.fastForward(5000);await expect(page.locator('#deviceHud')).toHaveAttribute('data-command','0');
 await expect.poll(()=>page.evaluate(()=>window.__writes.at(-1))).toBe(0);
});
