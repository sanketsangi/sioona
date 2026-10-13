# Conversation export formats (CB-12)

Upload CSV, Sioona JSON, Intercom JSON, WhatsApp TXT, XLSX, EML, or MBOX through
`POST /api/ingest`. Parsing belongs to the web server. Every adapter returns
`IngestConversationInput`; `toStoreRecords` performs the shared PII/name redaction
and customer pseudonymization before persisted records reach evidence/detection.
Existing CSV/JSON/Intercom/WhatsApp mappings remain in `ingest.ts` and
`ingest-platforms.ts`. Their legacy text/time defaults remain unchanged.

## XLSX mapping

Each nonempty worksheet uses the same header row and message-row contract:

| Column | Mapping |
| --- | --- |
| `conversation_id` (required) | Exact export identity; one conversation across sheets |
| `role` (required) | `customer`, `agent`, or `system` |
| `content` (required) | Exact cell text, including whitespace and Unicode |
| `customer_name` | Shared `Customer <hash>` pseudonym and message-name scrubbing |
| `timestamp` | ISO timestamp with explicit timezone, or an Excel date cell |
| `message_id` | Optional per-conversation deduplication key |
| `channel` | Optional channel; defaults to `upload` |
| `ground_truth` | Existing `lead`/`retention`/`upsell`/`none` values |

Rows with the same conversation identity must agree on customer, channel and
label. Identical duplicate message IDs are collapsed; conflicting duplicate IDs
reject the whole upload. Without message IDs, identical role/content/time rows
are collapsed. Duplicate IDs are scoped to each conversation. Empty sheets are
ignored, while header-only exports and empty messages are rejected. Formulas
never execute: only cached string/number values are read. Rich-text runs are
concatenated; hyperlink destinations are ignored. Macro-bearing, encrypted,
ZIP64, external-link, alternate-path and malformed workbooks are unsupported.

## Email mapping and supported subset

EML is a single RFC 5322 message. MBOX supports mboxrd `From ` envelope separators
and one-level unescaping of `>From ` body lines. This is not support for arbitrary
vendor email spreadsheets, PST/OST, compressed mailboxes, or every mbox dialect.

- `Message-ID` identifies a message; `References` (or `In-Reply-To`) connects
  threads, including ancestors absent from the export. Without an ID, a SHA256
  of the raw message provides a stable fallback. Identical duplicate IDs collapse;
  conflicting duplicates reject the whole upload.
- Plain text is preferred over HTML. UTF-8 and ASCII text, quoted-printable and
  base64 are supported. Invalid byte sequences, transfer encoding, multipart
  structure or unsupported charsets reject the upload. Decoded plain text keeps
  exact whitespace, line endings and Unicode; it is never trimmed or normalized.
- HTML-only email becomes local plain text using `html-to-text`, dropping scripts,
  styles, images and link destinations. Evidence hashes and offsets refer to the
  persisted **redacted plain text**, not to the original HTML markup/MIME bytes.
- Attachments and embedded forwarded messages are ignored; nothing is fetched,
  executed, opened or sent. Multiple body parts use the first plain-text body,
  falling back to the first HTML body.
- `From` supplies the customer display label. `X-Sioona-Role` explicitly specifies
  `customer`, `agent`, or `system`; default is `customer`. Exporters must label
  support replies to preserve direction, since From/To cannot identify the tenant's
  support mailbox. All identified customer participants are scrubbed in a thread.
- Messages sort by UTC timestamp and exact Message-ID as a tie-breaker. Root
  reference identities remain stable across export order for ordinary reply trees.

## Time, limits, errors and preview

New formats use the documented sentinel `1970-01-01T00:00:00.000Z` when a timestamp
is absent, avoiding ingestion-time-dependent replay. Supplied timestamps must
have an explicit timezone and parse successfully; timezone-free strings reject
rather than guessing. Excel date cells are interpreted as UTC wall time.

Limits: 10 MiB total file bytes, 16 files per request, 11 MiB multipart envelope,
40 MiB expanded XLSX ZIP bytes, 256 archive entries, 32 sheets, 32 columns,
10,000 message rows per request (before workbook deduplication), 100,000 UTF-16
code units per message, 200,000 XML elements per entry and XML depth 64. Email
limits: 128 MIME parts, depth 16 and 64 KiB headers per message. ZIP CRC, actual
expanded lengths, paths and decoded XML coordinates are validated before the
workbook reader allocates worksheet rows.

The failure policy is **all-or-nothing validation**: all selected files parse
before store access, detection or publication. Errors identify a sheet/row or
email index and a safe reason without echoing customer text. Correct the indicated
row or re-export the file and retry. This validation guarantee does not change
existing publication/retry semantics after successful parsing.

The XLSX/email upload UI offers **Preview mapping**. It posts `preview=true` to
that same authenticated endpoint and returns mapping descriptions plus normalized
conversation/message counts. Preview validates through `toStoreRecords`, returns
no transcript/customer data, and performs no store access or LLM calls. Upload &
Detect remains the explicit action that continues into the existing pilot flow.
