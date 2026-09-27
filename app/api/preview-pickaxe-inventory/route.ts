import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function pickaxe(path: string, token: string) {
  const response = await fetch(`https://api.pickaxe.co/v1${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  const token = process.env.PICKAXE_WORKSPACE_API_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing workspace token" }, { status: 503 });
  }

  const [whoami, deployments, accessGroups, portals] = await Promise.all([
    pickaxe("/studio/whoami", token),
    pickaxe("/studio/deployment/list", token),
    pickaxe("/studio/access-group/list", token),
    pickaxe("/studio/portal/list", token),
  ]);

  const deploymentData = Array.isArray((deployments.data as any)?.data)
    ? (deployments.data as any).data.map((item: any) => ({
        deploymentId: item.deploymentId,
        name: item.name,
        type: item.type,
        visibility: item.visibility,
        formId: item.formId,
        pickaxeName: item.pickaxeName,
        path: item.path,
        accessGroupId: item.accessGroupId ?? null,
      }))
    : deployments.data;

  const accessGroupData = Array.isArray((accessGroups.data as any)?.data)
    ? (accessGroups.data as any).data.map((item: any) => ({
        id: item.id ?? item.accessGroupId ?? item._id ?? null,
        name: item.name,
        displayName: item.displayName,
        type: item.type,
        limit: item.limit,
        limitInterval: item.limitInterval,
        price: item.price ?? item.amount ?? null,
        currency: item.currency ?? null,
      }))
    : accessGroups.data;

  const portalData = Array.isArray((portals.data as any)?.data)
    ? (portals.data as any).data.map((item: any) => ({
        portalId: item.portalId,
        primaryAccessGroupId: item.primaryAccessGroupId,
        name: item.name,
        path: item.path,
        items: item.items,
      }))
    : portals.data;

  return NextResponse.json({
    ok: true,
    whoami: whoami.data,
    deployments: deploymentData,
    accessGroups: accessGroupData,
    portals: portalData,
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
