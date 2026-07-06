import { Task } from '../entities/task';

export interface ITaskRepository {
  create(data: { idempotencyKey: string; type: string }): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  findByIdempotencyKey(key: string): Promise<Task | null>;
  findAll(): Promise<Task[]>;
  update(id: string, updates: Partial<Pick<Task, 'status' | 'attempts' | 'result'>>): Promise<Task>;
}
