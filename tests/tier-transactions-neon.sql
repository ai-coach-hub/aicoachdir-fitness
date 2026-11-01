-- Execute only against the isolated test branch. Fixtures roll back inside the
-- exception block; all assertions are run by PostgreSQL, not mocked SQL.
DO $test$
DECLARE result text; w record; intent text := 'upg_'||repeat('c',36);
 downid text := 'upg_'||repeat('d',36); member text := 'member_'||repeat('c',64);
 start_at timestamptz:=now()-interval '1 day'; end_at timestamptz:=now()+interval '29 days';
BEGIN
 IF current_setting('neon.branch_id',true)='br-sparkling-glitter-aucpz59d' THEN RAISE EXCEPTION 'Test cannot run in production'; END IF;
 BEGIN
  INSERT INTO public.shared_ai_usage_periods VALUES(member,'qa_tier_sql',start_at,end_at,200,5,37);
  INSERT INTO public.ai_tier_change_intents(id,member_key,entitlement_key,period_start,period_end,stripe_customer_id,stripe_subscription_id,stripe_item_id,old_price_id,target_price_id,expected_limit,target_limit,invoice_id,state,direction)
  VALUES(intent,member,'qa_tier_sql',start_at,end_at,'cus_QASQL','sub_QASQL','si_QASQL','price_QAGrowth','price_QAPremium',200,400,'in_QASQL','awaiting_payment','upgrade');
  SELECT public.ai_tier_apply_verified_paid_upgrade(intent,'in_QASQL',200,400) INTO result;
  ASSERT result='applied','paid upgrade did not apply';
  SELECT * INTO w FROM public.shared_ai_usage_periods WHERE member_key=member;
  ASSERT w.limit_uses=400 AND w.completed_uses=37 AND w.reserved_uses=5,'upgrade changed used or reserved balances';
  SELECT public.ai_tier_apply_verified_paid_upgrade(intent,'in_QASQL',200,400) INTO result;
  ASSERT result='already_applied','duplicate webhook applied twice';
  INSERT INTO public.ai_tier_change_intents(id,member_key,entitlement_key,period_start,period_end,stripe_customer_id,stripe_subscription_id,stripe_item_id,old_price_id,target_price_id,expected_limit,target_limit,state,direction)
  VALUES(downid,member,'qa_tier_sql',start_at,end_at,'cus_QASQL','sub_QASQL','si_QASQL','price_QAPremium','price_QAStarter',400,100,'scheduled','downgrade');
  SELECT * INTO w FROM public.shared_ai_usage_periods WHERE member_key=member;
  ASSERT w.limit_uses=400 AND w.completed_uses=37 AND w.reserved_uses=5,'scheduling reduced current benefits';
  SELECT public.ai_tier_apply_paid_renewal(downid,'in_QARenewal',end_at,end_at+interval '30 days',100) INTO result;
  ASSERT result='applied','renewal did not apply';
  SELECT * INTO w FROM public.shared_ai_usage_periods WHERE member_key=member AND period_start=end_at;
  ASSERT w.limit_uses=100 AND w.completed_uses=0 AND w.reserved_uses=0,'new period allowance incorrect';
  SELECT * INTO w FROM public.shared_ai_usage_periods WHERE member_key=member AND period_start=start_at;
  ASSERT w.limit_uses=400 AND w.completed_uses=37 AND w.reserved_uses=5,'renewal changed prior wallet';
  SELECT public.ai_tier_apply_paid_renewal(downid,'in_QARenewal',end_at,end_at+interval '30 days',100) INTO result;
  ASSERT result='applied','renewal replay failed';
  ASSERT (SELECT count(*) FROM public.shared_ai_usage_periods WHERE member_key=member)=2,'renewal duplicated wallet';
  SELECT public.ai_tier_apply_paid_renewal(downid,'in_QARenewal',end_at,end_at+interval '30 days',600) INTO result;
  ASSERT result='invalid_renewal','wrong allowance accepted';
  RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='rollback successful test fixtures';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 ASSERT NOT EXISTS(SELECT 1 FROM public.ai_tier_change_intents WHERE id IN(intent,downid)),'test fixtures persisted';
END $test$;
