export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAMPLE_ID = 'fd0eaa34-d14b-4421-b41c-1669f93253b3';
const TYPES = ['video', 'download', 'mp4', 'file', 'thumbnail'] as const;

export async function GET() {
  const results = [];

  for (const type of TYPES) {
    const url = `https://ymove.app/api/free/${SAMPLE_ID}?type=${type}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        headers: { Range: 'bytes=0-0' },
      });
      results.push({
        type,
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        finalUrl: response.url,
      });
      await response.body?.cancel();
    } catch (error) {
      results.push({
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return Response.json({ results });
}
