import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const migration=readFileSync(new URL("../migrations/20261103_public_introductory_trial_DRAFT.sql",import.meta.url),"utf8");
test("draft migration adds isolated lifetime trial storage without altering paid membership tables",()=>{
 for(const name of ["introductory_trial_grants","introductory_trial_requests","introductory_trial_history"])
  assert.match(migration,new RegExp("CREATE TABLE IF NOT EXISTS public\\."+name));
 assert.match(migration,/message_limit smallint NOT NULL DEFAULT 15 CHECK \(message_limit=15\)/);
 assert.match(migration,/UNIQUE CHECK \(member_key/);
 assert.match(migration,/FOREIGN KEY\(clerk_user_id,request_key\)/);
 assert.doesNotMatch(migration,/ALTER TABLE (?:public\.)?(?:fitness_memberships|shared_ai_usage_periods)/i);
 assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM|INSERT INTO public\.fitness_memberships/i);
});
test("one shared lifetime ledger is idempotent, holds uncertain provider requests and cannot complete without history",()=>{
 assert.match(migration,/SELECT \* INTO v FROM public\.introductory_trial_grants WHERE clerk_user_id=p_user FOR UPDATE/);
 assert.match(migration,/RETURN 'duplicate_'\|\|old\.status/);
 assert.match(migration,/IF v\.converted_at IS NOT NULL THEN RETURN 'converted'/);
 assert.match(migration,/v\.completed_uses\+v\.reserved_uses>=15/);
 assert.match(migration,/p_outcome='completed' AND NOT EXISTS/);
 assert.match(migration,/introductory_trial_history h/);
 assert.match(migration,/RETURN 'history_missing'/);
 assert.match(migration,/p_outcome='uncertain' THEN 0 ELSE 1 END/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.intro_trial_reserve/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.intro_trial_settle/);
});

test("operator-only uncertainty reconciliation never refunds a duplicate or counts an unsaved response",()=>{
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.intro_trial_reconcile\(/);
 assert.match(migration,/old\.status<>'uncertain'/);
 assert.match(migration,/IF p_outcome='completed' AND NOT EXISTS/);
 assert.match(migration,/reserved_uses=reserved_uses-1/);
 assert.match(migration,/RETURN 'history_missing'/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.intro_trial_reconcile/);
});
