# AI Coach Directory™ - AI Fitness Coach 2.0 Vercel Starter

Updated Vercel-ready Next.js starter for the AI Fitness Coach 2.0 subscription and returning-member access flow.

## What changed in this version

- Uses the supplied **AI Coaching for Fitness** image locally at `/public/images/ai-coaching-for-fitness.jpg`.
- Places that image directly above the AI Fitness Coach 2.0 subscription card.
- Displays the current offer as **$15/month** with **400 uses/month**.
- Replaces the previous short/sample Terms with the supplied full Terms & Conditions.
- Keeps the scroll-to-end requirement before the user can check the agreement box.
- Uses the requested acknowledgement text:

  > I have read and agree to the Terms & Conditions and acknowledge the Privacy Policy, including the arbitration agreement, class-action waiver, AI limitations, fitness assumption-of-risk provisions, and automatic-renewal terms. I confirm that I am at least 18 years old.

- Removes the previous confidentiality-style marketing claim.
- Adds a standalone `/terms` route in addition to the gated `/fitness/signup` flow.
- Adds a new **Coming Soon** preview section featuring **AI Coaching SpendSmart**, **AI Coaching for Life**, and **AI Coaching for Career**.
- Uses the supplied preview images with visible **Coming Soon** banners.
- Keeps **AI Fitness Coach 2.0** as the live primary offer while showing the upcoming coaches lower on the page.

## Trademark treatment

- Displays **AI Coach Directory™** as the claimed brand mark in the site header, branded sections, and legal/footer areas.
- Adds a footer notice stating that the AI Coach Directory™ name and logo are trademarks/service marks claimed by KCB Integrative LLC.
- Adds a corresponding trademark notice to Section 12 of the Terms & Conditions.
- Does **not** use the federal registered-trademark symbol ® because federal registration status was not provided.
- The Terms version is bumped to `fitness-2026-08-16-v3-trademark` because the legal text changed.


## Returning member login update

This version separates first-time subscription consent from ordinary member access:

- **New members** use `/fitness/signup`, review the full Terms, scroll to the end, provide the required acknowledgement, and then continue to Pickaxe/Stripe.
- **Returning members** use `/fitness/login`, which redirects directly to the configured Pickaxe AI Fitness Coach portal. They do not need to repeat the Vercel Terms gate simply to sign back in.
- A visible **Member Login** button is included in the header, the Fitness Coach offer, the signup page, and the footer.
- The existing `NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL` environment variable is reused for both post-consent signup and returning-member portal access, so no additional Vercel environment variable is required.

This does not bypass Pickaxe authentication or subscription enforcement. Pickaxe still determines whether the person is signed in and whether the account has access.

## Customer flow

1. Visitor lands on the Vercel-hosted Fitness Coach page. Returning subscribers may choose **Member Login** and go directly to Pickaxe.
2. Visitor selects **Review Terms & Get Started**.
3. `/fitness/signup` displays the complete Terms & Conditions inside a required scroll area.
4. The agreement checkbox remains disabled until the visitor reaches the end.
5. After agreement, **Continue to Secure Subscription** redirects to the Pickaxe Fitness Coach portal.
6. Pickaxe handles account access and the connected Stripe subscription flow.

## Vercel environment variable

Add this in Vercel Project Settings -> Environment Variables:

```text
NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL=https://studio.pickaxe.co/...
```

Use the customer-facing Pickaxe portal URL for the AI Fitness Coach 2.0 membership.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Deploying over the previous GitHub/Vercel project

Copy the contents of this folder over the previous `aicoachdir-fitness-vercel` project contents, commit the changes to the same GitHub repository, and push to `main`. Vercel should automatically create a new deployment from the updated commit.

If your GitHub repository still uses `aicoachdir-fitness-vercel` as its Vercel Root Directory, keep that root-directory setting unchanged.

## Terms source

The full legal text used by the site is stored at `content/terms-and-conditions.md` and rendered in both `/terms` and `/fitness/signup`.

Section 19 is preserved verbatim from the supplied Terms. Outside the legal Terms, the site avoids marketing language that promises or implies true confidentiality. Have counsel review the final legal text before launch.

## Acceptance record note

The starter stores the acceptance timestamp, Terms version, acknowledgement text, plan, price, and usage allowance in browser `sessionStorage` before redirecting to Pickaxe. This is not a durable server-side legal audit record. If you need durable consent records, add a server-side datastore before launch.


## Coaching value update

This version removes the small explanatory sentence below the Returning Member Login button on the homepage and adds a purpose-built AI coaching value section explaining Specialized Knowledge, Built to Coach, Purpose-Built Expertise, and Less Prompting / More Coaching.


## Verification email reminder

The first-time subscription flow includes a visible reminder to check the Spam or Junk folder if the verification email does not appear in the inbox within a few minutes.

