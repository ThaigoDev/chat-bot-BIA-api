// =================================================================
// SERVIDOR.JS - Backend para Chatbot com API ChatGPT (OpenAI)
// Autor: Assistente AI (Adaptado do código original)
// Data: 29 de Julho de 2025
// Funcionalidades:
// - Recebe mensagens do frontend.
// - Comunica-se com a API do OpenAI (ChatGPT).
// - Implementa retentativa com backoff para erros de sobrecarga (5xx).
// - Trata erros de cota excedida (429) com mensagem clara.
// =================================================================

// Importação dos módulos necessários
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const OpenAI = require('openai'); // Substituído pelo SDK da OpenAI

// --- Validação da Chave da API na inicialização ---
// A variável de ambiente agora deve ser OPENAI_API_KEY
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

    // O histórico da OpenAI precisa ser um array de objetos com 'role' e 'content'
    // O histórico do Gemini era {role: 'user'/'model', parts: [{text: '...'}]}
    // Esta função adapta o formato recebido para o formato da OpenAI.
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
            // A API da OpenAI retorna um objeto de erro com 'status'
            const status = err.status;

            // Verifica se o erro é de sobrecarga (5xx) ou cota (429)
            const isRetryableError = status === 429 || (status >= 500 && status < 600);

            // Se for um erro que permite retentativa e ainda temos tentativas
            if (isRetryableError && i < maxRetries - 1) {
                console.warn(`API retornou status ${status} (tentativa ${i + 1}/${maxRetries}). Tentando novamente em ${delay / 1000}s...`);
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
    // O formato do 'history' recebido do frontend continua o mesmo para não quebrar o cliente
    const { history, newMessage } = req.body;

    // Validação da entrada
    if (!newMessage || typeof newMessage !== 'string' || newMessage.trim() === '') {
        return res.status(400).json({ error: 'O campo "newMessage" é obrigatório e deve ser um texto válido.' });
    }

    try {
        // Chama a função que tem a lógica de retentativa
        const msg = await getBotResponseWithRetry(history || [], newMessage);
        res.json({ msg });

    } catch (err) {
        // Log detalhado do erro final no console do servidor
        console.error("-----------------------------------------");
        console.error("ERRO AO PROCESSAR REQUISIÇÃO PARA O CHATGPT (APÓS TODAS AS TENTATIVAS):");
        console.error("Mensagem que causou o erro:", newMessage);
        console.error("Detalhes do Erro:", err.status, err.message);
        console.error("-----------------------------------------");

        // Trata o erro de COTA EXCEDIDA (429) de forma específica
        if (err.status === 429) {
            return res.status(429).json({ error: 'Limite de uso da API atingido. Verifique seu plano na OpenAI ou tente novamente mais tarde.' });
        }
        
        // Para todos os outros erros, envia uma resposta genérica
        res.status(500).json({ error: 'O assistente está com dificuldades técnicas. Por favor, tente novamente mais tarde.' });
    }
});


// --- INICIA O SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Chat com ChatGPT rodando na porta ${PORT}`);
});
