import test from 'node:test';
import assert from 'node:assert/strict';
import { GlassesBluetooth, SERVICE_UUID, RX_UUID } from '../web/bluetooth.mjs';
function connectedManager(write){
 const statuses=[],manager=new GlassesBluetooth(null,(...status)=>statuses.push(status));
 const device={gatt:{connected:true,disconnect(){this.connected=false;}}};
 manager.device=device;manager.characteristic={properties:{writeWithoutResponse:true},writeValueWithoutResponse:write};
 return {manager,device,statuses};
}
for (const advertisement of [
 {name:'NavigationGlasses-C3',services:[]},
 {name:'',services:[SERVICE_UUID]}
]) {
 test('discovery connects with ' + (advertisement.name ? 'only the glasses name' : 'only the UART service') + ' advertised',async()=>{
  const writes=[];let requested=false;
  const characteristic={properties:{writeWithoutResponse:true},async writeValueWithoutResponse(value){writes.push(value[0]);}};
  const device={name:advertisement.name,addEventListener(){},gatt:{connected:false,disconnect(){this.connected=false;}}};
  const manager=new GlassesBluetooth({requestDevice(options){
   requested=true;
   const matches=options.filters?.some(filter=>(!filter.namePrefix||advertisement.name.startsWith(filter.namePrefix))&&(!filter.services||filter.services.every(uuid=>advertisement.services.includes(uuid))));
   if(!matches)return Promise.reject(new DOMException('No matching device','NotFoundError'));
   const allowed=new Set([...(options.optionalServices||[]),...options.filters.flatMap(filter=>filter.services||[])]);
   device.gatt.connect=async()=>{
    device.gatt.connected=true;
    return{async getPrimaryService(uuid){
     if(!allowed.has(uuid))throw new DOMException('Service access denied','SecurityError');
     assert.equal(uuid,SERVICE_UUID);
     return{async getCharacteristic(rx){assert.equal(rx,RX_UUID);return characteristic;}};
    }};
   };
   return Promise.resolve(device);
  }});
  const connecting=manager.connect();
  assert.equal(requested,true,'the chooser must open directly in the click handler');
  await connecting;
  assert.equal(manager.connected,true);
  await manager.send(1);
  assert.deepEqual(writes,[0,1]);
 });
}

test('BLE writes are serialized and the newest OFF replaces queued stale turns',async()=>{
 let resolveFirst;const writes=[];
 const {manager}=connectedManager(value=>{writes.push(value[0]);return writes.length===1?new Promise(resolve=>{resolveFirst=resolve;}):Promise.resolve();});
 const first=manager.send(1);await manager.send(2);await manager.send(0);
 assert.deepEqual(writes,[1]);resolveFirst();await first;
 assert.deepEqual(writes,[1,0]);
});
test('unchanged turn heartbeats are transmitted to refresh the firmware watchdog',async()=>{
 const writes=[];const {manager}=connectedManager(async value=>{writes.push(value[0]);});
 await manager.send(2);await manager.send(2);assert.deepEqual(writes,[2,2]);
});
test('write failures disconnect rather than claiming that the device received guidance',async()=>{
 const {manager,device,statuses}=connectedManager(async()=>{throw new Error('radio lost');});
 assert.equal(await manager.send(1),false);assert.equal(manager.connected,false);assert.equal(device.gatt.connected,false);
 assert.ok(statuses.some(([status])=>status==='error'));
});
test('unsupported browsers and invalid command bytes fail explicitly',async()=>{
 const manager=new GlassesBluetooth(undefined);
 await assert.rejects(manager.connect(),/Chrome/);
 await assert.rejects(manager.send(5),TypeError);
 assert.equal(await manager.send(1),false);
});
test('disconnect clears queued commands and suppresses stale writes',async()=>{
 let resolve;const writes=[];const {manager}=connectedManager(value=>{writes.push(value[0]);return new Promise(r=>{resolve=r;});});
 const first=manager.send(1);await manager.send(2);manager.disconnect();resolve();await first;
 assert.deepEqual(writes,[1]);assert.equal(manager.pending,null);assert.equal(manager.connected,false);
});
