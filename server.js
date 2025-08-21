// =================================================================
// SERVIDOR.JS - Backend para Chatbot com API OpenAI (Chat e Voz)
// =================================================================

// Importação dos módulos necessários
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const OpenAI = require('openai'); // Substituído pelo SDK da OpenAI

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
    const maxRetries = 3; // Tentar no máximo 3 vezes
    let delay = 1000;     // Começar com 1 segundo de espera

    // Adapta o formato do histórico para o formato da OpenAI.
    const messages = [
        ...history.map(item => ({
            role: item.role === 'model' ? 'assistant' : 'user', // Converte 'model' para 'assistant'
            content: item.parts[0].text // Extrai o texto
        })),
        { role: 'user', content: newMessage } // Adiciona a nova mensagem do usuário
    ];


    for (let i = 0; i < maxRetries; i++) {
        try {
            const chatCompletion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo", // ou "gpt-4", "gpt-4o", etc.
                messages: messages,
            });

            const responseText = chatCompletion.choices[0]?.message?.content;

            if (!responseText) {
                throw new Error("A resposta da IA está vazia ou em um formato inválido.");
            }

            // Sucesso! Retorna a mensagem.
            return responseText;

        } catch (err) {
            const status = err.status;
            const isRetryableError = status === 429 || (status >= 500 && status < 600);

            if (isRetryableError && i < maxRetries - 1) {
                console.warn(`API retornou status ${status} (tentativa ${i + 1}/${maxRetries}). Tentando novamente em ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Dobra o tempo de espera
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
        console.error("-----------------------------------------");
        console.error("ERRO AO PROCESSAR REQUISIÇÃO PARA O CHATGPT (APÓS TODAS AS TENTATIVAS):");
        console.error("Mensagem que causou o erro:", newMessage);
        console.error("Detalhes do Erro:", err.status, err.message);
        console.error("-----------------------------------------");

        if (err.status === 429) {
            return res.status(429).json({ error: 'Limite de uso da API atingido. Verifique seu plano na OpenAI ou tente novamente mais tarde.' });
        }
        
        res.status(500).json({ error: 'O assistente está com dificuldades técnicas. Por favor, tente novamente mais tarde.' });
    }
});


// =================================================================
// NOVA ROTA PARA GERAR ÁUDIO (TEXT-TO-SPEECH)
// =================================================================
app.post('/generate-speech', async (req, res) => {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({ error: 'O campo "text" é obrigatório.' });
    }

    try {
        console.log("Gerando áudio para o texto:", text.substring(0, 50) + "...");

        // Faz a chamada para a API de TTS da OpenAI
        const mp3 = await openai.audio.speech.create({
            model: "tts-1",       // "tts-1" é mais rápido, "tts-1-hd" tem mais qualidade
            voice: "nova",        // Vozes disponíveis: alloy, echo, fable, onyx, nova, shimmer
            input: text,
        });

        // Define o cabeçalho para indicar que estamos enviando um arquivo MP3
        res.setHeader('Content-Type', 'audio/mpeg');

        // Envia o áudio como uma stream diretamente para o cliente
        mp3.body.pipe(res);

    } catch (err) {
        console.error("-----------------------------------------");
        console.error("ERRO AO GERAR ÁUDIO COM A API DA OPENAI:");
        console.error("Detalhes do Erro:", err.status, err.message);
        console.error("-----------------------------------------");
        res.status(500).json({ error: 'Falha ao gerar o áudio da resposta.' });
    }
});


// --- INICIA O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Chat com ChatGPT rodando na porta ${PORT}`);
});