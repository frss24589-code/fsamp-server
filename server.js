const { WebSocketServer } = require('ws');
const http = require('http');

const porta = process.env.PORT || 8080;

const servidorHttp = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('FSAMP-LINK-AUDIO Central Ativa');
});

const wss = new WebSocketServer({ server: servidorHttp });

const mapaCanais = {
    'ESTUDIO': 0,
    'APRESENTADOR': 1,
    'REPORTER1': 2,
    'REPORTER2': 3,
    'REPORTER3': 4
};

let clientes = new Map();
let estadoNoArAtual = false;

function enviarListaOnline() {
    const online = [];
    for (let info of clientes.values()) {
        if (info.papel) online.push(info.papel);
    }
    const mensagem = JSON.stringify({ tipo: 'PRESENCA', online });
    for (let info of clientes.values()) {
        if (info.ws.readyState === 1) {
            info.ws.send(mensagem);
        }
    }
}

function transmitirEstadoNoAr(ativo) {
    estadoNoArAtual = !!ativo;
    const aviso = JSON.stringify({ tipo: 'NO_AR', ativo: estadoNoArAtual });
    for (let info of clientes.values()) {
        if (info.ws.readyState === 1) {
            info.ws.send(aviso);
        }
    }
}

wss.on('connection', (ws) => {
    const idConexao = Math.random().toString(36).substring(2, 9);
    clientes.set(idConexao, { ws, papel: null, canalId: 0 });

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (dados, isBinary) => {
        const remetente = clientes.get(idConexao);
        if (!remetente) return;

        if (!isBinary) {
            try {
                const texto = dados.toString();
                const msg = JSON.parse(texto);
                if (msg.tipo === 'ENTRAR' && msg.papel) {
                    remetente.papel = msg.papel;
                    remetente.canalId = mapaCanais[msg.papel] ?? 0;
                    console.log(`🎙️ [FSAMP] ${msg.papel} entrou na central.`);
                    enviarListaOnline();
                    ws.send(JSON.stringify({ tipo: 'NO_AR', ativo: estadoNoArAtual }));
                } else if (msg.tipo === 'PING') {
                    ws.send(JSON.stringify({ tipo: 'PONG' }));
                } else if (msg.tipo === 'NO_AR') {
                    console.log(`🔴 [FSAMP] Comando NO AR: ${msg.ativo ? 'ATIVADO' : 'ENCERRADO'} por ${remetente.papel}`);
                    transmitirEstadoNoAr(msg.ativo);
                }
            } catch (e) { }
            return;
        }

        const bufferOriginal = Buffer.from(dados);
        const pacoteEtiquetado = Buffer.allocUnsafe(bufferOriginal.length + 1);
        pacoteEtiquetado.writeUInt8(remetente.canalId, 0);
        bufferOriginal.copy(pacoteEtiquetado, 1);

        for (let [id, destino] of clientes.entries()) {
            if (id !== idConexao && destino.ws.readyState === 1) {
                destino.ws.send(pacoteEtiquetado, { binary: true });
            }
        }
    });

    ws.on('close', () => {
        const info = clientes.get(idConexao);
        if (info && info.papel) {
            console.log(`🚫 [FSAMP] ${info.papel} saiu da central.`);
        }
        clientes.delete(idConexao);
        enviarListaOnline();
    });
});

setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

servidorHttp.listen(porta, () => {
    console.log(`🔊 Central FSAMP-LINK-AUDIO rodando na porta ${porta}`);
});
