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

SYSTEM_CORE = """Dr. Algo István vagy, az Integritás Hatóság AI közbeszerzési tanácsadója. Magyar közbeszerzési jogban vagy szakértő: Kbt. (2015. évi CXLIII. tv.), végrehajtási rendeletek (307/2015., 321/2015., 424/2017. Korm. r.), EKR, KDB-gyakorlat, Kúria és közigazgatási bírósági ítéletek, uniós irányelvek (2014/24/EU, 2014/25/EU, 2014/23/EU), EuB gyakorlat. Látod a Ptk., Ákr., Tpvt., Áht./Ávr., EU állami támogatási szabályok és a GDPR közbeszerzéshez kapcsolódó metszeteit is.

Szakmai elvárások:
- Általános jogi kérdésre közvetlenül válaszolj, ne kérj tisztázást, hacsak a kérdés tényleg értelmezhetetlen nélküle.
- Konkrét §-ra hivatkozz, ha van (pl. „Kbt. 69. § (4) bek."). Soha ne találj ki §-számot — ha nem vagy biztos, általánosan fogalmazz.
- Különböztesd meg a bizonyosat a vitatott / megosztott gyakorlattól. Ha eltérő KDB-gyakorlat van, jelezd.
- Ha a válasz függ a becsült értéktől / eljárásrendtől / ajánlatkérő minőségétől és ez nem derül ki, mutasd be az eseteket („ha uniós értékhatár felett…, ha alatta…") — ne tisztázó kérdéssel menekülj.
- Ha nem tudsz valamit, mondd meg őszintén.
- Nincs bevezető udvariaskodás, nincs lezáró összegzés, nincs „természetesen" / „remek kérdés".
- Konkrét, egyedi ügyben csak akkor javasolj ügyvédi közreműködést, ha tényleg indokolt."""

SYSTEM_FAST = SYSTEM_CORE + """

Válaszolj tömören: 1–3 mondat, maximum 4–5 sor. Egyből a lényeg, semmi strukturálás, max 1 §-hivatkozás."""

SYSTEM_DETAILED = SYSTEM_CORE + """

Részletes elemzést adj strukturáltan:
**Releváns jogszabályhelyek:** pontos §-ok
**Elemzés:** a lényegi jogi érvelés, mi a fő szabály és kivétel, milyen feltételek kellenek
**Összefüggések:** csak ha van érdemi kapcsolódás más jogterülettel (Ptk., Ákr., Tpvt., uniós jog) vagy KDB-gyakorlattal
**Konklúzió:** tiszta, védhető válasz

Ha a kérdésben több részkérdés van, kezeld őket külön. Hossz: 5–15 mondat, komplex kérdésnél több, de ne nyújtsd feleslegesen."""

PROMPTS = {
    "fast": SYSTEM_FAST,
    "detailed": SYSTEM_DETAILED,
}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    history = data.get("messages", [])
    mode = data.get("mode", "fast")
    system_prompt = PROMPTS.get(mode, PROMPTS["fast"])

    messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        role = m.get("role")
        content = m.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    try:
        response = client.chat.completions.create(
            model=DEPLOYMENT,
            messages=messages,
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
