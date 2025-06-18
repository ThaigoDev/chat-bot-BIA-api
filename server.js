// servidor.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(express.json());
app.use(cors());

// Inicializa o Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Define o modelo que será usado
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

// ALTERAÇÃO PRINCIPAL: A rota agora lida com um histórico de chat
app.post('/send-msg', async (req, res) => {
  // O frontend agora enviará o histórico e a nova mensagem do usuário
  const { history, newMessage } = req.body;

  if (!newMessage) {
    return res.status(400).json({ error: 'A nova mensagem (newMessage) é obrigatória.' });
  }

  try {
    // Inicia um chat com o histórico fornecido
    const chat = model.startChat({
      history: history || [], // Usa o histórico enviado ou um array vazio
    });

    // Envia a nova mensagem do usuário para o chat
    const result = await chat.sendMessage(newMessage);
    const response = result.response;
    const msg = response.text();

    res.json({ msg });
  } catch (err) {
    console.error("Erro na API do Gemini:", err);
    res.status(500).json({ error: 'Erro ao se comunicar com a inteligência artificial.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});