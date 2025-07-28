// servidor.js

// Importação dos módulos necessários
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// Validação da Chave da API na inicialização
// Isso garante que o servidor não inicie se a chave essencial não for encontrada.
if (!process.env.GEMINI_API_KEY) {
  console.error("ERRO CRÍTICO: A variável de ambiente GEMINI_API_KEY não foi definida.");
  console.error("Por favor, crie um arquivo .env e adicione a linha: GEMINI_API_KEY=SUA_CHAVE_AQUI");
  process.exit(1); // Encerra o processo se a chave não existir
}

const app = express();

// Middlewares
app.use(express.json()); // Permite que o servidor entenda JSON
app.use(cors()); // Habilita o Cross-Origin Resource Sharing para permitir requisições do front-end

// Inicializa a API do Google Gemini com a chave
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define o modelo que será usado
const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash-latest' 
});

// Define configurações de segurança para evitar bloqueios por conteúdo
// Isso torna a IA menos restritiva, o que pode evitar alguns erros de "resposta bloqueada".
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

// Rota principal da API para receber e processar mensagens
app.post('/send-msg', async (req, res) => {
  const { history, newMessage } = req.body;

  // Validação rigorosa dos dados recebidos
  if (!newMessage || typeof newMessage !== 'string' || newMessage.trim() === '') {
    return res.status(400).json({ error: 'O campo "newMessage" é obrigatório e deve ser um texto válido.' });
  }

  try {
    // Inicia um chat com o histórico da conversa e as configurações de segurança
    const chat = model.startChat({
      history: history || [],
      safetySettings,
    });

    // Envia a nova mensagem do usuário para a IA
    const result = await chat.sendMessage(newMessage);
    const response = result.response;
    
    // Verifica se a IA retornou um texto válido
    if (!response || !response.text) {
        throw new Error("A resposta da IA está vazia ou em um formato inválido.");
    }
    
    const msg = response.text();

    // Envia a resposta de volta para o front-end
    res.json({ msg });

  } catch (err) {
    // Log detalhado do erro no console do servidor para facilitar a depuração
    console.error("-----------------------------------------");
    console.error("ERRO AO PROCESSAR REQUISIÇÃO PARA O GEMINI:");
    console.error("Mensagem que causou o erro:", newMessage);
    console.error("Detalhes do Erro:", err);
    console.error("-----------------------------------------");
    
    // Envia uma resposta de erro genérica para o front-end
    res.status(500).json({ error: 'Erro ao se comunicar com a inteligência artificial.' });
  }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Baymax rodando em http://localhost:${PORT}`);
});
