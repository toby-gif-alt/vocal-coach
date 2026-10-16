import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePositionAtPoint } from '../src/practice-selection.js';
const measures = [
  {pageIndex:0,measureNumber:2,qStart:4,qEnd:8,xStart:10,xEnd:210,yStart:20,height:100},
  {pageIndex:1,measureNumber:3,qStart:8,qEnd:12,xStart:10,xEnd:210,yStart:20,height:100},
];
const notes = new Map([['a',[{pageIndex:0,qStart:4,xStart:30},{pageIndex:0,qStart:6,xStart:130}]],['b',[{pageIndex:1,qStart:9,xStart:70}]]]);
test('score clicks snap to the closest musical onset rather than the bar start',()=>{
  assert.deepEqual(scorePositionAtPoint(measures,notes,0,125,60),{measure:2,quarter:6});
  assert.deepEqual(scorePositionAtPoint(measures,notes,0,20,60),{measure:2,quarter:4});
});
test('score clicks respect page and bar bounds',()=>{
  assert.deepEqual(scorePositionAtPoint(measures,notes,1,65,60),{measure:3,quarter:9});
  assert.equal(scorePositionAtPoint(measures,notes,0,220,60),null);
  assert.equal(scorePositionAtPoint(measures,notes,0,125,150),null);
});
test('rest-only measures start at their own boundary',()=>{
  assert.deepEqual(scorePositionAtPoint(measures,new Map(),1,125,60),{measure:3,quarter:8});
});
