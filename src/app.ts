import express from 'express';
import cors from 'cors';
import { taskRoutes } from './presentation/routes/task-routes';
import { errorHandler } from './presentation/middlewares/error-handler';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/', taskRoutes);

// Error Handling
app.use(errorHandler);

export default app;
