'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');

const tutorRoutes = require('./routes/tutor');
const generatorRoutes = require('./routes/generator');
const exportRoutes = require('./routes/export');
const recommenderRoutes = require('./routes/recommender');
const advisorRoutes = require('./routes/advisor');

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()],
});

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost').split(',').map(o => o.trim());

app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    methods: ['POST'],
}));
app.use(express.json({ limit: '16kb' }));
app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: () => process.env.NODE_ENV === 'test',
}));

app.use('/api/tutor', tutorRoutes);
app.use('/api/tutor', recommenderRoutes);
app.use('/api/generator', generatorRoutes);
app.use('/api/generator', exportRoutes);
app.use('/api/advisor', advisorRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0' }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
    logger.error({ message: err.message, stack: err.stack });
    const status = err.status || 500;
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

const PORT = parseInt(process.env.PORT || '3001', 10);

// Only bind the port when running as the main process, not when imported by tests.
if (require.main === module) {
    app.listen(PORT, () => logger.info(`PHAROS-AI middleware listening on port ${PORT}`));
} else {
    // In test mode log startup anyway (supertest spins up its own ephemeral server).
    logger.info(`PHAROS-AI middleware listening on port ${PORT}`);
}

module.exports = app;
