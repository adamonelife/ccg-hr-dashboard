// lib/multipart.mjs — parses a multipart/form-data request body for real
// file uploads (Documents' "upload a file" path, alongside the existing
// "paste a Drive link" path — see lib/documents.mjs).
//
// api/[[...path]].mjs's body handling only fully parses application/json
// bodies into req.body; anything else (this included) is left as a raw
// Buffer on req.rawBody, with the original Content-Type header (which
// carries the multipart boundary) still on req.headers. This file turns
// that raw buffer back into { fields, file } using busboy — a small,
// well-established parser, used here specifically because hand-rolling
// multipart boundary parsing is genuinely easy to get subtly wrong
// (binary-safe boundary scanning, encoding edge cases), unlike the rest of
// this codebase's external API calls, which are plain fetch with no SDK.

import busboy from 'busboy';
import { Readable } from 'stream';

// Returns { fields: {name: value}, file: {filename, mimeType, buffer} | null }.
// Assumes at most one uploaded file per request — Documents only ever
// sends zero or one.
export function parseMultipart(buffer, contentType) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let file = null;
    const bb = busboy({ headers: { 'content-type': contentType } });

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        if (chunks.length > 0) {
          file = { filename: info.filename, mimeType: info.mimeType, buffer: Buffer.concat(chunks) };
        }
      });
    });

    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, file }));

    Readable.from(buffer).pipe(bb);
  });
}
