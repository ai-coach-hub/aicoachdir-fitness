import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEPLOYMENT_ID = "deployment-4f0de4ce-2dc4-4d50-b9f5-4da3600a2cb5";
const FITNESS_FORM_ID = "W7S4B963AI9ELAW";
const FITNESS_ACCESS_GROUP_ID = "access-b232b0a3-4713-45b4-a7ab-3daba2faa4d9";

async function callPickaxe(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`https://api.pickaxe.co/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}

async function runSetup() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  const token = process.env.PICKAXE_WORKSPACE_API_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing workspace token" }, { status: 503 });
  }

  const list = await callPickaxe("/studio/deployment/list", token);
  const deployments = Array.isArray((list.data as any)?.data) ? (list.data as any).data : [];
  let deployment = deployments.find((item: any) => item.deploymentId === DEPLOYMENT_ID);

  if (!deployment) {
    const created = await callPickaxe("/studio/deployment/create", token, {
      method: "POST",
      body: JSON.stringify({
        formId: FITNESS_FORM_ID,
        deploymentType: "embed-script-inline",
        deploymentId: DEPLOYMENT_ID,
      }),
    });
    if (!created.ok) {
      return NextResponse.json({ ok: false, stage: "create", result: created }, { status: 502 });
    }
    deployment = (created.data as any)?.data || created.data;
  }

  const assigned = await callPickaxe("/studio/access-group/assign", token, {
    method: "POST",
    body: JSON.stringify({
      data: {
        mode: "append",
        deploymentId: DEPLOYMENT_ID,
        accessGroupIds: [FITNESS_ACCESS_GROUP_ID],
      },
    }),
  });

  if (!assigned.ok) {
    return NextResponse.json({ ok: false, stage: "assign", deployment, result: assigned }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    deploymentId: DEPLOYMENT_ID,
    formId: FITNESS_FORM_ID,
    accessGroupId: FITNESS_ACCESS_GROUP_ID,
    deployment,
    assignment: assigned.data,
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function GET() {
  return runSetup();
}

export async function POST() {
  return runSetup();
}
