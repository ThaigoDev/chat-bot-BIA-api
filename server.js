// servidor.js

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Inicializa o Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define o modelo que será usado de forma global
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

// --- ALTERAÇÃO PRINCIPAL ---
// A rota agora lida com um histórico de chat para manter o contexto.
app.post('/send-msg', async (req, res) => {
  // O frontend agora enviará o histórico (history) e a nova mensagem (newMessage).
  const { history, newMessage } = req.body;

  // Validação da entrada
  if (!newMessage) {
    return res.status(400).json({ error: 'A nova mensagem (newMessage) é obrigatória.' });
  }

  try {
    // Inicia um chat com o histórico fornecido pela requisição.
    // Isso dá à IA a "memória" de toda a conversa anterior.
    const chat = model.startChat({
      history: history || [], // Usa o histórico enviado ou um array vazio se for a primeira mensagem.
    });

    // Envia a nova mensagem do usuário para o chat que já tem o contexto.
    const result = await chat.sendMessage(newMessage);
    const response = result.response;
    const msg = response.text();

    // Retorna apenas a nova mensagem da IA.
    res.json({ msg });

  } catch (err) {
    console.error("Erro na API do Gemini:", err);
    res.status(500).json({ error: 'Erro ao se comunicar com a inteligência artificial.' });
  }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
