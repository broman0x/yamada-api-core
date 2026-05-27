/**
 * Logger terstruktur berbasis pino.
 *
 * Desain:
 * - Development: human-readable via pino-pretty.
 * - Production: JSON structured log untuk pipeline observability.
 * - HTTP request logging via pino-http + request id.
 * - Redaction untuk header sensitif.
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import util from 'util';
import pino from 'pino';
import pinoHttp from 'pino-http';

const LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const PRETTY = process.env.LOG_PRETTY === 'true' || (process.env.NODE_ENV !== 'production' && process.env.LOG_PRETTY !== 'false');

// Transport pretty hanya dipasang ketika mode readable diaktifkan.
const transport = PRETTY
    ? pino.transport({
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: true
        }
    })
    : undefined;

const serialisasiHeaderAman = (headers = {}) => {
    const hasil = {};
    const daftarAman = ['host', 'origin', 'referer', 'user-agent', 'x-forwarded-for', 'x-real-ip', 'x-request-id'];

    // Hanya header non-sensitif yang ikut masuk log request.
    for (const nama of daftarAman) {
        if (headers[nama]) {
            hasil[nama] = headers[nama];
        }
    }
    return hasil;
};

export const logger = pino(
    {
        level: LEVEL,
        base: {
            service: 'yamada-api-core',
            env: process.env.NODE_ENV || 'development'
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
            // Header sensitif di-redact agar tidak bocor ke log.
            paths: [
                'req.headers.authorization',
                'req.headers.x-api-key',
                'request.headers.authorization',
                'request.headers.x-api-key'
            ],
            censor: '[REDACTED]'
        }
    },
    transport
);

export const loggerHttp = pinoHttp({
    logger,
    genReqId: (req, res) => {
        // Hormati x-request-id dari upstream gateway; jika tidak ada, generate UUID.
        const dariHeader = req.headers['x-request-id'];
        const id = typeof dariHeader === 'string' && dariHeader.trim().length > 0 ? dariHeader.trim() : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
    },
    customProps: (req) => ({
        requestId: req.id
    }),
    serializers: {
        req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
            headers: serialisasiHeaderAman(req.headers)
        }),
        res: (res) => ({
            statusCode: res.statusCode
        }),
        err: pino.stdSerializers.err
    },
    customLogLevel: (req, res, err) => {
        // Pemilihan level log berbasis hasil request untuk observability yang konsisten.
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
    },
    customSuccessMessage: (req, res, waktuRespons) =>
        `HTTP ${req.method} ${req.url} -> ${res.statusCode} (${waktuRespons}ms)`,
    customErrorMessage: (req, res, err) =>
        `HTTP ${req.method} ${req.url} -> ${res.statusCode} (${err?.message || 'internal error'})`
});

export const pasangBridgeConsole = () => {
    // Bridge ini menjaga kompatibilitas log lama (console.*) tanpa refactor besar-besaran.
    const kirim = (level, args) => {
        if (!args || args.length === 0) return;
        if (args.length === 1 && args[0] instanceof Error) {
            logger[level]({ err: args[0] }, args[0].message);
            return;
        }
        logger[level](util.format(...args));
    };

    console.log = (...args) => kirim('info', args);
    console.info = (...args) => kirim('info', args);
    console.warn = (...args) => kirim('warn', args);
    console.error = (...args) => kirim('error', args);
    console.debug = (...args) => kirim('debug', args);
};
