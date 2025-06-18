// servidor.js
const express = require('express');
// const bodyParser = require('body-parser'); // Não é mais necessário com Express moderno
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// Middlewares
// SUGESTÃO: Usar o middleware embutido do Express
app.use(express.json()); 
app.use(express.static('public'));
app.use(cors());

// Inicializa Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Rota para gerar recomendação
app.post('/send-msg', async (req, res) => {
  // Adiciona uma verificação para o caso do prompt vir vazio
  if (!req.body || !req.body.prompt) {
    return res.status(400).json({ error: 'O "prompt" é obrigatório no corpo da requisição.' });
  }

  const { prompt } = req.body;

  try {
    // CORREÇÃO E SUGESTÃO: Usar o nome correto do modelo, de preferência com "-latest"
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const msg = response.text();

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