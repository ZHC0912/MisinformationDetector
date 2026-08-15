"""
Shared LIAR speaker-metadata formatting.
File: notebooks/_liar_meta.py

Used by 03_train_liar_stage2.py (training/valid text) and
04_build_eval_data.py (benchmark text) so the input format the model is
trained on and the format it is evaluated on can never drift apart.

Why: the LIAR paper (Wang, 2017) showed speaker metadata (who said it,
their party/job) adds several points over statement-only models — and it
directly backs this project's "influential sources" framing: the model
literally conditions on the speaker's identity.

Format produced:
  "Barack Obama (Democrat, President) said: <statement>"
  "Blog posting said: <statement>"            (no party/job available)
  "<statement>"                               (no speaker at all)

Optional evidence (LIAR-PLUS, 2026-07-28): when a justification passage is
supplied, it is appended as an "Evidence:" clause, e.g.
  "Barack Obama (Democrat, President) said: <statement> Evidence: <justification>"
LIAR-PLUS (Alhindi et al., 2018) extends LIAR with a short evidence passage
extracted from the PolitiFact article (the ruling sentence stripped out).
Published statement+justification models score several points above
statement-only. The suffix is only added when a justification is present, so
plain user text and ISOT articles are unaffected.
"""

import csv
import re

# LIAR tsv column indices (train/valid/test all share this layout)
COL_ID, COL_LABEL, COL_STATEMENT, COL_SPEAKER, COL_JOB, COL_PARTY = 0, 1, 2, 4, 5, 7

# LIAR-PLUS layout adds a leading row-index column (so every field shifts +1)
# and appends the extracted justification as the LAST column.
PLUS_COL_ID = 1

# Party values that carry no information — omitted from the prefix
_NO_PARTY = {"", "none"}


def humanize(slug: str) -> str:
    """'barack-obama' -> 'Barack Obama', 'talk-show-host' -> 'Talk Show Host'."""
    if not slug:
        return ""
    return " ".join(w.capitalize() for w in re.split(r"[-_]+", slug.strip()) if w)


def format_statement(statement: str, speaker: str = "", job: str = "",
                     party: str = "", justification: str = "") -> str:
    """Prepend speaker metadata (and optionally append evidence) to a statement.

    Falls back gracefully: missing fields are simply omitted, and with no
    speaker at all the raw statement is used unchanged — so the model still
    handles plain user-typed text (and ISOT articles) fine. When a LIAR-PLUS
    `justification` is supplied it is appended as an "Evidence:" clause; when
    absent (the default, and always for user text/ISOT) nothing is appended,
    so this stays backward-compatible with the metadata-only format.
    """
    speaker = humanize(speaker)
    if speaker:
        details = []
        p = (party or "").strip().lower()
        if p not in _NO_PARTY:
            details.append(humanize(p))
        job = (job or "").strip()
        if job:
            details.append(job)
        prefix = f"{speaker} ({', '.join(details)})" if details else speaker
        text = f"{prefix} said: {statement}"
    else:
        text = statement

    justification = (justification or "").strip()
    if justification:
        text = f"{text} Evidence: {justification}"
    return text


def row_fields(row: list) -> dict:
    """Extract the fields this project uses from a raw LIAR tsv row."""
    def _get(i):
        return row[i].strip() if len(row) > i and isinstance(row[i], str) else ""
    return {
        "id":        _get(COL_ID),
        "label":     _get(COL_LABEL).lower(),
        "statement": _get(COL_STATEMENT),
        "speaker":   _get(COL_SPEAKER),
        "job":       _get(COL_JOB),
        "party":     _get(COL_PARTY),
    }


def load_justification_map(plus_tsv_path: str) -> dict:
    """Build {id.json -> justification} from a LIAR-PLUS tsv (train2/val2/test2).

    LIAR-PLUS rows carry the statement id at column `PLUS_COL_ID` and the
    extracted justification passage as the last column. Rows are keyed to the
    plain-LIAR rows by this id, so the justification is joined onto the exact
    same statements the metadata pipeline already uses. Returns {} if the file
    is missing, so callers degrade to the metadata-only format automatically.
    """
    import os
    mapping: dict = {}
    if not plus_tsv_path or not os.path.exists(plus_tsv_path):
        return mapping
    with open(plus_tsv_path, encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t"):
            if len(row) >= 16:
                key = row[PLUS_COL_ID].strip()
                just = row[-1].strip() if isinstance(row[-1], str) else ""
                if key:
                    mapping[key] = just
    return mapping
