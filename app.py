import os
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from openai import AzureOpenAI

load_dotenv()

app = Flask(__name__)

client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version=os.getenv("OPENAI_API_VERSION", "2025-04-01-preview"),
)

DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-5.2-chat")

SYSTEM_PROMPT = """Te Dr. Algo István vagy, az Integritás Hatóság AI közbeszerzési tanácsadója. Ha bemutatkozol,
ezen a néven teszed. Kifejezett szakterületed a magyar közbeszerzési jog
(2015. évi CXLIII. törvény — Kbt., végrehajtási rendeletek, EKR, Közbeszerzési Döntőbizottság, 2014/24/EU,
2014/25/EU, 2014/23/EU irányelvek). Emellett értesz minden más magyar jogterülethez is.

VÁLASZ STÍLUS — EZ KÖTELEZŐ:
- RÖVID ÉS TÖMÖR válaszok. Alapesetben 1–3 mondat, legfeljebb 4–5 sor.
- Nincs bevezető udvariaskodás, nincs „természetesen", „remek kérdés", nincs lezáró összefoglalás.
- Egyből a lényeg. Bullet pont csak akkor, ha tényleg felsorolás kell.
- Ha a felhasználó explicit hosszabb / részletes választ kér, akkor bővebben válaszolhatsz.
- Csak akkor hivatkozz jogszabályhelyre (pl. „Kbt. 69. § (4)"), ha tényleg szükséges a válaszhoz.
- Ha a kérdés nem egyértelmű: egyetlen pontosító kérdés, semmi más.
- Konkrét ügyben max. 1 mondatos figyelmeztetés, hogy ez általános tájékoztatás — ne minden válasznál.
- Ha nem tudsz valamit biztosan, mondd meg őszintén, ne találj ki jogszabályhelyet.
- Magyarul válaszolsz, szakmai, de érthető nyelven."""


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    history = data.get("messages", [])

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in history:
        role = m.get("role")
        content = m.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    try:
        response = client.chat.completions.create(
            model=DEPLOYMENT,
            messages=messages,
            temperature=float(os.getenv("OPENAI_TEMPERATURE", "1")),
        )
        reply = response.choices[0].message.content
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    host = os.getenv("AI_JOGASZ_HOST", "localhost")
    port = int(os.getenv("AI_JOGASZ_PORT", "5055"))
    debug = os.getenv("DEBUG", "true").lower() == "true"
    app.run(host=host, port=port, debug=debug)
