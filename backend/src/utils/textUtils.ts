/**
 * Clean raw OCR text from a book page:
 *   1. Join broken mid-sentence lines back into continuous prose
 *   2. Remove footer/header patterns (page numbers, series titles, publisher info)
 *   3. Collapse excess blank lines to at most one paragraph break
 */
export function cleanBookText(text: string): string {
  const lines = text.split('\n');
  const joined: string[] = [];
  let buffer = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      // Blank line → flush buffer and preserve paragraph break
      if (buffer) {
        joined.push(buffer);
        buffer = '';
      }
      joined.push('');
      continue;
    }

    if (!buffer) {
      buffer = line;
    } else {
      // End-of-sentence punctuation (works for both ASCII and curly quotes)
      const endsWithPunctuation = /[.!?"""''\u201c\u201d\u2018\u2019]$/.test(buffer);
      // Next line starts with a lowercase letter (clearly mid-sentence)
      const nextStartsLower = /^[a-z\u00e0-\u01ff]/.test(line);

      if (!endsWithPunctuation || nextStartsLower) {
        buffer += ' ' + line;
      } else {
        joined.push(buffer);
        buffer = line;
      }
    }
  }
  if (buffer) joined.push(buffer);

  // Patterns that identify footer / header / publisher noise
  const footerPatterns: RegExp[] = [
    /^\d+\s*$/,                          // lone page number "7"
    /^\d+\s+câu\s+chuyện/i,              // "109 câu chuyện"
    /^về\s+lòng\s+/i,                    // "về lòng nhân ái"
    /^sinh\s+hoạt\s+cơ\s+sở/i,          // "Sinh hoạt cơ sở..."
    /^hotline[\s\d]+$/i,                 // "hotline 0911 26 77 55"
    /^www\./i,                           // website
    /^nxb\s/i,                           // nhà xuất bản abbrev
    /^nhà\s+xuất\s+bản/i,
    /^tái\s+bản\s+lần/i,
    /^in\s+lần\s+/i,
    /^isbn[\s:]/i,
    /^giá\s*:\s*\d/i,                    // "Giá: 45.000đ"
    /^lời\s+mẹ\s+nhắn/i,                // "Lời mẹ nhắn gửi" sidebox
    /^lời\s+khuyên/i,
  ];

  const filtered = joined.filter((line) => {
    const t = line.trim();
    if (!t) return true; // keep blank lines (paragraph separators)
    return !footerPatterns.some((re) => re.test(t));
  });

  // Collapse runs of more than one blank line into a single blank line
  const final: string[] = [];
  let prevEmpty = false;
  for (const line of filtered) {
    const empty = !line.trim();
    if (empty && prevEmpty) continue;
    final.push(line);
    prevEmpty = empty;
  }

  return final.join('\n').trim();
}
