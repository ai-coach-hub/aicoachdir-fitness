from pathlib import Path
import hashlib
p = Path('app/api/fitness/chat/route.ts')
raw = p.read_bytes()
blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
assert blob == 'dbdf353d65d66af1b98856de9741b481a8641289', 'Current route moved; do not patch automatically'
s = raw.decode()
old = '''    if (!data.plan) {
      const recovery = await recoverStructuredPlanForMember(memberEmail, studioToken);
      if (recovery.restored) {
        data = await readMemberWorkoutData(memberEmail, studioToken);
      }
    }

    return Response.json({'''
new = '''    if (!data.plan) {
      // The legacy portal also reads display-memory envelopes and its member cache.
      // A new website login must not require regenerating that member's plan.
      try {
        const { readLegacyMemberPlan } = await import("@/lib/legacyWorkoutRead");
        const legacy = await readLegacyMemberPlan(memberEmail, studioToken);
        if (legacy.plan) {
          data = { ...data, plan: legacy.plan };
          console.info("[fitness-member-hub] legacy-plan-read", {
            source: legacy.source,
            scheduleMode: legacy.plan.scheduleMode || null,
            workoutCount: Object.keys(legacy.plan.workouts as Record<string, unknown>).length,
          });
        }
      } catch {
        console.warn("[fitness-member-hub] legacy-plan-read-unavailable");
      }
    }

    if (!data.plan) {
      const recovery = await recoverStructuredPlanForMember(memberEmail, studioToken);
      if (recovery.restored) {
        data = await readMemberWorkoutData(memberEmail, studioToken);
      }
    }

    return Response.json({'''
assert s.count(old) == 1, 'Guarded GET read anchor changed; do not patch automatically'
p.write_text(s.replace(old, new))
