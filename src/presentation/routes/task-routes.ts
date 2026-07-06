import { Router } from 'express';
import { TaskController } from '../controllers/task-controller';

const router = Router();

router.post('/tasks', TaskController.createTask);
router.get('/tasks/:id', TaskController.getTaskStatus);
router.get('/tasks', TaskController.listTasks);

export { router as taskRoutes };
