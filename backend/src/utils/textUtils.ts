/**
 * Clean raw OCR text from a book page:
 *   1. Join broken mid-sentence lines back into continuous prose
 *   2. Remove footer/header patterns (page numbers, series titles, publisher info)
 *   3. Remove moral lesson block at end of story if detected
 *   4. Collapse excess blank lines to at most one paragraph break
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
  // Tests against the FULL trimmed line (not just start) for mid-line matches
  const footerPatterns: RegExp[] = [
    /^\d+\s*$/,                              // lone page number "7"
    /^\d+\s*(câu|truyện|bài)/i,             // "109 câu chuyện", "5 bài"
    /\d+\s+câu\s+chuyện/i,                  // anywhere in line
    /^về\s+lòng\s+/i,                        // "về lòng nhân ái"
    /^sinh\s+hoạt\s+cơ\s+sở/i,              // "Sinh hoạt cơ sở..."
    /^hotline[\s\d]+$/i,                     // "hotline 0911 26 77 55"
    /^www\./i,                               // website
    /^nxb\s/i,                               // nhà xuất bản abbrev
    /^nhà\s+xuất\s+bản/i,
    /^tái\s+bản\s+lần/i,
    /^in\s+lần\s+/i,
    /^isbn[\s:]/i,
    /^giá\s*:\s*\d/i,                        // "Giá: 45.000đ"
    /lời\s+mẹ\s+nhắn/i,                     // anywhere in line
    /lời\s+nhắn\s+gửi/i,
    /^lời\s+khuyên/i,
    /bài\s+học\s+cuộc\s+sống/i,
    /^giúp\s+đỡ\s+người\s+khác/i,
    /^trang\s+\d+/i,                          // "Trang 7"
    /^chủ\s+đề\s*:/i,                         // "Chủ đề: ..."
  ];

  const filtered = joined.filter((line) => {
    const t = line.trim();
    if (!t) return true; // keep blank lines (paragraph separators)
    return !footerPatterns.some((re) => re.test(t));
  });

  // Remove moral lesson block — short paragraph(s) at the end of the text
  // that start with common moral lesson openers
  const moralStartPatterns = [
    /^(giúp\s+đỡ|hãy\s+luôn|chúng\s+ta\s+nên|bài\s+học|qua\s+câu\s+chuyện|câu\s+chuyện\s+dạy|đây\s+là\s+bài)/i,
  ];
  const nonEmpty = filtered.filter(l => l.trim());
  const checkLast = Math.min(3, nonEmpty.length);
  const lastParagraphs = nonEmpty.slice(-checkLast);
  const moralIdx = lastParagraphs.findIndex(p =>
    moralStartPatterns.some(pat => pat.test(p.trim()))
  );
  let finalLines = filtered;
  if (moralIdx !== -1) {
    const cutFrom = nonEmpty.length - (checkLast - moralIdx);
    // Find the position in filtered[] corresponding to cutFrom-th non-empty line
    let nonEmptyCount = 0;
    let cutPos = filtered.length;
    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i].trim()) {
        if (nonEmptyCount === cutFrom) { cutPos = i; break; }
        nonEmptyCount++;
      }
    }
    finalLines = filtered.slice(0, cutPos);
  }

  // Collapse runs of more than one blank line into a single blank line
  const final: string[] = [];
  let prevEmpty = false;
  for (const line of finalLines) {
    const empty = !line.trim();
    if (empty && prevEmpty) continue;
    final.push(line);
    prevEmpty = empty;
  }

  return final.join('\n').trim();
}
