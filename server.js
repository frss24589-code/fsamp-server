const { WebSocketServer } = require('ws');

const porta = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: porta });

let conexoes = new Map();

wss.on('connection', (ws) => {
    let idCliente = Math.random().toString(36).substring(7);
    conexoes.set(idCliente, ws);
    console.log(`🎙️ [FSAMP] Conectado! ID: ${idCliente} | Total: ${conexoes.size}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (dadosAudio, isBinary) => {
        for (let [id, cliente] of conexoes.entries()) {
            if (id !== idCliente && cliente.readyState === 1) {
                cliente.send(dadosAudio, { binary: isBinary });
            }
        }
    });

    ws.on('close', () => {
        conexoes.delete(idCliente);
        console.log(`🚫 [FSAMP] Desconectado. Restantes: ${conexoes.size}`);
    });
});

const intervalo = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 15000);

console.log(`🔊 Servidor FSAMP rodando na porta ${porta}`);
