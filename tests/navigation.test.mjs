import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMMAND, maneuverCommand, prepareRoute, guidanceAt, projectOnRoute, pointAt, distance, usableFix, safeGuidanceCommand, parseCoordinates } from '../web/navigation.mjs';
const fixture=JSON.parse(await readFile(new URL('../web/data/demo-route.json',import.meta.url),'utf8'));

test('real OSRM fixture contains a continuous route and ordered maneuvers',()=>{
 const route=prepareRoute(fixture);
 assert.ok(route.length>1000&&route.length<1400);
 assert.ok(route.steps.length>=3);
 assert.ok(route.steps.every((step,i)=>i===0||step.at>=route.steps[i-1].at));
 assert.equal(route.steps.at(-1).command,COMMAND.OFF);
 assert.deepEqual(pointAt(route,0),route.coordinates[0]);
 assert.ok(distance(pointAt(route,route.length),route.coordinates.at(-1))<0.001);
});
test('unknown and arrival maneuvers clear the LEDs; all firmware commands map correctly',()=>{
 assert.equal(maneuverCommand({type:'turn',modifier:'slight left'}),1);
 assert.equal(maneuverCommand({type:'turn',modifier:'sharp right'}),2);
 assert.equal(maneuverCommand({type:'continue',modifier:'straight'}),3);
 assert.equal(maneuverCommand({type:'turn',modifier:'uturn'}),4);
 assert.equal(maneuverCommand({type:'arrive',modifier:'right'}),0);
 assert.equal(maneuverCommand({type:'roundabout'}),0);
 assert.equal(maneuverCommand({type:'unknown'}),0);
});
test('180 m alert boundary is inclusive and passed maneuvers are retired',()=>{
 const route={length:500,steps:[{at:0,command:3},{at:200,command:1},{at:500,command:0}]};
 assert.equal(guidanceAt(route,19).command,0);
 assert.equal(guidanceAt(route,20).command,1);
 assert.equal(guidanceAt(route,200).command,1);
 assert.equal(guidanceAt(route,209).command,0);
});
test('route projection does not jump to a later loop crossing or move backwards',()=>{
 const coordinates=[[0,0],[0,.002],[.001,.002],[.001,0],[0,0]];
 const cumulative=[0];for(let i=1;i<coordinates.length;i++)cumulative.push(cumulative.at(-1)+distance(coordinates[i-1],coordinates[i]));
 const route={coordinates,cumulative,length:cumulative.at(-1)};
 assert.ok(projectOnRoute(route,[0,0]).progress<1);
 assert.equal(projectOnRoute(route,[0,.0001],100).progress,100);
 assert.ok(projectOnRoute(route,[.01,.01]).distance>500);
});
test('stale, inaccurate, invalid and absent GPS never enables turn LEDs',()=>{
 const now=100000,fix={point:[10,106],accuracy:10,timestamp:now};
 assert.equal(usableFix(fix,now),true);
 for(const bad of [null,{...fix,accuracy:51},{...fix,accuracy:-1},{...fix,timestamp:now-15001},{...fix,point:[NaN,106]}])assert.equal(usableFix(bad,now),false);
 const context={active:true,visible:true,simulated:false,fix,offRoute:false,guidance:{command:2}};
 assert.equal(safeGuidanceCommand(context,now),2);
 for(const patch of [{active:false},{visible:false},{offRoute:true},{fix:null},{fix:{...fix,timestamp:0}}])assert.equal(safeGuidanceCommand({...context,...patch},now),0);
 assert.equal(safeGuidanceCommand({...context,simulated:true,fix:null},now),2);
 assert.equal(safeGuidanceCommand({...context,simulated:true,visible:false},now),0);
});
test('coordinate search validates bounds without confusing coordinate order',()=>{
 assert.deepEqual(parseCoordinates('10.77, 106.70'),[10.77,106.70]);
 assert.deepEqual(parseCoordinates('-33.9; 151.2'),[-33.9,151.2]);
 assert.equal(parseCoordinates('106.70,10.77'),null);
 assert.equal(parseCoordinates('a place'),null);
});
test('malformed or zero-length routing responses are rejected',()=>{
 assert.throws(()=>prepareRoute({code:'NoRoute'}));
 assert.throws(()=>prepareRoute({code:'Ok',routes:[{geometry:{coordinates:[[106,10],[106,10]]},legs:[{steps:[]}]}]}));
});
