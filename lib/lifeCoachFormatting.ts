/**
 * Normalize Markdown-looking model replies into readable plain text.
 * This is a formatter, not a generator: never invent dates or rewrite
 * member input. Apply on new AI replies and when displaying saved replies.
 */
export function cleanLifeCoachText(input: string): string {
  const lines = input
    .replace(/\r\n?/g, "\n")
    .replace(/\\([*#~_\x60\[\]\\])/g, "$1")
    .split("\n");
  const output = lines.map((source) => {
    let line = source.trim();
    if (/^(?:[-*_]\s*){3,}$/.test(line) || /^\x60{3,}/.test(line)) return "";
    if (/^Week starting:\s*\[(?:Date|Start date)\]\s*$/i.test(line)) return "";
    if (/^Tracking:\s*(?:[☐☑☒]|\[[ xX]\])\s*(?:Completed|Done)?\s*$/i.test(line)) return "";
    if (/^Notes:\s*$/i.test(line)) return "";
    line = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/\x60([^\x60\n]+)\x60/g, "$1")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^ )]+)\)/g, "$1 ($2)")
      .replace(/\[\s?\]/g, "")
      .replace(/[☐☑☒]/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    return line;
  });
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function isLifeCoachSectionHeading(line: string): boolean {
  const value = line.trim();
  return /^Day\s+\d+\s*:/i.test(value) ||
    /^Your .{2,90}(?:Plan|Guide)$/i.test(value) ||
    /^(?:If You Miss a Day|Weekly Reflection|Next Steps|Your Action Plan|Plan Overview)$/i.test(value);
}
