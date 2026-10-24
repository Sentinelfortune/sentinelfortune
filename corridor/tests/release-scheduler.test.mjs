import test from "node:test";
import assert from "node:assert/strict";
import {makeSeries,slotForDay,validateRelease,dueQueue} from "../core/release-scheduler.js";
const series=makeSeries({id:"legacy-365",branch:"VIBRAFLOW_MEDIA",title:"Legacy 365",length:365,startDate:"2026-11-01",releaseTime:"09:00"});
const record={id:"ed_day1",branch:"VIBRAFLOW_MEDIA",title:"Spiritual Legacy",summary:"A reflection",body:"Faith, grace and prayer are explored in a contemplative spiritual teaching.",version:2,status:"APPROVED"};
const approved={day:1,seriesId:"legacy-365",branch:"VIBRAFLOW_MEDIA",access:"FREE",version:2,record,approval:{approved:true,version:2,recordId:"ed_day1",action:"publish_approved"},editorialReviewApproved:true};
test("365 daily slots are consistent",()=>{assert.equal(slotForDay(series,1),"2026-11-01T09:00:00.000Z");assert.equal(slotForDay(series,2),"2026-11-02T09:00:00.000Z");assert.equal(slotForDay(series,365),"2027-10-31T09:00:00.000Z")});
test("early release refused",()=>assert.equal(validateRelease(series,approved,"2026-11-01T08:59:00Z").code,"NOT_DUE"));
test("approved exact version becomes eligible after due time",()=>assert.equal(validateRelease(series,approved,"2026-11-01T09:00:00Z").ok,true));
test("wrong world fails closed",()=>assert.equal(validateRelease(series,{...approved,branch:"LIGHTNODE_SYSTEMS"},"2026-11-02T09:00:00Z").code,"WRONG_WORLD"));
test("unapproved and edited versions refused",()=>{assert.equal(validateRelease(series,{...approved,record:{...record,status:"DRAFT"}},"2026-11-02T09:00:00Z").code,"OWNER_APPROVAL_REQUIRED");assert.equal(validateRelease(series,{...approved,version:3},"2026-11-02T09:00:00Z").code,"STALE_VERSION")});
test("paid content never enters free release queue",()=>assert.equal(validateRelease(series,{...approved,access:"PREMIUM"},"2026-11-02T09:00:00Z").ok,false));
test("duplicate releases deduplicate deterministically",()=>{const q=dueQueue(series,[approved,approved],"2026-11-02T09:00:00Z");assert.equal(q.length,1);assert.equal(dueQueue(series,[approved],"2026-11-02T09:00:00Z",new Set([q[0].key])).length,0)});
test("invalid inputs refused",()=>{assert.throws(()=>makeSeries({...series,branch:"EIGHTH_WORLD"}));assert.throws(()=>makeSeries({...series,startDate:"2026-02-30"}));assert.throws(()=>makeSeries({...series,length:732}));assert.throws(()=>makeSeries({...series,timezone:"America/Phoenix"}))});

test("two-year daily series supports 730 or 731 episodes",()=>{const s=makeSeries({...series,id:"two-year",length:731});assert.equal(slotForDay(s,731),"2028-10-31T09:00:00.000Z")});
test("weekly seasons retain stable release intervals",()=>{const s=makeSeries({...series,id:"two-year-weekly",length:104,intervalDays:7});assert.equal(slotForDay(s,2),"2026-11-08T09:00:00.000Z");assert.equal(slotForDay(s,104),"2028-10-22T09:00:00.000Z")});
test("Owner-programmed pauses fail closed",()=>{const s=makeSeries({...series,pausedDays:[1]});assert.equal(validateRelease(s,approved,"2026-11-02T09:00:00Z").code,"RELEASE_PAUSED")});
test("invalid pauses and intervals are rejected",()=>{assert.throws(()=>makeSeries({...series,intervalDays:0}));assert.throws(()=>makeSeries({...series,pausedDays:[1,1]}))});
