// Fast CSV reader: a drop-in for csv-reader 1.0.0.
// run(input) returns {columns, rows, errors} identical to csv-reader 1.0.0
// for every input, including broken CSV (see the policy below).
//
// Speed comes from scanning with indexOf and taking fields with slice(),
// instead of reading one character at a time and building each field by
// concatenation. One pass, no regex in the hot path, minimal allocation.
// The broken-row policy is csv-reader 1.0.0's own:
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a quoted field runs to the next quote that is not doubled ("" inside is
//     one quote, CRLF or lone CR inside is LF); text after its closing quote,
//     up to the next comma or line break, is appended as it stands
//     (quote_junk); a quote that never closes is literal and the text after
//     it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is literal; fields stay strings;
//   - columns is the first record when header is true, else null; rows holds
//     the rest, each padded (short_row) or cut (long_row) to the first
//     record's width; errors are {code, line, row} in the order met.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // Read an unquoted field starting at pos, with `base` as its initial value
  // (the quoted content, when this is the junk after a closing quote).
  // Returns {value, ended, added}; added counts the characters appended here.
  function readUnquoted(base) {
    let value = base;
    let added = 0;
    for (;;) {
      // Nearest of comma / LF / CR.
      let end = n;
      let kind = END;
      const ci = text.indexOf(',', pos);
      if (ci !== -1 && ci < end) { end = ci; kind = COMMA; }
      const li = text.indexOf('\n', pos);
      if (li !== -1 && li < end) { end = li; kind = LINE_BREAK; }
      const ri = text.indexOf('\r', pos);
      if (ri !== -1 && ri < end) { end = ri; kind = 3; }
      if (kind === COMMA) {
        const seg = text.slice(pos, end);
        value += seg;
        added += seg.length;
        pos = end + 1;
        return { value, ended: COMMA, added };
      }
      if (kind === LINE_BREAK) {
        const seg = text.slice(pos, end);
        value += seg;
        added += seg.length;
        pos = end + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (kind === END) {
        const seg = text.slice(pos, end);
        value += seg;
        added += seg.length;
        pos = n;
        return { value, ended: END, added };
      }
      // A CR: CRLF ends the record, a lone CR is dropped (stray_cr).
      if (text.charCodeAt(end + 1) === 10) {
        const seg = text.slice(pos, end);
        value += seg;
        added += seg.length;
        pos = end + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      const seg = text.slice(pos, end);
      value += seg;
      added += seg.length;
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = end + 1;
    }
  }

  // Build a quoted field's value from its inner text [from, to):
  // "" becomes one quote, CR / LF / CRLF each become one LF (counting lines).
  function buildQuotedValue(from, to) {
    const parts = [];
    let segStart = from;
    let i = from;
    for (;;) {
      let next = to;
      let kind = 0;
      const qi = text.indexOf('"', i);
      if (qi !== -1 && qi < next) { next = qi; kind = 1; }
      const ri = text.indexOf('\r', i);
      if (ri !== -1 && ri < next) { next = ri; kind = 2; }
      const ni = text.indexOf('\n', i);
      if (ni !== -1 && ni < next) { next = ni; kind = 3; }
      if (kind === 0) break;
      if (kind === 1) {
        parts.push(text.slice(segStart, next));
        parts.push('"');
        i = next + 2;
        segStart = i;
      } else if (kind === 2) {
        parts.push(text.slice(segStart, next));
        parts.push('\n');
        line += 1;
        i = next + (text.charCodeAt(next + 1) === 10 ? 2 : 1);
        segStart = i;
      } else {
        parts.push(text.slice(segStart, next));
        parts.push('\n');
        line += 1;
        i = next + 1;
        segStart = i;
      }
    }
    parts.push(text.slice(segStart, to));
    return parts.join('');
  }

  // Read a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // Find the closing quote: a '"' not followed by another '"'.
    let searchFrom = pos + 1;
    let close = -1;
    // A doubled quote inside means the field is not clean; remember it here
    // so the check below skips one more indexOf scan over the inner text.
    let doubled = false;
    for (;;) {
      const q = text.indexOf('"', searchFrom);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) { doubled = true; searchFrom = q + 2; continue; }
      close = q;
      break;
    }
    if (close === -1) {
      // Never closes: the quote is literal, re-read the rest as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    // The inner text is clean when it holds no quote, CR or LF. The quote
    // part is already known: `doubled` is true exactly when a doubled quote
    // sits before the closing quote, so no third indexOf scan is needed.
    const ri = text.indexOf('\r', open + 1);
    const ni = text.indexOf('\n', open + 1);
    const clean = !doubled && (ri === -1 || ri >= close) && (ni === -1 || ni >= close);
    const value = clean ? text.slice(open + 1, close) : buildQuotedValue(open + 1, close);
    pos = close + 1;
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; return { value, ended: COMMA }; }
    if (c === 10) { pos += 1; line += 1; return { value, ended: LINE_BREAK }; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; return { value, ended: LINE_BREAK }; }
    // Text after the closing quote is appended as it stands (quote_junk).
    const junk = readUnquoted(value);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = (header && columns === null) ? null : rows.length;

    const fields = [];
    let ended;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      const field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
      ended = field.ended;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
