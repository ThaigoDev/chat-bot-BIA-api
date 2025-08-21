// =================================================================
// SERVIDOR.JS - Backend para Chatbot com API OpenAI (Chat e Voz)
// =================================================================

// Importação dos módulos necessários
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const OpenAI = require('openai');

// --- Validação da Chave da API na inicialização ---
if (!process.env.OPENAI_API_KEY) {
    console.error("ERRO CRÍTICO: A variável de ambiente OPENAI_API_KEY não foi definida.");
    console.error("Por favor, crie um arquivo .env e adicione a linha: OPENAI_API_KEY=SUA_CHAVE_AQUI");
    process.exit(1); // Encerra o processo se a chave não existir
}

const app = express();

// Middlewares
app.use(express.json()); // Permite que o servidor entenda JSON
app.use(cors()); // Habilita o Cross-Origin Resource Sharing

// --- CONFIGURAÇÃO DA API DA OPENAI ---
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- FUNÇÃO COM LÓGICA DE RETENTATIVA (BACKOFF EXPONENCIAL) ---
async function getBotResponseWithRetry(history, newMessage) {
    const maxRetries = 3;
    let delay = 1000;

    const messages = [
        ...history.map(item => ({
            role: item.role === 'model' ? 'assistant' : 'user',
            content: item.parts[0].text
        })),
        { role: 'user', content: newMessage }
    ];

    for (let i = 0; i < maxRetries; i++) {
        try {
            const chatCompletion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: messages,
            });

            const responseText = chatCompletion.choices[0]?.message?.content;
            if (!responseText) {
                throw new Error("A resposta da IA está vazia ou em um formato inválido.");
            }
            return responseText;

        } catch (err) {
            const status = err.status;
            const isRetryableError = status === 429 || (status >= 500 && status < 600);

            if (isRetryableError && i < maxRetries - 1) {
                console.warn(`API retornou status ${status} (tentativa ${i + 1}/${maxRetries}). Tentando novamente em ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            } else {
                throw err;
            }
        }
    }
}

// --- ROTA PRINCIPAL DA API DE CHAT ---
app.post('/send-msg', async (req, res) => {
    const { history, newMessage } = req.body;

    if (!newMessage || typeof newMessage !== 'string' || newMessage.trim() === '') {
        return res.status(400).json({ error: 'O campo "newMessage" é obrigatório e deve ser um texto válido.' });
    }

    try {
        const msg = await getBotResponseWithRetry(history || [], newMessage);
        res.json({ msg });
    } catch (err) {
        console.error("ERRO AO PROCESSAR REQUISIÇÃO PARA O CHATGPT:", err.status, err.message);
        if (err.status === 429) {
            return res.status(429).json({ error: 'Limite de uso da API atingido. Verifique seu plano na OpenAI.' });
        }
        res.status(500).json({ error: 'O assistente está com dificuldades técnicas. Tente novamente mais tarde.' });
    }
});

// --- NOVA ROTA PARA GERAR ÁUDIO (TEXT-TO-SPEECH) ---
app.post('/generate-speech', async (req, res) => {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({ error: 'O campo "text" é obrigatório.' });
    }

    try {
        console.log("Gerando áudio para o texto:", text.substring(0, 50) + "...");
        const mp3 = await openai.audio.speech.create({
            model: "tts-1",
            voice: "sage",
            input: text,
        });

        // ======================= CORREÇÃO AQUI =======================
        // A nova versão da biblioteca retorna um objeto que pode ser convertido
        // para um Buffer. Não usamos mais o .pipe() diretamente dessa forma.
        
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(buffer);
        // ===================== FIM DA CORREÇÃO =====================

    } catch (err) {
        // Agora vamos logar o erro completo para ter mais detalhes
        console.error("ERRO AO GERAR ÁUDIO COM A API DA OPENAI:", err);
        res.status(500).json({ error: 'Falha ao gerar o áudio da resposta.' });
    }
});

// --- INICIA O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Chat com ChatGPT rodando na porta ${PORT}`);
});