/* DANI Release Scheduler v0.1 — deterministic, fail-closed planning layer.
 * No timer, API endpoint, Owner impersonation or production publication.
 * Persistence/cron activation requires a separately validated adapter. */
import { EDITORIAL_CHARTERS, checkEditorialFit } from "./editorial-policy.js";
export const RELEASE_POLICY_VERSION="sfl-release/0.2.0";
const CHANNELS=new Set(["FREE","PREMIUM","PRODUCT","SUPPORT"]);
const dayMs=86400000;
const isoDay=/^\d{4}-\d{2}-\d{2}$/;
const validTime=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function makeSeries(input) {
  const {id,branch,title,length,startDate,releaseTime="09:00",timezone="UTC",access="FREE",intervalDays=1,pausedDays=[]}=input||{};
  if(typeof id!=="string"||!/^[a-z0-9-]{3,80}$/.test(id)) throw Error("INVALID_SERIES_ID");
  if(!EDITORIAL_CHARTERS[branch]) throw Error("INVALID_WORLD");
  if(typeof title!=="string"||title.trim().length<3) throw Error("INVALID_SERIES_TITLE");
  if(!Number.isInteger(length)||length<1||length>731) throw Error("INVALID_LENGTH");
  if(!isoDay.test(startDate)||Number.isNaN(Date.parse(startDate+"T00:00:00Z"))||new Date(startDate+"T00:00:00Z").toISOString().slice(0,10)!==startDate) throw Error("INVALID_START_DATE");
  if(!validTime.test(releaseTime)) throw Error("INVALID_RELEASE_TIME");
  if(timezone!=="UTC") throw Error("UNSUPPORTED_TIMEZONE_V0_1");
  if(!CHANNELS.has(access)) throw Error("INVALID_ACCESS");
  if(!Number.isInteger(intervalDays)||intervalDays<1||intervalDays>365) throw Error("INVALID_INTERVAL");
  if(!Array.isArray(pausedDays)||pausedDays.some(x=>!Number.isInteger(x)||x<1||x>length)||new Set(pausedDays).size!==pausedDays.length) throw Error("INVALID_PAUSED_DAYS");
  return Object.freeze({id,branch,title,length,startDate,releaseTime,timezone,access,intervalDays,pausedDays:Object.freeze([...pausedDays]),policy:RELEASE_POLICY_VERSION});
}
export function slotForDay(series,day) {
  if(!Number.isInteger(day)||day<1||day>series.length) throw Error("INVALID_DAY");
  const start=Date.parse(series.startDate+"T"+series.releaseTime+":00Z");
  return new Date(start+(day-1)*series.intervalDays*dayMs).toISOString();
}
export function validateRelease(series,item,now=new Date().toISOString()) {
  const reject=(code)=>({ok:false,code});
  if(!series||!item||!EDITORIAL_CHARTERS[series.branch]) return reject("INVALID_SERIES");
  if(!Number.isInteger(item.day)||item.day<1||item.day>series.length) return reject("INVALID_DAY");
  if(series.pausedDays.includes(item.day)) return reject("RELEASE_PAUSED");
  if(item.branch!==series.branch||item.record?.branch!==series.branch) return reject("WRONG_WORLD");
  if(item.seriesId!==series.id) return reject("WRONG_SERIES");
  if(item.access!==series.access) return reject("ACCESS_MISMATCH");
  if(item.access!=="FREE") return reject("COMMERCIAL_AUTHORITY_REQUIRED");
  if(!Number.isInteger(item.version)||item.version!==item.record?.version) return reject("STALE_VERSION");
  if(item.record?.status!=="APPROVED") return reject("OWNER_APPROVAL_REQUIRED");
  if(item.approval?.approved!==true||item.approval.version!==item.version||item.approval.recordId!==item.record.id||item.approval.action!=="publish_approved") return reject("APPROVAL_VERSION_MISMATCH");
  const editorial=checkEditorialFit(item.record);
  if(!editorial.ok) return reject(editorial.code);
  if(editorial.reviewRequired&&!item.editorialReviewApproved) return reject("EDITORIAL_REVIEW_REQUIRED");
  if(typeof now!=="string"||Number.isNaN(Date.parse(now))) return reject("INVALID_NOW");
  if(Date.parse(now)<Date.parse(slotForDay(series,item.day))) return reject("NOT_DUE");
  return {ok:true,code:"READY",key:series.id+"/"+item.day+"/"+item.record.id+"@v"+item.version,scheduledAt:slotForDay(series,item.day)};
}
export function dueQueue(series,items,now,completedKeys=new Set()) {
  const result=[],seen=new Set();
  for(const item of items||[]) {
    const gate=validateRelease(series,item,now);
    if(!gate.ok||seen.has(gate.key)||completedKeys.has(gate.key)) continue;
    seen.add(gate.key);
    result.push({key:gate.key,recordId:item.record.id,version:item.version,branch:series.branch,scheduledAt:gate.scheduledAt,day:item.day});
  }
  return result.sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)||a.day-b.day);
}
