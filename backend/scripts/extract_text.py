import sys
import pymupdf

doc = pymupdf.open(stream=sys.stdin.buffer.read(), filetype="pdf")
for page in doc:
    text = page.get_text()
    if text.strip():
        sys.stdout.write(text)
