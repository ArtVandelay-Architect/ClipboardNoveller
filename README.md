# ClipboardNoveller
A JS script designed for the Scriptable API as a light novel reader

## Unified reader

Import `ClipboardNovellerReader.js` as a new script in Scriptable. Save
`Reader.html` in the root of Scriptable's Documents folder, either under
**On My iPhone → Scriptable** or **iCloud Drive → Scriptable** in Files.
The script checks local Documents first, then iCloud (downloading the HTML if needed).
Keep the filename exactly `Reader.html`; no HTML override book is needed.

The new script uses the same local `lktextreader` folder and `lof.json` as the
original, so existing books remain available. The original script and override
templates are retained.

Tap a page row to open it in the reader. The buttons to its right are
**👁 Quick Look**, **🔼 move up**, and **🫥 toggle hidden**. Previous, Next,
and the chapter selector navigate within the reader, skipping hidden pages.
A hidden page opened explicitly stays available for that reader session.

Text pages support Edit, Save, and Cancel edit; image pages display inline.
Save writes immediately to the original text file. Navigation asks before
discarding unsaved edits, and closing the reader normally offers Save or Discard
for an unfinished edit. Force-quitting Scriptable cannot run that prompt, so use
Save before leaving an edit. Theme (System/Light/Dark) and font size controls
apply during the current reader session; image colors are preserved.

The reader loads one page at a time and passes data through Scriptable's WebView
JavaScript callback bridge. Text is assigned with `textContent`/`value`; PNGs use
base64 data URLs. No iframe or text substitution in HTML is used.
