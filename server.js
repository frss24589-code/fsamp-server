const { WebSocketServer } = require('ws');
const http = require('http');

const porta = process.env.PORT || 8080;

// =========================================================================
// TABELA DE CENTRAIS AUTORIZADAS (SALAS ISOLADAS + BLOQUEIO INDIVIDUAL)
// Para bloquear ou trocar a senha de um cliente, altere apenas a linha dele.
// Para adicionar mais clientes no futuro, basta criar evento36, evento37...
// =========================================================================
const CENTRAIS_AUTORIZADAS = {
    "admin": "central123",
    "evento1": "fsamp101",
    "evento2": "fsamp202",
    "evento3": "fsamp303",
    "evento4": "fsamp404",
    "evento5": "fsamp505",
    "evento6": "fsamp606",
    "evento7": "fsamp707",
    "evento8": "fsamp808",
    "evento9": "fsamp909",
    "evento10": "link1010",
    "evento11": "link1122",
    "evento12": "link1234",
    "evento13": "link1345",
    "evento14": "link1456",
    "evento15": "link1567",
    "evento16": "link1678",
    "evento17": "link1789",
    "evento18": "link1890",
    "evento19": "link1912",
    "evento20": "radio2020",
    "evento21": "radio2121",
    "evento22": "radio2222",
    "evento23": "radio2323",
    "evento24": "radio2424",
    "evento25": "radio2525",
    "evento26": "radio2626",
    "evento27": "radio2727",
    "evento28": "radio2828",
    "evento29": "radio2929",
    "evento30": "audio3030",
    "evento31": "audio3131",
    "evento32": "audio3232",
    "evento33": "audio3333",
    "evento34": "audio3434",
    "evento35": "audio3535"
};

const servidorHttp = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('FSAMP-LINK-AUDIO Multi-Central WebRTC Opus 48kHz Ativa');
});

const wss = new WebSocketServer({ server: servidorHttp, perMessageDeflate: false });

const mapaCanais = {
    'ESTUDIO': 0,
    'APRESENTADOR': 1,
    'REPORTER1': 2,
    'REPORTER2': 3,
    'REPORTER3': 4
};

let clientes = new Map();
let estadoNoArPorSala = new Map();

function enviarListaOnline(salaId) {
    if (!salaId) return;
    const online = [];
    for (let info of clientes.values()) {
        if (info.autenticado && info.sala === salaId && info.papel) {
            online.push(info.papel);
        }
    }
    const mensagem = JSON.stringify({ tipo: 'PRESENCA', online });
    for (let info of clientes.values()) {
        if (info.autenticado && info.sala === salaId && info.ws.readyState === 1) {
            info.ws.send(mensagem);
        }
    }
}

function transmitirEstadoNoAr(salaId, ativo) {
    if (!salaId) return;
    const novoEstado = !!ativo;
    estadoNoArPorSala.set(salaId, novoEstado);
    const aviso = JSON.stringify({ tipo: 'NO_AR', ativo: novoEstado });
    for (let info of clientes.values()) {
        if (info.autenticado && info.sala === salaId && info.ws.readyState === 1) {
            info.ws.send(aviso);
        }
    }
}

function enviarParaPapelNaSala(salaId, papelDestino, objetoMsg) {
    const texto = JSON.stringify(objetoMsg);
    for (let info of clientes.values()) {
        if (info.autenticado && info.sala === salaId && info.papel === papelDestino && info.ws.readyState === 1) {
            info.ws.send(texto);
        }
    }
}

wss.on('connection', (ws) => {
    const idConexao = Math.random().toString(36).substring(2, 9);
    clientes.set(idConexao, { ws, sala: null, papel: null, canalId: 0, autenticado: false });

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (dados) => {
        const remetente = clientes.get(idConexao);
        if (!remetente) return;

        try {
            const texto = dados.toString();
            const msg = JSON.parse(texto);

            // Validação de Login Remoto por Sala
            if (msg.tipo === 'LOGIN') {
                const salaLimpa = (msg.id || "").trim().toLowerCase();
                const senhaDigitada = (msg.senha || "").trim();

                if (CENTRAIS_AUTORIZADAS[salaLimpa] && CENTRAIS_AUTORIZADAS[salaLimpa] === senhaDigitada) {
                    remetente.autenticado = true;
                    remetente.sala = salaLimpa;
                    ws.send(JSON.stringify({ tipo: 'LOGIN_OK', sala: salaLimpa }));
                } else {
                    console.log(`⛔ [SEGURANÇA] Acesso negado (Sala: ${salaLimpa})`);
                    ws.send(JSON.stringify({ tipo: 'LOGIN_ERRO', motivo: 'ID da Central ou Senha inválidos / bloqueados.' }));
                }
                return;
            }

            if (!remetente.autenticado || !remetente.sala) return;

            // Sinalização WebRTC isolada estritamente dentro da mesma sala
            if (msg.tipo === 'WEBRTC_OFERTA' || msg.tipo === 'WEBRTC_RESPOSTA' || msg.tipo === 'WEBRTC_ICE') {
                if (msg.para && remetente.papel) {
                    enviarParaPapelNaSala(remetente.sala, msg.para, {
                        tipo: msg.tipo,
                        de: remetente.papel,
                        canalId: remetente.canalId,
                        dados: msg.dados
                    });
                }
                return;
            }

            if (msg.tipo === 'ENTRAR' && msg.papel) {
                remetente.papel = msg.papel;
                remetente.canalId = mapaCanais[msg.papel] ?? 0;
                console.log(`🎙️ [${remetente.sala.toUpperCase()}] ${msg.papel} entrou na sala.`);
                enviarListaOnline(remetente.sala);
                const noArSala = estadoNoArPorSala.get(remetente.sala) || false;
                ws.send(JSON.stringify({ tipo: 'NO_AR', ativo: noArSala }));
            } else if (msg.tipo === 'PING') {
                ws.send(JSON.stringify({ tipo: 'PONG' }));
            } else if (msg.tipo === 'DIAG') {
                console.log(`🔍 [${remetente.sala.toUpperCase()}] ${msg.papel} | modo=${msg.taxa} | status=${msg.state}`);
            } else if (msg.tipo === 'NO_AR') {
                console.log(`🔴 [${remetente.sala.toUpperCase()}] Comando NO AR: ${msg.ativo ? 'ATIVADO' : 'ENCERRADO'} por ${remetente.papel}`);
                transmitirEstadoNoAr(remetente.sala, msg.ativo);
            }
        } catch (e) { }
    });

    ws.on('close', () => {
        const info = clientes.get(idConexao);
        if (info && info.papel && info.sala) {
            console.log(`🚫 [${info.sala.toUpperCase()}] ${info.papel} saiu da sala.`);
            const salaSaindo = info.sala;
            clientes.delete(idConexao);
            enviarListaOnline(salaSaindo);
        } else {
            clientes.delete(idConexao);
        }
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
    console.log(`🔊 Central FSAMP-LINK-AUDIO Multi-Central WebRTC Opus 48kHz rodando na porta ${porta}`);
});
