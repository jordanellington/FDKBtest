import sys
import pymupdf

doc = pymupdf.open(stream=sys.stdin.buffer.read(), filetype="pdf")
for i, page in enumerate(doc):
    sys.stdout.write(f"\n--- Page {i + 1} ---\n")
    blocks = page.get_text("blocks")
    for block in blocks:
        text = block[4]
        if not text.strip():
            continue
        # Detect table-like blocks: multiple short lines at similar positions
        lines = text.strip().split("\n")
        if len(lines) >= 3 and all(len(l.strip()) < 60 for l in lines):
            sys.stdout.write(f"[TABLE]\n{text}")
        else:
            sys.stdout.write(text)
