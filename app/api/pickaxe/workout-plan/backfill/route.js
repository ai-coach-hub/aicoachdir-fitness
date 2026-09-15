export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request) {
  const origin = request.headers.get('origin')?.trim() || '';
  if (origin !== 'https://studio.pickaxe.co') {
    return new Response(null, {
      status: 403,
      headers: { 'Cache-Control': 'no-store', Vary: 'Origin' },
    });
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

export async function POST() {
  return Response.json(
    { ok: false, message: 'Workout bridge migration is retired.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
