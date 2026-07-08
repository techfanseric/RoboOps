# RoboOps materials archive

This folder stores original project materials that should not live only in chat history, Downloads, or temporary working folders.

## Folder Rules

| Folder | Content | Format |
| --- | --- | --- |
| `audio/` | Original meeting, interview, field, and review recordings | Preferred: `.m4a` AAC-LC, mono, 64-96 kbps. Acceptable for web-first capture: `.opus` at 24-48 kbps. |
| `transcripts/` | Original transcription text converted from recordings | `.txt`, UTF-8, preserve speaker names and timestamps when available. |
| `summaries/` | Structured summaries, decisions, requirements, and action items | `.md`, UTF-8, one file per recording or source event. |

## Naming

Use the same leading timestamp for related files:

```text
YYYYMMDDHHMMSS-topic.audio.m4a
YYYYMMDDHHMMSS-topic-transcript.txt
YYYYMMDDHHMMSS-topic-summary.md
```

When an audio file is not available, keep the transcript and summary using the same timestamp. Do not invent an audio placeholder that looks like a real recording.

## Metadata

Every summary should include:

- Source time and topic.
- Related recording path, if available.
- Transcript path.
- Summary owner.
- Business context.
- Decisions.
- Requirements.
- Open facts to verify.
- Follow-up actions.

## Product Implication

RoboOps itself should include an information-asset archive for recordings, transcripts, summaries, field notes, customer interviews, and operational reviews. These assets need data scope, permission control, retention rules, and audit logs.
