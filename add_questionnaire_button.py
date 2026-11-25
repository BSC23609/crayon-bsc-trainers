"""Run once inside the crayon-web folder:  python add_questionnaire_button.py
Adds the Call Questionnaire button to public/insights.html (safe to run again)."""
from pathlib import Path
p = Path(__file__).resolve().parent / "public" / "insights.html"
if not p.exists():
    raise SystemExit("public/insights.html not found - run this inside the crayon-web folder.")
s = p.read_text(encoding="utf-8")
tag = '<script src="questionnaire-button.js"></script>'
if tag in s:
    print("Already added - nothing to do.")
else:
    i = s.rfind("</body>")
    if i < 0:
        raise SystemExit("Could not find </body> in insights.html")
    p.write_text(s[:i] + tag + "\n" + s[i:], encoding="utf-8")
    print("Done - Call Questionnaire button added to insights.html. Now run push.bat")
