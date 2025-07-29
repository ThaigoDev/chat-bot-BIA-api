// servidor.js

// ... (todo o início do seu arquivo permanece igual)
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

if (!process.env.GEMINI_API_KEY) {
    console.error("ERRO CRÍTICO: A variável de ambiente GEMINI_API_KEY não foi definida.");
    process.exit(1);
}

const app = express();
app.use(express.json());
app.use(cors());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

const safetySettings = [
    // ... (suas configurações de segurança permanecem as mesmas)
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];


// NOVA FUNÇÃO COM LÓGICA DE RETENTATIVA
async function getBotResponseWithRetry(history, newMessage) {
    const maxRetries = 3; // Tentar no máximo 3 vezes
    let delay = 1000;     // Começar com 1 segundo de espera

    for (let i = 0; i < maxRetries; i++) {
        try {
            const chat = model.startChat({ history: history || [], safetySettings });
            const result = await chat.sendMessage(newMessage);
            const response = result.response;

            if (!response || !response.text) {
                throw new Error("A resposta da IA está vazia ou em um formato inválido.");
            }
            
            // Se chegou aqui, a requisição foi bem-sucedida, então retornamos a mensagem
            return response.text();

        } catch (err) {
            // Verifica se o erro é de sobrecarga (503)
            const isOverloadedError = err.message && err.message.includes('503');

            // Se for um erro de sobrecarga E ainda temos tentativas restantes
            if (isOverloadedError && i < maxRetries - 1) {
                console.warn(`Servidor sobrecarregado (tentativa ${i + 1}/${maxRetries}). Tentando novamente em ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Dobra o tempo de espera para a próxima tentativa
            } else {
                // Se for outro tipo de erro ou se as tentativas acabaram, lança o erro para ser pego pelo bloco catch principal
                console.error("Erro final ao se comunicar com o Gemini após múltiplas tentativas:", err);
                throw err;
            }
        }
    }
}


// Rota principal atualizada para usar a nova função
app.post('/send-msg', async (req, res) => {
    const { history, newMessage } = req.body;

    if (!newMessage || typeof newMessage !== 'string' || newMessage.trim() === '') {
        return res.status(400).json({ error: 'O campo "newMessage" é obrigatório e deve ser um texto válido.' });
    }

    try {
        // Chama a nova função que tem a lógica de retentativa
        const msg = await getBotResponseWithRetry(history, newMessage);
        res.json({ msg });

    } catch (err) {
        // Log do erro final no console do servidor
        console.error("-----------------------------------------");
        console.error("ERRO AO PROCESSAR REQUISIÇÃO PARA O GEMINI (APÓS TODAS AS TENTATIVAS):");
        console.error("Mensagem que causou o erro:", newMessage);
        console.error("Detalhes do Erro:", err.message); // Log mais limpo da mensagem de erro
        console.error("-----------------------------------------");

        // Envia uma resposta de erro para o front-end
        res.status(500).json({ error: 'O assistente está sobrecarregado. Por favor, tente novamente mais tarde.' });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Baymax rodando em http://localhost:${PORT}`);
});