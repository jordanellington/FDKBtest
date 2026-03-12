import sys
import pymupdf
import pymupdf4llm

doc = pymupdf.open(stream=sys.stdin.buffer.read(), filetype="pdf")
md = pymupdf4llm.to_markdown(doc, show_progress=False, page_separators=True)
sys.stdout.write(md)
