import { Request, Response, NextFunction } from 'express';
import { PrismaTaskRepository } from '../../infrastructure/database/prisma-task-repository';
import { RedisCache } from '../../infrastructure/cache/redis-cache';
import { enqueueTask } from '../../infrastructure/queue/task-queue';

const repository = new PrismaTaskRepository();

export class TaskController {
  /**
   * POST /tasks
   * Create a new background task
   */
  static async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type } = req.body;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;

      if (!type) {
        res.status(400).json({ error: 'Missing parameter: type is required.' });
        return;
      }

      if (!idempotencyKey) {
        res.status(400).json({ error: 'Missing header: x-idempotency-key is required.' });
        return;
      }

      // Check if task already exists (Idempotency)
      const existingTask = await repository.findByIdempotencyKey(idempotencyKey);
      if (existingTask) {
        res.setHeader('X-Idempotency-Duplicate', 'true');
        res.status(200).json({
          message: 'Task with this idempotency key already exists. Returning current state.',
          task: existingTask,
        });
        return;
      }

      // Create new PENDING task in Database
      const task = await repository.create({ idempotencyKey, type });

      // Enqueue the task in BullMQ for background execution
      await enqueueTask(task.id, task.type);

      res.status(201).json({
        message: 'Task submitted successfully. Processing in background.',
        task,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /tasks/:id
   * Fetch task status with Redis caching layer
   */
  static async getTaskStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;

      // 1. Try to fetch from Redis cache
      const cachedTask = await RedisCache.get(id);
      if (cachedTask) {
        res.setHeader('X-Cache', 'HIT');
        res.status(200).json(cachedTask);
        return;
      }

      // 2. Cache miss -> fetch from PostgreSQL database
      const task = await repository.findById(id);
      if (!task) {
        res.status(404).json({ error: `Task with ID ${id} not found.` });
        return;
      }

      // 3. Cache the task status in Redis for 45s (TTL 30-60s requirement)
      await RedisCache.set(id, task);

      res.setHeader('X-Cache', 'MISS');
      res.status(200).json(task);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /tasks
   * Fetch list of all tasks
   */
  static async listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tasks = await repository.findAll();
      res.status(200).json(tasks);
    } catch (err) {
      next(err);
    }
  }
}
