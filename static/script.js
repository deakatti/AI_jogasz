const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const resetBtn = document.getElementById('reset-btn');
const voiceToggle = document.getElementById('voice-toggle');
const statusEl = document.getElementById('status');
const avatarSvg = document.querySelector('.avatar-svg');
const mouthInner = document.getElementById('mouth-inner');
const lipLower = document.getElementById('lip-lower');
const lidL = document.getElementById('lid-l');
const lidR = document.getElementById('lid-r');

const LIP_LOWER_CLOSED = 'M 108 206 Q 120 214 130 215 Q 140 214 152 206 Q 140 218 130 219 Q 120 218 108 206 Z';

let history = [];
let sending = false;
let hungarianVoice = null;
let mouthAnimId = null;
let currentMode = 'fast';

function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
}

function addMessage(role, text, { isError = false } = {}) {
    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble' + (isError ? ' error' : '');
    bubble.textContent = text;
    wrap.appendChild(bubble);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    return wrap;
}

function addTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'message assistant';
    wrap.id = 'typing-indicator';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    wrap.appendChild(bubble);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
}

function removeTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

// --- Voice / TTS ---

function pickHungarianVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const hu = voices.find(v => /^hu(-|_)/i.test(v.lang)) || voices.find(v => /hungar/i.test(v.name));
    return hu || null;
}

function initVoices() {
    hungarianVoice = pickHungarianVoice();
    if (!hungarianVoice && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
            hungarianVoice = pickHungarianVoice();
        };
    }
}

function stripForTTS(text) {
    return text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/#+\s*/g, '')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .trim();
}

function speak(text) {
    if (!voiceToggle.checked) return;
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(stripForTTS(text));
    utter.lang = 'hu-HU';
    if (hungarianVoice) utter.voice = hungarianVoice;
    utter.rate = 1.0;
    utter.pitch = 1.0;

    utter.onstart = () => {
        setStatus('beszél…', 'speaking');
        avatarSvg.classList.add('speaking');
        startMouthAnimation();
    };
    utter.onend = utter.onerror = () => {
        setStatus('készenlétben');
        avatarSvg.classList.remove('speaking');
        stopMouthAnimation();
    };

    window.speechSynthesis.speak(utter);
}

// --- Mouth animation (fake amplitude, noise-driven) ---

function startMouthAnimation() {
    stopMouthAnimation();
    const start = performance.now();
    const tick = (now) => {
        const t = (now - start) / 1000;
        const base = 0.5 + 0.5 * Math.sin(t * 18);
        const wiggle = 0.5 + 0.5 * Math.sin(t * 27 + 1.3);
        const slow = 0.5 + 0.5 * Math.sin(t * 6 + 0.7);
        const noise = Math.random() * 0.3;
        const v = Math.max(0, Math.min(1, 0.3 * base + 0.3 * wiggle + 0.25 * slow + noise * 0.3));

        // Mouth inner (dark opening)
        const ry = 0.8 + v * 7.5;
        mouthInner.setAttribute('ry', ry.toFixed(2));

        // Lower lip slides down with opening
        const shift = v * 5;
        const midY = 215 + shift;
        const outerY = 219 + shift * 1.3;
        lipLower.setAttribute('d',
            `M 108 206 Q 120 ${214 + shift} 130 ${midY} Q 140 ${214 + shift} 152 206 Q 140 ${outerY} 130 ${outerY + 1} Q 120 ${outerY} 108 206 Z`);

        mouthAnimId = requestAnimationFrame(tick);
    };
    mouthAnimId = requestAnimationFrame(tick);
}

function stopMouthAnimation() {
    if (mouthAnimId) cancelAnimationFrame(mouthAnimId);
    mouthAnimId = null;
    mouthInner.setAttribute('ry', '0.8');
    lipLower.setAttribute('d', LIP_LOWER_CLOSED);
}

// --- Blinking ---

function blink() {
    const lids = [lidL, lidR];
    lids.forEach(l => l.setAttribute('height', '6'));
    setTimeout(() => lids.forEach(l => l.setAttribute('height', '0')), 130);
}

function scheduleBlink() {
    const next = 2500 + Math.random() * 3500;
    setTimeout(() => { blink(); scheduleBlink(); }, next);
}

// --- Chat ---

async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || sending) return;

    sending = true;
    sendBtn.disabled = true;
    inputEl.value = '';

    // Stop any ongoing speech when new message sent
    window.speechSynthesis && window.speechSynthesis.cancel();
    stopMouthAnimation();

    addMessage('user', text);
    history.push({ role: 'user', content: text });
    addTyping();
    setStatus('gondolkodik…', 'thinking');

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: history, mode: currentMode }),
        });
        const data = await res.json();
        removeTyping();

        if (!res.ok) {
            addMessage('assistant', `Hiba történt: ${data.error || res.statusText}`, { isError: true });
            setStatus('hiba');
        } else {
            addMessage('assistant', data.reply);
            history.push({ role: 'assistant', content: data.reply });
            setStatus('készenlétben');
            speak(data.reply);
        }
    } catch (err) {
        removeTyping();
        addMessage('assistant', `Hálózati hiba: ${err.message}`, { isError: true });
        setStatus('hiba');
    } finally {
        sending = false;
        sendBtn.disabled = false;
        inputEl.focus();
    }
}

sendBtn.addEventListener('click', sendMessage);

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

resetBtn.addEventListener('click', () => {
    window.speechSynthesis && window.speechSynthesis.cancel();
    stopMouthAnimation();
    history = [];
    chatEl.innerHTML = '';
    addMessage('assistant',
        'Új beszélgetés indult. Miben segíthetek a magyar jog, különösen a közbeszerzés területén?');
    setStatus('készenlétben');
});

voiceToggle.addEventListener('change', () => {
    if (!voiceToggle.checked) {
        window.speechSynthesis && window.speechSynthesis.cancel();
        stopMouthAnimation();
        setStatus('készenlétben');
    }
});

// --- Speech recognition (mic) ---

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let recognizing = false;
let autoSendAfterRecognition = true;

if (!SR) {
    micBtn.disabled = true;
    micBtn.title = 'A böngésződ nem támogatja a beszédfelismerést (használj Chrome-ot vagy Edge-et)';
} else {
    recognition = new SR();
    recognition.lang = 'hu-HU';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onstart = () => {
        recognizing = true;
        finalTranscript = '';
        micBtn.classList.add('recording');
        micBtn.title = 'Felvétel leállítása';
        setStatus('figyel…', 'recording');
        // Stop any ongoing TTS so it doesn't feed back into the mic
        window.speechSynthesis && window.speechSynthesis.cancel();
        stopMouthAnimation();
    };

    recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) finalTranscript += res[0].transcript;
            else interim += res[0].transcript;
        }
        inputEl.value = (finalTranscript + interim).trim();
    };

    recognition.onerror = (event) => {
        const map = {
            'no-speech': 'Nem hallottam semmit.',
            'audio-capture': 'Nincs mikrofon vagy nem elérhető.',
            'not-allowed': 'Mikrofon engedély megtagadva.',
            'network': 'Hálózati hiba a felismerés közben.',
        };
        setStatus(map[event.error] || ('felismerési hiba: ' + event.error));
    };

    recognition.onend = () => {
        recognizing = false;
        micBtn.classList.remove('recording');
        micBtn.title = 'Beszéd (Chrome / Edge)';
        if (statusEl.textContent === 'figyel…') setStatus('készenlétben');
        const text = inputEl.value.trim();
        if (autoSendAfterRecognition && text) {
            sendMessage();
        }
    };

    micBtn.addEventListener('click', () => {
        if (recognizing) {
            recognition.stop();
        } else {
            try {
                inputEl.value = '';
                recognition.start();
            } catch (e) {
                setStatus('nem indul a mikrofon');
            }
        }
    });
}

// --- Mode switch ---

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        currentMode = btn.dataset.mode;
    });
});

initVoices();
scheduleBlink();
inputEl.focus();
