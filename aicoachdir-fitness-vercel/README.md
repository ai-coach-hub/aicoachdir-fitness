# AI Coach Directory - Fitness Coach Vercel Starter

A small Next.js App Router starter for launching the AI Fitness Coach first while keeping Pickaxe as the hosted account/access/billing layer connected to Stripe.

## Flow

1. Visitor lands on the Vercel-hosted Fitness Coach page.
2. Visitor selects **Start Your Fitness Coach**.
3. `/fitness/signup` requires the visitor to scroll to the bottom of the Terms & Conditions.
4. The agreement checkbox is disabled until the bottom is reached.
5. After checking agreement, **Continue to Secure Subscription** redirects to the fitness-only Pickaxe deployment/signup URL.
6. Pickaxe handles its connected Stripe subscription and access provisioning.

## Important before launch

- Replace the sample Terms & Conditions with attorney-approved text.
- Create/confirm a FITNESS-ONLY paid access group/deployment in Pickaxe.
- Put that Pickaxe URL into `NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL` in Vercel Environment Variables.
- Test the complete flow in Stripe test mode before going live.
- The starter stores the acceptance version/time only in browser sessionStorage. For durable legal/audit records, add a server-side datastore and save the terms version, acceptance timestamp, user identifier, and other fields your legal counsel recommends.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

Push this folder to GitHub/GitLab/Bitbucket and import the repository into Vercel. Add the environment variable in Project Settings -> Environment Variables and deploy.

## Brand notes

The starter uses the existing public AI Coach Directory image assets from `aicoachdir.com` and a dark navy/black palette with blue, violet, and cyan accents to match the current site. It uses the system/Inter-style sans-serif stack; replace it with the exact current brand font if desired.
