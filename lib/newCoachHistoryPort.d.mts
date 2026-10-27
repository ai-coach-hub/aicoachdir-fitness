export type CoachHistoryIdentity = Readonly<{coach:string;memberId:string;threadId:string}>;
export function coachHistoryKey(coach:string,memberId:string,threadId:string):CoachHistoryIdentity|null;
export function newCoachHistoryPort(args:{
 coach:string;memberId:string;
 repo:{read:(key:CoachHistoryIdentity)=>Promise<unknown>;
 save:(row:CoachHistoryIdentity&{requestKey:string;question:string;reply:string})=>Promise<string>;}
}):Readonly<{
 read:(threadId:string)=>Promise<unknown>;
 save:(threadId:string,requestKey:string,question:string,reply:string)=>Promise<string>;
}>|null;
