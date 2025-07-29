// =================================================================
// SERVIDOR.JS - Backend para Chatbot com API Gemini
// Autor: Assistente AI
// Data: 29 de Julho de 2025
// Funcionalidades:
// - Recebe mensagens do frontend.
// - Comunica-se com a API do Google Gemini.
// - Implementa retentativa com backoff para erros de sobrecarga (503).
// - Trata erros de cota excedida (429) com mensagem clara.
// =================================================================

// Importação dos módulos necessários
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// Validação da Chave da API na inicialização
if (!process.env.GEMINI_API_KEY) {
    console.error("ERRO CRÍTICO: A variável de ambiente GEMINI_API_KEY não foi definida.");
    console.error("Por favor, crie um arquivo .env e adicione a linha: GEMINI_API_KEY=SUA_CHAVE_AQUI");
    process.exit(1); // Encerra o processo se a chave não existir
}

const app = express();

// Middlewares
app.use(express.json()); // Permite que o servidor entenda JSON
app.use(cors()); // Habilita o Cross-Origin Resource Sharing

// --- CONFIGURAÇÃO DA API DO GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];


// --- FUNÇÃO COM LÓGICA DE RETENTATIVA (BACKOFF EXPONENCIAL) ---
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
            
            // Sucesso! Retorna a mensagem.
            return response.text();

        } catch (err) {
            // Verifica se o erro é de sobrecarga (503)
            const isOverloadedError = err.message && err.message.includes('503');

            // Se for sobrecarga e ainda temos tentativas
            if (isOverloadedError && i < maxRetries - 1) {
                console.warn(`Servidor sobrecarregado (tentativa ${i + 1}/${maxRetries}). Tentando novamente em ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Dobra o tempo de espera
            } else {
                // Se for outro tipo de erro ou se as tentativas acabaram, joga o erro para o próximo catch
                throw err;
            }
        }
    }
}


// --- ROTA PRINCIPAL DA API ---
app.post('/send-msg', async (req, res) => {
    const { history, newMessage } = req.body;

    // Validação da entrada
    if (!newMessage || typeof newMessage !== 'string' || newMessage.trim() === '') {
        return res.status(400).json({ error: 'O campo "newMessage" é obrigatório e deve ser um texto válido.' });
    }

    try {
        // Chama a função que tem a lógica de retentativa
        const msg = await getBotResponseWithRetry(history, newMessage);
        res.json({ msg });

    } catch (err) {
        // Log detalhado do erro final no console do servidor
        console.error("-----------------------------------------");
        console.error("ERRO AO PROCESSAR REQUISIÇÃO PARA O GEMINI (APÓS TODAS AS TENTATIVAS):");
        console.error("Mensagem que causou o erro:", newMessage);
        console.error("Detalhes do Erro:", err);
        console.error("-----------------------------------------");
        
        // Trata o erro de COTA EXCEDIDA (429) de forma específica
        if (err.message && err.message.includes('429')) {
             return res.status(429).json({ error: 'Limite de uso diário atingido. Por favor, tente novamente amanhã.' });
        }
        
        // Para todos os outros erros, envia uma resposta genérica de erro
        res.status(500).json({ error: 'O assistente está com dificuldades técnicas. Por favor, tente novamente mais tarde.' });
    }
});


// --- INICIA O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Baymax rodando na porta ${PORT}`);
});