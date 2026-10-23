import test from 'node:test';
import assert from 'node:assert/strict';
import { GlassesBluetooth } from '../web/bluetooth.mjs';
function connectedManager(write){
 const statuses=[],manager=new GlassesBluetooth(null,(...status)=>statuses.push(status));
 const device={gatt:{connected:true,disconnect(){this.connected=false;}}};
 manager.device=device;manager.characteristic={properties:{writeWithoutResponse:true},writeValueWithoutResponse:write};
 return {manager,device,statuses};
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
