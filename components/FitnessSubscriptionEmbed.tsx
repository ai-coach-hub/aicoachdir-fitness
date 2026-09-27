"use client";

import { useEffect, useState } from "react";
import { PICKAXE_FITNESS_SSO_DEPLOYMENT_ID } from "@/lib/pickaxeSso";

declare global {
  interface Window {
    PickaxeConfig?: Record<string, unknown>;
  }
}

type SsoContext = {
  deploymentId?: string;
  studioId?: string;
  pickaxeId?: string;
};

export default function FitnessSubscriptionEmbed() {
  const [status, setStatus] = useState(
    "Loading your secure Fitness Coach subscription…",
  );

  useEffect(() => {
    let cancelled = false;
    let membershipTimer: ReturnType<typeof setInterval> | null = null;

    const deploymentId = PICKAXE_FITNESS_SSO_DEPLOYMENT_ID;
    const existingConfig = window.PickaxeConfig || {};
    const deploymentConfig =
      existingConfig[deploymentId] &&
      typeof existingConfig[deploymentId] === "object"
        ? (existingConfig[deploymentId] as Record<string, unknown>)
        : {};

    window.PickaxeConfig = {
      ...existingConfig,
      [deploymentId]: {
        ...deploymentConfig,
        sso: {
          getJwt: async (context: SsoContext) => {
            const response = await fetch("/api/pickaxe/embed-sso-token", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                deploymentId: context.deploymentId || deploymentId,
                studioId: context.studioId || "",
                pickaxeId: context.pickaxeId || "",
              }),
            });

            if (!response.ok) return null;
            const data = (await response.json()) as { token?: string | null };
            return data.token || null;
          },
        },
      },
    };

    const startMembershipWatch = () => {
      const check = async () => {
        try {
          const response = await fetch("/api/fitness/membership-status", {
            cache: "no-store",
          });
          if (!response.ok) return;
          const data = (await response.json()) as { active?: boolean };
          if (data.active && !cancelled) {
            setStatus("Membership confirmed. Opening your Fitness Coach…");
            window.location.replace("/fitness/chat");
          }
        } catch {}
      };

      void check();
      membershipTimer = setInterval(check, 3000);
    };

    let script = document.querySelector<HTMLScriptElement>(
      'script[data-aicoach-pickaxe-embed="true"]',
    );

    if (!script) {
      script = document.createElement("script");
      script.src = "https://studio.pickaxe.co/api/embed/bundle.js";
      script.async = true;
      script.defer = true;
      script.dataset.aicoachPickaxeEmbed = "true";
      script.onload = () => {
        if (!cancelled) setStatus("Secure subscription is ready.");
      };
      script.onerror = () => {
        if (!cancelled) {
          setStatus("The secure subscription panel could not load. Please refresh.");
        }
      };
      document.body.appendChild(script);
    } else {
      setStatus("Secure subscription is ready.");
    }

    startMembershipWatch();

    return () => {
      cancelled = true;
      if (membershipTimer) clearInterval(membershipTimer);
    };
  }, []);

  return (
    <section className="login-config-card" aria-labelledby="fitness-subscription-heading">
      <p className="eyebrow">NEW SUBSCRIBER · STEP 3 OF 3</p>
      <h1 id="fitness-subscription-heading">Complete your Fitness Coach membership</h1>
      <p>
        You are already signed into AI Coach Directory. Complete the $15/month
        Fitness Coach membership below—there should be no second account login.
      </p>

      <div
        id={PICKAXE_FITNESS_SSO_DEPLOYMENT_ID}
        style={{ minHeight: 560, width: "100%", margin: "24px 0" }}
      />

      <p className="status-note">{status}</p>
      <p className="microcopy">
        Your membership includes 400 uses per month. After Pickaxe confirms the
        subscription, this page will open your Coach + My Workouts automatically.
      </p>
    </section>
  );
}
